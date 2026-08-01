// src-tauri/src/commands/sftp.rs

use tauri::AppHandle;
use uuid::Uuid;

use crate::features::sftp;
use crate::features::ssh_rt::SshParams;

fn parse(id: &str) -> Result<Uuid, String> {
  Uuid::parse_str(id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn sftp_connect(params: SshParams) -> Result<String, String> {
  sftp::connect(&params)
    .await
    .map(|id| id.to_string())
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn sftp_disconnect(id: String) -> Result<(), String> {
  sftp::disconnect(parse(&id)?).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn sftp_home(id: String) -> Result<String, String> {
  sftp::home(parse(&id)?).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn sftp_canonicalize(id: String, path: String) -> Result<String, String> {
  sftp::canonicalize(parse(&id)?, &path)
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn sftp_list(id: String, path: String) -> Result<Vec<sftp::SftpEntry>, String> {
  sftp::list(parse(&id)?, &path).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn sftp_mkdir(id: String, path: String) -> Result<(), String> {
  sftp::mkdir(parse(&id)?, &path).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn sftp_rename(id: String, from: String, to: String) -> Result<(), String> {
  sftp::rename(parse(&id)?, &from, &to)
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn sftp_remove(id: String, path: String) -> Result<(), String> {
  sftp::remove(parse(&id)?, &path).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn sftp_read_text(
  id: String,
  path: String,
  max_bytes: Option<usize>,
) -> Result<sftp::SftpTextPreview, String> {
  sftp::read_text(parse(&id)?, &path, max_bytes.unwrap_or(256 * 1024))
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn sftp_download(
  app: AppHandle,
  id: String,
  remote_path: String,
  local_path: String,
) -> Result<u64, String> {
  sftp::download(&app, parse(&id)?, &remote_path, &local_path)
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn sftp_upload(
  app: AppHandle,
  id: String,
  local_path: String,
  remote_path: String,
) -> Result<u64, String> {
  sftp::upload(&app, parse(&id)?, &local_path, &remote_path)
    .await
    .map_err(|e| e.to_string())
}
