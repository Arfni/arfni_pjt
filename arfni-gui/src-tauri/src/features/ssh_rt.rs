use anyhow::{Context, Result};
use once_cell::sync::OnceCell;
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use std::{
  collections::HashMap,
  io::{BufRead, BufReader, Write},
  process::{Child, ChildStdin, Command, Stdio},
  sync::mpsc::{self, Sender},
  thread,
};
use tauri::{AppHandle, Emitter};
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

struct SshHandle {
  #[allow(dead_code)]
  id: Uuid,
  child: Child,
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

fn connect_interactive(params: &SshParams) -> Result<(Child, ChildStdin)> {
  let target = format!("{}@{}", params.user, params.host);
  println!("[DEBUG] Launching system SSH to {target}");

  let mut child = Command::new("ssh")
    .args([
      "-i", &params.pem_path,
      "-tt", // force pseudo-terminal for interactive commands
      "-o", "StrictHostKeyChecking=accept-new",
      &target,
    ])
    .stdin(Stdio::piped())
    .stdout(Stdio::piped())
    .stderr(Stdio::piped())
    .spawn()
    .context("failed to spawn ssh")?;

  let stdin = child.stdin.take().context("failed to open stdin")?;
  Ok((child, stdin))
}

// ============ Session API (Rust) ============

/// 세션 시작: stdout/stderr를 이벤트로 지속 푸시
pub fn start_interactive_session(app: AppHandle, params: SshParams) -> Result<Uuid> {
  let (mut child, mut stdin) = connect_interactive(&params)?;

  let (tx_cmd, rx_cmd) = mpsc::channel::<String>();
  let (tx_close, rx_close) = mpsc::channel::<()>();

  let id = Uuid::new_v4();

  // --- stdout reader ---
  let app_stdout = app.clone();
  let stdout_id = id;
  let stdout = child.stdout.take().context("no stdout")?;
  let stdout_join = thread::spawn(move || {
    let reader = BufReader::new(stdout);
    for line in reader.lines() {
      if rx_close.try_recv().is_ok() {
        break;
      }
      if let Ok(s) = line {
        let _ = app_stdout.emit(
          "ssh:data",
          SshDataEvent { id: stdout_id.to_string(), chunk: s },
        );
      }
    }
  });

  // --- stderr reader ---
  let app_stderr = app.clone();
  let stderr_id = id;
  let stderr = child.stderr.take().context("no stderr")?;
  let stderr_join = thread::spawn(move || {
    let reader = BufReader::new(stderr);
    for line in reader.lines() {
      if let Ok(s) = line {
        let _ = app_stderr.emit(
          "ssh:stderr",
          SshDataEvent { id: stderr_id.to_string(), chunk: s },
        );
      }
    }
  });

  // --- writer (명령 큐 소비) ---
  thread::spawn(move || {
    while let Ok(cmd) = rx_cmd.recv() {
      let line = if cmd.ends_with('\n') { cmd } else { format!("{cmd}\n") };
      if let Err(e) = stdin.write_all(line.as_bytes()) {
        println!("[DEBUG] write error: {:?}", e);
        break;
      }
      let _ = stdin.flush();
    }
  });

  // 핸들 등록
  let handle = SshHandle {
    id,
    child,
    tx_cmd,
    tx_close,
    _stdout_join: stdout_join,
    _stderr_join: stderr_join,
  };
  sessions().lock().insert(id, handle);

  println!("[DEBUG] SSH session {id} started ✅");
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
    let _ = h.tx_close.send(()); // reader 루프 종료 유도
    let _ = h.child.kill(); // ssh 프로세스 종료
    let _ = app.emit(
      "ssh:closed",
      SshDataEvent { id: id.to_string(), chunk: "session closed".into() },
    );
    println!("[DEBUG] Session {id} closed");
    Ok(())
  } else {
    anyhow::bail!("session not found");
  }
}

/// 앱 종료 시, 살아있는 세션들 정리
#[allow(dead_code)]
pub fn close_all_sessions(app: &AppHandle) {
  let ids: Vec<Uuid> = sessions().lock().keys().cloned().collect();
  for id in ids {
    let _ = close_session(app, id);
  }
}
