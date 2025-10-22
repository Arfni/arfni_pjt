use std::{fs, path::PathBuf};
use tauri::AppHandle;
use serde::Serialize;

const TARGET_SUFFIX: &str = "-x86_64-pc-windows-msvc.exe";
const DATA_DIR_NAME: &str = "data";

fn data_dir_near_exe() -> anyhow::Result<PathBuf> {
    let exe = std::env::current_exe()?;
    let exe_dir = exe.parent().ok_or_else(|| anyhow::anyhow!("no exe parent"))?;
    let mut base = exe_dir.to_path_buf();
    base.push(DATA_DIR_NAME);
    if !base.exists() {
        fs::create_dir_all(&base)?;
    }
    Ok(base)
}

#[derive(Serialize)]
pub struct TargetEntry {
    pub file_name: String,
    pub target_name: String,
    pub size: u64,
    pub path: String,
}

fn strip_suffix(file_name: &str) -> Option<&str> {
    file_name.strip_suffix(TARGET_SUFFIX)
}

#[tauri::command]
pub async fn list_targets(_app: AppHandle) -> Result<Vec<TargetEntry>, String> {
    // ★ Result<PathBuf, _> → PathBuf 로 언랩
    let dir: PathBuf = data_dir_near_exe().map_err(|e| e.to_string())?;

    let mut out = Vec::new();
    if dir.exists() {
        // &PathBuf OK (AsRef<Path>)
        for ent in fs::read_dir(&dir).map_err(|e| e.to_string())? {
            let ent = ent.map_err(|e| e.to_string())?;
            let md = ent.metadata().map_err(|e| e.to_string())?;
            if md.is_file() {
                let name = ent.file_name().to_string_lossy().to_string();
                if name.ends_with(TARGET_SUFFIX) {
                    let target_name = strip_suffix(&name).unwrap_or("").to_string();
                    out.push(TargetEntry {
                        file_name: name.clone(),
                        target_name,
                        size: md.len(),
                        path: ent.path().to_string_lossy().to_string(),
                    });
                }
            }
        }
    }
    Ok(out)
}
