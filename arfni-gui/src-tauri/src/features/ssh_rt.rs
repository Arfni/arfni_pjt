//! Tauri v2 / 실시간 인터랙티브 SSH 세션 매니저
//! - 세션 시작: ssh_start(params) → session_id 반환
//! - 명령 전송: ssh_send(id, cmd)
//! - 세션 종료: ssh_close(id)
//! - 이벤트:
//!   * "ssh:data"   : stdout chunk
//!   * "ssh:stderr" : stderr chunk
//!   * "ssh:closed" : 세션 종료 알림

use anyhow::{Context, Result};
use once_cell::sync::OnceCell;
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use ssh2::{Channel, Session};
use std::{
  collections::HashMap,
  io::{Read, Write},
  net::TcpStream,
  path::Path,
  sync::mpsc::{self, Sender},
  thread,
  time::Duration,
};
use tauri::{AppHandle, Emitter}; // v2: emit()은 Emitter 트레이트 필요
use uuid::Uuid;

// ============ Public Types ============

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SshParams {
  pub host: String,     // "ec2-xxx.amazonaws.com"
  pub user: String,     // "ec2-user"
  pub pem_path: String, // PEM 절대 경로
}

#[derive(Debug, Clone, Serialize)]
pub struct SshDataEvent {
  pub id: String,    // session_id (UUID)
  pub chunk: String, // 출력 조각
}

// ============ Session Handle ============

// Debug 파생 금지: ssh2::{Session, Channel}은 Debug 미구현
struct SshHandle {
  id: Uuid,
  session: Session,
  chan: Channel,
  tx_cmd: Sender<String>,
  tx_close: Sender<()>,
  _stdout_join: thread::JoinHandle<()>,
  _stderr_join: thread::JoinHandle<()>,
}

// 글로벌 세션 맵
static SESSIONS: OnceCell<Mutex<HashMap<Uuid, SshHandle>>> = OnceCell::new();
fn sessions() -> &'static Mutex<HashMap<Uuid, SshHandle>> {
  SESSIONS.get_or_init(|| Mutex::new(HashMap::new()))
}

// ============ Low-level Connect ============

fn connect_interactive(params: &SshParams) -> Result<(Session, Channel)> {
  let addr = format!("{}:22", params.host);
  let tcp = TcpStream::connect(&addr)
    .with_context(|| format!("connect {}", addr))?;
  tcp.set_read_timeout(Some(Duration::from_secs(2))).ok();
  tcp.set_write_timeout(Some(Duration::from_secs(2))).ok();

  let mut sess = Session::new().context("create ssh session")?;
  sess.set_tcp_stream(tcp);
  sess.handshake().context("ssh handshake failed")?;

  // 키 인증
  let key_path = Path::new(&params.pem_path);
  sess
    .userauth_pubkey_file(&params.user, None, key_path, None)
    .context("pubkey auth failed")?;

  if !sess.authenticated() {
    anyhow::bail!("not authenticated");
  }

  // 인터랙티브 셸
  let mut ch = sess.channel_session().context("open channel")?;
  // 필요한 경우만 PTY (tail -f, top 등은 PTY가 자연스러움)
  ch.request_pty("xterm", None, None).ok();
  ch.shell().context("start shell failed")?;

  // 기본 모드(ExtendedData::Normal)면 stderr는 ch.stderr()로 분리 읽기 가능
  Ok((sess, ch))
}

// ============ Session API (Rust) ============

/// 세션 시작: stdout/stderr를 이벤트로 지속 푸시
pub fn start_interactive_session(app: AppHandle, params: SshParams) -> Result<Uuid> {
  let (sess, ch) = connect_interactive(&params)?;

  let (tx_cmd, rx_cmd) = mpsc::channel::<String>();
  let (tx_close, rx_close) = mpsc::channel::<()>();

  let id = Uuid::new_v4();

  // --- stdout reader ---
  let app_stdout = app.clone();
  let stdout_id = id;
  // stream(0) == stdout
  let mut ch_stdout = ch.stream(0);
  let stdout_join = thread::spawn(move || {
    let mut buf = [0u8; 4096];
    loop {
      if rx_close.try_recv().is_ok() {
        break;
      }
      match ch_stdout.read(&mut buf) {
        Ok(0) => break, // EOF
        Ok(n) => {
          let s = String::from_utf8_lossy(&buf[..n]).to_string();
          let _ = app_stdout.emit(
            "ssh:data",
            SshDataEvent { id: stdout_id.to_string(), chunk: s },
          );
        }
        Err(_) => thread::sleep(Duration::from_millis(20)),
      }
    }
  });

  // --- stderr reader ---
  let app_stderr = app.clone();
  let stderr_id = id;
  let mut ch_stderr = ch.stderr();
  let stderr_join = thread::spawn(move || {
    let mut buf = [0u8; 4096];
    loop {
      match ch_stderr.read(&mut buf) {
        Ok(0) => break,
        Ok(n) => {
          let s = String::from_utf8_lossy(&buf[..n]).to_string();
          let _ = app_stderr.emit(
            "ssh:stderr",
            SshDataEvent { id: stderr_id.to_string(), chunk: s },
          );
        }
        Err(_) => thread::sleep(Duration::from_millis(20)),
      }
    }
  });

  // --- writer (명령 큐 소비) ---
  let mut ch_writer = ch.clone();
  thread::spawn(move || {
    while let Ok(cmd) = rx_cmd.recv() {
      // 한 줄 보장 (엔터)
      let line = if cmd.ends_with('\n') { cmd } else { format!("{cmd}\n") };
      if let Err(_e) = ch_writer.write_all(line.as_bytes()) {
        break;
      }
      let _ = ch_writer.flush();
    }
  });

  // 핸들 등록
  let handle = SshHandle {
    id,
    session: sess,
    chan: ch,
    tx_cmd,
    tx_close,
    _stdout_join: stdout_join,
    _stderr_join: stderr_join,
  };
  sessions().lock().insert(id, handle);

  Ok(id)
}

/// 명령 전송
pub fn send_command(id: Uuid, cmd: String) -> Result<()> {
  if let Some(h) = sessions().lock().get(&id) {
    h.tx_cmd.send(cmd).context("send cmd")?;
    Ok(())
  } else {
    anyhow::bail!("session not found");
  }
}

/// 세션 종료
pub fn close_session(app: &AppHandle, id: Uuid) -> Result<()> {
  if let Some(mut h) = sessions().lock().remove(&id) {
    let _ = h.tx_close.send(());      // reader 루프 종료 유도
    let _ = h.chan.close();           // 채널 닫기
    let _ = h.chan.wait_close();      // 원격 종료 대기
    let _ = app.emit("ssh:closed", SshDataEvent {
      id: id.to_string(),
      chunk: String::from("session closed"),
    });
    Ok(())
  } else {
    anyhow::bail!("session not found");
  }
}

// ============ Tauri Commands (v2) ============

#[tauri::command]
pub async fn ssh_start(app: AppHandle, params: SshParams) -> Result<String, String> {
  start_interactive_session(app, params)
    .map(|id| id.to_string())
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn ssh_send(id: String, cmd: String) -> Result<(), String> {
  let id = Uuid::parse_str(&id).map_err(|e| e.to_string())?;
  send_command(id, cmd).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn ssh_close(app: AppHandle, id: String) -> Result<(), String> {
  let id = Uuid::parse_str(&id).map_err(|e| e.to_string())?;
  close_session(&app, id).map_err(|e| e.to_string())
}
