use serde::Deserialize;

#[derive(Deserialize)]
pub struct SshSimpleParams {
  pub host: String,     // "ec2-13-...amazonaws.com"
  pub user: String,     // "ec2-user"
  pub pem_path: String, //key 위치
  pub cmd: String,      // "uname -a"
}

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