use tauri::{AppHandle, path::BaseDirectory};
use tauri::Manager;
use serde::{Serialize, Deserialize};
use std::{
  fs,
  io::Write,
  path::{Path, PathBuf},
  process::{Command as StdCommand, Stdio},
};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

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
    let mut cmd = StdCommand::new(exe_path);

    #[cfg(target_os = "windows")]
    {
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

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

        #[cfg(target_os = "windows")]
        {
            const CREATE_NO_WINDOW: u32 = 0x08000000;
            cmd.creation_flags(CREATE_NO_WINDOW);
        }

        spawn_and_collect(cmd, &label)
      }
      PluginRunArgs::Config { config_path, output } => {
        let mut cmd = StdCommand::new(&exe_path);
        cmd.arg("--config").arg(&config_path);
        if let Some(out_file) = output.as_ref() {
          cmd.arg("--output").arg(out_file);
        }

        #[cfg(target_os = "windows")]
        {
            const CREATE_NO_WINDOW: u32 = 0x08000000;
            cmd.creation_flags(CREATE_NO_WINDOW);
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

        #[cfg(target_os = "windows")]
        {
            const CREATE_NO_WINDOW: u32 = 0x08000000;
            cmd.creation_flags(CREATE_NO_WINDOW);
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

// Plugin installation/management commands

#[derive(Serialize, Deserialize)]
pub struct PluginInfo {
  pub name: String,
  pub version: String,
  pub github_url: Option<String>,
  pub installed_at: String,
  pub is_bundled: bool,
}

/// Install a plugin from GitHub
#[tauri::command]
pub async fn install_plugin(
  app: AppHandle,
  owner: String,
  repo: String,
  version: String,
  manifest_yaml: String,
) -> Result<String, String> {
  use std::io::Read;

  // Get user plugins directory
  let app_data_dir = app.path()
    .app_data_dir()
    .map_err(|e| format!("Failed to get app data dir: {}", e))?;

  let user_plugins_dir = app_data_dir.join("plugins").join("installed");
  fs::create_dir_all(&user_plugins_dir)
    .map_err(|e| format!("Failed to create plugins directory: {}", e))?;

  // Extract category from manifest
  let manifest: serde_yaml::Value = serde_yaml::from_str(&manifest_yaml)
    .map_err(|e| format!("Failed to parse manifest YAML: {}", e))?;

  let category = manifest.get("category")
    .and_then(|v| v.as_str())
    .ok_or_else(|| "Plugin manifest missing 'category' field".to_string())?;

  let plugin_name = manifest.get("name")
    .and_then(|v| v.as_str())
    .ok_or_else(|| "Plugin manifest missing 'name' field".to_string())?;

  // Create plugin directory
  let plugin_dir = user_plugins_dir.join(category).join(plugin_name);
  fs::create_dir_all(&plugin_dir)
    .map_err(|e| format!("Failed to create plugin directory: {}", e))?;

  // Save plugin.yaml
  let manifest_path = plugin_dir.join("plugin.yaml");
  fs::write(&manifest_path, &manifest_yaml)
    .map_err(|e| format!("Failed to write plugin.yaml: {}", e))?;

  // Download icon.png from GitHub
  let icon_url = format!(
    "https://raw.githubusercontent.com/{}/{}/{}/icon.png",
    owner, repo, version
  );

  // Use reqwest to download the icon
  let client = reqwest::Client::new();
  let icon_response = client.get(&icon_url)
    .send()
    .await
    .map_err(|e| format!("Failed to download icon: {}", e))?;

  if icon_response.status().is_success() {
    let icon_bytes = icon_response.bytes()
      .await
      .map_err(|e| format!("Failed to read icon bytes: {}", e))?;

    let icon_path = plugin_dir.join("icon.png");
    fs::write(&icon_path, &icon_bytes)
      .map_err(|e| format!("Failed to write icon.png: {}", e))?;
  }

  // Save plugin info to database or JSON file
  let plugin_info = PluginInfo {
    name: plugin_name.to_string(),
    version: version.clone(),
    github_url: Some(format!("https://github.com/{}/{}", owner, repo)),
    installed_at: chrono::Local::now().to_rfc3339(),
    is_bundled: false,
  };

  // Store in a JSON file for now
  let plugins_json_path = app_data_dir.join("installed_plugins.json");
  let mut plugins: Vec<PluginInfo> = if plugins_json_path.exists() {
    let json_str = fs::read_to_string(&plugins_json_path)
      .map_err(|e| format!("Failed to read plugins JSON: {}", e))?;
    serde_json::from_str(&json_str).unwrap_or_default()
  } else {
    Vec::new()
  };

  // Remove old version if exists
  plugins.retain(|p| p.name != plugin_name);
  plugins.push(plugin_info);

  let json_str = serde_json::to_string_pretty(&plugins)
    .map_err(|e| format!("Failed to serialize plugins JSON: {}", e))?;
  fs::write(&plugins_json_path, json_str)
    .map_err(|e| format!("Failed to write plugins JSON: {}", e))?;

  Ok(format!("Plugin '{}' installed successfully", plugin_name))
}

/// Uninstall a plugin
#[tauri::command]
pub async fn uninstall_plugin(
  app: AppHandle,
  plugin_name: String,
) -> Result<String, String> {
  // Get user plugins directory
  let app_data_dir = app.path()
    .app_data_dir()
    .map_err(|e| format!("Failed to get app data dir: {}", e))?;

  let user_plugins_dir = app_data_dir.join("plugins").join("installed");

  // Find and remove plugin directory
  if user_plugins_dir.exists() {
    for category_dir in fs::read_dir(&user_plugins_dir)
      .map_err(|e| format!("Failed to read plugins directory: {}", e))?
    {
      if let Ok(category) = category_dir {
        let plugin_dir = category.path().join(&plugin_name);
        if plugin_dir.exists() {
          fs::remove_dir_all(&plugin_dir)
            .map_err(|e| format!("Failed to remove plugin directory: {}", e))?;
        }
      }
    }
  }

  // Update plugins JSON
  let plugins_json_path = app_data_dir.join("installed_plugins.json");
  if plugins_json_path.exists() {
    let json_str = fs::read_to_string(&plugins_json_path)
      .map_err(|e| format!("Failed to read plugins JSON: {}", e))?;

    let mut plugins: Vec<PluginInfo> = serde_json::from_str(&json_str).unwrap_or_default();
    plugins.retain(|p| p.name != plugin_name);

    let json_str = serde_json::to_string_pretty(&plugins)
      .map_err(|e| format!("Failed to serialize plugins JSON: {}", e))?;
    fs::write(&plugins_json_path, json_str)
      .map_err(|e| format!("Failed to write plugins JSON: {}", e))?;
  }

  Ok(format!("Plugin '{}' uninstalled successfully", plugin_name))
}

/// List installed plugins
#[tauri::command]
pub async fn list_installed_plugins(
  app: AppHandle,
) -> Result<Vec<PluginInfo>, String> {
  let app_data_dir = app.path()
    .app_data_dir()
    .map_err(|e| format!("Failed to get app data dir: {}", e))?;

  let plugins_json_path = app_data_dir.join("installed_plugins.json");

  if plugins_json_path.exists() {
    let json_str = fs::read_to_string(&plugins_json_path)
      .map_err(|e| format!("Failed to read plugins JSON: {}", e))?;

    let plugins: Vec<PluginInfo> = serde_json::from_str(&json_str)
      .map_err(|e| format!("Failed to parse plugins JSON: {}", e))?;

    Ok(plugins)
  } else {
    Ok(Vec::new())
  }
}

/// Load plugin registry from GitHub or local cache
#[tauri::command]
pub async fn load_plugin_registry() -> Result<String, String> {
  // Try to fetch from GitHub
  let registry_url = "https://raw.githubusercontent.com/Arfni/arfni-plugins/main/registry/index.json";

  let client = reqwest::Client::new();
  let response = client.get(registry_url)
    .send()
    .await
    .map_err(|e| format!("Failed to fetch plugin registry: {}", e))?;

  if !response.status().is_success() {
    return Err(format!("Failed to fetch plugin registry: HTTP {}", response.status()));
  }

  let registry_json = response.text()
    .await
    .map_err(|e| format!("Failed to read registry response: {}", e))?;

  Ok(registry_json)
}

/// Read plugin template file
#[tauri::command]
pub async fn read_plugin_template(
  app: AppHandle,
  plugin_path: String,
  template_path: String,
) -> Result<String, String> {
  // Get resource directory for bundled plugins
  let resource_dir = app.path()
    .resource_dir()
    .map_err(|e| format!("Failed to get resource dir: {}", e))?;

  // Check if it's a bundled plugin or user-installed
  let full_path = if plugin_path.starts_with("bundled/") {
    // Bundled plugin - look in resources/plugins
    resource_dir.join("plugins").join(&plugin_path[8..]).join(&template_path)
  } else {
    // User-installed plugin
    let app_data_dir = app.path()
      .app_data_dir()
      .map_err(|e| format!("Failed to get app data dir: {}", e))?;
    app_data_dir.join("plugins").join("installed").join(&plugin_path).join(&template_path)
  };

  // Read the template file
  fs::read_to_string(&full_path)
    .map_err(|e| format!("Failed to read template file at {:?}: {}", full_path, e))
}
