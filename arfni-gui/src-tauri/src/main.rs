#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")] // ← 파일 맨 첫 줄(중요)
use tauri_plugin_dialog;
use tauri::Manager;
use std::sync::Mutex;

mod test;
// re-export 해서 현재 모듈로 끌어오면 매크로 가시성 문제를 피하기 좋습니다
pub use test::{greet, hello};

mod commands;
mod features;
mod db;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            // 데이터베이스 초기화
            let db = db::Database::new(app.handle())?;

            // JSON → SQLite 마이그레이션 (일회성)
            db::migrate_from_json(app.handle(), &db)?;

            // 더미 EC2 서버 추가 (테스트용 - 서버가 없을 때만)
            // db::add_dummy_server_if_empty(&db)?;

            // 앱 상태로 DB 저장 (전역 접근 가능)
            app.manage(db);

            // 프로젝트 잠금 상태 초기화
            app.manage(Mutex::new(commands::project::ProjectLock::new()));

            // 윈도우 닫힐 때 모니터링 스택 정리
            let window = app.get_webview_window("main").unwrap();

            // Windows에서는 OS가 foreground 가로채기를 막으므로
            // 잠깐 always-on-top으로 올린 뒤 포커스를 주고 해제
            let _ = window.set_always_on_top(true);
            let _ = window.set_focus();
            let _ = window.set_always_on_top(false);

            let app_handle_clone = app.handle().clone();
            let window_clone = window.clone();

            window.on_window_event(move |event| {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    println!("[main.rs] Window close requested");

                    // 프로젝트 잠금 파일 해제
                    if let Some(lock) = app_handle_clone.try_state::<Mutex<commands::project::ProjectLock>>() {
                        let mut lock_guard = lock.lock().unwrap();
                        lock_guard.file = None;
                        lock_guard.path = None;
                    }

                    // 창을 먼저 숨김 (사용자는 즉시 닫힌 것처럼 보임)
                    let _ = window_clone.hide();

                    // 우리가 띄운 SSH 세션/터널만 정리 (전역 ssh.exe 학살 금지)
                    crate::features::ssh_rt::close_all_sessions(&app_handle_clone);
                    crate::features::ssh_rt::close_all_tunnels(&app_handle_clone);
                    crate::features::sftp::kill_all_sessions();

                    // 백그라운드에서 cleanup 실행
                    let cleanup_app = app_handle_clone.clone();
                    std::thread::spawn(move || {
                        println!("[main.rs] Starting cleanup in background...");
                        crate::commands::monitoring::cleanup_owned_monitoring_on_exit(&cleanup_app);
                        println!("[main.rs] Cleanup completed");

                        // cleanup 완료 후 프로세스 종료
                        std::process::exit(0);
                    });

                    // CloseRequested를 막음 (우리가 수동으로 종료함)
                    api.prevent_close();
                }
            });

            println!("✅ ARFNI GUI initialized successfully");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
      // SSH 명령어
      commands::ssh::ssh_exec_system,

      // 원격 Docker (검증된 형태로만 노출)
      commands::docker_remote::docker_container_action,
      commands::docker_remote::docker_all_containers,
      commands::docker_remote::docker_ps,

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
      commands::ssh_it::ssh_write,
      commands::ssh_it::ssh_resize,
      commands::ssh_it::ssh_close,
      commands::ssh_it::tunnel_open,
      commands::ssh_it::tunnel_list,
      commands::ssh_it::tunnel_close,

      // SFTP 명령어
      commands::sftp::sftp_connect,
      commands::sftp::sftp_disconnect,
      commands::sftp::sftp_home,
      commands::sftp::sftp_canonicalize,
      commands::sftp::sftp_list,
      commands::sftp::sftp_mkdir,
      commands::sftp::sftp_rename,
      commands::sftp::sftp_remove,
      commands::sftp::sftp_read_text,
      commands::sftp::sftp_download,
      commands::sftp::sftp_upload,

      // 플러그인 명령어
      commands::plugin::run_plugin,
      commands::plugin::run_plugin_with_args,
      commands::plugin::run_plugin_with_mode,
      commands::plugin::install_plugin,
      commands::plugin::uninstall_plugin,
      commands::plugin::list_installed_plugins,
      commands::plugin::load_plugin_registry,
      commands::plugin::refresh_plugin_registry,
      commands::plugin::clear_registry_cache,
      commands::plugin::get_cache_info,
      commands::plugin::read_plugin_template,
      commands::plugin::list_bundled_plugins,
      commands::plugin::read_bundled_plugin_manifest,
      commands::plugin::read_plugin_icon,
      commands::plugin::import_custom_plugin,
      commands::plugin_check::list_targets,
      commands::plugin_check::read_plugins,

      // 프로젝트 관리 명령어 (SQLite 기반)
      commands::project::create_project,
      commands::project::open_project,
      commands::project::open_project_by_path,
      commands::project::save_stack_yaml,
      commands::project::read_stack_yaml,
      // commands::project::read_file_content,  // Temporarily disabled - GitHub feature unstable
      commands::project::load_canvas_state,
      commands::project::get_all_projects,
      commands::project::get_projects_by_environment,
      commands::project::get_projects_by_server,
      commands::project::get_recent_projects,
      commands::project::add_to_recent_projects,
      commands::project::remove_from_recent_projects,
      commands::project::update_project,
      commands::project::delete_project,
      commands::project::write_file,
      commands::project::delete_project_from_db_only,
      commands::project::close_project,
      // GitHub-related commands temporarily disabled due to instability
      // commands::project::clone_github_repo_on_ec2,
      // commands::project::commit_stack_yaml_to_github,
      // commands::project::setup_github_project_with_cicd,
      // commands::project::commit_and_push_stack_yaml,

      // 배포 명령어
      commands::deployment::validate_stack_yaml,
      commands::deployment::deploy_stack,
      commands::deployment::stop_deployment,
      commands::deployment::reset_deployment_state,
      commands::deployment::check_docker,
      commands::deployment::check_docker_compose,
      commands::deployment::check_docker_running,
      commands::deployment::test_ssh_connection,
      commands::deployment::start_monitoring,
      commands::deployment::smart_deploy,
      commands::deployment::analyze_deployment_failure,

      // 파일 감시 명령어
      commands::file_watcher::watch_stack_yaml,
      commands::file_watcher::stop_watching,

      //헬스체크 명령어
      commands::health::check_health,

      // 모니터링 명령어
      commands::monitoring::prometheus_query,
      commands::monitoring::get_cpu_usage,
      commands::monitoring::get_memory_usage,
      commands::monitoring::get_network_traffic,
      commands::monitoring::get_disk_usage,
      commands::monitoring::get_all_metrics,
      commands::monitoring::get_monitoring_config,
      commands::monitoring::test_prometheus_connection,
      commands::monitoring::check_server_status,
      commands::monitoring::start_monitoring_stack,
      commands::monitoring::check_monitoring_running,
      commands::monitoring::stop_monitoring_stack,

      //포트체크 명령어
      commands::port_check::list_open_ports,
      commands::port_check::list_listening_ports,
      commands::port_check::list_ec2_listening_ports,


      // 비용 예측 명령어
      commands::pricing::estimate_cost,
      commands::pricing::analyze,


      // 시스템 명령어
      commands::system::open_downloads_folder,
      commands::system::open_folder_in_explorer,
      commands::system::path_exists,

      //api_key
      commands::keys::add_api_key,
      commands::keys::list_api_keys,
      commands::keys::delete_api_key,
      commands::keys::set_active_api_key,
      commands::keys::get_active_api_key,
      commands::keys::deactivate_all_api_keys,

      // CI/CD 명령어
      commands::cicd::authenticate_github,
      commands::cicd::fetch_github_repositories,
      commands::cicd::setup_cicd,
      commands::cicd::update_workflow_file,
      commands::cicd::setup_complete_cicd,
      commands::cicd::check_cicd_status,

      //github 
      commands::github_command::git_clone_full,
    ])
        .run(tauri::generate_context!())
        .expect("error while running Tauri application");
}
