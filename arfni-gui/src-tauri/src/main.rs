#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")] // ← 파일 맨 첫 줄(중요)
use tauri_plugin_dialog;
use tauri::Manager;

mod test;
// re-export 해서 현재 모듈로 끌어오면 매크로 가시성 문제를 피하기 좋습니다
pub use test::{greet, hello};

mod commands;
mod features;
mod db;

fn main() {

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            // 데이터베이스 초기화
            let db = db::Database::new(app.handle())?;

            // JSON → SQLite 마이그레이션 (일회성)
            db::migrate_from_json(app.handle(), &db)?;

            // 더미 EC2 서버 추가 (테스트용 - 서버가 없을 때만)
            db::add_dummy_server_if_empty(&db)?;

            // 앱 상태로 DB 저장 (전역 접근 가능)
            app.manage(db);

            println!("✅ ARFNI GUI initialized successfully");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
      // SSH 명령어
      commands::ssh::ssh_exec_system,

      // EC2 서버 관리 명령어 (SQLite 기반)
      commands::ssh::create_ec2_server,
      commands::ssh::get_all_ec2_servers,
      commands::ssh::get_ec2_server_by_id,
      commands::ssh::update_ec2_server,
      commands::ssh::delete_ec2_server,
      commands::ssh::update_ec2_server_last_connected,

      // EC2 레거시 명령어 (호환성)
      commands::ssh::ec2_add_entry,
      commands::ssh::ec2_read_entry,
      commands::ssh::ec2_delete_entry,
      commands::ssh_it::ssh_start,
      commands::ssh_it::ssh_send,
      commands::ssh_it::ssh_close,

      // 플러그인 명령어
      commands::plugin::run_plugin,
      commands::plugin::run_plugin_with_args,
      commands::plugin::run_plugin_with_mode,
      commands::plugin_check::list_targets,
      commands::plugin_check::read_plugins,

      // 프로젝트 관리 명령어 (SQLite 기반)
      commands::project::create_project,
      commands::project::open_project,
      commands::project::open_project_by_path,
      commands::project::save_stack_yaml,
      commands::project::read_stack_yaml,
      commands::project::load_canvas_state,
      commands::project::get_all_projects,
      commands::project::get_projects_by_environment,
      commands::project::get_projects_by_server,
      commands::project::get_recent_projects,
      commands::project::add_to_recent_projects,
      commands::project::remove_from_recent_projects,
      commands::project::delete_project,

      // 배포 명령어
      commands::deployment::validate_stack_yaml,
      commands::deployment::deploy_stack,
      commands::deployment::stop_deployment,
      commands::deployment::reset_deployment_state,
      commands::deployment::check_docker,
      commands::deployment::check_docker_compose,
      commands::deployment::check_docker_running,

      // 파일 감시 명령어
      commands::file_watcher::watch_stack_yaml,
      commands::file_watcher::stop_watching,

      //헬스체크 명령어
      commands::health::check_health,
    ])
        .run(tauri::generate_context!())
        .expect("error while running Tauri application");
}
