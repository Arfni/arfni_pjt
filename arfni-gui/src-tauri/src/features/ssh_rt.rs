use anyhow::{Context, Result};
use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
use once_cell::sync::OnceCell;
use parking_lot::Mutex;
use portable_pty::{native_pty_system, Child as PtyChild, CommandBuilder, MasterPty, PtySize};
use serde::{Deserialize, Serialize};
use std::{
  collections::HashMap,
  io::{BufRead, BufReader, Read, Write},
  process::{Child as StdChild, Command, Stdio},
  sync::Arc,
  thread,
};
use tauri::{AppHandle, Emitter};
use uuid::Uuid;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

// ============ Public Types ============

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SshParams {
  pub host: String,     // "ec2-xxx.amazonaws.com"
  pub user: String,     // "ec2-user"
  pub pem_path: String, // PEM 절대 경로
}

/// 상태/알림 계열 이벤트 (사람이 읽는 텍스트)
#[derive(Debug, Clone, Serialize)]
pub struct SshDataEvent {
  pub id: String,
  pub chunk: String,
}

/// 세션 종료 이벤트.
///
/// `clean`이 왜 필요한가: PTY EOF만 보면 "사용자가 셸에서 exit 했다"와
/// "ServerAliveInterval 한도를 넘겨 연결이 끊겼다"가 완전히 같은 모양이다.
/// 프론트가 이 둘을 구분하지 못하면 정상 종료한 탭까지 자동 재접속으로 되살린다.
#[derive(Debug, Clone, Serialize)]
pub struct SshClosedEvent {
  pub id: String,
  pub chunk: String,
  /// 원격 셸이 정상 종료했으면 true. 연결이 끊겨 ssh가 죽었으면 false.
  pub clean: bool,
}

/// PTY 원본 바이트 스트림 이벤트.
/// ANSI 이스케이프가 그대로 들어있으므로 프론트의 터미널 에뮬레이터(xterm.js)가 해석한다.
/// UTF-8 경계가 청크 중간에서 잘릴 수 있어 base64로 전송한다.
#[derive(Debug, Clone, Serialize)]
pub struct SshBytesEvent {
  pub id: String,
  pub data: String, // base64
}

// ============ Session Handle ============

struct SshHandle {
  #[allow(dead_code)]
  id: Uuid,
  master: Box<dyn MasterPty + Send>,
  writer: Box<dyn Write + Send>,
  child: Box<dyn PtyChild + Send + Sync>,
}

// ============ Tunnel Types ============

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum TunnelKind {
  /// -L : 로컬 포트를 열고 원격 쪽에서 target_host:target_port로 연결
  Local,
  /// -R : 원격 포트를 열고 이쪽에서 target_host:target_port로 연결
  Remote,
  /// -D : 로컬에 SOCKS5 프록시를 연다
  Dynamic,
}

/// ssh의 -L/-R/-D 문법을 그대로 옮긴 형태.
/// 필드 이름을 ssh 인자 순서(bind → target)에 맞춰야 -L/-R에서 방향이 헷갈리지 않는다.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TunnelSpec {
  pub kind: TunnelKind,
  /// -L/-D는 로컬에서, -R은 원격에서 바인드할 주소
  #[serde(default)]
  pub bind_address: Option<String>,
  pub bind_port: u16,
  /// -D에서는 쓰이지 않는다
  #[serde(default)]
  pub target_host: Option<String>,
  #[serde(default)]
  pub target_port: Option<u16>,
  #[serde(default)]
  pub label: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct TunnelInfo {
  pub id: String,
  pub kind: TunnelKind,
  pub bind_address: String,
  pub bind_port: u16,
  pub target_host: Option<String>,
  pub target_port: Option<u16>,
  pub label: Option<String>,
  /// ssh 접속 대상 (user@host)
  pub via: String,
  /// UI에 그대로 쓸 수 있는 한 줄 설명
  pub description: String,
}

// ============ Tunnel Handle ============

struct TunnelHandle {
  #[allow(dead_code)]
  id: Uuid,
  child: StdChild,
  spec: TunnelSpec,
  via: String,
  /// 종료 사유를 알려주기 위해 stderr 마지막 줄들을 들고 있는다
  stderr_tail: Arc<Mutex<Vec<String>>>,
}

// 글로벌 세션 맵
static SESSIONS: OnceCell<Mutex<HashMap<Uuid, SshHandle>>> = OnceCell::new();
fn sessions() -> &'static Mutex<HashMap<Uuid, SshHandle>> {
  SESSIONS.get_or_init(|| Mutex::new(HashMap::new()))
}

// 글로벌 터널 맵
static TUNNELS: OnceCell<Mutex<HashMap<Uuid, TunnelHandle>>> = OnceCell::new();
fn tunnels() -> &'static Mutex<HashMap<Uuid, TunnelHandle>> {
  TUNNELS.get_or_init(|| Mutex::new(HashMap::new()))
}

// ============ Session API ============

/// tmux 세션 이름으로 쓸 수 있게 식별자를 다듬는다.
///
/// 이 값은 원격 셸 명령 문자열에 그대로 박히므로 셸 메타문자가 절대 들어가면 안 된다.
/// tmux 자체도 세션 이름에 `.`과 `:`를 허용하지 않는다.
fn sanitize_session_key(key: &str) -> String {
  let cleaned: String = key
    .chars()
    .filter(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_')
    .take(48)
    .collect();
  if cleaned.is_empty() {
    "default".to_string()
  } else {
    cleaned
  }
}

/// 연결이 끊겨도 원격 작업이 살아남도록 셸을 tmux로 감싸는 원격 명령을 만든다.
///
/// 설계 이유:
/// - `new-session -A`: 세션이 있으면 붙고 없으면 만든다. 재접속이 곧 복원이 된다.
/// - `mouse off`: tmux가 마우스를 가져가면 xterm.js의 드래그 선택과 우클릭
///   복사/붙여넣기가 전부 죽는다. 마우스는 프론트가 계속 소유해야 한다.
/// - 대신 Alt+위/아래에만 스크롤을 걸어 둔다. 프론트가 휠을 이 키로 바꿔 보내면
///   마우스를 뺏기지 않고도 스크롤백을 볼 수 있다. `copy-mode -e`라서 바닥에
///   닿으면 스스로 빠져나온다.
/// - tmux가 없는 서버에서는 조용히 평소 로그인 셸로 떨어진다.
fn tmux_wrapped_command(session_key: &str) -> String {
  let name = format!("arfni-{}", sanitize_session_key(session_key));
  format!(
    "if command -v tmux >/dev/null 2>&1; then \
       tmux start-server 2>/dev/null; \
       tmux set-option -g mouse off 2>/dev/null; \
       tmux bind-key -n M-Up copy-mode -e \\; send-keys -X -N 3 scroll-up 2>/dev/null; \
       tmux bind-key -n M-Down send-keys -X -N 3 scroll-down 2>/dev/null; \
       exec tmux -u new-session -A -s {name}; \
     fi; \
     exec \"$SHELL\" -l"
  )
}

/// 로컬 PTY(윈도우는 ConPTY) 안에서 ssh를 띄우고, PTY 출력 전체를 원본 바이트로 스트리밍한다.
///
/// 이전 구현은 `Stdio::piped()` + `BufReader::lines()` 였다. 그 경우
/// - 개행이 오기 전까지 아무것도 emit되지 않아 codex/vim/htop 같은 full-screen TUI가 화면에 뜨지 않고
/// - 로컬에 tty가 없어 rows/cols 협상이 불가능했다.
pub fn start_interactive_session(
  app: AppHandle,
  params: SshParams,
  rows: u16,
  cols: u16,
  persistent: bool,
  session_key: Option<&str>,
) -> Result<Uuid> {
  let target = format!("{}@{}", params.user, params.host);
  println!("[ssh_rt] opening pty session to {target} ({cols}x{rows})");

  let pty_system = native_pty_system();
  let pair = pty_system
    .openpty(PtySize {
      rows: rows.max(1),
      cols: cols.max(1),
      pixel_width: 0,
      pixel_height: 0,
    })
    .context("failed to open pty")?;

  let mut cmd = CommandBuilder::new("ssh");
  cmd.arg("-i");
  cmd.arg(&params.pem_path);
  cmd.arg("-t"); // 원격 PTY 요청 (로컬 tty가 있으므로 -tt 강제는 불필요)
  cmd.arg("-o");
  cmd.arg("StrictHostKeyChecking=accept-new");
  cmd.arg("-o");
  cmd.arg("ServerAliveInterval=30");
  cmd.arg("-o");
  cmd.arg("ServerAliveCountMax=3");
  cmd.arg(&target);
  // BatchMode는 켜지 않는다. 패스프레이즈/호스트키 프롬프트를 터미널에서 직접 입력할 수 있어야 한다.

  // 원격 명령을 붙이면 로그인 셸 대신 그 명령이 실행된다.
  // tmux가 죽거나 없는 경우까지 명령 안에서 처리하므로 여기서 분기하지 않는다.
  if persistent {
    let wrapped = tmux_wrapped_command(session_key.unwrap_or("default"));
    println!("[ssh_rt] persistent session enabled (tmux)");
    cmd.arg(&wrapped);
  }

  cmd.env("TERM", "xterm-256color");

  let child = pair
    .slave
    .spawn_command(cmd)
    .context("failed to spawn ssh inside pty")?;

  // slave는 자식에게 넘어갔으므로 부모 쪽 핸들은 즉시 닫는다.
  // (닫지 않으면 자식이 죽어도 master 쪽 read가 EOF를 보지 못한다)
  drop(pair.slave);

  let mut reader = pair
    .master
    .try_clone_reader()
    .context("failed to clone pty reader")?;
  let writer = pair
    .master
    .take_writer()
    .context("failed to take pty writer")?;

  let id = Uuid::new_v4();

  // 리더 스레드보다 먼저 맵에 등록한다.
  // 순서가 뒤바뀌면 ssh가 즉시 실패했을 때 리더가 remove(None)을 보고 ssh:closed를 못 쏘고,
  // 그 뒤 insert된 핸들이 맵에 좀비로 남는다.
  sessions().lock().insert(
    id,
    SshHandle {
      id,
      master: pair.master,
      writer,
      child,
    },
  );

  // --- PTY reader: 원본 바이트 그대로 밀어올린다 ---
  let app_reader = app.clone();
  thread::spawn(move || {
    let mut buf = [0u8; 8192];
    loop {
      match reader.read(&mut buf) {
        Ok(0) => break, // EOF: 자식 종료
        Ok(n) => {
          let _ = app_reader.emit(
            "ssh:data",
            SshBytesEvent {
              id: id.to_string(),
              data: B64.encode(&buf[..n]),
            },
          );
        }
        Err(e) if e.kind() == std::io::ErrorKind::Interrupted => continue,
        Err(_) => break,
      }
    }

    // 세션 정리 + 종료 통지.
    // close_session()이 먼저 지웠다면 여기서는 아무것도 하지 않는다 (ssh:closed 중복 방지).
    let removed = sessions().lock().remove(&id);
    if let Some(mut h) = removed {
      // 자식을 거둬 종료 코드를 확인한다. EOF가 이미 왔으므로 즉시 반환된다.
      // ssh(1)은 연결 실패/끊김에 255를 쓰고, 그 외에는 원격 셸의 종료 코드를 그대로 돌려준다.
      // 그래서 255가 아니면 사용자가 exit 등으로 끝낸 것이고, 자동 재접속으로 되살리면 안 된다.
      let clean = matches!(h.child.wait(), Ok(status) if status.exit_code() != 255);
      let _ = app_reader.emit(
        "ssh:closed",
        SshClosedEvent {
          id: id.to_string(),
          chunk: "session closed".into(),
          clean,
        },
      );
    }
    println!("[ssh_rt] session {id} reader finished");
  });


  println!("[ssh_rt] session {id} started");
  Ok(id)
}

/// 키 입력을 PTY에 원본 그대로 write 한다.
/// 개행을 임의로 붙이지 않는다 — Ctrl+C(0x03), ESC 시퀀스, Tab 자동완성이 그대로 전달되어야 한다.
pub fn write_bytes(id: Uuid, data: &[u8]) -> Result<()> {
  let mut map = sessions().lock();
  let h = map.get_mut(&id).context("session not found")?;
  h.writer.write_all(data).context("pty write failed")?;
  h.writer.flush().context("pty flush failed")?;
  Ok(())
}

/// 터미널 크기 변경을 PTY에 전파한다 (원격으로 SIGWINCH가 전달된다).
pub fn resize_session(id: Uuid, rows: u16, cols: u16) -> Result<()> {
  let map = sessions().lock();
  let h = map.get(&id).context("session not found")?;
  h.master
    .resize(PtySize {
      rows: rows.max(1),
      cols: cols.max(1),
      pixel_width: 0,
      pixel_height: 0,
    })
    .context("pty resize failed")?;
  Ok(())
}

/// 세션 종료: 해당 세션의 자식 프로세스만 죽인다.
pub fn close_session(app: &AppHandle, id: Uuid) -> Result<()> {
  let removed = sessions().lock().remove(&id);
  if let Some(mut h) = removed {
    let _ = h.child.kill();
    let _ = h.child.wait();
    // 사용자가 직접 끊었으므로 정상 종료다. 되살리지 않는다.
    let _ = app.emit(
      "ssh:closed",
      SshClosedEvent {
        id: id.to_string(),
        chunk: "session closed".into(),
        clean: true,
      },
    );
    println!("[ssh_rt] session {id} closed");
    Ok(())
  } else {
    anyhow::bail!("session not found");
  }
}

/// 앱 종료 시, 이 앱이 띄운 세션만 정리한다.
pub fn close_all_sessions(app: &AppHandle) {
  let ids: Vec<Uuid> = sessions().lock().keys().cloned().collect();
  for id in ids {
    let _ = close_session(app, id);
  }
}

// ============ Tunnel API ============

const DEFAULT_LOCAL_BIND: &str = "127.0.0.1";
const DEFAULT_REMOTE_BIND: &str = "localhost";
const DEFAULT_TARGET_HOST: &str = "localhost";

pub fn tunnel_bind_address(spec: &TunnelSpec) -> String {
  spec
    .bind_address
    .as_deref()
    .map(str::trim)
    .filter(|s| !s.is_empty())
    .unwrap_or(match spec.kind {
      TunnelKind::Remote => DEFAULT_REMOTE_BIND,
      _ => DEFAULT_LOCAL_BIND,
    })
    .to_string()
}

pub fn tunnel_target_host(spec: &TunnelSpec) -> String {
  spec
    .target_host
    .as_deref()
    .map(str::trim)
    .filter(|s| !s.is_empty())
    .unwrap_or(DEFAULT_TARGET_HOST)
    .to_string()
}

/// TunnelSpec을 ssh 인자 한 쌍으로 바꾼다. 순수 함수라 단독으로 검증할 수 있다.
///
/// - Local:   `-L bind:bindPort:target:targetPort`
/// - Remote:  `-R bind:bindPort:target:targetPort`
/// - Dynamic: `-D bind:bindPort`
pub fn build_forward_arg(spec: &TunnelSpec) -> Result<(&'static str, String)> {
  if spec.bind_port == 0 {
    anyhow::bail!("bind port must not be 0");
  }

  let bind = tunnel_bind_address(spec);
  if bind.contains(':') {
    // ssh의 -L 문법은 콜론으로 필드를 나눈다. IPv6 리터럴은 그대로 못 쓴다.
    anyhow::bail!("bind address must not contain ':' (got {bind})");
  }

  match spec.kind {
    TunnelKind::Dynamic => Ok(("-D", format!("{bind}:{}", spec.bind_port))),
    TunnelKind::Local | TunnelKind::Remote => {
      let target_port = spec
        .target_port
        .filter(|p| *p != 0)
        .context("target port is required for local/remote forwarding")?;
      let target = tunnel_target_host(spec);
      if target.contains(':') {
        anyhow::bail!("target host must not contain ':' (got {target})");
      }
      let flag = if spec.kind == TunnelKind::Local { "-L" } else { "-R" };
      Ok((flag, format!("{bind}:{}:{target}:{target_port}", spec.bind_port)))
    }
  }
}

/// UI/로그에 그대로 쓰는 한 줄 설명.
pub fn describe_tunnel(spec: &TunnelSpec, via: &str) -> String {
  let bind = tunnel_bind_address(spec);
  match spec.kind {
    TunnelKind::Dynamic => format!("SOCKS5 {bind}:{} via {via}", spec.bind_port),
    TunnelKind::Local => format!(
      "{bind}:{} -> {}:{} via {via}",
      spec.bind_port,
      tunnel_target_host(spec),
      spec.target_port.unwrap_or(0)
    ),
    TunnelKind::Remote => format!(
      "remote {bind}:{} -> {}:{} via {via}",
      spec.bind_port,
      tunnel_target_host(spec),
      spec.target_port.unwrap_or(0)
    ),
  }
}

/// 로컬에 바인드하는 터널은 미리 포트를 잡아본다.
/// 안 하면 ssh가 "bind: Address already in use"만 남기고 죽어서 원인을 알기 어렵다.
fn ensure_local_port_free(spec: &TunnelSpec) -> Result<()> {
  if matches!(spec.kind, TunnelKind::Remote) {
    return Ok(()); // -R은 원격에서 바인드한다
  }
  let bind = tunnel_bind_address(spec);
  match std::net::TcpListener::bind((bind.as_str(), spec.bind_port)) {
    Ok(listener) => {
      drop(listener);
      Ok(())
    }
    Err(e) => anyhow::bail!("local port {bind}:{} is not available: {e}", spec.bind_port),
  }
}

fn tunnel_info(id: Uuid, h: &TunnelHandle) -> TunnelInfo {
  TunnelInfo {
    id: id.to_string(),
    kind: h.spec.kind,
    bind_address: tunnel_bind_address(&h.spec),
    bind_port: h.spec.bind_port,
    target_host: match h.spec.kind {
      TunnelKind::Dynamic => None,
      _ => Some(tunnel_target_host(&h.spec)),
    },
    target_port: h.spec.target_port,
    label: h.spec.label.clone(),
    via: h.via.clone(),
    description: describe_tunnel(&h.spec, &h.via),
  }
}

/// SSH 터널 생성 (포트 포워딩만, 명령 실행 없음)
pub fn open_tunnel(app: AppHandle, params: SshParams, spec: TunnelSpec) -> Result<Uuid> {
  let (flag, forward) = build_forward_arg(&spec)?;
  ensure_local_port_free(&spec)?;

  let via = format!("{}@{}", params.user, params.host);
  println!("[ssh_rt] creating tunnel: {flag} {forward}");

  let mut cmd = Command::new("ssh");
  cmd
    .args([
      "-i",
      &params.pem_path,
      flag,
      &forward,
      "-N", // 명령 실행 안함, 터널만 유지
      "-o",
      "StrictHostKeyChecking=accept-new",
      "-o",
      "BatchMode=yes",
      "-o",
      "LogLevel=ERROR",
      "-o",
      "ExitOnForwardFailure=yes", // 포워딩 실패 시 즉시 종료
      "-o",
      "ServerAliveInterval=30",
      "-o",
      "ServerAliveCountMax=3",
      &via,
    ])
    .stdin(Stdio::null())
    .stdout(Stdio::piped())
    .stderr(Stdio::piped());

  // Windows에서 콘솔 창 숨김
  #[cfg(target_os = "windows")]
  {
    const CREATE_NO_WINDOW: u32 = 0x08000000;
    const CREATE_NEW_PROCESS_GROUP: u32 = 0x00000200;
    cmd.creation_flags(CREATE_NO_WINDOW | CREATE_NEW_PROCESS_GROUP);
  }

  let mut child = cmd.spawn().context("failed to spawn ssh tunnel")?;
  let id = Uuid::new_v4();
  let stderr_tail: Arc<Mutex<Vec<String>>> = Arc::new(Mutex::new(Vec::new()));

  // stderr 모니터링. 이벤트로 올리는 동시에 종료 사유용으로 마지막 줄들을 남긴다.
  if let Some(stderr) = child.stderr.take() {
    let app_stderr = app.clone();
    let tail = stderr_tail.clone();
    thread::spawn(move || {
      let reader = BufReader::new(stderr);
      for line in reader.lines().map_while(std::result::Result::ok) {
        {
          let mut t = tail.lock();
          t.push(line.clone());
          if t.len() > 10 {
            t.remove(0);
          }
        }
        let _ = app_stderr.emit(
          "tunnel:stderr",
          SshDataEvent {
            id: id.to_string(),
            chunk: line,
          },
        );
      }
    });
  }

  let description = describe_tunnel(&spec, &via);
  tunnels().lock().insert(
    id,
    TunnelHandle {
      id,
      child,
      spec,
      via,
      stderr_tail,
    },
  );

  ensure_tunnel_reaper(app.clone());

  let _ = app.emit(
    "tunnel:opened",
    SshDataEvent {
      id: id.to_string(),
      chunk: format!("Tunnel opened: {description}"),
    },
  );

  println!("[ssh_rt] tunnel {id} opened: {description}");
  Ok(id)
}

/// monitoring.rs용 단축 헬퍼: 로컬 포트 → 원격 localhost 포트
pub fn open_local_tunnel(
  app: AppHandle,
  params: SshParams,
  local_port: u16,
  remote_port: u16,
) -> Result<Uuid> {
  open_tunnel(
    app,
    params,
    TunnelSpec {
      kind: TunnelKind::Local,
      bind_address: None,
      bind_port: local_port,
      target_host: None,
      target_port: Some(remote_port),
      label: None,
    },
  )
}

pub fn list_tunnels() -> Vec<TunnelInfo> {
  let map = tunnels().lock();
  let mut out: Vec<TunnelInfo> = map.iter().map(|(id, h)| tunnel_info(*id, h)).collect();
  out.sort_by(|a, b| a.bind_port.cmp(&b.bind_port).then(a.id.cmp(&b.id)));
  out
}

/// 터널 종료
pub fn close_tunnel(app: &AppHandle, id: Uuid) -> Result<()> {
  let removed = tunnels().lock().remove(&id);
  if let Some(mut h) = removed {
    let _ = h.child.kill();
    let _ = h.child.wait();
    let _ = app.emit(
      "tunnel:closed",
      SshDataEvent {
        id: id.to_string(),
        chunk: format!("Tunnel closed: {}", describe_tunnel(&h.spec, &h.via)),
      },
    );
    println!("[ssh_rt] tunnel {id} closed");
    Ok(())
  } else {
    anyhow::bail!("tunnel not found");
  }
}

/// 모든 터널 종료 (이 앱이 띄운 것만)
pub fn close_all_tunnels(app: &AppHandle) {
  let ids: Vec<Uuid> = tunnels().lock().keys().cloned().collect();
  for id in ids {
    let _ = close_tunnel(app, id);
  }
}

/// 종료된 ssh 프로세스를 가진 터널을 맵에서 걷어내고 종료 사유를 돌려준다.
///
/// 이게 없으면 네트워크가 끊기거나 원격이 포워딩을 거부해서 ssh가 죽어도
/// 맵에는 계속 "열림"으로 남아 UI가 거짓말을 한다.
///
/// emit과 분리해 둔 이유는 AppHandle 없이 단독으로 검증하기 위해서다.
fn reap_dead_tunnels() -> Vec<(Uuid, String)> {
  let mut dead = Vec::new();
  let mut map = tunnels().lock();
  let ids: Vec<Uuid> = map.keys().cloned().collect();

  for id in ids {
    let exited = map
      .get_mut(&id)
      .map(|h| matches!(h.child.try_wait(), Ok(Some(_))))
      .unwrap_or(false);
    if !exited {
      continue;
    }
    if let Some(h) = map.remove(&id) {
      let description = describe_tunnel(&h.spec, &h.via);
      let reason = h.stderr_tail.lock().join("; ");
      dead.push((
        id,
        if reason.is_empty() {
          format!("Tunnel closed unexpectedly: {description}")
        } else {
          format!("Tunnel closed unexpectedly: {description} ({reason})")
        },
      ));
    }
  }
  dead
}

static REAPER: OnceCell<()> = OnceCell::new();
fn ensure_tunnel_reaper(app: AppHandle) {
  REAPER.get_or_init(|| {
    thread::spawn(move || loop {
      thread::sleep(std::time::Duration::from_millis(700));
      for (id, chunk) in reap_dead_tunnels() {
        println!("[ssh_rt] {chunk}");
        let _ = app.emit(
          "tunnel:closed",
          SshDataEvent {
            id: id.to_string(),
            chunk,
          },
        );
      }
    });
  });
}

#[cfg(test)]
mod tests {
  use super::*;

  fn spec(kind: TunnelKind, bind_port: u16, target_port: Option<u16>) -> TunnelSpec {
    TunnelSpec {
      kind,
      bind_address: None,
      bind_port,
      target_host: None,
      target_port,
      label: None,
    }
  }

  // ---- tmux 영속 세션 ----
  //
  // sanitize_session_key의 결과는 원격 셸이 해석하는 명령 문자열에 그대로 들어간다.
  // 여기서 새는 문자가 하나라도 있으면 원격 명령 실행이다.

  #[test]
  fn session_key_keeps_ordinary_identifiers() {
    assert_eq!(sanitize_session_key("prod"), "prod");
    assert_eq!(sanitize_session_key("web-01"), "web-01");
    assert_eq!(sanitize_session_key("my_server_2"), "my_server_2");
    assert_eq!(
      sanitize_session_key("3f2b1a0c9d8e7f6a5b4c3d2e1f0a9b8c"),
      "3f2b1a0c9d8e7f6a5b4c3d2e1f0a9b8c"
    );
  }

  #[test]
  fn session_key_strips_shell_metacharacters() {
    // 통과하면 tmux 세션 이름 자리에서 임의 명령이 실행된다
    for (input, expected) in [
      ("a; rm -rf /", "arm-rf"),
      ("a && whoami", "awhoami"),
      ("a | tee /tmp/x", "ateetmpx"),
      ("a`id`", "aid"),
      ("a$(id)", "aid"),
      ("a\nwhoami", "awhoami"),
      ("a>b", "ab"),
      ("a'b\"c\\d", "abcd"),
      ("a b", "ab"),
      ("a*b", "ab"),
    ] {
      assert_eq!(sanitize_session_key(input), expected, "input={input:?}");
    }
  }

  #[test]
  fn session_key_strips_characters_tmux_rejects() {
    // tmux는 세션 이름에 '.'과 ':'를 허용하지 않는다
    assert_eq!(sanitize_session_key("ec2-1-2-3-4.compute.amazonaws.com"), "ec2-1-2-3-4computeamazonawscom");
    assert_eq!(sanitize_session_key("host:22"), "host22");
  }

  #[test]
  fn session_key_falls_back_when_nothing_survives() {
    // 빈 이름을 넘기면 `tmux new-session -A -s arfni-` 가 되어 명령이 깨진다
    assert_eq!(sanitize_session_key(""), "default");
    assert_eq!(sanitize_session_key("...:::"), "default");
    assert_eq!(sanitize_session_key("한글만"), "default");
    assert_eq!(sanitize_session_key("   "), "default");
  }

  #[test]
  fn session_key_is_length_capped() {
    let long = "a".repeat(200);
    assert_eq!(sanitize_session_key(&long).len(), 48);
  }

  #[test]
  fn tmux_command_uses_the_sanitized_name_and_falls_back_to_login_shell() {
    let cmd = tmux_wrapped_command("web-01");
    assert!(cmd.contains("new-session -A -s arfni-web-01"), "{cmd}");
    // tmux가 없는 서버에서도 로그인 셸로 떨어져야 한다
    assert!(cmd.contains(r#"exec "$SHELL" -l"#), "{cmd}");
    // 마우스를 tmux가 가져가면 xterm의 드래그 선택/우클릭이 죽는다
    assert!(cmd.contains("mouse off"), "{cmd}");
  }

  #[test]
  fn tmux_command_does_not_let_the_key_escape() {
    let cmd = tmux_wrapped_command("evil; rm -rf /");
    assert!(cmd.contains("arfni-evilrm-rf"), "{cmd}");
    // 정제 후 이름 뒤에는 원래 명령 구분자만 남아야 한다
    assert!(!cmd.contains("rm -rf /"), "{cmd}");
  }

  #[test]
  fn local_forward_defaults_to_loopback_and_localhost() {
    let (flag, arg) = build_forward_arg(&spec(TunnelKind::Local, 9091, Some(9090))).unwrap();
    assert_eq!(flag, "-L");
    assert_eq!(arg, "127.0.0.1:9091:localhost:9090");
  }

  #[test]
  fn local_forward_can_reach_a_third_host() {
    // EC2에서만 보이는 RDS 같은 경우
    let mut s = spec(TunnelKind::Local, 5432, Some(5432));
    s.target_host = Some("db.internal".into());
    let (flag, arg) = build_forward_arg(&s).unwrap();
    assert_eq!(flag, "-L");
    assert_eq!(arg, "127.0.0.1:5432:db.internal:5432");
  }

  #[test]
  fn local_forward_can_bind_all_interfaces() {
    let mut s = spec(TunnelKind::Local, 8080, Some(80));
    s.bind_address = Some("0.0.0.0".into());
    assert_eq!(build_forward_arg(&s).unwrap().1, "0.0.0.0:8080:localhost:80");
  }

  #[test]
  fn remote_forward_uses_dash_r_and_remote_default_bind() {
    let (flag, arg) = build_forward_arg(&spec(TunnelKind::Remote, 8000, Some(3000))).unwrap();
    assert_eq!(flag, "-R");
    assert_eq!(arg, "localhost:8000:localhost:3000");
  }

  #[test]
  fn dynamic_forward_ignores_target() {
    let (flag, arg) = build_forward_arg(&spec(TunnelKind::Dynamic, 1080, None)).unwrap();
    assert_eq!(flag, "-D");
    assert_eq!(arg, "127.0.0.1:1080");
  }

  #[test]
  fn local_forward_requires_a_target_port() {
    let err = build_forward_arg(&spec(TunnelKind::Local, 9091, None)).unwrap_err();
    assert!(err.to_string().contains("target port"), "{err}");
    // 0도 미지정과 같게 취급해야 ssh에 ":0"이 넘어가지 않는다
    assert!(build_forward_arg(&spec(TunnelKind::Local, 9091, Some(0))).is_err());
  }

  #[test]
  fn zero_bind_port_is_rejected() {
    assert!(build_forward_arg(&spec(TunnelKind::Local, 0, Some(80))).is_err());
  }

  #[test]
  fn colons_in_hosts_are_rejected() {
    // ssh 인자는 콜론으로 필드를 나눈다. 통과시키면 포워딩 대상이 조용히 바뀐다.
    let mut s = spec(TunnelKind::Local, 9091, Some(9090));
    s.bind_address = Some("::1".into());
    assert!(build_forward_arg(&s).is_err());

    let mut s2 = spec(TunnelKind::Local, 9091, Some(9090));
    s2.target_host = Some("evil:1234".into());
    assert!(build_forward_arg(&s2).is_err());
  }

  #[test]
  fn description_reads_in_the_direction_of_traffic() {
    assert_eq!(
      describe_tunnel(&spec(TunnelKind::Local, 9091, Some(9090)), "ubuntu@ec2"),
      "127.0.0.1:9091 -> localhost:9090 via ubuntu@ec2"
    );
    assert_eq!(
      describe_tunnel(&spec(TunnelKind::Dynamic, 1080, None), "ubuntu@ec2"),
      "SOCKS5 127.0.0.1:1080 via ubuntu@ec2"
    );
  }

  #[test]
  fn busy_local_port_is_detected_before_spawning_ssh() {
    let listener = std::net::TcpListener::bind(("127.0.0.1", 0)).unwrap();
    let port = listener.local_addr().unwrap().port();

    let busy = spec(TunnelKind::Local, port, Some(9090));
    let err = ensure_local_port_free(&busy).unwrap_err();
    assert!(err.to_string().contains("not available"), "{err}");

    // -R은 원격에서 바인드하므로 로컬 점유와 무관해야 한다
    assert!(ensure_local_port_free(&spec(TunnelKind::Remote, port, Some(9090))).is_ok());

    drop(listener);
  }

  /// ssh가 죽으면 터널이 목록에서 사라져야 한다.
  /// 수거가 없으면 UI가 끊어진 터널을 계속 "열림"으로 보여준다.
  #[test]
  fn reaper_removes_tunnels_whose_ssh_exited() {
    // 바로 종료되는 프로세스를 ssh 대신 세워 종료 감지만 검증한다.
    let mut cmd = if cfg!(windows) {
      let mut c = Command::new("cmd.exe");
      c.args(["/c", "exit", "3"]);
      c
    } else {
      let mut c = Command::new("sh");
      c.args(["-c", "exit 3"]);
      c
    };
    let child = cmd
      .stdin(Stdio::null())
      .stdout(Stdio::null())
      .stderr(Stdio::null())
      .spawn()
      .expect("spawn failed");

    let id = Uuid::new_v4();
    tunnels().lock().insert(
      id,
      TunnelHandle {
        id,
        child,
        spec: spec(TunnelKind::Local, 59_991, Some(9090)),
        via: "ubuntu@ec2".into(),
        stderr_tail: Arc::new(Mutex::new(vec!["bind: Address already in use".into()])),
      },
    );

    // 살아 있는 동안에는 목록에 있어야 한다
    assert!(list_tunnels().iter().any(|t| t.id == id.to_string()));

    // 자식이 실제로 끝날 때까지 기다린다
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(5);
    let mut reaped: Vec<(Uuid, String)> = Vec::new();
    while std::time::Instant::now() < deadline {
      reaped = reap_dead_tunnels();
      if reaped.iter().any(|(rid, _)| *rid == id) {
        break;
      }
      std::thread::sleep(std::time::Duration::from_millis(50));
    }

    let (_, chunk) = reaped
      .into_iter()
      .find(|(rid, _)| *rid == id)
      .expect("죽은 터널이 수거되지 않았다");

    // 종료 사유(stderr 마지막 줄)가 메시지에 실려야 원인을 알 수 있다
    assert!(chunk.contains("closed unexpectedly"), "{chunk}");
    assert!(chunk.contains("Address already in use"), "{chunk}");

    // 맵에서도 빠져야 한다
    assert!(!list_tunnels().iter().any(|t| t.id == id.to_string()));
  }
}
