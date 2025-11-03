use tauri::command;
use std::process::Command;

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
