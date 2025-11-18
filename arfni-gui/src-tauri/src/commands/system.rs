use tauri::command;
use std::process::Command;
use std::path::Path;
use std::fs;

#[command]
pub async fn open_downloads_folder() -> Result<(), String> {
    let downloads_dir = dirs::download_dir()
        .ok_or("Downloads 폴더를 찾을 수 없습니다.".to_string())?;

    #[cfg(target_os = "windows")]
    {
        Command::new("explorer")
            .arg(downloads_dir)
            .spawn()
            .map_err(|e| format!("폴더 열기 실패: {}", e))?;
    }

    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(downloads_dir)
            .spawn()
            .map_err(|e| format!("폴더 열기 실패: {}", e))?;
    }

    #[cfg(target_os = "linux")]
    {
        Command::new("xdg-open")
            .arg(downloads_dir)
            .spawn()
            .map_err(|e| format!("폴더 열기 실패: {}", e))?;
    }

    Ok(())
}

#[command]
pub async fn open_folder_in_explorer(path: String) -> Result<(), String> {
    let folder_path = Path::new(&path);

    if !folder_path.exists() {
        return Err(format!("폴더를 찾을 수 없습니다: {}", path));
    }

    #[cfg(target_os = "windows")]
    {
        Command::new("explorer")
            .arg(folder_path)
            .spawn()
            .map_err(|e| format!("폴더 열기 실패: {}", e))?;
    }

    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(folder_path)
            .spawn()
            .map_err(|e| format!("폴더 열기 실패: {}", e))?;
    }

    #[cfg(target_os = "linux")]
    {
        Command::new("xdg-open")
            .arg(folder_path)
            .spawn()
            .map_err(|e| format!("폴더 열기 실패: {}", e))?;
    }

    Ok(())
}

#[command]
pub fn path_exists(path: String) -> bool {
    Path::new(&path).exists()
}

#[command]
pub fn get_temp_dir() -> Result<String, String> {
    std::env::temp_dir()
        .to_str()
        .map(|s| s.to_string())
        .ok_or_else(|| "임시 디렉토리 경로를 가져올 수 없습니다".to_string())
}
