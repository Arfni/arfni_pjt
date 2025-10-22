use std::{fs, path::PathBuf};
use tauri::AppHandle;
use serde::{Serialize, Deserialize};
use anyhow::Result;

const TARGET_SUFFIX: &str = "-x86_64-pc-windows-msvc.exe";
const DATA_DIR_NAME: &str = "data";
const DATA_FILE: &str = "plugins.json";

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

fn plugin_dir_near_exe() -> anyhow::Result<PathBuf> {
    let exe = std::env::current_exe()?;
    let exe_dir = exe.parent().ok_or_else(|| anyhow::anyhow!("no exe parent"))?;
    let mut base = exe_dir.to_path_buf();
    base.push("plugins");
    Ok(base)
}

#[derive(Serialize, Deserialize, Clone)]
pub struct TargetEntry {
    pub file_name: String,
    pub target_name: String,
    pub size: u64,
    pub path: String,
}

#[derive(Serialize, Deserialize)]
struct SavedTargets {
    generated_at_ms: u128,     // 저장 시각 (epoch ms)
    items: Vec<TargetEntry>,   // 실제 목록
}


fn strip_suffix(file_name: &str) -> Option<&str> {
    file_name.strip_suffix(TARGET_SUFFIX)
}




#[tauri::command]
pub async fn list_targets(_app: AppHandle) -> Result<Vec<TargetEntry>, String> {
    // ★ Result<PathBuf, _> → PathBuf 로 언랩
    let dir: PathBuf = plugin_dir_near_exe().map_err(|e| e.to_string())?;

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

    if let Ok(data_dir) = data_dir_near_exe() {
        let mut json_path = data_dir.clone();
        json_path.push("plugins.json");

        if let Ok(json) = serde_json::to_string_pretty(&out) {
            let _ = fs::write(&json_path, json);
        }
    }
    Ok(out)
}


#[tauri::command]
pub async fn read_plugins(_app: AppHandle) -> Result<Vec<TargetEntry>, String> {
    let mut path = data_dir_near_exe().map_err(|e| e.to_string())?;

    path.push(DATA_FILE);
    //없으면 빈배열 반환
    if !path.exists() {
        return Ok(Vec::new());
    }

        // 읽기 + 파싱
    let txt = fs::read_to_string(&path).map_err(|e| e.to_string())?;


    let items: Vec<TargetEntry> =
        serde_json::from_str(&txt).or_else(|_e| {
            #[derive(Deserialize)]
            struct Saved { items: Vec<TargetEntry> }
            serde_json::from_str::<Saved>(&txt).map(|s| s.items)
        })
        .map_err(|e| e.to_string())?;

    Ok(items)
}
