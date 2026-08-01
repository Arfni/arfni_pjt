//! SFTP 백엔드.
//!
//! 인증은 시스템 OpenSSH(`ssh -s sftp`)에 위임하고, 그 stdin/stdout 위에서
//! SFTP 프로토콜만 직접 말한다.
//!
//! libssh2(ssh2 크레이트)를 쓰지 않는 이유: Windows에서 libssh2는 WinCNG 백엔드로 빌드되는데
//! 이 백엔드는 `-----BEGIN OPENSSH PRIVATE KEY-----` 포맷과 ed25519를 지원하지 않는다.
//! 그러면 같은 키로 터미널은 붙는데 SFTP만 실패하는 상황이 생긴다.
//! 시스템 ssh에 인증을 위임하면 터미널 세션과 키/known_hosts/ssh_config 처리가 100% 동일하다.

use anyhow::{anyhow, Context, Result};
use once_cell::sync::OnceCell;
use parking_lot::Mutex;
use russh_sftp::client::SftpSession;
use serde::Serialize;
use std::{
  collections::HashMap,
  path::Path,
  pin::Pin,
  sync::Arc,
  task::{Context as TaskContext, Poll},
};
use tauri::{AppHandle, Emitter};
use tokio::{
  io::{AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt, ReadBuf},
  process::{Child, ChildStdin, ChildStdout, Command},
};
use uuid::Uuid;

use crate::features::ssh_rt::SshParams;

const CONNECT_TIMEOUT_SECS: u64 = 25;
const CHUNK: usize = 32 * 1024;

// ============ Public Types ============

#[derive(Debug, Clone, Serialize)]
pub struct SftpEntry {
  pub name: String,
  pub path: String,
  pub is_dir: bool,
  pub is_symlink: bool,
  pub size: u64,
  /// unix epoch seconds
  pub mtime: Option<u32>,
  pub permissions: Option<u32>,
  /// "drwxr-xr-x" 형태
  pub mode: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct SftpProgress {
  pub id: String,
  pub transfer_id: String,
  pub name: String,
  /// "download" | "upload"
  pub direction: String,
  pub transferred: u64,
  pub total: u64,
  pub done: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct SftpTextPreview {
  pub text: String,
  /// max_bytes를 넘어 잘렸는지
  pub truncated: bool,
  /// NUL 바이트가 섞여 있어 텍스트로 보기 부적합한지
  pub likely_binary: bool,
  /// 원본 전체 크기 (bytes)
  pub size: u64,
}

// ============ ssh stdio <-> AsyncRead+AsyncWrite 어댑터 ============

struct SshPipe {
  stdout: ChildStdout,
  stdin: ChildStdin,
}

impl AsyncRead for SshPipe {
  fn poll_read(
    mut self: Pin<&mut Self>,
    cx: &mut TaskContext<'_>,
    buf: &mut ReadBuf<'_>,
  ) -> Poll<std::io::Result<()>> {
    Pin::new(&mut self.stdout).poll_read(cx, buf)
  }
}

impl AsyncWrite for SshPipe {
  fn poll_write(
    mut self: Pin<&mut Self>,
    cx: &mut TaskContext<'_>,
    buf: &[u8],
  ) -> Poll<std::io::Result<usize>> {
    Pin::new(&mut self.stdin).poll_write(cx, buf)
  }
  fn poll_flush(
    mut self: Pin<&mut Self>,
    cx: &mut TaskContext<'_>,
  ) -> Poll<std::io::Result<()>> {
    Pin::new(&mut self.stdin).poll_flush(cx)
  }
  fn poll_shutdown(
    mut self: Pin<&mut Self>,
    cx: &mut TaskContext<'_>,
  ) -> Poll<std::io::Result<()>> {
    Pin::new(&mut self.stdin).poll_shutdown(cx)
  }
}

// ============ Session Store ============

struct SftpHandle {
  session: Arc<SftpSession>,
  child: Child,
}

static SFTP: OnceCell<Mutex<HashMap<Uuid, SftpHandle>>> = OnceCell::new();
fn store() -> &'static Mutex<HashMap<Uuid, SftpHandle>> {
  SFTP.get_or_init(|| Mutex::new(HashMap::new()))
}

/// 락을 await 너머로 들고 가지 않기 위해 Arc만 꺼내온다.
fn session_of(id: Uuid) -> Result<Arc<SftpSession>> {
  store()
    .lock()
    .get(&id)
    .map(|h| h.session.clone())
    .ok_or_else(|| anyhow!("sftp session not found"))
}

// ============ Connect / Disconnect ============

pub async fn connect(params: &SshParams) -> Result<Uuid> {
  let target = format!("{}@{}", params.user, params.host);

  let mut cmd = Command::new("ssh");
  cmd
    .args([
      "-i",
      &params.pem_path,
      "-o",
      "StrictHostKeyChecking=accept-new",
      "-o",
      "BatchMode=yes",
      "-o",
      "LogLevel=ERROR",
      "-o",
      "ServerAliveInterval=30",
      "-s", // 서브시스템 실행
      &target,
      "sftp",
    ])
    .stdin(std::process::Stdio::piped())
    .stdout(std::process::Stdio::piped())
    .stderr(std::process::Stdio::piped())
    .kill_on_drop(true);

  #[cfg(target_os = "windows")]
  {
    const CREATE_NO_WINDOW: u32 = 0x08000000;
    cmd.creation_flags(CREATE_NO_WINDOW);
  }

  let mut child = cmd.spawn().context("failed to spawn `ssh -s sftp`")?;

  let stdin = child.stdin.take().context("no stdin on ssh")?;
  let stdout = child.stdout.take().context("no stdout on ssh")?;
  let mut stderr = child.stderr.take().context("no stderr on ssh")?;

  // 실패 시 원인을 그대로 보여주기 위해 ssh의 stderr를 모아둔다.
  let err_buf = Arc::new(Mutex::new(String::new()));
  {
    let err_buf = err_buf.clone();
    tokio::spawn(async move {
      let mut s = String::new();
      let _ = stderr.read_to_string(&mut s).await;
      if !s.is_empty() {
        err_buf.lock().push_str(&s);
      }
    });
  }

  let pipe = SshPipe { stdout, stdin };

  let session = match tokio::time::timeout(
    std::time::Duration::from_secs(CONNECT_TIMEOUT_SECS),
    SftpSession::new(pipe),
  )
  .await
  {
    Ok(Ok(s)) => s,
    Ok(Err(e)) => {
      let _ = child.kill().await;
      let detail = err_buf.lock().trim().to_string();
      return Err(if detail.is_empty() {
        anyhow!("SFTP handshake failed: {e}")
      } else {
        anyhow!("SFTP handshake failed: {e}\n{detail}")
      });
    }
    Err(_) => {
      let _ = child.kill().await;
      let detail = err_buf.lock().trim().to_string();
      return Err(if detail.is_empty() {
        anyhow!("SFTP connection timed out after {CONNECT_TIMEOUT_SECS}s")
      } else {
        anyhow!("SFTP connection failed:\n{detail}")
      });
    }
  };

  let id = Uuid::new_v4();
  store().lock().insert(
    id,
    SftpHandle {
      session: Arc::new(session),
      child,
    },
  );

  println!("[sftp] session {id} connected to {target}");
  Ok(id)
}

pub async fn disconnect(id: Uuid) -> Result<()> {
  let removed = store().lock().remove(&id);
  if let Some(mut h) = removed {
    let _ = h.session.close().await;
    let _ = h.child.kill().await;
    println!("[sftp] session {id} disconnected");
    Ok(())
  } else {
    Err(anyhow!("sftp session not found"))
  }
}

/// 앱 종료 시 이 앱이 띄운 SFTP 세션만 정리한다.
pub fn kill_all_sessions() {
  let mut map = store().lock();
  for (id, h) in map.iter_mut() {
    let _ = h.child.start_kill();
    println!("[sftp] session {id} killed on shutdown");
  }
  map.clear();
}

// ============ Filesystem Ops ============

pub async fn home(id: Uuid) -> Result<String> {
  let s = session_of(id)?;
  s.canonicalize(".")
    .await
    .map_err(|e| anyhow!("failed to resolve home: {e}"))
}

pub async fn canonicalize(id: Uuid, path: &str) -> Result<String> {
  let s = session_of(id)?;
  s.canonicalize(path)
    .await
    .map_err(|e| anyhow!("failed to resolve {path}: {e}"))
}

pub async fn list(id: Uuid, path: &str) -> Result<Vec<SftpEntry>> {
  let s = session_of(id)?;
  let base = s
    .canonicalize(path)
    .await
    .map_err(|e| anyhow!("failed to resolve {path}: {e}"))?;

  let dir = s
    .read_dir(&base)
    .await
    .map_err(|e| anyhow!("failed to list {base}: {e}"))?;

  let mut out: Vec<SftpEntry> = Vec::new();
  for entry in dir {
    let name = entry.file_name();
    if name == "." || name == ".." {
      continue;
    }
    let meta = entry.metadata();
    let is_dir = meta.is_dir();
    let is_symlink = meta.is_symlink();
    let perms = meta.permissions;

    out.push(SftpEntry {
      path: join_remote(&base, &name),
      name,
      is_dir,
      is_symlink,
      size: meta.size.unwrap_or(0),
      mtime: meta.mtime,
      permissions: perms,
      mode: mode_string(perms, is_dir, is_symlink),
    });
  }

  // 디렉터리 먼저, 그 안에서 이름순 (대소문자 무시)
  out.sort_by(|a, b| {
    b.is_dir
      .cmp(&a.is_dir)
      .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
  });

  Ok(out)
}

pub async fn mkdir(id: Uuid, path: &str) -> Result<()> {
  let s = session_of(id)?;
  s.create_dir(path)
    .await
    .map_err(|e| anyhow!("failed to create {path}: {e}"))
}

pub async fn rename(id: Uuid, from: &str, to: &str) -> Result<()> {
  let s = session_of(id)?;
  s.rename(from, to)
    .await
    .map_err(|e| anyhow!("failed to rename {from} -> {to}: {e}"))
}

/// 파일/디렉터리 삭제. 디렉터리는 재귀적으로 지운다.
pub async fn remove(id: Uuid, path: &str) -> Result<()> {
  let s = session_of(id)?;
  let meta = s
    .symlink_metadata(path)
    .await
    .map_err(|e| anyhow!("failed to stat {path}: {e}"))?;

  // 심볼릭 링크는 따라가지 않고 링크 자체만 지운다.
  if meta.is_dir() && !meta.is_symlink() {
    remove_dir_recursive(&s, path).await
  } else {
    s.remove_file(path)
      .await
      .map_err(|e| anyhow!("failed to remove {path}: {e}"))
  }
}

/// 재귀 삭제. async 재귀라 Box<dyn Future>로 감싼다.
fn remove_dir_recursive<'a>(
  s: &'a Arc<SftpSession>,
  path: &'a str,
) -> Pin<Box<dyn std::future::Future<Output = Result<()>> + Send + 'a>> {
  Box::pin(async move {
    let dir = s
      .read_dir(path)
      .await
      .map_err(|e| anyhow!("failed to list {path}: {e}"))?;

    let mut children: Vec<(String, bool)> = Vec::new();
    for entry in dir {
      let name = entry.file_name();
      if name == "." || name == ".." {
        continue;
      }
      let meta = entry.metadata();
      children.push((join_remote(path, &name), meta.is_dir() && !meta.is_symlink()));
    }

    for (child, is_dir) in children {
      if is_dir {
        remove_dir_recursive(s, &child).await?;
      } else {
        s.remove_file(&child)
          .await
          .map_err(|e| anyhow!("failed to remove {child}: {e}"))?;
      }
    }

    s.remove_dir(path)
      .await
      .map_err(|e| anyhow!("failed to remove dir {path}: {e}"))
  })
}

/// 텍스트 미리보기. `max_bytes`를 넘으면 잘라서 돌려준다.
pub async fn read_text(id: Uuid, path: &str, max_bytes: usize) -> Result<SftpTextPreview> {
  let s = session_of(id)?;
  let bytes = s
    .read(path)
    .await
    .map_err(|e| anyhow!("failed to read {path}: {e}"))?;

  let size = bytes.len() as u64;
  let truncated = bytes.len() > max_bytes;
  let slice = if truncated { &bytes[..max_bytes] } else { &bytes[..] };

  Ok(SftpTextPreview {
    likely_binary: looks_binary(slice),
    text: String::from_utf8_lossy(slice).to_string(),
    truncated,
    size,
  })
}

/// 앞부분에 NUL 바이트가 있으면 바이너리로 본다. `file(1)`이 쓰는 것과 같은 휴리스틱.
fn looks_binary(bytes: &[u8]) -> bool {
  bytes.iter().take(8192).any(|&b| b == 0)
}

// ============ Transfers ============

pub async fn download(
  app: &AppHandle,
  id: Uuid,
  remote_path: &str,
  local_path: &str,
) -> Result<u64> {
  let s = session_of(id)?;
  let transfer_id = Uuid::new_v4().to_string();
  let name = base_name(remote_path);

  let total = s
    .metadata(remote_path)
    .await
    .ok()
    .and_then(|m| m.size)
    .unwrap_or(0);

  let mut remote = s
    .open(remote_path)
    .await
    .map_err(|e| anyhow!("failed to open {remote_path}: {e}"))?;

  if let Some(parent) = Path::new(local_path).parent() {
    let _ = tokio::fs::create_dir_all(parent).await;
  }
  let mut local = tokio::fs::File::create(local_path)
    .await
    .with_context(|| format!("failed to create {local_path}"))?;

  let mut buf = vec![0u8; CHUNK];
  let mut transferred: u64 = 0;
  let mut last_emit = std::time::Instant::now();

  loop {
    let n = remote
      .read(&mut buf)
      .await
      .map_err(|e| anyhow!("read error on {remote_path}: {e}"))?;
    if n == 0 {
      break;
    }
    local
      .write_all(&buf[..n])
      .await
      .with_context(|| format!("write error on {local_path}"))?;
    transferred += n as u64;

    // 이벤트 폭주 방지: 100ms 간격으로만 진행률을 쏜다.
    if last_emit.elapsed() >= std::time::Duration::from_millis(100) {
      emit_progress(app, id, &transfer_id, &name, "download", transferred, total, false);
      last_emit = std::time::Instant::now();
    }
  }

  local.flush().await.ok();
  let _ = remote.shutdown().await;
  emit_progress(app, id, &transfer_id, &name, "download", transferred, total.max(transferred), true);
  Ok(transferred)
}

pub async fn upload(
  app: &AppHandle,
  id: Uuid,
  local_path: &str,
  remote_path: &str,
) -> Result<u64> {
  let s = session_of(id)?;
  let transfer_id = Uuid::new_v4().to_string();
  let name = base_name(local_path);

  let total = tokio::fs::metadata(local_path)
    .await
    .map(|m| m.len())
    .unwrap_or(0);

  let mut local = tokio::fs::File::open(local_path)
    .await
    .with_context(|| format!("failed to open {local_path}"))?;

  let mut remote = s
    .create(remote_path)
    .await
    .map_err(|e| anyhow!("failed to create {remote_path}: {e}"))?;

  let mut buf = vec![0u8; CHUNK];
  let mut transferred: u64 = 0;
  let mut last_emit = std::time::Instant::now();

  loop {
    let n = local
      .read(&mut buf)
      .await
      .with_context(|| format!("read error on {local_path}"))?;
    if n == 0 {
      break;
    }
    remote
      .write_all(&buf[..n])
      .await
      .map_err(|e| anyhow!("write error on {remote_path}: {e}"))?;
    transferred += n as u64;

    if last_emit.elapsed() >= std::time::Duration::from_millis(100) {
      emit_progress(app, id, &transfer_id, &name, "upload", transferred, total, false);
      last_emit = std::time::Instant::now();
    }
  }

  // shutdown을 호출해야 핸들이 닫히고 서버가 파일을 확정한다.
  remote
    .shutdown()
    .await
    .map_err(|e| anyhow!("failed to finalize {remote_path}: {e}"))?;

  emit_progress(app, id, &transfer_id, &name, "upload", transferred, total.max(transferred), true);
  Ok(transferred)
}

// ============ Helpers ============

#[allow(clippy::too_many_arguments)]
fn emit_progress(
  app: &AppHandle,
  id: Uuid,
  transfer_id: &str,
  name: &str,
  direction: &str,
  transferred: u64,
  total: u64,
  done: bool,
) {
  let _ = app.emit(
    "sftp:progress",
    SftpProgress {
      id: id.to_string(),
      transfer_id: transfer_id.to_string(),
      name: name.to_string(),
      direction: direction.to_string(),
      transferred,
      total,
      done,
    },
  );
}

/// 원격 경로는 항상 POSIX 구분자를 쓴다. Windows의 `\`가 섞이면 안 된다.
fn join_remote(base: &str, name: &str) -> String {
  if base == "/" {
    format!("/{name}")
  } else {
    format!("{}/{}", base.trim_end_matches('/'), name)
  }
}

fn base_name(path: &str) -> String {
  path
    .rsplit(['/', '\\'])
    .next()
    .unwrap_or(path)
    .to_string()
}

/// 유닉스 퍼미션 비트를 "drwxr-xr-x" 문자열로.
fn mode_string(perms: Option<u32>, is_dir: bool, is_symlink: bool) -> String {
  let p = match perms {
    Some(p) => p,
    None => return String::new(),
  };
  let kind = if is_symlink {
    'l'
  } else if is_dir {
    'd'
  } else {
    '-'
  };
  let bit = |shift: u32, ch: char| if p >> shift & 1 == 1 { ch } else { '-' };
  format!(
    "{kind}{}{}{}{}{}{}{}{}{}",
    bit(8, 'r'),
    bit(7, 'w'),
    bit(6, 'x'),
    bit(5, 'r'),
    bit(4, 'w'),
    bit(3, 'x'),
    bit(2, 'r'),
    bit(1, 'w'),
    bit(0, 'x'),
  )
}

// tokio::process::Command은 Windows에서 creation_flags를 inherent 메서드로 제공한다.
// std의 CommandExt를 별도로 import할 필요가 없다.

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn join_remote_uses_posix_separator() {
    assert_eq!(join_remote("/", "opt"), "/opt");
    assert_eq!(join_remote("/opt", "hermes"), "/opt/hermes");
    assert_eq!(join_remote("/opt/", "hermes"), "/opt/hermes");
  }

  #[test]
  fn base_name_handles_both_separators() {
    assert_eq!(base_name("/opt/hermes/app.log"), "app.log");
    assert_eq!(base_name(r"C:\Users\me\app.log"), "app.log");
    assert_eq!(base_name("app.log"), "app.log");
  }

  #[test]
  fn looks_binary_detects_nul_bytes() {
    assert!(!looks_binary(b"version: '3'\nservices:\n  web:\n"));
    assert!(!looks_binary(&[])); // 빈 파일은 텍스트로 본다
    assert!(looks_binary(b"\x7fELF\x02\x01\x01\x00\x00\x00"));
    // NUL이 8KB 뒤에만 있으면 휴리스틱상 텍스트로 본다
    let mut late = vec![b'a'; 9000];
    late.push(0);
    assert!(!looks_binary(&late));
  }

  #[test]
  fn mode_string_renders_unix_bits() {
    assert_eq!(mode_string(Some(0o755), true, false), "drwxr-xr-x");
    assert_eq!(mode_string(Some(0o644), false, false), "-rw-r--r--");
    assert_eq!(mode_string(Some(0o777), false, true), "lrwxrwxrwx");
    assert_eq!(mode_string(Some(0o600), false, false), "-rw-------");
    assert_eq!(mode_string(None, false, false), "");
  }

  /// 연결 실패 시 ssh의 stderr가 그대로 올라와야 한다.
  /// 예전 SSH 구현은 BatchMode + stderr 분리 탓에 실패가 조용히 삼켜졌다. 그 회귀를 막는다.
  ///
  /// `.invalid`는 RFC 2606이 예약한 TLD라 절대 해석되지 않으므로 오프라인에서도 결정적이다.
  #[tokio::test]
  async fn connect_failure_surfaces_ssh_stderr() {
    let params = SshParams {
      host: "arfni-sftp-test.invalid".into(),
      user: "nobody".into(),
      pem_path: "definitely-not-a-real-key.pem".into(),
    };

    let before = store().lock().len();
    let err = connect(&params).await.expect_err("연결은 실패해야 한다");
    let msg = err.to_string();

    assert!(
      msg.to_lowercase().contains("resolve") || msg.contains("arfni-sftp-test.invalid"),
      "ssh의 stderr가 에러 메시지로 전달되지 않았다: {msg}"
    );
    assert_eq!(
      store().lock().len(),
      before,
      "실패한 연결이 세션 맵에 좀비로 남았다"
    );
  }
}
