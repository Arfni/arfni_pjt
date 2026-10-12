use anyhow::{Context, Result};
use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
use once_cell::sync::OnceCell;
use parking_lot::Mutex;
use portable_pty::{native_pty_system, Child as PtyChild, CommandBuilder, MasterPty, PtySize};
use serde::{Deserialize, Serialize};
use std::{
  collections::HashMap,
  io::{BufRead, BufReader, Read, Write},
  net::{SocketAddr, TcpStream, ToSocketAddrs},
  process::{Child as StdChild, Command, Stdio},
  sync::Arc,
  thread,
  time::{Duration, Instant},
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

/// Status and notice events, carrying human readable text
#[derive(Debug, Clone, Serialize)]
pub struct SshDataEvent {
  pub id: String,
  pub chunk: String,
}

/// Session close event.
///
/// Why `clean` exists: a pty EOF looks identical for "the user typed exit" and "the
/// link went past ServerAliveInterval and dropped". Unable to tell them apart, the
/// frontend would revive tabs the user closed on purpose.
#[derive(Debug, Clone, Serialize)]
pub struct SshClosedEvent {
  pub id: String,
  pub chunk: String,
  /// True when the remote shell exited normally, false when ssh died with the link.
  pub clean: bool,
}

/// Raw pty byte stream event. ANSI escapes are left in place for the terminal emulator
/// on the frontend (xterm.js) to interpret, and the payload is base64 because a UTF-8
/// boundary can fall in the middle of a chunk.
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
  /// -L : opens a local port and connects to target_host:target_port from the remote side
  Local,
  /// -R : opens a remote port and connects to target_host:target_port from this side
  Remote,
  /// -D : opens a SOCKS5 proxy locally
  Dynamic,
}

/// A direct transcription of ssh's -L, -R and -D syntax. The field names follow the ssh
/// argument order (bind then target) so the direction of -L and -R stays unambiguous.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TunnelSpec {
  pub kind: TunnelKind,
  /// Address to bind: locally for -L and -D, on the remote for -R
  #[serde(default)]
  pub bind_address: Option<String>,
  pub bind_port: u16,
  /// Unused for -D
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
  /// ssh target (user@host)
  pub via: String,
  /// One line description the UI can show as is
  pub description: String,
}

/// Result of a tunnel request.
///
/// `created` tells a caller that opens several tunnels which ones it is responsible for:
/// a reused tunnel belongs to whoever opened it first and must not be rolled back.
pub struct TunnelOpen {
  pub id: Uuid,
  pub created: bool,
}

// ============ Tunnel Handle ============

struct TunnelHandle {
  #[allow(dead_code)]
  id: Uuid,
  child: StdChild,
  spec: TunnelSpec,
  via: String,
  pem_path: String,
  owner: Option<String>,
  /// Keeps the last stderr lines so the exit reason can be reported
  stderr_tail: Arc<Mutex<Vec<String>>>,
}

// Global session map
static SESSIONS: OnceCell<Mutex<HashMap<Uuid, SshHandle>>> = OnceCell::new();
fn sessions() -> &'static Mutex<HashMap<Uuid, SshHandle>> {
  SESSIONS.get_or_init(|| Mutex::new(HashMap::new()))
}

// Global tunnel map
static TUNNELS: OnceCell<Mutex<HashMap<Uuid, TunnelHandle>>> = OnceCell::new();
fn tunnels() -> &'static Mutex<HashMap<Uuid, TunnelHandle>> {
  TUNNELS.get_or_init(|| Mutex::new(HashMap::new()))
}

// ============ Session API ============

/// Sanitises an identifier so it can serve as a tmux session name.
///
/// The value is pasted straight into a remote shell command, so no shell metacharacter
/// may survive. tmux itself also rejects `.` and `:` in session names.
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

/// Builds the remote command that wraps the shell in tmux so work survives a drop.
///
/// Reasoning:
/// - `new-session -A`: attach if it exists, create otherwise, which turns a reconnect
///   into a restore.
/// - `mouse off`: once tmux owns the mouse, xterm.js loses drag selection and right
///   click copy and paste. The frontend has to keep the mouse.
/// - scrolling is bound to Alt with up and down instead, so the frontend can translate
///   the wheel into those keys and reach the scrollback without giving up the mouse.
///   `copy-mode -e` also leaves itself once it hits the bottom.
/// - on a server without tmux this falls back quietly to the normal login shell.
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

/// Spawns ssh inside a local pty (ConPTY on Windows) and streams all of its output as
/// raw bytes.
///
/// The previous implementation used `Stdio::piped()` with `BufReader::lines()`, where
/// - nothing was emitted until a newline arrived, so full screen tuis such as codex, vim
///   or htop never appeared, and
/// - without a local tty there was no way to negotiate rows and cols.
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
  // BatchMode stays off so passphrase and host key prompts can be answered in the terminal.

  // A remote command replaces the login shell. The command itself handles a missing or
  // dying tmux, so there is no branch here.
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

  // The slave went to the child, so the parent handle is closed at once; kept open, the
  // master side would never see EOF even after the child dies.
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

  // Registered in the map before the reader thread starts. The other order means an ssh
  // that fails instantly makes the reader see remove(None), skip ssh:closed, and leave
  // the handle inserted afterwards as a zombie.
  sessions().lock().insert(
    id,
    SshHandle {
      id,
      master: pair.master,
      writer,
      child,
    },
  );

  // --- pty reader: pushes raw bytes upwards ---
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

    // Cleans up the session and reports the close. When close_session() already removed
    // it, nothing happens here, which keeps ssh:closed from firing twice.
    let removed = sessions().lock().remove(&id);
    if let Some(mut h) = removed {
      // Reaps the child for its exit code, returning immediately since EOF already came.
      // ssh(1) uses 255 for a failed or dropped connection and otherwise passes the remote
      // shell's code through, so anything else means the user ended it and it must not be
      // revived.
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

/// Writes key input to the pty verbatim, adding no newline of its own: Ctrl+C (0x03),
/// escape sequences and tab completion all have to pass through untouched.
pub fn write_bytes(id: Uuid, data: &[u8]) -> Result<()> {
  let mut map = sessions().lock();
  let h = map.get_mut(&id).context("session not found")?;
  h.writer.write_all(data).context("pty write failed")?;
  h.writer.flush().context("pty flush failed")?;
  Ok(())
}

/// Propagates a terminal resize to the pty, which sends SIGWINCH to the remote.
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

/// Closes a session, killing only that session's child process.
pub fn close_session(app: &AppHandle, id: Uuid) -> Result<()> {
  let removed = sessions().lock().remove(&id);
  if let Some(mut h) = removed {
    let _ = h.child.kill();
    let _ = h.child.wait();
    // The user disconnected, so this is a clean exit and nothing is revived.
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

/// On app shutdown, cleans up only the sessions this app started.
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

/// Turns a TunnelSpec into the pair of ssh arguments. Pure, so it can be tested alone.
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
    // ssh's -L syntax splits fields on colons, so an IPv6 literal cannot be used as is.
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

/// One line description used directly in the UI and logs.
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

/// A tunnel that binds locally probes the port first. Without it ssh just dies leaving
/// "bind: Address already in use", which says little about the cause.
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

/// How long to wait for a freshly spawned ssh to actually serve its forward.
const FORWARD_READY_TIMEOUT: Duration = Duration::from_secs(10);

/// True when two tunnels would occupy the same local endpoint and forward to the same
/// place through the same ssh target. Spawning the second is pointless: it can only fail
/// on the port bind.
fn tunnel_equivalent(a: &TunnelSpec, a_via: &str, b: &TunnelSpec, b_via: &str) -> bool {
  a.kind == b.kind
    && a_via == b_via
    && tunnel_bind_address(a) == tunnel_bind_address(b)
    && a.bind_port == b.bind_port
    && match a.kind {
      // -D has no target; the bind endpoint fully identifies it
      TunnelKind::Dynamic => true,
      _ => tunnel_target_host(a) == tunnel_target_host(b) && a.target_port == b.target_port,
    }
}

fn forward_endpoint(spec: &TunnelSpec) -> Option<SocketAddr> {
  let bind = tunnel_bind_address(spec);
  (bind.as_str(), spec.bind_port).to_socket_addrs().ok()?.next()
}

/// Confirms the forwarded port accepts connections.
///
/// `ensure_local_port_free` only proves nothing else holds the port; this proves ssh is
/// serving it. For -L that is true as soon as ssh listens, so this does not depend on the
/// remote service being up.
fn probe_forward(spec: &TunnelSpec) -> bool {
  if matches!(spec.kind, TunnelKind::Remote) {
    return true; // bound on the server, nothing to probe from here
  }
  forward_endpoint(spec)
    .map(|addr| TcpStream::connect_timeout(&addr, Duration::from_millis(500)).is_ok())
    .unwrap_or(false)
}

/// Returns a live, working tunnel equivalent to `spec`, dropping a stale match so the
/// caller can spawn a fresh one.
///
/// A match whose ssh is alive but whose forward no longer answers is worse than no match:
/// it holds the port while serving nothing.
fn reuse_live_tunnel(spec: &TunnelSpec, via: &str) -> Option<Uuid> {
  reuse_tunnel_for(spec, via, None, None)
}

fn reuse_owned_tunnel(spec: &TunnelSpec, via: &str, pem_path: &str, owner: &str) -> Option<Uuid> {
  reuse_tunnel_for(spec, via, Some(pem_path), Some(owner))
}

fn reuse_tunnel_for(spec: &TunnelSpec, via: &str, pem_path: Option<&str>, owner: Option<&str>) -> Option<Uuid> {
  let mut map = tunnels().lock();
  let found = map.iter().find_map(|(id, h)| {
    if tunnel_equivalent(&h.spec, &h.via, spec, via)
      && h.owner.as_deref() == owner
      && pem_path.map_or(true, |key| h.pem_path == key)
    {
      Some(*id)
    } else {
      None
    }
  })?;

  let alive = map
    .get_mut(&found)
    .map(|h| !matches!(h.child.try_wait(), Ok(Some(_))))
    .unwrap_or(false);
  if alive && probe_forward(spec) {
    return Some(found);
  }

  if let Some(mut h) = map.remove(&found) {
    println!("[ssh_rt] dropping stale tunnel {found}: {}", describe_tunnel(&h.spec, &h.via));
    let _ = h.child.kill();
    let _ = h.child.wait();
  }
  None
}

/// Blocks until the forward serves, the ssh process dies, or the timeout expires.
///
/// `open_tunnel` used to return as soon as ssh was spawned, so a forward the server
/// refused — `ExitOnForwardFailure` kills ssh milliseconds later — was reported as
/// success, and the caller only discovered it when its own requests failed.
fn wait_for_forward(
  child: &mut StdChild,
  spec: &TunnelSpec,
  stderr_tail: &Arc<Mutex<Vec<String>>>,
) -> Result<()> {
  if matches!(spec.kind, TunnelKind::Remote) {
    return Ok(());
  }
  let reason = || {
    let tail = stderr_tail.lock().join("; ");
    if tail.is_empty() {
      String::new()
    } else {
      format!(": {tail}")
    }
  };

  let deadline = Instant::now() + FORWARD_READY_TIMEOUT;
  loop {
    if let Ok(Some(status)) = child.try_wait() {
      anyhow::bail!("ssh exited before the forward was ready ({status}){}", reason());
    }
    if probe_forward(spec) {
      return Ok(());
    }
    if Instant::now() >= deadline {
      anyhow::bail!(
        "timed out after {}s waiting for the forward to accept connections{}",
        FORWARD_READY_TIMEOUT.as_secs(),
        reason()
      );
    }
    thread::sleep(Duration::from_millis(150));
  }
}

/// Creates an ssh tunnel: port forwarding only, no command execution.
pub fn open_tunnel(app: AppHandle, params: SshParams, spec: TunnelSpec) -> Result<Uuid> {
  open_tunnel_ex(app, params, spec).map(|t| t.id)
}

/// Same as [`open_tunnel`], but reports whether the tunnel was newly spawned or reused.
pub fn open_tunnel_ex(app: AppHandle, params: SshParams, spec: TunnelSpec) -> Result<TunnelOpen> {
  open_tunnel_for(app, params, spec, None)
}

fn open_tunnel_for(app: AppHandle, params: SshParams, spec: TunnelSpec, owner: Option<String>) -> Result<TunnelOpen> {
  let (flag, forward) = build_forward_arg(&spec)?;
  let via = format!("{}@{}", params.user, params.host);

  let reused = match owner.as_deref() {
    Some(project) => reuse_owned_tunnel(&spec, &via, &params.pem_path, project),
    None => reuse_live_tunnel(&spec, &via),
  };
  if let Some(id) = reused {
    println!("[ssh_rt] reusing tunnel {id}: {flag} {forward}");
    return Ok(TunnelOpen { id, created: false });
  }

  ensure_local_port_free(&spec)?;

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

  // Hides the console window on Windows
  #[cfg(target_os = "windows")]
  {
    const CREATE_NO_WINDOW: u32 = 0x08000000;
    const CREATE_NEW_PROCESS_GROUP: u32 = 0x00000200;
    cmd.creation_flags(CREATE_NO_WINDOW | CREATE_NEW_PROCESS_GROUP);
  }

  let mut child = cmd.spawn().context("failed to spawn ssh tunnel")?;
  let id = Uuid::new_v4();
  let stderr_tail: Arc<Mutex<Vec<String>>> = Arc::new(Mutex::new(Vec::new()));

  // Watches stderr, both emitting events and keeping the last lines as an exit reason.
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

  // Confirmed before registering: a tunnel in the map is one the UI is told is open.
  if let Err(e) = wait_for_forward(&mut child, &spec, &stderr_tail) {
    let _ = child.kill();
    let _ = child.wait();
    return Err(e.context(format!("tunnel {flag} {forward} failed")));
  }

  let description = describe_tunnel(&spec, &via);
  tunnels().lock().insert(
    id,
    TunnelHandle {
      id,
      child,
      spec,
      via,
      pem_path: params.pem_path,
      owner,
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
  Ok(TunnelOpen { id, created: true })
}

pub fn open_local_tunnel_owned(
  app: AppHandle,
  params: SshParams,
  local_port: u16,
  remote_port: u16,
  owner: String,
) -> Result<TunnelOpen> {
  open_tunnel_for(
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
    Some(owner),
  )
}

fn owned_tunnel_ids(owner: &str) -> Vec<Uuid> {
  tunnels().lock().iter()
    .filter_map(|(id, h)| (h.owner.as_deref() == Some(owner)).then_some(*id))
    .collect()
}

pub fn close_owned_tunnels(app: &AppHandle, owner: &str) {
  for id in owned_tunnel_ids(owner) {
    let _ = close_tunnel(app, id);
  }
}

fn outdated_owned_tunnel_ids(owner: &str, params: &SshParams, prometheus_port: u16, grafana_port: u16) -> Vec<Uuid> {
  let via = format!("{}@{}", params.user, params.host);
  tunnels().lock().iter()
    .filter_map(|(id, h)| {
      if h.owner.as_deref() != Some(owner) {
        return None;
      }
      let expected_port = match h.spec.target_port {
        Some(9090) => prometheus_port,
        Some(3200) => grafana_port,
        _ => return Some(*id),
      };
      let matches = h.via == via
        && h.pem_path == params.pem_path
        && h.spec.kind == TunnelKind::Local
        && tunnel_bind_address(&h.spec) == "127.0.0.1"
        && tunnel_target_host(&h.spec) == "localhost"
        && h.spec.bind_port == expected_port;
      (!matches).then_some(*id)
    })
    .collect()
}

pub fn retire_outdated_owned_tunnels(app: &AppHandle, owner: &str, params: &SshParams, prometheus_port: u16, grafana_port: u16) {
  for id in outdated_owned_tunnel_ids(owner, params, prometheus_port, grafana_port) {
    let _ = close_tunnel(app, id);
  }
}

pub fn list_tunnels() -> Vec<TunnelInfo> {
  let map = tunnels().lock();
  let mut out: Vec<TunnelInfo> = map.iter().map(|(id, h)| tunnel_info(*id, h)).collect();
  out.sort_by(|a, b| a.bind_port.cmp(&b.bind_port).then(a.id.cmp(&b.id)));
  out
}

/// Closes a tunnel
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

/// Closes every tunnel this app started
pub fn close_all_tunnels(app: &AppHandle) {
  let ids: Vec<Uuid> = tunnels().lock().keys().cloned().collect();
  for id in ids {
    let _ = close_tunnel(app, id);
  }
}

/// Removes tunnels whose ssh process exited from the map and returns the exit reason.
///
/// Without it, an ssh killed by a dropped network or a refused forwarding stays "open"
/// in the map and the UI lies about it.
///
/// Kept apart from the emit so it can be verified without an AppHandle.
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

  #[test]
  fn monitoring_reuse_rejects_manual_and_other_project_tunnels() {
    let owner = Uuid::new_v4().to_string();
    let listener = std::net::TcpListener::bind(("127.0.0.1", 0)).unwrap();
    let port = listener.local_addr().unwrap().port();
    let s = spec(TunnelKind::Local, port, Some(3200));
    let manual = insert_stub("ubuntu@shared-host", s.clone());

    assert_eq!(reuse_owned_tunnel(&s, "ubuntu@shared-host", "key.pem", &owner), None);
    assert_eq!(owned_tunnel_ids(&owner), Vec::<Uuid>::new());

    forget_stub(manual);
    drop(listener);
  }

  #[test]
  fn monitoring_reuse_requires_same_project_and_ssh_key() {
    let owner = Uuid::new_v4().to_string();
    let other_owner = Uuid::new_v4().to_string();
    let listener = std::net::TcpListener::bind(("127.0.0.1", 0)).unwrap();
    let port = listener.local_addr().unwrap().port();
    let s = spec(TunnelKind::Local, port, Some(3200));
    let id = insert_owned_stub("ubuntu@shared-host", "old.pem", &owner, s.clone());

    assert_eq!(reuse_owned_tunnel(&s, "ubuntu@shared-host", "old.pem", &owner), Some(id));
    assert_eq!(reuse_owned_tunnel(&s, "ubuntu@shared-host", "new.pem", &owner), None);
    assert_eq!(reuse_owned_tunnel(&s, "ubuntu@shared-host", "old.pem", &other_owner), None);
    assert_eq!(owned_tunnel_ids(&owner), vec![id]);
    assert_eq!(owned_tunnel_ids(&other_owner), Vec::<Uuid>::new());

    forget_stub(id);
    drop(listener);
  }

  #[test]
  fn changed_monitoring_target_retires_only_that_projects_old_tunnels() {
    let owner = Uuid::new_v4().to_string();
    let other_owner = Uuid::new_v4().to_string();
    let current = insert_owned_stub("ubuntu@new-host", "new.pem", &owner, spec(TunnelKind::Local, 39091, Some(9090)));
    let old = insert_owned_stub("ubuntu@old-host", "old.pem", &owner, spec(TunnelKind::Local, 33200, Some(3200)));
    let other = insert_owned_stub("ubuntu@new-host", "new.pem", &other_owner, spec(TunnelKind::Local, 43200, Some(3200)));
    let manual = insert_stub("ubuntu@new-host", spec(TunnelKind::Local, 53200, Some(3200)));
    let params = SshParams { host: "new-host".into(), user: "ubuntu".into(), pem_path: "new.pem".into() };

    assert_eq!(outdated_owned_tunnel_ids(&owner, &params, 39091, 43200), vec![old]);

    for id in [current, old, other, manual] {
      forget_stub(id);
    }
  }

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

  // ---- tmux persistent sessions ----
  //
  // The result of sanitize_session_key goes straight into a command string the remote
  // shell parses; a single leaked character is remote command execution.

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
    // getting through here would run an arbitrary command in the session name slot
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
    // tmux does not allow '.' or ':' in a session name
    assert_eq!(sanitize_session_key("ec2-1-2-3-4.compute.amazonaws.com"), "ec2-1-2-3-4computeamazonawscom");
    assert_eq!(sanitize_session_key("host:22"), "host22");
  }

  #[test]
  fn session_key_falls_back_when_nothing_survives() {
    // an empty name would produce `tmux new-session -A -s arfni-` and break the command
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
    // a server without tmux still has to fall back to the login shell
    assert!(cmd.contains(r#"exec "$SHELL" -l"#), "{cmd}");
    // tmux owning the mouse would kill xterm's drag selection and right click
    assert!(cmd.contains("mouse off"), "{cmd}");
  }

  #[test]
  fn tmux_command_does_not_let_the_key_escape() {
    let cmd = tmux_wrapped_command("evil; rm -rf /");
    assert!(cmd.contains("arfni-evilrm-rf"), "{cmd}");
    // after sanitising, only the original command separators may follow the name
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
    // e.g. an RDS instance only reachable from the EC2 host
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
    // zero has to read as unset, otherwise ":0" reaches ssh
    assert!(build_forward_arg(&spec(TunnelKind::Local, 9091, Some(0))).is_err());
  }

  #[test]
  fn zero_bind_port_is_rejected() {
    assert!(build_forward_arg(&spec(TunnelKind::Local, 0, Some(80))).is_err());
  }

  #[test]
  fn colons_in_hosts_are_rejected() {
    // ssh arguments split on colons; letting one through silently retargets the forward
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

    // -R binds on the remote, so a local occupant is irrelevant
    assert!(ensure_local_port_free(&spec(TunnelKind::Remote, port, Some(9090))).is_ok());

    drop(listener);
  }

  /// A dead ssh has to disappear from the list; without reaping, the UI keeps showing a
  /// broken tunnel as "open".
  #[test]
  fn reaper_removes_tunnels_whose_ssh_exited() {
    // Stands in a process that exits immediately for ssh, to test only the detection.
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
        pem_path: "key.pem".into(),
        owner: None,
        stderr_tail: Arc::new(Mutex::new(vec!["bind: Address already in use".into()])),
      },
    );

    // while alive it must stay in the list
    assert!(list_tunnels().iter().any(|t| t.id == id.to_string()));

    // wait until the child has really finished
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

    // the exit reason (last stderr lines) has to ride along or the cause is lost
    assert!(chunk.contains("closed unexpectedly"), "{chunk}");
    assert!(chunk.contains("Address already in use"), "{chunk}");

    // it must be gone from the map as well
    assert!(!list_tunnels().iter().any(|t| t.id == id.to_string()));
  }

  // ---- reuse and readiness ----
  //
  // Opening the monitoring pair used to leave a live tunnel behind whenever the second
  // one failed, and reported a forward as open the instant ssh was spawned. Both made a
  // single transient failure permanent.

  /// A process that stays alive, standing in for a healthy ssh.
  fn spawn_stub() -> StdChild {
    let mut cmd = if cfg!(windows) {
      let mut c = Command::new("cmd.exe");
      c.args(["/c", "ping", "-n", "30", "127.0.0.1"]);
      c
    } else {
      let mut c = Command::new("sh");
      c.args(["-c", "sleep 30"]);
      c
    };
    cmd
      .stdin(Stdio::null())
      .stdout(Stdio::null())
      .stderr(Stdio::null())
      .spawn()
      .expect("spawn failed")
  }

  fn insert_stub(via: &str, spec: TunnelSpec) -> Uuid {
    let id = Uuid::new_v4();
    tunnels().lock().insert(
      id,
      TunnelHandle {
        id,
        child: spawn_stub(),
        spec,
        via: via.into(),
        pem_path: "key.pem".into(),
        owner: None,
        stderr_tail: Arc::new(Mutex::new(Vec::new())),
      },
    );
    id
  }

  fn insert_owned_stub(via: &str, pem_path: &str, owner: &str, spec: TunnelSpec) -> Uuid {
    let id = Uuid::new_v4();
    tunnels().lock().insert(
      id,
      TunnelHandle {
        id,
        child: spawn_stub(),
        spec,
        via: via.into(),
        pem_path: pem_path.into(),
        owner: Some(owner.into()),
        stderr_tail: Arc::new(Mutex::new(Vec::new())),
      },
    );
    id
  }

  fn forget_stub(id: Uuid) {
    if let Some(mut h) = tunnels().lock().remove(&id) {
      let _ = h.child.kill();
      let _ = h.child.wait();
    }
  }

  #[test]
  fn equivalent_tunnels_are_matched_by_endpoint_and_ssh_target() {
    let a = spec(TunnelKind::Local, 3200, Some(3200));

    assert!(tunnel_equivalent(&a, "ubuntu@ec2", &a, "ubuntu@ec2"));

    // a different local port is a different tunnel
    let other_bind = spec(TunnelKind::Local, 3201, Some(3200));
    assert!(!tunnel_equivalent(&a, "ubuntu@ec2", &other_bind, "ubuntu@ec2"));

    // same local port but forwarded elsewhere: reusing it would silently serve the
    // wrong service
    let other_target = spec(TunnelKind::Local, 3200, Some(9090));
    assert!(!tunnel_equivalent(&a, "ubuntu@ec2", &other_target, "ubuntu@ec2"));

    // same endpoint through a different server is also a different tunnel
    assert!(!tunnel_equivalent(&a, "ubuntu@ec2", &a, "ubuntu@other"));

    // -L and -D mean opposite things even on one port
    let dynamic = spec(TunnelKind::Dynamic, 3200, None);
    assert!(!tunnel_equivalent(&a, "ubuntu@ec2", &dynamic, "ubuntu@ec2"));

    // -D carries no target, so the bind endpoint alone identifies it
    let dynamic_with_target = spec(TunnelKind::Dynamic, 3200, Some(1080));
    assert!(tunnel_equivalent(
      &dynamic,
      "ubuntu@ec2",
      &dynamic_with_target,
      "ubuntu@ec2"
    ));
  }

  #[test]
  fn a_working_tunnel_is_reused_instead_of_respawned() {
    let listener = std::net::TcpListener::bind(("127.0.0.1", 0)).unwrap();
    let port = listener.local_addr().unwrap().port();
    let s = spec(TunnelKind::Local, port, Some(3200));
    let id = insert_stub("ubuntu@reuse-ok", s.clone());

    assert_eq!(reuse_live_tunnel(&s, "ubuntu@reuse-ok"), Some(id));

    forget_stub(id);
    drop(listener);
  }

  /// The failure that stranded the monitoring page: ssh still running while its forward
  /// serves nothing. Holding the port without answering is worse than no tunnel at all,
  /// so the stale one has to be dropped rather than handed back.
  #[test]
  fn a_tunnel_whose_forward_stopped_answering_is_dropped_not_reused() {
    let port = {
      let probe = std::net::TcpListener::bind(("127.0.0.1", 0)).unwrap();
      probe.local_addr().unwrap().port() // released again, so nothing listens
    };
    let s = spec(TunnelKind::Local, port, Some(3200));
    let id = insert_stub("ubuntu@reuse-stale", s.clone());

    assert_eq!(reuse_live_tunnel(&s, "ubuntu@reuse-stale"), None);
    assert!(
      !list_tunnels().iter().any(|t| t.id == id.to_string()),
      "stale tunnel must be removed from the map"
    );

    forget_stub(id);
  }

  #[test]
  fn waiting_reports_success_once_the_forward_accepts_connections() {
    let listener = std::net::TcpListener::bind(("127.0.0.1", 0)).unwrap();
    let port = listener.local_addr().unwrap().port();

    let mut child = spawn_stub();
    let tail = Arc::new(Mutex::new(Vec::new()));
    let result = wait_for_forward(&mut child, &spec(TunnelKind::Local, port, Some(3200)), &tail);
    let _ = child.kill();
    let _ = child.wait();

    assert!(result.is_ok(), "{:?}", result.err());
    drop(listener);
  }

  /// ExitOnForwardFailure kills ssh milliseconds after a refused forward. Returning Ok
  /// there is what let the UI claim a tunnel was open when it never was.
  #[test]
  fn waiting_fails_when_ssh_dies_before_the_forward_is_ready() {
    let port = {
      let probe = std::net::TcpListener::bind(("127.0.0.1", 0)).unwrap();
      probe.local_addr().unwrap().port()
    };

    let mut cmd = if cfg!(windows) {
      let mut c = Command::new("cmd.exe");
      c.args(["/c", "exit", "1"]);
      c
    } else {
      let mut c = Command::new("sh");
      c.args(["-c", "exit 1"]);
      c
    };
    let mut child = cmd
      .stdin(Stdio::null())
      .stdout(Stdio::null())
      .stderr(Stdio::null())
      .spawn()
      .expect("spawn failed");

    let tail = Arc::new(Mutex::new(vec![
      "bind [127.0.0.1]:3200: Address already in use".to_string(),
    ]));
    let err = wait_for_forward(&mut child, &spec(TunnelKind::Local, port, Some(3200)), &tail)
      .expect_err("a dead ssh must not be reported as ready");

    assert!(err.to_string().contains("exited before the forward was ready"), "{err}");
    // the real ssh error has to ride along, or the UI is left guessing
    assert!(err.to_string().contains("Address already in use"), "{err}");
  }
}
