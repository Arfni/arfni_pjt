// src-tauri/src/commands/ssh_it.rs

use tauri::ipc::Invoke;
use tauri::AppHandle;
use uuid::Uuid;

use crate::features::ssh_rt::{
  close_session, close_tunnel, list_tunnels, open_tunnel, resize_session,
  start_interactive_session, write_bytes, SshParams, TunnelInfo, TunnelSpec,
};

/// Starts a session; rows and cols come straight from xterm.js's real size.
///
/// With `persistent` on, the remote shell is wrapped in tmux so a dropped link does not
/// SIGHUP the remote process and a reconnect restores the screen as it was.
/// `session_key` is the per-tab identifier deciding which tmux session to reattach to.
#[tauri::command]
pub async fn ssh_start(
  app: AppHandle,
  params: SshParams,
  rows: Option<u16>,
  cols: Option<u16>,
  persistent: Option<bool>,
  session_key: Option<String>,
) -> Result<String, String> {
  start_interactive_session(
    app,
    params,
    rows.unwrap_or(24),
    cols.unwrap_or(80),
    persistent.unwrap_or(false),
    session_key.as_deref(),
  )
  .map(|id| id.to_string())
  .map_err(|e| e.to_string())
}

/// Forwards key input verbatim; `data` is xterm's onData string (UTF-8). No newline is
/// added, so Ctrl+C, arrows and tab pass through as they are.
#[tauri::command]
pub async fn ssh_write(id: String, data: String) -> Result<(), String> {
  let id = Uuid::parse_str(&id).map_err(|e| e.to_string())?;
  write_bytes(id, data.as_bytes()).map_err(|e| e.to_string())
}

/// Terminal resize, propagated to the pty, which sends SIGWINCH to the remote
#[tauri::command]
pub async fn ssh_resize(id: String, rows: u16, cols: u16) -> Result<(), String> {
  let id = Uuid::parse_str(&id).map_err(|e| e.to_string())?;
  resize_session(id, rows, cols).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn ssh_close(app: AppHandle, id: String) -> Result<(), String> {
  let id = Uuid::parse_str(&id).map_err(|e| e.to_string())?;
  close_session(&app, id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn tunnel_open(
  app: AppHandle,
  params: SshParams,
  spec: TunnelSpec,
) -> Result<String, String> {
  open_tunnel(app, params, spec)
    .map(|id| id.to_string())
    .map_err(|e| e.to_string())
}

/// Live tunnels; the reaper removes dead ones so this always matches reality.
#[tauri::command]
pub async fn tunnel_list() -> Result<Vec<TunnelInfo>, String> {
  Ok(list_tunnels())
}

#[tauri::command]
pub async fn tunnel_close(app: AppHandle, id: String) -> Result<(), String> {
  let id = Uuid::parse_str(&id).map_err(|e| e.to_string())?;
  close_tunnel(&app, id).map_err(|e| e.to_string())
}

/// The supported version for Tauri v2
#[allow(dead_code)]
pub fn register() -> impl Fn(Invoke) -> bool + Send + Sync + 'static {
  tauri::generate_handler![
    ssh_start,
    ssh_write,
    ssh_resize,
    ssh_close,
    tunnel_open,
    tunnel_list,
    tunnel_close
  ]
}
