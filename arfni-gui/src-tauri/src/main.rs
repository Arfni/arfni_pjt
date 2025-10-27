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
      // SSH 명령어
      commands::ssh::ssh_exec_system,
      commands::ssh::ec2_add_entry,
      commands::ssh::ec2_read_entry,
      commands::ssh::ec2_delete_entry,

      // 플러그인 명령어
      commands::plugin::run_plugin,
      commands::plugin_check::list_targets,
      commands::plugin_check::read_plugins,

      // 프로젝트 관리 명령어
      commands::project::create_project,
      commands::project::open_project,
      commands::project::save_stack_yaml,
      commands::project::read_stack_yaml,
      commands::project::load_canvas_state,
      commands::project::get_recent_projects,
      commands::project::add_to_recent_projects,

      // 배포 명령어
      commands::deployment::validate_stack_yaml,
      commands::deployment::deploy_stack,
      commands::deployment::stop_deployment,
      commands::deployment::check_docker,
      commands::deployment::check_docker_compose,

      // 파일 감시 명령어
      commands::file_watcher::watch_stack_yaml,
      commands::file_watcher::stop_watching,
    ])
        .run(tauri::generate_context!())
        .expect("error while running Tauri application");
}
