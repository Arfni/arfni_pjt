use tauri::{AppHandle, path::BaseDirectory};
use tauri::Manager;
use serde_json::Value;
use std::{
  io::Write,
  path::PathBuf,
  process::{Command as StdCommand, Stdio},
};

#[derive(serde::Deserialize)]
#[serde(tag = "mode")] // mode 필드에 따라 자동 분기
pub enum PluginRunArgs {
  #[serde(rename = "cli")]
  Cli { args: Vec<String> },

  #[serde(rename = "config")]
  Config {
    config_path: String,
    #[serde(default)]
    output: Option<String>,
  },

  // stdin 으로 JSON을 전달
  #[serde(rename = "stdin")]
  Stdin { json: serde_json::Value },
}

// 환경 변수로 주입된 타깃 트리플이 있으면 쓰고, 없으면 기본값 반환
fn target_triple() -> &'static str {
  option_env!("TAURI_ENV_TARGET_TRIPLE").unwrap_or("x86_64-pc-windows-msvc")
}

fn plugin_filename(plugin: &str) -> String {
  // 예: test-dummy-x86_64-pc-windows-msvc.exe (Windows 가정)
  if cfg!(target_os = "windows") {
    format!("{plugin}-{}.exe", target_triple())
  } else {
    format!("{plugin}-{}", target_triple())
  }
}

// 실행 파일 경로 탐색(배포 리소스/개발 경로/보조 경로 모두 지원)
fn resolve_plugin_exe(app: &AppHandle, plugin: &str) -> Result<PathBuf, String> {
  let exe_name = plugin_filename(plugin);

  // Resource/plugins/<plugin>/<exe> 와 Resource/plugins/<exe> 둘 다 시도
  let res_under_plugin = app
    .path()
    .resolve(&format!("plugins/{plugin}/{exe_name}"), BaseDirectory::Resource)
    .ok();
  let res_flat = app
    .path()
    .resolve(&format!("plugins/{exe_name}"), BaseDirectory::Resource)
    .ok();

  // 개발 경로들 (src-tauri 기준)
  let mut dev_plugins = PathBuf::from(env!("CARGO_MANIFEST_DIR")); // = src-tauri
  dev_plugins.push("plugins");
  let dev_under_plugin = dev_plugins.join(plugin).join(&exe_name);
  let dev_flat = dev_plugins.join(&exe_name);
  let dev_plain = dev_plugins.join(plugin).join(format!("{plugin}.exe")); // 보조

  let candidates = [
    res_under_plugin,
    res_flat,
    Some(dev_under_plugin),
    Some(dev_flat),
    Some(dev_plain),
  ];

  candidates
    .into_iter()
    .flatten()
    .find(|p| p.exists())
    .ok_or_else(|| format!("plugin exe not found: plugins/{plugin}/{exe_name}"))
}

/// 커맨드 실행 → stdout/stderr/exit code 수집
/// 실패 시 stderr가 비어 있으면 stdout을 대신 붙여서 반환
fn spawn_and_collect(mut cmd: StdCommand, what: &str) -> Result<String, String> {
  // 디버깅용: 실행 경로 & 명령 줄 일부 로깅(콘솔)
  // println!("[spawn] {what}: {:?}", cmd);

  let out = cmd.output().map_err(|e| format!("spawn failed ({what}): {e}"))?;
  let status = out.status;
  let stdout = String::from_utf8_lossy(&out.stdout).trim().to_string();
  let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();

  if status.success() {
    return Ok(stdout);
  }

  let code = status.code().unwrap_or(-1);
  // stderr 우선, 없으면 stdout, 둘 다 없으면 안내 문구
  let detail = if !stderr.is_empty() {
    stderr
  } else if !stdout.is_empty() {
    stdout
  } else {
    "(no stderr / no stdout)".to_string()
  };

  Err(format!("exit {}: {}", code, detail))
}

#[tauri::command]
pub async fn run_plugin(app: AppHandle, plugin: String) -> Result<String, String> {
  let exe_path = resolve_plugin_exe(&app, &plugin)?;
  let label = format!("run_plugin: {}", exe_path.display());

  tauri::async_runtime::spawn_blocking(move || {
    let cmd = StdCommand::new(exe_path);
    spawn_and_collect(cmd, &label)
  })
  .await
  .map_err(|e| e.to_string())?
}

/// 플러그인 실행 + 모드별 인자 전달
/// - mode: "cli" | "config" | "stdin"
#[tauri::command]
pub async fn run_plugin_with_mode(
  app: AppHandle,
  plugin: String,
  params: PluginRunArgs
) -> Result<String, String> {
  let exe_path = resolve_plugin_exe(&app, &plugin)?;
  let label = format!("run_plugin_with_mode({plugin}): {}", exe_path.display());

  tauri::async_runtime::spawn_blocking(move || -> Result<String, String> {
    match params {
      PluginRunArgs::Cli { args } => {
        let mut cmd = StdCommand::new(&exe_path);
        if !args.is_empty() {
          cmd.args(&args);
        }
        // 디버깅 도움: 어떤 인자로 실행했는지 프린트
        // println!("[cli] {label} args={:?}", args);
        spawn_and_collect(cmd, &label)
      }
      PluginRunArgs::Config { config_path, output } => {
        let mut cmd = StdCommand::new(&exe_path);
        cmd.arg("--config").arg(&config_path);
        if let Some(out_file) = output.as_ref() {
          cmd.arg("--output").arg(out_file);
        }
        // println!("[config] {label} --config {:?} --output {:?}", config_path, output);
        spawn_and_collect(cmd, &label)
      }
      PluginRunArgs::Stdin { json } => {
        let mut cmd = StdCommand::new(&exe_path);
        cmd.stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped());

        // 옵션: json에 output이 있으면 플래그로도 전달
        if let Some(out) = json.get("output").and_then(|v| v.as_str()) {
          cmd.arg("--output").arg(out);
        }

        // println!("[stdin] {label} json keys={:?}", json.as_object().map(|o| o.keys().collect::<Vec<_>>()));
        let mut child = cmd.spawn().map_err(|e| format!("spawn failed ({label}): {e}"))?;

        // STDIN에 JSON 쓰고, 반드시 flush + drop 해서 EOF 전달
        if let Some(mut stdin) = child.stdin.take() {
          let buf = serde_json::to_vec(&json).map_err(|e| e.to_string())?;
          stdin.write_all(&buf).map_err(|e| e.to_string())?;
          stdin.flush().ok();
          drop(stdin); // ← EOF 보내기 중요
        }

        let out = child.wait_with_output().map_err(|e| e.to_string())?;
        let status = out.status;
        let stdout = String::from_utf8_lossy(&out.stdout).trim().to_string();
        let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();

        if status.success() {
          Ok(stdout)
        } else {
          let code = status.code().unwrap_or(-1);
          let detail = if !stderr.is_empty() {
            stderr
          } else if !stdout.is_empty() {
            stdout
          } else {
            "(no stderr / no stdout)".to_string()
          };
          Err(format!("exit {}: {}", code, detail))
        }
      }
    }
  })
  .await
  .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn run_plugin_with_args(
  app: AppHandle,
  plugin: String,
  args: Vec<String>
) -> Result<String, String> {
  run_plugin_with_mode(app, plugin, PluginRunArgs::Cli { args }).await
}
