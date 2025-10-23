use serde::{Serialize, Deserialize};
use anyhow::Result;
use crate::features::ssh_exec::SshParams;
#[derive(Deserialize)]
pub struct SshSimpleParams {
  pub host: String,     // "ec2-13-...amazonaws.com"
  pub user: String,     // "ec2-user"
  pub pem_path: String, //key 위치
  pub cmd: String,      // "uname -a"
}

#[derive(Deserialize)]
pub struct SshValue {
  pub host: String,     // "ec2-13-...amazonaws.com"
  pub user: String,     // "ec2-user"
  pub pem_path: String, //key 위치
}

#[derive(Deserialize)]
pub struct DeletePayload {
    pub host: String,
    pub user: String,
}

//ec2 단일 커맨드 호출
#[tauri::command]
pub async fn ssh_exec_system(params: SshSimpleParams) -> Result<String, String> {
  // features 계층의 실제 실행 함수 호출
  crate::features::ssh_exec::exec_once_via_system_ssh(
      &params.host,
      &params.user,
      &params.pem_path,
      &params.cmd,
  ).map_err(|e| e.to_string())
}


//ssh 추가
#[tauri::command] 
pub fn ec2_add_entry(params: SshValue) -> Result<(), String> {
    crate::features::ssh_exec::add_or_update_entry(SshParams {
        host: params.host, 
        user: params.user,       
        pem_path: params.pem_path, 
    })
    .map_err(|e| e.to_string())
}

//SSH 목록조회
#[tauri::command]
pub fn ec2_read_entry() -> Result<Vec<crate::features::ssh_exec::SshParams>, String> {
    crate::features::ssh_exec::read_all_entries()
        .map_err(|e| e.to_string())
}


#[tauri::command]
pub fn ec2_delete_entry(params: DeletePayload) -> Result<bool, String> {
    crate::features::ssh_exec::delete_entry(&params.host, &params.user)
        .map_err(|e| e.to_string())
}