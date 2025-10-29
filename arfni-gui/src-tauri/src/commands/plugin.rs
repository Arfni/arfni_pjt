use tauri::{AppHandle, path::BaseDirectory};
use tauri::Manager;
use std::{
  fs,
  io::Write,
  path::{Path, PathBuf},
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

/// 폴더에서 .exe 후보들을 수집(Windows 전용).
/// - 단일 exe만 있으면 그걸 Some로 반환
/// - 여러 개면 plugin.exe가 있으면 그걸 Some로 반환
/// - 그 외엔 None (호출측에서 에러 메시지 구성)
#[cfg(target_os = "windows")]
fn pick_exe_in_dir(dir: &Path, plugin: &str) -> Option<PathBuf> {
  if !dir.exists() || !dir.is_dir() {
    return None;
  }
  let Ok(entries) = fs::read_dir(dir) else { return None; };

  let mut exes: Vec<PathBuf> = entries
    .filter_map(|e| e.ok())
    .map(|e| e.path())
    .filter(|p| p.is_file() && p.extension().map(|ext| ext.eq_ignore_ascii_case("exe")).unwrap_or(false))
    .collect();

  if exes.is_empty() {
    return None;
  }
  if exes.len() == 1 {
    return exes.pop();
  }

  // 여러 개면 plugin.exe 우선
  let want = dir.join(format!("{plugin}.exe"));
  if want.exists() {
    return Some(want);
  }

  None
}

/// Windows가 아닌 경우(맥/리눅스)는 굳이 지원할 필요 없다고 했지만,
/// 편의를 위해 `plugin` 이름과 동일한 실행 파일(확장자 없음)을 찾는 최소 동작만 둠.
#[cfg(not(target_os = "windows"))]
fn pick_exe_in_dir(dir: &Path, plugin: &str) -> Option<PathBuf> {
  if !dir.exists() || !dir.is_dir() {
    return None;
  }
  let candidate = dir.join(plugin);
  if candidate.exists() && candidate.is_file() {
    Some(candidate)
  } else {
    None
  }
}

/// 실행 파일 경로 탐색(배포 리소스/개발 경로 모두 지원)
/// - “그냥 exe면 실행” 원칙에 맞춰 간단화
fn resolve_plugin_exe(app: &AppHandle, plugin: &str) -> Result<PathBuf, String> {
  // 1) 리소스 기준 우선 후보들
  let res_plugin_dir = app
    .path()
    .resolve(&format!("plugins/{plugin}"), BaseDirectory::Resource)
    .ok();

  let res_flat_plugin_exe = app
    .path()
    .resolve(&format!("plugins/{plugin}.exe"), BaseDirectory::Resource)
    .ok();

  let res_plugin_exe_in_dir = res_plugin_dir
    .as_ref()
    .map(|d| d.join(format!("{plugin}.exe")));

  // 2) 개발 경로(src-tauri/plugins)
  let mut dev_plugins = PathBuf::from(env!("CARGO_MANIFEST_DIR")); // = src-tauri
  dev_plugins.push("plugins");

  let dev_plugin_dir = dev_plugins.join(plugin);
  let dev_flat_plugin_exe = dev_plugins.join(format!("{plugin}.exe"));
  let dev_plugin_exe_in_dir = dev_plugin_dir.join(format!("{plugin}.exe"));

  // ==== 탐색 순서 ====

  // A. 리소스: plugins/<plugin>/plugin.exe
  if let Some(p) = res_plugin_exe_in_dir.as_ref().filter(|p| p.exists()) {
    return Ok(p.clone());
  }

  // B. 리소스: plugins/<plugin>/ 에서 단일 .exe 자동 선택 (또는 다수일 때 plugin.exe 우선)
  if let Some(dir) = res_plugin_dir.as_ref() {
    if let Some(picked) = pick_exe_in_dir(dir, plugin) {
      return Ok(picked);
    }
  }

  // C. 리소스: plugins/plugin.exe
  if let Some(p) = res_flat_plugin_exe.as_ref().filter(|p| p.exists()) {
    return Ok(p.clone());
  }

  // D. 개발: src-tauri/plugins/<plugin>/plugin.exe
  if dev_plugin_exe_in_dir.exists() {
    return Ok(dev_plugin_exe_in_dir);
  }

  // E. 개발: src-tauri/plugins/<plugin>/ 단일 exe 자동 선택 (또는 다수일 때 plugin.exe 우선)
  if let Some(picked) = pick_exe_in_dir(&dev_plugin_dir, plugin) {
    return Ok(picked);
  }

  // F. 개발: src-tauri/plugins/plugin.exe
  if dev_flat_plugin_exe.exists() {
    return Ok(dev_flat_plugin_exe);
  }

  // ---- 실패시 후보/스캔 경로 안내 ----
  let mut tried: Vec<String> = vec![];
  if let Some(p) = res_plugin_exe_in_dir {
    tried.push(format!("Resource: {}", p.display()));
  }
  if let Some(d) = res_plugin_dir {
    tried.push(format!("Resource dir scan: {}", d.display()));
  }
  if let Some(p) = res_flat_plugin_exe {
    tried.push(format!("Resource: {}", p.display()));
  }
  tried.push(format!("Dev: {}", dev_plugin_exe_in_dir.display()));
  tried.push(format!("Dev dir scan: {}", dev_plugin_dir.display()));
  tried.push(format!("Dev: {}", dev_flat_plugin_exe.display()));

  Err(format!(
    "Plugin executable not found for '{plugin}'. Tried:\n  - {}",
    tried.join("\n  - ")
  ))
}

/// 커맨드 실행 → stdout/stderr/exit code 수집
/// 실패 시 stderr가 비어 있으면 stdout을 대신 붙여서 반환
fn spawn_and_collect(mut cmd: StdCommand, what: &str) -> Result<String, String> {
  // println!("[spawn] {what}: {:?}", cmd);

  let out = cmd.output().map_err(|e| format!("spawn failed ({what}): {e}"))?;
  let status = out.status;
  let stdout = String::from_utf8_lossy(&out.stdout).trim().to_string();
  let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();

  if status.success() {
    return Ok(stdout);
  }

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
        spawn_and_collect(cmd, &label)
      }
      PluginRunArgs::Config { config_path, output } => {
        let mut cmd = StdCommand::new(&exe_path);
        cmd.arg("--config").arg(&config_path);
        if let Some(out_file) = output.as_ref() {
          cmd.arg("--output").arg(out_file);
        }
        spawn_and_collect(cmd, &label)
      }
      PluginRunArgs::Stdin { json } => {
        let mut cmd = StdCommand::new(&exe_path);
        cmd.stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped());

        // 옵션: json에 output이 있으면 플래그로도 전달
        if let Some(out) = json.get("output").and_then(|v| v.as_str()) {
          cmd.arg("--output").arg(out);
        }

        let mut child = cmd.spawn().map_err(|e| format!("spawn failed ({label}): {e}"))?;

        // STDIN에 JSON 쓰고, 반드시 flush + drop 해서 EOF 전달
        if let Some(mut stdin) = child.stdin.take() {
          let buf = serde_json::to_vec(&json).map_err(|e| e.to_string())?;
          stdin.write_all(&buf).map_err(|e| e.to_string())?;
          let _ = stdin.flush();
          drop(stdin); // EOF 중요
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
