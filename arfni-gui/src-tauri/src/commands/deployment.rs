use serde::{Deserialize, Serialize};
use std::process::{Command, Stdio};
use std::io::{BufRead, BufReader};
use tauri::{AppHandle, Manager, Emitter};
use std::path::Path;
use std::sync::{Arc, Mutex, OnceLock};
use std::sync::atomic::{AtomicBool, Ordering};
use std::collections::HashMap;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[derive(Debug, Clone, Serialize)]
pub struct DeploymentLog {
    pub timestamp: String,
    pub level: String, // info, warning, error, success
    pub message: String,
    pub data: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize)]
pub struct DeploymentStatus {
    pub status: String, // idle, deploying, success, failed
    pub message: Option<String>,
    pub outputs: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize)]
pub struct DeploymentInit {
    pub services: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct StackYaml {
    services: Option<HashMap<String, serde_json::Value>>,
}

// 배포 프로세스 관리를 위한 전역 상태
static DEPLOYMENT_RUNNING: AtomicBool = AtomicBool::new(false);

// 배포 프로세스 PID 저장
static DEPLOYMENT_PROCESS_PID: OnceLock<Arc<Mutex<Option<u32>>>> = OnceLock::new();

fn get_deployment_pid() -> &'static Arc<Mutex<Option<u32>>> {
    DEPLOYMENT_PROCESS_PID.get_or_init(|| Arc::new(Mutex::new(None)))
}

/// stack.yaml 검증
#[tauri::command]
pub fn validate_stack_yaml(yaml_content: String) -> Result<bool, String> {
    // 간단한 YAML 검증 (실제로는 Go 백엔드의 validator 사용 권장)
    if !yaml_content.contains("apiVersion:") {
        return Err("apiVersion이 없습니다".to_string());
    }
    if !yaml_content.contains("name:") {
        return Err("프로젝트 이름이 없습니다".to_string());
    }
    if !yaml_content.contains("targets:") {
        return Err("배포 대상(targets)이 없습니다".to_string());
    }
    if !yaml_content.contains("services:") {
        return Err("서비스 정의가 없습니다".to_string());
    }

    Ok(true)
}

/// Docker 배포 실행
#[tauri::command]
pub async fn deploy_stack(
    app: AppHandle,
    project_path: String,
    stack_yaml_path: String,
    project_id: Option<String>,
) -> Result<DeploymentStatus, String> {
    // 이미 배포가 진행 중인지 확인
    if DEPLOYMENT_RUNNING.load(Ordering::SeqCst) {
        return Err("이미 배포가 진행 중입니다".to_string());
    }

    // GitHub 프로젝트인 경우 별도 처리
    if let Some(proj_id) = project_id {
        use crate::db::Database;
        use rusqlite::params;

        if let Some(db) = app.try_state::<Database>() {
            let (repo_url, branch, access_token, project_name) = {
                let conn = db.get_conn();
                let conn_lock = conn.lock().unwrap();

                let mut stmt = conn_lock.prepare(
                    "SELECT github_repo_url, github_branch, github_access_token, name, workdir, ec2_server_id
                     FROM projects WHERE id = ?1"
                ).map_err(|e| format!("프로젝트 조회 실패: {}", e))?;

                let (repo_url, branch, access_token, project_name, _workdir, _ec2_server_id):
                    (Option<String>, Option<String>, Option<String>, String, Option<String>, Option<String>) = stmt
                    .query_row(params![&proj_id], |row| {
                        Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?, row.get(5)?))
                    })
                    .map_err(|e| format!("프로젝트 정보 조회 실패: {}", e))?;

                drop(stmt);
                // conn_lock은 이 블록을 벗어나면 자동으로 drop됨

                Ok::<_, String>((repo_url, branch, access_token, project_name))
            }?;

            // GitHub 프로젝트인 경우 GitHub Actions Workflow로 배포
            if repo_url.is_some() {
                // GitHub 프로젝트 배포는 Workflow API로 처리
                return deploy_github_project_via_workflow(
                    app,
                    proj_id,
                    project_name,
                    branch.unwrap_or("main".to_string()),
                    repo_url.unwrap(),
                    access_token.ok_or("GitHub access token not found")?,
                ).await;
            }
        }
    }

    // Go 백엔드 실행 파일 경로 찾기 (플래그 설정 전에 먼저 확인)
    let go_binary_path = match find_go_binary(&app) {
        Ok(path) => path,
        Err(e) => {
            // Go 바이너리를 찾지 못한 경우 상세한 에러 메시지와 함께 실패 이벤트 전송
            app.emit("deployment-failed", DeploymentStatus {
                status: "failed".to_string(),
                message: Some(format!("Go 바이너리를 찾을 수 없습니다: {}", e)),
                outputs: None,
            }).unwrap_or(());
            return Err(e);
        }
    };

    // 배포 시작 플래그 설정 (바이너리 확인 후에만 설정)
    DEPLOYMENT_RUNNING.store(true, Ordering::SeqCst);

    // 배포 시작 이벤트 전송
    app.emit("deployment-started", DeploymentStatus {
        status: "deploying".to_string(),
        message: Some("배포를 시작합니다...".to_string()),
        outputs: None,
    }).unwrap_or(());

    // stack.yaml 파싱하여 서비스 목록 추출
    let services = match std::fs::read_to_string(&stack_yaml_path) {
        Ok(yaml_content) => {
            match serde_yaml::from_str::<StackYaml>(&yaml_content) {
                Ok(stack) => {
                    if let Some(services_map) = stack.services {
                        services_map.keys().cloned().collect::<Vec<String>>()
                    } else {
                        Vec::new()
                    }
                }
                Err(e) => {
                    app.emit("deployment-log", DeploymentLog {
                        timestamp: chrono::Utc::now().to_rfc3339(),
                        level: "warning".to_string(),
                        message: format!("⚠️ YAML 파싱 실패: {}", e),
                        data: None,
                    }).unwrap_or(());
                    Vec::new()
                }
            }
        }
        Err(e) => {
            app.emit("deployment-log", DeploymentLog {
                timestamp: chrono::Utc::now().to_rfc3339(),
                level: "warning".to_string(),
                message: format!("⚠️ YAML 파일 읽기 실패: {}", e),
                data: None,
            }).unwrap_or(());
            Vec::new()
        }
    };

    // 서비스 목록 전송
    if !services.is_empty() {
        app.emit("deployment-init", DeploymentInit {
            services: services.clone(),
        }).unwrap_or(());

        app.emit("deployment-log", DeploymentLog {
            timestamp: chrono::Utc::now().to_rfc3339(),
            level: "info".to_string(),
            message: format!("🔨 Found {} service(s): {}", services.len(), services.join(", ")),
            data: None,
        }).unwrap_or(());
    }

    // 새 스레드에서 배포 실행
    let app_clone = app.clone();
    std::thread::spawn(move || {
        // 디버깅: 실행할 명령어 정보 출력
        app_clone.emit("deployment-log", DeploymentLog {
            timestamp: chrono::Utc::now().to_rfc3339(),
            level: "info".to_string(),
            message: format!("Go 바이너리 실행: {}", go_binary_path),
            data: None,
        }).unwrap_or(());

        app_clone.emit("deployment-log", DeploymentLog {
            timestamp: chrono::Utc::now().to_rfc3339(),
            level: "info".to_string(),
            message: format!("프로젝트 경로: {}", project_path),
            data: None,
        }).unwrap_or(());

        // 플러그인 디렉토리 경로 가져오기 (GUI의 AppData)
        let plugin_dir = match app_clone.path().app_data_dir() {
            Ok(mut path) => {
                path.push("plugins");
                path.to_string_lossy().to_string()
            }
            Err(_) => String::new()
        };

        // Bundled 플러그인 디렉토리 경로 가져오기
        let bundled_plugin_dir = if cfg!(debug_assertions) {
            // 개발 모드: CARGO_MANIFEST_DIR 기준으로 resources/plugins/bundled 찾기
            let manifest_dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"));
            let bundled_path = manifest_dir.join("resources").join("plugins").join("bundled");

            if bundled_path.exists() {
                app_clone.emit("deployment-log", DeploymentLog {
                    timestamp: chrono::Utc::now().to_rfc3339(),
                    level: "info".to_string(),
                    message: format!("✅ [DEV] Found bundled plugins at: {}", bundled_path.display()),
                    data: None,
                }).unwrap_or(());
                bundled_path.to_string_lossy().to_string()
            } else {
                app_clone.emit("deployment-log", DeploymentLog {
                    timestamp: chrono::Utc::now().to_rfc3339(),
                    level: "warning".to_string(),
                    message: format!("⚠️ [DEV] Bundled plugins NOT found at: {}", bundled_path.display()),
                    data: None,
                }).unwrap_or(());
                String::new()
            }
        } else {
            // 프로덕션에서는 리소스 디렉토리 사용
            // tauri.conf.json에서 ../public/plugins/bundled -> plugins/bundled 매핑
            match app_clone.path().resource_dir() {
                Ok(path) => {
                    // 디버깅: 리소스 디렉토리 내용 출력
                    app_clone.emit("deployment-log", DeploymentLog {
                        timestamp: chrono::Utc::now().to_rfc3339(),
                        level: "info".to_string(),
                        message: format!("🔍 [PROD] Resource directory: {}", path.display()),
                        data: None,
                    }).unwrap_or(());

                    // 리소스 디렉토리 하위 항목 나열
                    if let Ok(entries) = std::fs::read_dir(&path) {
                        for entry in entries.flatten() {
                            app_clone.emit("deployment-log", DeploymentLog {
                                timestamp: chrono::Utc::now().to_rfc3339(),
                                level: "info".to_string(),
                                message: format!("  📁 {}", entry.file_name().to_string_lossy()),
                                data: None,
                            }).unwrap_or(());
                        }
                    }

                    // 경로 1: plugins/bundled (명시적 매핑)
                    let bundled_path = path.join("plugins").join("bundled");
                    if bundled_path.exists() {
                        app_clone.emit("deployment-log", DeploymentLog {
                            timestamp: chrono::Utc::now().to_rfc3339(),
                            level: "info".to_string(),
                            message: format!("✅ [PROD] Found bundled plugins at: {}", bundled_path.display()),
                            data: None,
                        }).unwrap_or(());
                        bundled_path.to_string_lossy().to_string()
                    } else {
                        // 경로 2: public/plugins/bundled (fallback)
                        let bundled_path_alt = path.join("public").join("plugins").join("bundled");
                        if bundled_path_alt.exists() {
                            app_clone.emit("deployment-log", DeploymentLog {
                                timestamp: chrono::Utc::now().to_rfc3339(),
                                level: "info".to_string(),
                                message: format!("✅ [PROD] Found bundled plugins (fallback) at: {}", bundled_path_alt.display()),
                                data: None,
                            }).unwrap_or(());
                            bundled_path_alt.to_string_lossy().to_string()
                        } else {
                            // 경로 3: 실행 파일 근처에서 찾기 (최후 fallback)
                            let mut found = false;
                            let mut result_path = String::new();

                            if let Ok(exe_path) = std::env::current_exe() {
                                if let Some(exe_dir) = exe_path.parent() {
                                    let exe_bundled_path = exe_dir.join("resources").join("plugins").join("bundled");
                                    if exe_bundled_path.exists() {
                                        app_clone.emit("deployment-log", DeploymentLog {
                                            timestamp: chrono::Utc::now().to_rfc3339(),
                                            level: "info".to_string(),
                                            message: format!("✅ [PROD] Found bundled plugins (exe fallback) at: {}", exe_bundled_path.display()),
                                            data: None,
                                        }).unwrap_or(());
                                        found = true;
                                        result_path = exe_bundled_path.to_string_lossy().to_string();
                                    }
                                }
                            }

                            if !found {
                                app_clone.emit("deployment-log", DeploymentLog {
                                    timestamp: chrono::Utc::now().to_rfc3339(),
                                    level: "warning".to_string(),
                                    message: format!("⚠️ [PROD] Bundled plugins NOT found. Tried: {}, {}",
                                        bundled_path.display(), bundled_path_alt.display()),
                                    data: None,
                                }).unwrap_or(());
                            }

                            result_path
                        }
                    }
                }
                Err(e) => {
                    app_clone.emit("deployment-log", DeploymentLog {
                        timestamp: chrono::Utc::now().to_rfc3339(),
                        level: "error".to_string(),
                        message: format!("❌ [PROD] Failed to get resource dir: {}", e),
                        data: None,
                    }).unwrap_or(());
                    String::new()
                }
            }
        };

        // 배포 명령 실행 - Go 바이너리 직접 실행
        let mut command = Command::new(&go_binary_path);
        command
            .arg("run")
            .arg("-f")
            .arg(&stack_yaml_path)
            .arg("-project-dir")
            .arg(&project_path);

        // 플러그인 디렉토리가 있으면 전달
        if !plugin_dir.is_empty() && Path::new(&plugin_dir).exists() {
            command.arg("-plugins-dir").arg(&plugin_dir);
            app_clone.emit("deployment-log", DeploymentLog {
                timestamp: chrono::Utc::now().to_rfc3339(),
                level: "info".to_string(),
                message: format!("플러그인 디렉토리: {}", plugin_dir),
                data: None,
            }).unwrap_or(());
        }

        // Bundled 플러그인 디렉토리가 있으면 전달
        if !bundled_plugin_dir.is_empty() && Path::new(&bundled_plugin_dir).exists() {
            command.arg("-bundled-plugins-dir").arg(&bundled_plugin_dir);
            app_clone.emit("deployment-log", DeploymentLog {
                timestamp: chrono::Utc::now().to_rfc3339(),
                level: "info".to_string(),
                message: format!("Bundled 플러그인 디렉토리: {}", bundled_plugin_dir),
                data: None,
            }).unwrap_or(());
        }

        command
            .current_dir(&project_path)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        // Windows에서 콘솔 창 숨김
        #[cfg(target_os = "windows")]
        {
            const CREATE_NO_WINDOW: u32 = 0x08000000;
            command.creation_flags(CREATE_NO_WINDOW);
        }

        let cmd = command.spawn();

        match cmd {
            Ok(mut child) => {
                // 프로세스 PID 저장 (stop_deployment에서 사용)
                let pid = child.id();
                if let Ok(mut pid_guard) = get_deployment_pid().lock() {
                    *pid_guard = Some(pid);
                }

                // stdout과 stderr를 동시에 읽기 위해 스레드 사용
                let stdout = child.stdout.take();
                let stderr = child.stderr.take();
                let app_clone_stdout = app_clone.clone();
                let app_clone_stderr = app_clone.clone();

                // stdout 읽기 스레드
                let outputs_arc = Arc::new(std::sync::Mutex::new(None));
                let outputs_clone = outputs_arc.clone();

                let stdout_handle = stdout.map(|stdout| {
                    std::thread::spawn(move || {
                        let reader = BufReader::new(stdout);
                        for line in reader.lines() {
                            // 배포 중단 플래그 확인
                            if !DEPLOYMENT_RUNNING.load(Ordering::SeqCst) {
                                break;
                            }

                            if let Ok(line) = line {
                                // __OUTPUTS__ 파싱
                                if line.contains("__OUTPUTS__") {
                                    if let Some(json_start) = line.find("__OUTPUTS__") {
                                        let json_str = &line[json_start + 11..]; // "__OUTPUTS__" 길이 = 11
                                        if let Ok(outputs_json) = serde_json::from_str::<serde_json::Value>(json_str) {
                                            if let Ok(mut outputs_guard) = outputs_clone.lock() {
                                                *outputs_guard = Some(outputs_json);
                                            }
                                        }
                                    }
                                    continue;
                                }

                                // NDJSON 파싱 시도
                                if let Ok(log_entry) = parse_ndjson_log(&line) {
                                    app_clone_stdout.emit("deployment-log", log_entry).unwrap_or(());
                                } else {
                                    // 일반 텍스트 로그
                                    app_clone_stdout.emit("deployment-log", DeploymentLog {
                                        timestamp: chrono::Utc::now().to_rfc3339(),
                                        level: "info".to_string(),
                                        message: line,
                                        data: None,
                                    }).unwrap_or(());
                                }
                            }
                        }
                    })
                });

                // stderr 읽기 스레드
                let stderr_handle = stderr.map(|stderr| {
                    std::thread::spawn(move || {
                        let reader = BufReader::new(stderr);
                        for line in reader.lines() {
                            // 배포 중단 플래그 확인
                            if !DEPLOYMENT_RUNNING.load(Ordering::SeqCst) {
                                break;
                            }

                            if let Ok(line) = line {
                                // stderr는 에러 레벨로 처리
                                app_clone_stderr.emit("deployment-log", DeploymentLog {
                                    timestamp: chrono::Utc::now().to_rfc3339(),
                                    level: "error".to_string(),
                                    message: line,
                                    data: None,
                                }).unwrap_or(());
                            }
                        }
                    })
                });

                // 스레드 종료 대기
                if let Some(handle) = stdout_handle {
                    let _ = handle.join();
                }
                if let Some(handle) = stderr_handle {
                    let _ = handle.join();
                }

                // 프로세스 종료 대기
                match child.wait() {
                    Ok(status) => {
                        // outputs 가져오기
                        let final_outputs = if let Ok(guard) = outputs_arc.lock() {
                            guard.clone()
                        } else {
                            None
                        };

                        if status.success() {
                            app_clone.emit("deployment-completed", DeploymentStatus {
                                status: "success".to_string(),
                                message: Some("배포가 성공적으로 완료되었습니다".to_string()),
                                outputs: final_outputs,
                            }).unwrap_or(());
                        } else {
                            // 플래그 확인: false면 사용자가 중지한 것이므로 failed 이벤트 발신하지 않음
                            if DEPLOYMENT_RUNNING.load(Ordering::SeqCst) {
                                // 실제 배포 실패
                                app_clone.emit("deployment-failed", DeploymentStatus {
                                    status: "failed".to_string(),
                                    message: Some(format!("배포 실패: 종료 코드 {}", status.code().unwrap_or(-1))),
                                    outputs: None,
                                }).unwrap_or(());
                            }
                            // 플래그가 false면 이미 deployment-stopped 이벤트가 발신되었으므로 아무것도 하지 않음
                        }
                    }
                    Err(e) => {
                        // 플래그 확인: false면 사용자가 중지한 것이므로 failed 이벤트 발신하지 않음
                        if DEPLOYMENT_RUNNING.load(Ordering::SeqCst) {
                            app_clone.emit("deployment-failed", DeploymentStatus {
                                status: "failed".to_string(),
                                message: Some(format!("배포 프로세스 오류: {}", e)),
                                outputs: None,
                            }).unwrap_or(());
                        }
                    }
                }
            }
            Err(e) => {
                app_clone.emit("deployment-failed", DeploymentStatus {
                    status: "failed".to_string(),
                    message: Some(format!("배포 명령 실행 실패: {}", e)),
                    outputs: None,
                }).unwrap_or(());
            }
        }

        // 배포 종료 플래그 및 PID 클리어
        DEPLOYMENT_RUNNING.store(false, Ordering::SeqCst);
        if let Ok(mut pid_guard) = get_deployment_pid().lock() {
            *pid_guard = None;
        }
    });

    Ok(DeploymentStatus {
        status: "deploying".to_string(),
        message: Some("배포가 백그라운드에서 실행 중입니다".to_string()),
        outputs: None,
    })
}

/// 배포 중단
#[tauri::command]
pub fn stop_deployment(app: AppHandle) -> Result<(), String> {
    // 플래그 설정 (배포 스레드가 이를 확인하고 중단할 수 있도록)
    DEPLOYMENT_RUNNING.store(false, Ordering::SeqCst);

    let mut process_killed = false;
    let mut kill_error: Option<String> = None;

    // 저장된 PID로 프로세스 종료 시도
    if let Ok(mut pid_guard) = get_deployment_pid().lock() {
        if let Some(pid) = pid_guard.take() {
            // 플랫폼별 프로세스 종료
            #[cfg(target_os = "windows")]
            {
                use std::process::Command;
                // Windows에서는 taskkill 사용
                let result = Command::new("taskkill")
                    .args(&["/F", "/PID", &pid.to_string()])
                    .output();

                match result {
                    Ok(output) => {
                        if output.status.success() {
                            process_killed = true;
                        } else {
                            kill_error = Some(format!("taskkill 실패: {}",
                                String::from_utf8_lossy(&output.stderr)));
                        }
                    }
                    Err(e) => {
                        kill_error = Some(format!("프로세스 종료 명령 실패: {}", e));
                    }
                }
            }

            #[cfg(not(target_os = "windows"))]
            {
                // Unix 계열에서는 kill 시스템 콜 사용
                use nix::sys::signal::{self, Signal};
                use nix::unistd::Pid;

                match signal::kill(Pid::from_raw(pid as i32), Signal::SIGTERM) {
                    Ok(_) => {
                        process_killed = true;
                    }
                    Err(e) => {
                        kill_error = Some(format!("프로세스 종료 실패: {}", e));
                    }
                }
            }
        }
    }

    // 중지 로그 메시지 발신
    app.emit("deployment-log", DeploymentLog {
        timestamp: chrono::Utc::now().to_rfc3339(),
        level: "warning".to_string(),
        message: "🛑 Deployment stopped by user".to_string(),
        data: None,
    }).unwrap_or(());

    // 프로세스 종료 성공 여부와 상관없이 항상 중단 이벤트 발생
    // (플래그가 false로 설정되었으므로 배포 스레드가 중단될 것임)
    let message = if process_killed {
        "사용자가 배포를 중단했습니다".to_string()
    } else if let Some(err) = kill_error {
        format!("배포 중단 요청됨 (프로세스 종료 시도 중 오류: {})", err)
    } else {
        "배포 중단 요청됨 (프로세스 정보 없음, 플래그로 중단 시도)".to_string()
    };

    app.emit("deployment-stopped", DeploymentStatus {
        status: "stopped".to_string(),
        message: Some(message),
        outputs: None,
    }).unwrap_or(());

    Ok(())
}

/// 배포 상태 초기화 (디버깅용)
#[tauri::command]
pub fn reset_deployment_state() -> Result<bool, String> {
    let was_running = DEPLOYMENT_RUNNING.load(Ordering::SeqCst);
    DEPLOYMENT_RUNNING.store(false, Ordering::SeqCst);
    Ok(was_running)
}

/// Docker 설치 확인
#[tauri::command]
pub fn check_docker() -> Result<bool, String> {
    let mut command = Command::new("docker");
    command.arg("--version");

    #[cfg(target_os = "windows")]
    {
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        command.creation_flags(CREATE_NO_WINDOW);
    }

    match command.output() {
        Ok(output) => {
            if output.status.success() {
                let version = String::from_utf8_lossy(&output.stdout);
                println!("Docker version: {}", version);
                Ok(true)
            } else {
                Ok(false)
            }
        }
        Err(_) => Ok(false),
    }
}

/// Docker Compose 설치 확인
#[tauri::command]
pub fn check_docker_compose() -> Result<bool, String> {
    let mut command = Command::new("docker-compose");
    command.arg("--version");

    #[cfg(target_os = "windows")]
    {
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        command.creation_flags(CREATE_NO_WINDOW);
    }

    match command.output() {
        Ok(output) => Ok(output.status.success()),
        Err(_) => {
            // docker compose (v2) 시도
            let mut command2 = Command::new("docker");
            command2.arg("compose").arg("version");

            #[cfg(target_os = "windows")]
            {
                const CREATE_NO_WINDOW: u32 = 0x08000000;
                command2.creation_flags(CREATE_NO_WINDOW);
            }

            match command2.output() {
                Ok(output) => Ok(output.status.success()),
                Err(_) => Ok(false),
            }
        }
    }
}

/// Docker 데몬 실행 상태 확인
#[tauri::command]
pub fn check_docker_running() -> Result<bool, String> {
    let mut command = Command::new("docker");
    command.arg("ps");

    #[cfg(target_os = "windows")]
    {
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        command.creation_flags(CREATE_NO_WINDOW);
    }

    match command.output() {
        Ok(output) => {
            if output.status.success() {
                Ok(true)
            } else {
                let error = String::from_utf8_lossy(&output.stderr);
                Err(format!("Docker 데몬이 실행되고 있지 않습니다: {}", error.trim()))
            }
        }
        Err(e) => Err(format!("Docker 실행 상태 확인 실패: {}", e)),
    }
}

// 헬퍼 함수들

/// Go 바이너리 경로 찾기 (배포 리소스/개발 경로 모두 지원)
fn find_go_binary(app: &AppHandle) -> Result<String, String> {
    use std::env;
    use tauri::Manager;
    use tauri::path::BaseDirectory;
    use std::path::PathBuf;

    // OS별 실행 파일 확장자
    let extension = if cfg!(windows) { ".exe" } else { "" };
    let binary_name = format!("arfni-go{}", extension);

    // 1. 환경변수 우선 확인
    if let Ok(env_path) = env::var("ARFNI_GO_BINARY_PATH") {
        let env_binary_path = Path::new(&env_path);
        if env_binary_path.exists() {
            println!("✅ Found Go binary from ARFNI_GO_BINARY_PATH: {:?}", env_binary_path);
            return Ok(env_binary_path.to_string_lossy().to_string());
        }
    }

    // 2. 개발 경로들 시도 (CARGO_MANIFEST_DIR 기준) - 개발 모드 우선
    let mut dev_path = PathBuf::from(env!("CARGO_MANIFEST_DIR")); // src-tauri
    dev_path.push("../../BE/arfni/bin");
    dev_path.push(&binary_name);
    if dev_path.exists() {
        println!("✅ Found Go binary (dev): {:?}", dev_path);
        return Ok(dev_path.to_string_lossy().to_string());
    }

    // 3. 프로젝트 루트 찾기 (개발 모드 보조)
    if let Ok(current_dir) = env::current_dir() {
        if let Some(project_root) = find_project_root(&current_dir) {
            let root_based_path = project_root.join("BE").join("arfni").join("bin").join(&binary_name);
            if root_based_path.exists() {
                println!("✅ Found Go binary at project root: {:?}", root_based_path);
                return Ok(root_based_path.to_string_lossy().to_string());
            }
        }
    }

    // 4. Resource 경로들 시도 (배포 환경) - 개발 경로 이후에 확인
    let resource_patterns = vec![
        format!("resources/bin/{}", binary_name),  // Resource/resources/bin/arfni-go.exe (array 방식은 구조 유지)
        format!("bin/{}", binary_name),  // Resource/bin/arfni-go.exe (fallback)
        binary_name.clone(),  // Resource/arfni-go.exe (fallback)
    ];

    for pattern in resource_patterns {
        if let Ok(path) = app.path().resolve(&pattern, BaseDirectory::Resource) {
            if path.exists() {
                println!("✅ Found Go binary in resources: {:?}", path);
                return Ok(path.to_string_lossy().to_string());
            }
        }
    }

    Err(format!("Go 바이너리를 찾을 수 없습니다: {}. 다음을 확인하세요:\n  1. ARFNI_GO_BINARY_PATH 환경변수 설정\n  2. BE/arfni/bin/{} 경로에 바이너리 존재 여부\n  3. Go 바이너리 빌드 완료 여부\n  4. 프로덕션 빌드인 경우 resources 설정 확인",
        binary_name, binary_name))
}

/// 프로젝트 루트 디렉토리 찾기 (.git 폴더 탐색)
fn find_project_root(start_path: &Path) -> Option<std::path::PathBuf> {
    let mut current = start_path;

    loop {
        // .git 폴더가 있으면 프로젝트 루트로 간주
        if current.join(".git").exists() {
            return Some(current.to_path_buf());
        }

        // 부모 디렉토리로 이동
        match current.parent() {
            Some(parent) => current = parent,
            None => return None, // 루트 디렉토리에 도달
        }
    }
}

/// Go 플러그인 경로 찾기 (레거시 - 사용하지 않음)
#[allow(dead_code)]
fn find_plugin_path(app: &AppHandle, plugin_name: &str) -> Result<String, String> {
    use tauri::Manager;
    use std::env;

    // OS별 실행 파일 확장자
    let extension = if cfg!(windows) { ".exe" } else { "" };

    // 1. 프로젝트 루트에서 찾기
    if let Ok(current_dir) = env::current_dir() {
        if let Some(project_root) = find_project_root(&current_dir) {
            let root_based_path = project_root.join("BE").join(format!("arfni{}", extension));
            if root_based_path.exists() {
                println!("✅ Found Go binary at project root: {:?}", root_based_path);
                return Ok(root_based_path.to_string_lossy().to_string());
            }
        }
    }

    // 2. 개발 모드: 상대 경로로 BE/arfni 바이너리 찾기
    let be_path = Path::new("..").join("BE").join(format!("arfni{}", extension));
    if be_path.exists() {
        println!("✅ Found Go binary at: {:?}", be_path);
        return Ok(be_path.to_string_lossy().to_string());
    }

    // 3. 상대 경로로 한 번 더 시도
    let be_path_alt = Path::new("../../BE").join(format!("arfni{}", extension));
    if be_path_alt.exists() {
        println!("✅ Found Go binary at: {:?}", be_path_alt);
        return Ok(be_path_alt.to_string_lossy().to_string());
    }

    // 4. 타겟 트리플 방식 (플러그인 폴더)
    let target_triple = if cfg!(target_os = "windows") {
        "x86_64-pc-windows-msvc"
    } else if cfg!(target_os = "macos") {
        "x86_64-apple-darwin"
    } else {
        "x86_64-unknown-linux-gnu"
    };

    let plugin_filename = format!("{}-{}{}", plugin_name, target_triple, extension);

    // 5. 개발 모드: src-tauri/plugins/
    let dev_path = Path::new("src-tauri")
        .join("plugins")
        .join(plugin_name)
        .join(&plugin_filename);

    if dev_path.exists() {
        return Ok(dev_path.to_string_lossy().to_string());
    }

    // 6. 프로덕션 모드: resources/plugins/
    if let Ok(resource_path) = app.path().resource_dir() {
        let prod_path = resource_path
            .join("plugins")
            .join(plugin_name)
            .join(&plugin_filename);

        if prod_path.exists() {
            return Ok(prod_path.to_string_lossy().to_string());
        }
    }

    Err(format!("플러그인을 찾을 수 없습니다: {}. 경로를 확인하세요:\n  - {:?}\n  - {:?}",
        plugin_name, be_path, be_path_alt))
}

/// NDJSON 로그 파싱
fn parse_ndjson_log(line: &str) -> Result<DeploymentLog, serde_json::Error> {
    #[derive(Deserialize)]
    struct NdjsonEntry {
        #[serde(rename = "type")]
        log_type: String,
        timestamp: String,
        message: String,
        data: Option<serde_json::Value>,
    }

    let entry: NdjsonEntry = serde_json::from_str(line)?;

    Ok(DeploymentLog {
        timestamp: entry.timestamp,
        level: entry.log_type,
        message: entry.message,
        data: entry.data,
    })
}

/// SSH 연결 테스트 (CMD 창 안 뜨게)
#[tauri::command]
pub fn test_ssh_connection(host: String, user: String, key_path: String) -> Result<String, String> {
    let mut command = Command::new("ssh");
    command
        .arg("-i")
        .arg(&key_path)
        .arg("-o").arg("StrictHostKeyChecking=no")
        .arg("-o").arg("BatchMode=yes")
        .arg("-o").arg("ConnectTimeout=10")
        .arg("-o").arg("LogLevel=ERROR")
        .arg(format!("{}@{}", user, host))
        .arg("echo 'Connection successful'")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    // Windows에서 콘솔 창 숨김
    #[cfg(target_os = "windows")]
    {
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        const CREATE_NEW_PROCESS_GROUP: u32 = 0x00000200;
        command.creation_flags(CREATE_NO_WINDOW | CREATE_NEW_PROCESS_GROUP);
    }

    match command.output() {
        Ok(output) => {
            if output.status.success() {
                let stdout = String::from_utf8_lossy(&output.stdout);
                Ok(format!("✓ SSH 연결 성공\n{}", stdout.trim()))
            } else {
                let stderr = String::from_utf8_lossy(&output.stderr);
                Err(format!("SSH 연결 실패: {}", stderr.trim()))
            }
        }
        Err(e) => Err(format!("SSH 실행 실패: {}", e)),
    }
}

/// 모니터링 시작
#[tauri::command]
pub async fn start_monitoring(
    app: AppHandle,
    stack_path: String,
) -> Result<String, String> {
    println!("🎯 Starting monitoring for: {}", stack_path);

    // Go 바이너리 찾기
    let go_binary = find_go_binary(&app)?;
    println!("✅ Found arfni-go at: {}", go_binary);

    // 절대 경로로 변환
    let stack_path_abs = if Path::new(&stack_path).is_absolute() {
        stack_path.clone()
    } else {
        std::env::current_dir()
            .map_err(|e| format!("현재 디렉토리 확인 실패: {}", e))?
            .join(&stack_path)
            .to_string_lossy()
            .to_string()
    };

    if !Path::new(&stack_path_abs).exists() {
        return Err(format!("stack.yaml 파일을 찾을 수 없습니다: {}", stack_path_abs));
    }

    println!("📄 Stack file: {}", stack_path_abs);

    // arfni-go.exe monitor -f stack.yaml 명령어 실행
    let mut command = Command::new(&go_binary);
    command
        .arg("monitor")
        .arg("-f")
        .arg(&stack_path_abs)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    // Windows에서 콘솔 창 숨기지 않음 (모니터링은 별도 창에서 실행)
    // 사용자가 Ctrl+C로 종료할 수 있도록 함

    println!("🚀 Executing: {} monitor -f {}", go_binary, stack_path_abs);

    // 백그라운드에서 실행
    let child = command.spawn()
        .map_err(|e| format!("모니터링 프로세스 시작 실패: {}", e))?;

    let pid = child.id();
    println!("✅ Monitoring process started with PID: {}", pid);

    Ok(format!("모니터링이 시작되었습니다 (PID: {})", pid))
}

// GitHub API helper functions

/// Parse GitHub repo URL to extract owner and repo name
fn parse_github_repo(url: &str) -> Result<(String, String), String> {
    // Handle both HTTPS and SSH formats
    // HTTPS: https://github.com/owner/repo.git
    // SSH: git@github.com:owner/repo.git

    let cleaned = url.trim_end_matches(".git");

    if let Some(parts) = cleaned.strip_prefix("https://github.com/") {
        let segments: Vec<&str> = parts.split('/').collect();
        if segments.len() >= 2 {
            return Ok((segments[0].to_string(), segments[1].to_string()));
        }
    } else if let Some(parts) = cleaned.strip_prefix("git@github.com:") {
        let segments: Vec<&str> = parts.split('/').collect();
        if segments.len() >= 2 {
            return Ok((segments[0].to_string(), segments[1].to_string()));
        }
    }

    Err(format!("Invalid GitHub URL format: {}", url))
}

/// Check if GitHub Actions workflow file exists
async fn check_workflow_exists(
    owner: &str,
    repo: &str,
    token: &str,
) -> Result<bool, String> {
    let url = format!(
        "https://api.github.com/repos/{}/{}/contents/.github/workflows/deploy.yml",
        owner, repo
    );

    let client = reqwest::Client::new();
    let response = client
        .get(&url)
        .header("Authorization", format!("Bearer {}", token))
        .header("User-Agent", "arfni-gui")
        .header("Accept", "application/vnd.github+json")
        .header("X-GitHub-Api-Version", "2022-11-28")
        .send()
        .await
        .map_err(|e| format!("Failed to check workflow file: {}", e))?;

    Ok(response.status().is_success())
}

/// Trigger GitHub Actions workflow dispatch
async fn trigger_workflow_dispatch(
    owner: &str,
    repo: &str,
    branch: &str,
    token: &str,
) -> Result<(), String> {
    let url = format!(
        "https://api.github.com/repos/{}/{}/actions/workflows/deploy.yml/dispatches",
        owner, repo
    );

    let body = serde_json::json!({
        "ref": branch,
    });

    let client = reqwest::Client::new();
    let response = client
        .post(&url)
        .header("Authorization", format!("Bearer {}", token))
        .header("User-Agent", "arfni-gui")
        .header("Accept", "application/vnd.github+json")
        .header("X-GitHub-Api-Version", "2022-11-28")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Failed to trigger workflow: {}", e))?;

    if !response.status().is_success() {
        let error_text = response.text().await.unwrap_or_default();
        return Err(format!("Workflow trigger failed: {}", error_text));
    }

    Ok(())
}

#[derive(serde::Deserialize, Debug)]
struct WorkflowRun {
    id: u64,
    status: String,
    conclusion: Option<String>,
    created_at: String,
}

#[derive(serde::Deserialize)]
struct WorkflowRunsResponse {
    workflow_runs: Vec<WorkflowRun>,
}

/// Get recent workflow runs
async fn get_recent_workflow_run(
    owner: &str,
    repo: &str,
    branch: &str,
    token: &str,
    created_after: &str,
) -> Result<Option<WorkflowRun>, String> {
    let url = format!(
        "https://api.github.com/repos/{}/{}/actions/workflows/deploy.yml/runs?branch={}&per_page=5",
        owner, repo, branch
    );

    let client = reqwest::Client::new();
    let response = client
        .get(&url)
        .header("Authorization", format!("Bearer {}", token))
        .header("User-Agent", "arfni-gui")
        .header("Accept", "application/vnd.github+json")
        .header("X-GitHub-Api-Version", "2022-11-28")
        .send()
        .await
        .map_err(|e| format!("Failed to get workflow runs: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("Failed to get workflow runs: {}", response.status()));
    }

    let runs: WorkflowRunsResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse workflow runs: {}", e))?;

    // Find the most recent run created after our trigger time
    for run in runs.workflow_runs {
        if run.created_at.as_str() >= created_after {
            return Ok(Some(run));
        }
    }

    Ok(None)
}

/// Download workflow run logs
async fn download_workflow_logs(
    owner: &str,
    repo: &str,
    run_id: u64,
    token: &str,
) -> Result<String, String> {
    let url = format!(
        "https://api.github.com/repos/{}/{}/actions/runs/{}/logs",
        owner, repo, run_id
    );

    let client = reqwest::Client::new();
    let response = client
        .get(&url)
        .header("Authorization", format!("Bearer {}", token))
        .header("User-Agent", "arfni-gui")
        .header("Accept", "application/vnd.github+json")
        .header("X-GitHub-Api-Version", "2022-11-28")
        .send()
        .await
        .map_err(|e| format!("Failed to download logs: {}", e))?;

    if !response.status().is_success() {
        return Ok(String::new());
    }

    response
        .text()
        .await
        .map_err(|e| format!("Failed to read logs: {}", e))
}

/// GitHub 프로젝트를 GitHub Actions Workflow로 배포
async fn deploy_github_project_via_workflow(
    app: AppHandle,
    _project_id: String,
    project_name: String,
    branch: String,
    github_repo_url: String,
    github_access_token: String,
) -> Result<DeploymentStatus, String> {
    println!("[GitHub Deploy] Starting workflow deployment for project: {}", project_name);

    // Parse GitHub repo URL
    let (owner, repo) = parse_github_repo(&github_repo_url)?;
    println!("[GitHub Deploy] Repository: {}/{}", owner, repo);

    // 배포 시작 플래그 설정
    DEPLOYMENT_RUNNING.store(true, Ordering::SeqCst);

    // 배포 시작 이벤트 전송
    app.emit("deployment-started", DeploymentStatus {
        status: "deploying".to_string(),
        message: Some("배포를 시작합니다...".to_string()),
        outputs: None,
    }).unwrap_or(());

    // Step 1: Check if workflow file exists
    app.emit("deployment-log", DeploymentLog {
        timestamp: chrono::Utc::now().to_rfc3339(),
        level: "info".to_string(),
        message: "🔍 Checking CI/CD workflow configuration...".to_string(),
        data: None,
    }).unwrap_or(());

    let workflow_exists = check_workflow_exists(&owner, &repo, &github_access_token).await
        .map_err(|e| {
            DEPLOYMENT_RUNNING.store(false, Ordering::SeqCst);
            e
        })?;

    if !workflow_exists {
        DEPLOYMENT_RUNNING.store(false, Ordering::SeqCst);

        app.emit("deployment-log", DeploymentLog {
            timestamp: chrono::Utc::now().to_rfc3339(),
            level: "error".to_string(),
            message: "❌ CI/CD workflow not configured.".to_string(),
            data: None,
        }).unwrap_or(());

        app.emit("deployment-log", DeploymentLog {
            timestamp: chrono::Utc::now().to_rfc3339(),
            level: "info".to_string(),
            message: "".to_string(),
            data: None,
        }).unwrap_or(());

        app.emit("deployment-log", DeploymentLog {
            timestamp: chrono::Utc::now().to_rfc3339(),
            level: "info".to_string(),
            message: "📋 To deploy this GitHub project, you need to setup CI/CD first:".to_string(),
            data: None,
        }).unwrap_or(());

        app.emit("deployment-log", DeploymentLog {
            timestamp: chrono::Utc::now().to_rfc3339(),
            level: "info".to_string(),
            message: "   1. Go back to Projects page".to_string(),
            data: None,
        }).unwrap_or(());

        app.emit("deployment-log", DeploymentLog {
            timestamp: chrono::Utc::now().to_rfc3339(),
            level: "info".to_string(),
            message: "   2. Click 'Setup CI/CD' button on your project card".to_string(),
            data: None,
        }).unwrap_or(());

        app.emit("deployment-log", DeploymentLog {
            timestamp: chrono::Utc::now().to_rfc3339(),
            level: "info".to_string(),
            message: "   3. Complete the 5-step CI/CD configuration wizard".to_string(),
            data: None,
        }).unwrap_or(());

        app.emit("deployment-log", DeploymentLog {
            timestamp: chrono::Utc::now().to_rfc3339(),
            level: "info".to_string(),
            message: "   4. After setup completes, return here and deploy again".to_string(),
            data: None,
        }).unwrap_or(());

        app.emit("deployment-log", DeploymentLog {
            timestamp: chrono::Utc::now().to_rfc3339(),
            level: "info".to_string(),
            message: "".to_string(),
            data: None,
        }).unwrap_or(());

        app.emit("deployment-log", DeploymentLog {
            timestamp: chrono::Utc::now().to_rfc3339(),
            level: "info".to_string(),
            message: "💡 This is a one-time setup. Once configured, future deployments will work automatically.".to_string(),
            data: None,
        }).unwrap_or(());

        app.emit("deployment-failed", DeploymentStatus {
            status: "failed".to_string(),
            message: Some("CI/CD가 설정되지 않았습니다. Projects 페이지에서 'Setup CI/CD' 버튼을 클릭하세요.".to_string()),
            outputs: None,
        }).unwrap_or(());

        return Err("CI/CD workflow not configured. Please run 'Setup CI/CD' from the project card.".to_string());
    }

    app.emit("deployment-log", DeploymentLog {
        timestamp: chrono::Utc::now().to_rfc3339(),
        level: "success".to_string(),
        message: "✅ Workflow configuration found".to_string(),
        data: None,
    }).unwrap_or(());

    // Step 2: Trigger workflow
    app.emit("deployment-log", DeploymentLog {
        timestamp: chrono::Utc::now().to_rfc3339(),
        level: "info".to_string(),
        message: format!("🚀 Triggering GitHub Actions workflow (branch: {})...", branch),
        data: None,
    }).unwrap_or(());

    let trigger_time = chrono::Utc::now().to_rfc3339();

    trigger_workflow_dispatch(&owner, &repo, &branch, &github_access_token).await
        .map_err(|e| {
            DEPLOYMENT_RUNNING.store(false, Ordering::SeqCst);
            app.emit("deployment-log", DeploymentLog {
                timestamp: chrono::Utc::now().to_rfc3339(),
                level: "error".to_string(),
                message: format!("❌ Failed to trigger workflow: {}", e),
                data: None,
            }).unwrap_or(());
            e
        })?;

    app.emit("deployment-log", DeploymentLog {
        timestamp: chrono::Utc::now().to_rfc3339(),
        level: "success".to_string(),
        message: "✅ Workflow triggered successfully".to_string(),
        data: None,
    }).unwrap_or(());

    // Step 3: Monitor workflow in background thread
    let app_clone = app.clone();
    let owner_clone = owner.clone();
    let repo_clone = repo.clone();
    let branch_clone = branch.clone();
    let token_clone = github_access_token.clone();

    tokio::spawn(async move {
        // Wait a bit for workflow to appear in the API
        tokio::time::sleep(tokio::time::Duration::from_secs(5)).await;

        app_clone.emit("deployment-log", DeploymentLog {
            timestamp: chrono::Utc::now().to_rfc3339(),
            level: "info".to_string(),
            message: "⏳ Waiting for workflow to start...".to_string(),
            data: None,
        }).unwrap_or(());

        let mut last_status = String::new();
        let mut log_fetched = false;

        // Poll for workflow run (max 2 minutes)
        for _ in 0..24 {
            tokio::time::sleep(tokio::time::Duration::from_secs(5)).await;

            if let Ok(Some(run)) = get_recent_workflow_run(
                &owner_clone,
                &repo_clone,
                &branch_clone,
                &token_clone,
                &trigger_time,
            ).await {

                if run.status != last_status {
                    last_status = run.status.clone();

                    let message = match run.status.as_str() {
                        "queued" => "📋 Workflow queued...",
                        "in_progress" => "🔄 Workflow running...",
                        "completed" => {
                            match run.conclusion.as_deref() {
                                Some("success") => "✅ Workflow completed successfully!",
                                Some("failure") => "❌ Workflow failed!",
                                Some("cancelled") => "⚠️ Workflow cancelled",
                                _ => "⏹️ Workflow completed",
                            }
                        },
                        _ => &format!("Status: {}", run.status),
                    };

                    let level = if run.status == "completed" {
                        if run.conclusion.as_deref() == Some("success") {
                            "success"
                        } else {
                            "error"
                        }
                    } else {
                        "info"
                    };

                    app_clone.emit("deployment-log", DeploymentLog {
                        timestamp: chrono::Utc::now().to_rfc3339(),
                        level: level.to_string(),
                        message: message.to_string(),
                        data: None,
                    }).unwrap_or(());
                }

                // If completed, fetch logs and finish
                if run.status == "completed" {
                    if !log_fetched {
                        log_fetched = true;

                        app_clone.emit("deployment-log", DeploymentLog {
                            timestamp: chrono::Utc::now().to_rfc3339(),
                            level: "info".to_string(),
                            message: "📥 Fetching workflow logs...".to_string(),
                            data: None,
                        }).unwrap_or(());

                        if let Ok(logs) = download_workflow_logs(&owner_clone, &repo_clone, run.id, &token_clone).await {
                            if !logs.is_empty() {
                                // Send truncated logs (last 100 lines)
                                let log_lines: Vec<&str> = logs.lines().collect();
                                let start = if log_lines.len() > 100 { log_lines.len() - 100 } else { 0 };

                                for line in &log_lines[start..] {
                                    if !line.trim().is_empty() {
                                        app_clone.emit("deployment-log", DeploymentLog {
                                            timestamp: chrono::Utc::now().to_rfc3339(),
                                            level: "info".to_string(),
                                            message: line.to_string(),
                                            data: None,
                                        }).unwrap_or(());
                                    }
                                }
                            }
                        }
                    }

                    DEPLOYMENT_RUNNING.store(false, Ordering::SeqCst);

                    if run.conclusion.as_deref() == Some("success") {
                        app_clone.emit("deployment-completed", DeploymentStatus {
                            status: "success".to_string(),
                            message: Some("배포가 성공적으로 완료되었습니다".to_string()),
                            outputs: None,
                        }).unwrap_or(());
                    } else {
                        app_clone.emit("deployment-failed", DeploymentStatus {
                            status: "failed".to_string(),
                            message: Some(format!("배포 실패: {}", run.conclusion.unwrap_or_default())),
                            outputs: None,
                        }).unwrap_or(());
                    }

                    return;
                }
            }
        }

        // Timeout
        DEPLOYMENT_RUNNING.store(false, Ordering::SeqCst);
        app_clone.emit("deployment-log", DeploymentLog {
            timestamp: chrono::Utc::now().to_rfc3339(),
            level: "warning".to_string(),
            message: "⚠️ Workflow monitoring timeout. Check GitHub Actions for status.".to_string(),
            data: None,
        }).unwrap_or(());

        app_clone.emit("deployment-completed", DeploymentStatus {
            status: "unknown".to_string(),
            message: Some("워크플로우 모니터링 시간 초과. GitHub Actions에서 상태를 확인하세요.".to_string()),
            outputs: None,
        }).unwrap_or(());
    });

    Ok(DeploymentStatus {
        status: "deploying".to_string(),
        message: Some("GitHub Actions 워크플로우 실행 중...".to_string()),
        outputs: None,
    })
}