// src-tauri/src/commands/ssh_it.rs

use tauri::{AppHandle};
use tauri::ipc::Invoke;  // ✅ 추가 (Tauri v2용)
use uuid::Uuid;

use crate::features::ssh_rt::{
  SshParams,
  start_interactive_session,
  send_command,
  close_session,
};

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

/// ✅ Tauri v2에서 동작하는 정식 버전
pub fn register() -> impl Fn(Invoke) -> bool + Send + Sync + 'static {
  tauri::generate_handler![ssh_start, ssh_send, ssh_close]
}
