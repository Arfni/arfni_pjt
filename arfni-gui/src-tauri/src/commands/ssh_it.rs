// src-tauri/src/commands/ssh_it.rs

use tauri::ipc::Invoke;
use tauri::AppHandle;
use uuid::Uuid;

use crate::features::ssh_rt::{
  close_session, close_tunnel, list_tunnels, open_tunnel, resize_session,
  start_interactive_session, write_bytes, SshParams, TunnelInfo, TunnelSpec,
};

/// 세션 시작. rows/cols는 프론트 xterm.js의 실제 크기를 그대로 받는다.
#[tauri::command]
pub async fn ssh_start(
  app: AppHandle,
  params: SshParams,
  rows: Option<u16>,
  cols: Option<u16>,
) -> Result<String, String> {
  start_interactive_session(app, params, rows.unwrap_or(24), cols.unwrap_or(80))
    .map(|id| id.to_string())
    .map_err(|e| e.to_string())
}

/// 키 입력 원본 전달. `data`는 xterm의 onData 문자열(UTF-8)이다.
/// 개행을 붙이지 않으므로 Ctrl+C / 방향키 / Tab이 그대로 전달된다.
#[tauri::command]
pub async fn ssh_write(id: String, data: String) -> Result<(), String> {
  let id = Uuid::parse_str(&id).map_err(|e| e.to_string())?;
  write_bytes(id, data.as_bytes()).map_err(|e| e.to_string())
}

/// 터미널 리사이즈 → PTY로 전파 → 원격에 SIGWINCH
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

/// 살아 있는 터널 목록. reaper가 죽은 터널을 걷어내므로 항상 실제 상태와 맞는다.
#[tauri::command]
pub async fn tunnel_list() -> Result<Vec<TunnelInfo>, String> {
  Ok(list_tunnels())
}

#[tauri::command]
pub async fn tunnel_close(app: AppHandle, id: String) -> Result<(), String> {
  let id = Uuid::parse_str(&id).map_err(|e| e.to_string())?;
  close_tunnel(&app, id).map_err(|e| e.to_string())
}

/// ✅ Tauri v2에서 동작하는 정식 버전
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
