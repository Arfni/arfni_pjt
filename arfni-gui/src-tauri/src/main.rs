#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")] // ← 파일 맨 첫 줄(중요)
use tauri_plugin_dialog;
mod test;
// re-export 해서 현재 모듈로 끌어오면 매크로 가시성 문제를 피하기 좋습니다
pub use test::{greet, hello};

mod commands;
mod features;

fn main() {
    
    tauri::Builder::default()
     .plugin(tauri_plugin_dialog::init())
            .invoke_handler(tauri::generate_handler![
      commands::ssh::ssh_exec_system, 
      commands::plugin::run_plugin, 
      commands::plugin_check::list_targets ,
      commands::plugin_check::read_plugins, 
      commands::ssh::ec2_add_entry,
      commands::ssh::ec2_read_entry,
      commands::ssh::ec2_delete_entry,
       
       // ← 등록
    ])
        .run(tauri::generate_context!())
        .expect("error while running Tauri application");
}
