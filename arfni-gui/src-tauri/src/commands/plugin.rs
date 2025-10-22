// src/commands/plugin.rs
use serde_json::Value;
use std::path::{Path, PathBuf};
use std::process::Command as StdCommand;
use tauri::{AppHandle, path::BaseDirectory};
use tauri::Manager;

// (선택) 아직 구현 전이면 그대로 둠
#[tauri::command]
pub async fn plugin_invoke(_plugin: String, _method: String, _params: Value)
  -> Result<Value, String>
{
  Err("plugin_invoke not implemented yet".into())
}

// 현재 플랫폼 타깃 트리플 결정 (빌드 스크립트가 넣어준 값을 우선 사용)
const DEFAULT_TARGET_TRIPLE: &str = "x86_64-pc-windows-msvc";
const TARGET_TRIPLE: &str = match option_env!("TAURI_ENV_TARGET_TRIPLE") {
  Some(t) if !t.is_empty() => t,
  _ => DEFAULT_TARGET_TRIPLE,
};

fn plugin_filename(plugin: &str) -> String {
  // 예: "deploy-ec2-x86_64-pc-windows-msvc.exe"
  format!("{plugin}-{TARGET_TRIPLE}.exe")
}

/// 플러그인 이름(=폴더/실행기 이름)을 받아 실행.
/// - 배포:   Resource/plugins/<plugin>/<plugin>-<triple>.exe
/// - 개발:   src-tauri/plugins/<plugin>/<plugin>-<triple>.exe
///           (추가로, 확장자만 붙인 <plugin>.exe 도 보조 탐색)
#[tauri::command]
pub async fn run_plugin(app: AppHandle, plugin: String) -> Result<String, String> {
  let exe_name = plugin_filename(&plugin);

  // 1) 배포 리소스 경로
  let resource_candidate = app.path()
    .resolve(
      &format!("plugins/{exe_name}"),
      BaseDirectory::Resource
    )
    .ok();

  // 2) 개발 경로들 (src-tauri 기준)
  let mut dev_plugins = PathBuf::from(env!("CARGO_MANIFEST_DIR")); // = src-tauri
  dev_plugins.push("plugins");
  let dev_candidate = dev_plugins.join(&plugin).join(&exe_name);
  let dev_plain_exe = dev_plugins.join(&plugin).join(format!("{plugin}.exe")); // 보조

  // 3) 존재하는 첫 경로
  let exe_path = [resource_candidate, Some(dev_candidate), Some(dev_plain_exe)]
    .into_iter()
    .flatten()
    .find(|p| p.exists())
    .ok_or_else(|| format!("plugin exe not found: plugins/{exe_name}"))?;

  // 4) 블로킹 프로세스는 별 스레드에서 실행
  let out = tauri::async_runtime::spawn_blocking(move || {
    StdCommand::new(&exe_path)
      // 필요하면 .arg(...) 추가
      .output()
  })
  .await
  .map_err(|e| e.to_string())?
  .map_err(|e| format!("spawn failed: {e}"))?;

  if out.status.success() {
    Ok(String::from_utf8_lossy(&out.stdout).trim().to_string())
  } else {
    Err(format!(
      "exit {}: {}",
      out.status.code().unwrap_or(-1),
      String::from_utf8_lossy(&out.stderr)
    ))
  }
}
