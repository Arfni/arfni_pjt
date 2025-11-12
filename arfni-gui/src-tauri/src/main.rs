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
        .setup(|app| {
            // 데이터베이스 초기화
            let db = db::Database::new(app.handle())?;

            // JSON → SQLite 마이그레이션 (일회성)
            db::migrate_from_json(app.handle(), &db)?;

            // 더미 EC2 서버 추가 (테스트용 - 서버가 없을 때만)
            db::add_dummy_server_if_empty(&db)?;

            // 앱 상태로 DB 저장 (전역 접근 가능)
            app.manage(db);

            // 프로젝트 잠금 상태 초기화
            app.manage(Mutex::new(commands::project::ProjectLock::new()));

            // 윈도우 닫힐 때 모니터링 스택 정리
            let window = app.get_webview_window("main").unwrap();
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

                    // 백그라운드에서 cleanup 실행
                    std::thread::spawn(move || {
                        println!("[main.rs] Starting cleanup in background...");
                        cleanup_monitoring_stack();
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
      commands::ssh_it::tunnel_open,
      commands::ssh_it::tunnel_close,

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
      commands::project::update_project,
      commands::project::delete_project,
      commands::project::write_file,
      commands::project::delete_project_from_db_only,
      commands::project::close_project,
      commands::project::clone_github_repo_on_ec2,
      commands::project::commit_stack_yaml_to_github,

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
      commands::monitoring::start_monitoring_stack,
      commands::monitoring::check_monitoring_running,
      commands::monitoring::stop_monitoring_stack,

      //포트체크 명령어
      commands::port_check::list_open_ports,
      commands::port_check::list_listening_ports,
      commands::port_check::list_ec2_listening_ports,

      
      // 비용 예측 명령어
      commands::pricing::estimate_cost,
      commands::pricing::optimize,


      // 시스템 명령어
      commands::system::open_downloads_folder,
      commands::system::open_folder_in_explorer,

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
    ])
        .run(tauri::generate_context!())
        .expect("error while running Tauri application");
}

fn cleanup_monitoring_stack() {
    use std::process::Command;
    use std::fs::OpenOptions;
    use std::io::Write;

    #[cfg(target_os = "windows")]
    use std::os::windows::process::CommandExt;

    #[cfg(target_os = "windows")]
    const CREATE_NO_WINDOW: u32 = 0x08000000;

    // 로그 파일 생성
    let log_path = std::env::temp_dir().join("arfni_cleanup.log");
    let mut log_file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_path)
        .ok();

    let mut log = |msg: &str| {
        let timestamp = chrono::Local::now().format("%Y-%m-%d %H:%M:%S");
        let log_msg = format!("[{}] {}\n", timestamp, msg);
        println!("{}", log_msg.trim());
        if let Some(ref mut f) = log_file {
            let _ = f.write_all(log_msg.as_bytes());
        }
    };

    log(&format!("Cleanup started. Log file: {}", log_path.display()));

    // 1. arfni-monitoring.exe 프로세스 종료
    #[cfg(target_os = "windows")]
    {
        let mut kill_monitoring = Command::new("taskkill");
        kill_monitoring.args(&["/F", "/IM", "arfni-monitoring.exe"]);
        kill_monitoring.creation_flags(CREATE_NO_WINDOW);
        match kill_monitoring.output() {
            Ok(_) => log("Killed arfni-monitoring.exe"),
            Err(e) => log(&format!("Failed to kill arfni-monitoring.exe: {}", e)),
        }
    }

    // 2. 모니터링 관련 Docker 컨테이너 정리
    let name_patterns = vec!["grafana", "prometheus", "node-exporter"];

    for pattern in &name_patterns {
        log(&format!("Searching for containers with name pattern: {}", pattern));

        let mut list_cmd = Command::new("docker");
        list_cmd.args(&["ps", "-aq", "--filter", &format!("name={}", pattern)]);

        #[cfg(target_os = "windows")]
        {
            list_cmd.creation_flags(CREATE_NO_WINDOW);
        }

        match list_cmd.output() {
            Ok(output) => {
                let container_ids = String::from_utf8_lossy(&output.stdout);
                let ids: Vec<&str> = container_ids.lines()
                    .map(|s| s.trim())
                    .filter(|s| !s.is_empty())
                    .collect();

                log(&format!("Found {} containers for pattern '{}'", ids.len(), pattern));

                for container_id in ids {
                    let mut rm_cmd = Command::new("docker");
                    rm_cmd.args(&["rm", "-f", container_id]);

                    #[cfg(target_os = "windows")]
                    {
                        rm_cmd.creation_flags(CREATE_NO_WINDOW);
                    }

                    match rm_cmd.output() {
                        Ok(_) => log(&format!("Removed container: {}", container_id)),
                        Err(e) => log(&format!("Failed to remove {}: {}", container_id, e)),
                    }
                }
            }
            Err(e) => log(&format!("Failed to list containers: {}", e)),
        }
    }

    // 3. SSH 프로세스 종료
    #[cfg(target_os = "windows")]
    {
        let mut kill_cmd = Command::new("taskkill");
        kill_cmd.args(&["/F", "/IM", "ssh.exe"]);
        kill_cmd.creation_flags(CREATE_NO_WINDOW);
        let _ = kill_cmd.output();
        log("Killed ssh.exe");
    }

    log("Cleanup completed");
}
