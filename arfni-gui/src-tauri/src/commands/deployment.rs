use serde::{Deserialize, Serialize};
use std::process::{Command, Stdio};
use std::io::{BufRead, BufReader};
use tauri::{AppHandle, Manager, Emitter, State};
use std::path::Path;
use std::sync::{Arc, Mutex, OnceLock};
use std::sync::atomic::{AtomicBool, Ordering};
use std::collections::HashMap;
use crate::db::Database;

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

    // GitHub 프로젝트 검증 - deploy_stack은 로컬 프로젝트만 처리
    if let Some(ref pid) = project_id {
        // DB에서 프로젝트 정보 확인
        let db: State<Database> = app.state();
        let conn = db.get_conn();
        let conn = conn.lock().unwrap();

        let is_github = conn.query_row(
            "SELECT github_repo_url FROM projects WHERE id = ?1",
            rusqlite::params![pid],
            |row| row.get::<_, Option<String>>(0)
        ).ok().flatten().is_some();

        if is_github {
            return Err("GitHub 프로젝트는 deploy_github_actions를 사용해야 합니다. deploy_stack은 로컬 프로젝트 전용입니다.".to_string());
        }
    }

    // deploy_stack은 로컬 프로젝트 배포만 담당
    // GitHub 프로젝트는 프론트엔드에서 smartDeploy 직접 호출

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

/// Smart deployment handler that detects project type and deploys accordingly
#[tauri::command]
pub async fn smart_deploy(
    app: AppHandle,
    project_id: String,
) -> Result<DeploymentStatus, String> {
    use crate::db::Database;
    use tauri::{State, Manager};
    use serde_json::json;

    println!("[Smart Deploy] Starting smart deployment for project: {}", project_id);

    // Send initial progress event
    app.emit("deployment-progress", json!({
        "stage": "check_cicd",
        "message": "CI/CD 상태를 확인하고 있습니다...",
        "progress": 5
    })).ok();

    // Get project info from database
    let db_state: State<'_, Database> = app.state();
    let project = {
        let conn = db_state.get_conn();
        let conn = conn.lock().unwrap();

        let mut stmt = conn.prepare(
            "SELECT id, name, path, environment, ec2_server_id, stack_yaml_path,
                    github_repo_url, github_branch, github_access_token
             FROM projects WHERE id = ?1"
        ).map_err(|e| format!("Failed to prepare query: {}", e))?;

        #[derive(Debug)]
        struct ProjectInfo {
            _id: String,
            name: String,
            path: String,
            environment: String,
            ec2_server_id: Option<String>,
            stack_yaml_path: Option<String>,
            github_repo_url: Option<String>,
            github_branch: Option<String>,
            github_access_token: Option<String>,
        }

        stmt.query_row(rusqlite::params![&project_id], |row| {
            Ok(ProjectInfo {
                _id: row.get(0)?,
                name: row.get(1)?,
                path: row.get(2)?,
                environment: row.get(3)?,
                ec2_server_id: row.get(4)?,
                stack_yaml_path: row.get(5)?,
                github_repo_url: row.get(6)?,
                github_branch: row.get(7)?,
                github_access_token: row.get(8)?,
            })
        }).map_err(|e| format!("Failed to get project: {}", e))?
    };

    println!("[Smart Deploy] Project: {}, Environment: {}, GitHub: {:?}",
             project.name, project.environment, project.github_repo_url);

    // Store branch name before move
    let github_branch = project.github_branch.clone().unwrap_or("main".to_string());

    // Determine deployment type
    let deployment_type = match (project.environment.as_str(), &project.github_repo_url) {
        ("ec2", Some(repo_url)) if !repo_url.is_empty() => {
            println!("[Smart Deploy] Detected: GitHub + EC2 project");

            // Check if CI/CD is already configured
            if let Some(access_token) = &project.github_access_token {
                let cicd_configured = crate::commands::cicd::check_cicd_status(
                    repo_url.clone(),
                    access_token.clone()
                ).await.unwrap_or(false);

                // Get EC2 server info (needed for both cases)
                if let Some(ec2_server_id) = project.ec2_server_id {
                    if !cicd_configured {
                        println!("[Smart Deploy] CI/CD not configured, setting up automatically...");

                        // Send event: Starting CI/CD setup
                        app.emit("deployment-progress", json!({
                            "stage": "clone_repo",
                            "message": "EC2에 레포지토리를 클론하고 있습니다...",
                            "progress": 15
                        })).ok();

                        // GitHub 프로젝트는 DB에 저장된 Canvas 데이터에서 stack.yaml 읽기
                        // (프론트엔드에서 이미 저장했음)
                        println!("[Smart Deploy] Reading stack.yaml from database for GitHub project");

                        // Read stack.yaml from projects table
                        let stack_yaml_content = {
                            let conn = db_state.get_conn();
                            let conn = conn.lock().unwrap();

                            conn.query_row(
                                "SELECT stack_yaml FROM projects WHERE id = ?1",
                                rusqlite::params![&project_id],
                                |row| row.get::<_, String>(0)
                            ).ok()
                        };

                        // Parse stack.yaml to get docker service name
                        let docker_service = if let Some(ref yaml) = stack_yaml_content {
                            // Simple parsing to find first service name
                            yaml.lines()
                                .skip_while(|line| !line.starts_with("services:"))
                                .skip(1) // Skip "services:" line
                                .find(|line| line.trim().ends_with(":"))
                                .and_then(|line| line.trim().strip_suffix(":"))
                                .map(|s| s.to_string())
                                .unwrap_or("spring".to_string())
                        } else {
                            println!("[Smart Deploy] No stack.yaml in DB, using default service name 'spring'");
                            "spring".to_string()
                        };

                        // Auto-setup CI/CD
                        let config = crate::commands::cicd::CICDConfiguration {
                            platform: "github".to_string(),
                            repository_url: repo_url.clone(),
                            branch: github_branch.clone(),
                            framework: "springboot".to_string(), // GitHub 프로젝트는 기본값 사용
                            java_version: Some("17".to_string()),
                            node_version: None,
                            python_version: None,
                            ec2_host: get_ec2_host(&app, &ec2_server_id)?,
                            ec2_user: get_ec2_user(&app, &ec2_server_id)?,
                            deploy_root: "/home/ubuntu/cicdtest".to_string(),
                            docker_service,
                        };

                        let ssh_key = get_ec2_ssh_key(&app, &ec2_server_id)?;

                        // Send event: Setting up CI/CD
                        app.emit("deployment-progress", json!({
                            "stage": "commit_stack",
                            "message": "stack.yaml 파일을 커밋하고 있습니다...",
                            "progress": 30
                        })).ok();

                        crate::commands::cicd::setup_complete_cicd(
                            app.clone(),
                            config,
                            ssh_key,
                            project_id.clone(),
                            ec2_server_id,
                            access_token.clone(),
                            stack_yaml_content,          // 사용자의 stack.yaml 전달
                            None,      // docker_compose_content - let setup_complete_cicd generate it
                            None,      // dockerfiles - let setup_complete_cicd generate it
                        ).await.map_err(|e| format!("Failed to setup CI/CD: {}", e))?;

                        println!("[Smart Deploy] CI/CD setup completed!");

                        // Send event: CI/CD setup completed
                        app.emit("deployment-progress", json!({
                            "stage": "configure_secrets",
                            "message": "CI/CD 설정이 완료되었습니다.",
                            "progress": 60
                        })).ok();
                    } else {
                        // CI/CD already configured, commit all files (stack.yaml + docker files) to GitHub
                        println!("[Smart Deploy] CI/CD already configured, committing all files to GitHub...");

                        // Send event: Updating files
                        app.emit("deployment-progress", json!({
                            "stage": "commit_stack",
                            "message": "stack.yaml을 GitHub에 커밋하고 있습니다...",
                            "progress": 20
                        })).ok();

                        // Read stack.yaml from database (source of truth for CI/CD projects)
                        println!("[Smart Deploy] Reading stack.yaml from database for GitHub project");

                        let stack_yaml_content = {
                            let conn = db_state.get_conn();
                            let conn = conn.lock().unwrap();

                            // Read stack.yaml from projects table
                            conn.query_row(
                                "SELECT stack_yaml FROM projects WHERE id = ?1",
                                rusqlite::params![&project_id],
                                |row| row.get::<_, String>(0)
                            ).ok()
                        };

                        if let Some(ref yaml_content) = stack_yaml_content {
                            println!("[Smart Deploy] ✅ Read stack.yaml from database");

                            // Send event: Generating Docker files
                            app.emit("deployment-progress", json!({
                                "stage": "generate_docker",
                                "message": "Docker 파일을 생성하고 있습니다...",
                                "progress": 40
                            })).ok();

                            // Commit stack.yaml + docker-compose.yml + Dockerfiles to GitHub
                            crate::commands::cicd::update_docker_files_only(
                                app.clone(),
                                repo_url.clone(),
                                github_branch.clone(),
                                access_token.clone(),
                                yaml_content.clone()
                            ).await.map_err(|e| format!("Failed to update Docker files: {}", e))?;

                            println!("[Smart Deploy] ✅ All files committed to GitHub successfully");

                            // Send event: Files committed
                            app.emit("deployment-progress", json!({
                                "stage": "trigger_workflow",
                                "message": "파일이 GitHub에 커밋되었습니다.",
                                "progress": 60
                            })).ok();
                        } else {
                            return Err("Could not read stack.yaml from database. Please save your canvas first.".to_string());
                        }
                    }
                }

                // Deploy via GitHub Actions
                "github_actions"
            } else {
                "docker_compose" // Fallback to Docker Compose
            }
        }
        ("local", _) => {
            println!("[Smart Deploy] Detected: Local project");
            "docker_compose"
        }
        _ => {
            println!("[Smart Deploy] Detected: Default Docker Compose deployment");
            "docker_compose"
        }
    };

    // Execute deployment based on type
    match deployment_type {
        "github_actions" => {
            println!("[Smart Deploy] Deploying via GitHub Actions...");

            // Send event: Triggering workflow
            app.emit("deployment-progress", json!({
                "stage": "trigger_workflow",
                "message": "GitHub Actions 워크플로우를 트리거하고 있습니다...",
                "progress": 70
            })).ok();

            // GitHub Actions deployment: trigger workflow via API
            let result = trigger_github_workflow(
                project.github_repo_url.as_ref().unwrap().clone(),
                github_branch,
                project.github_access_token.unwrap()
            ).await;

            match result {
                Ok(status) => {
                    // Send event: Deployment in progress
                    app.emit("deployment-progress", json!({
                        "stage": "monitor_deployment",
                        "message": "배포가 진행 중입니다. GitHub Actions에서 확인하세요.",
                        "progress": 90
                    })).ok();

                    // Wait a moment for better UX
                    tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;

                    // Send event: Deployment complete
                    app.emit("deployment-progress", json!({
                        "stage": "deployment_complete",
                        "message": "배포가 성공적으로 시작되었습니다!",
                        "progress": 100
                    })).ok();

                    Ok(status)
                },
                Err(e) => {
                    // Send event: Deployment error
                    app.emit("deployment-progress", json!({
                        "stage": "monitor_deployment",
                        "message": format!("배포 실패: {}", e),
                        "progress": 90,
                        "status": "error"
                    })).ok();

                    Err(e)
                }
            }
        }
        "docker_compose" => {
            println!("[Smart Deploy] Deploying via Docker Compose...");
            // Return error for local deployment in smart_deploy
            // This should not happen as smart_deploy is for GitHub projects only
            Err("Local deployment should use deploy_stack directly, not smart_deploy".to_string())
        }
        _ => Err("Unknown deployment type".to_string())
    }
}

/// GitHub 프로젝트 전용 배포 함수 - Go 바이너리를 호출하지 않음
/// GitHub Actions를 트리거하고 상태만 반환
#[tauri::command]
pub async fn deploy_github_actions(
    app: AppHandle,
    project_id: String,
) -> Result<DeploymentStatus, String> {
    use serde_json::json;

    println!("[GitHub Deploy] Starting GitHub Actions deployment for project: {}", project_id);

    // DB에서 프로젝트 정보 가져오기
    let db_state: State<'_, Database> = app.state();
    let project = {
        let conn = db_state.get_conn();
        let conn = conn.lock().unwrap();

        conn.query_row(
            "SELECT id, name, path, environment, ec2_server_id, github_repo_url, github_branch, github_access_token, workdir
             FROM projects WHERE id = ?1",
            rusqlite::params![&project_id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,         // id
                    row.get::<_, String>(1)?,         // name
                    row.get::<_, String>(2)?,         // path
                    row.get::<_, String>(3)?,         // environment
                    row.get::<_, Option<String>>(4)?, // ec2_server_id
                    row.get::<_, Option<String>>(5)?, // github_repo_url
                    row.get::<_, Option<String>>(6)?, // github_branch
                    row.get::<_, Option<String>>(7)?, // github_access_token
                    row.get::<_, Option<String>>(8)?, // workdir
                ))
            },
        ).map_err(|e| format!("Failed to get project from DB: {}", e))?
    };

    let (_id, name, path, environment, ec2_server_id, github_repo_url, github_branch, github_access_token, _workdir) = project;

    // GitHub 프로젝트 검증
    if github_repo_url.is_none() || github_access_token.is_none() {
        return Err("This is not a GitHub project. Use deploy_stack for local projects.".to_string());
    }

    let repo_url = github_repo_url.unwrap();
    let branch = github_branch.unwrap_or("main".to_string());
    let access_token = github_access_token.unwrap();

    println!("[GitHub Deploy] Project: {}, Repo: {}, Branch: {}", name, repo_url, branch);

    // EC2 서버가 설정되어 있는지 확인
    if environment != "ec2" || ec2_server_id.is_none() {
        return Err("GitHub deployment requires EC2 environment".to_string());
    }

    // 진행 상황 이벤트 전송
    app.emit("deployment-progress", json!({
        "stage": "check_files",
        "message": "필요한 CI/CD 파일들을 확인 중...",
        "progress": 10
    })).ok();

    println!("[GitHub Deploy] Checking required files...");

    // 모든 필요한 파일의 존재 여부 확인
    let workflow_exists = check_github_workflow_exists(&repo_url, &branch, &access_token)
        .await
        .unwrap_or(false);
    let dockerfile_exists = check_dockerfile_exists(&repo_url, &branch, &access_token)
        .await
        .unwrap_or(false);
    let docker_compose_exists = check_docker_compose_exists(&repo_url, &branch, &access_token)
        .await
        .unwrap_or(false);

    println!("[GitHub Deploy] File status - Workflow: {}, Dockerfile: {}, Docker-Compose: {}",
        workflow_exists, dockerfile_exists, docker_compose_exists);

    // TEMPORARY FIX: Force workflow regeneration to fix template issues
    // TODO: Remove this after successful deployment
    let needs_setup = true; // !workflow_exists || !dockerfile_exists || !docker_compose_exists;

    if needs_setup {
        let missing_files: Vec<&str> = vec![
            if !workflow_exists { Some("workflow") } else { None },
            if !dockerfile_exists { Some("Dockerfile") } else { None },
            if !docker_compose_exists { Some("docker-compose.yml") } else { None },
        ].into_iter().filter_map(|x| x).collect();

        let missing_list = missing_files.join(", ");

        app.emit("deployment-progress", json!({
            "stage": "setup_cicd",
            "message": format!("누락된 파일 생성 중: {}", missing_list),
            "progress": 20
        })).ok();

        println!("[GitHub Deploy] Missing files detected: {}. Setting up CI/CD...", missing_list);

        // CI/CD 설정을 위한 configuration 생성
        use crate::commands::cicd::{setup_cicd, setup_complete_cicd, CICDConfiguration};
        use std::path::PathBuf;

        // stack.yaml에서 framework 정보 읽기
        let stack_yaml_path = PathBuf::from(&path).join("stack.yaml");
        let stack_content = tokio::fs::read_to_string(&stack_yaml_path)
            .await
            .map_err(|e| format!("Failed to read stack.yaml: {}", e))?;

        // stack.yaml 파싱해서 framework와 service name 찾기
        let framework = extract_framework_from_stack(&stack_content)
            .unwrap_or_else(|| "springboot".to_string());

        // Extract docker service name from stack.yaml
        let docker_service = extract_service_name_from_stack(&stack_content)
            .unwrap_or_else(|| "app".to_string());

        println!("[GitHub Deploy] Detected framework: {}", framework);
        println!("[GitHub Deploy] Detected docker service: {}", docker_service);

        // EC2 서버 정보 가져오기 (SSH key)
        let ec2_server_id = ec2_server_id.ok_or("EC2 server ID is required")?;
        let (pem_path, ec2_host, ec2_user): (String, String, String) = {
            let conn = db_state.get_conn();
            let conn = conn.lock().unwrap();
            conn.query_row(
                "SELECT pem_path, host, user FROM ec2_servers WHERE id = ?1",
                rusqlite::params![&ec2_server_id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?))
            ).map_err(|e| format!("Failed to get EC2 server info: {}", e))?
        };

        // Read SSH key content from file
        let ssh_key = tokio::fs::read_to_string(&pem_path)
            .await
            .map_err(|e| format!("Failed to read SSH key from {}: {}", pem_path, e))?;

        println!("[GitHub Deploy] SSH key loaded from: {}", pem_path);
        println!("[GitHub Deploy] SSH key length: {} bytes", ssh_key.len());

        // Framework별 버전 설정
        let (java_version, node_version, python_version) = match framework.as_str() {
            "springboot" => (Some("17".to_string()), None, None),
            "nodejs" => (None, Some("18".to_string()), None),
            "python" => (None, None, Some("3.11".to_string())),
            _ => (Some("17".to_string()), None, None),
        };

        let cicd_config = CICDConfiguration {
            platform: "github-actions".to_string(),
            repository_url: repo_url.clone(),
            branch: branch.clone(),
            framework,
            java_version,
            node_version,
            python_version,
            ec2_host: ec2_host.clone(),
            ec2_user: ec2_user.clone(),
            deploy_root: "/home/ubuntu/arfni-deploy".to_string(),
            docker_service,
        };

        // setup_complete_cicd 호출 - stack.yaml 기반으로 파일 생성 및 커밋
        match setup_complete_cicd(
            app.clone(),
            cicd_config,
            ssh_key.clone(),
            project_id.clone(),
            ec2_server_id.clone(),
            access_token.clone(),
            Some(stack_content.clone()),  // stack.yaml 내용 전달
            None,  // docker-compose.yml 자동 생성
            None,  // Dockerfiles 자동 생성
        ).await {
            Ok(_) => {
                app.emit("deployment-progress", json!({
                    "stage": "setup_cicd",
                    "message": "CI/CD 파일들이 성공적으로 생성되고 커밋되었습니다!",
                    "progress": 40
                })).ok();
                println!("[GitHub Deploy] CI/CD setup completed successfully");
            }
            Err(e) => {
                app.emit("deployment-progress", json!({
                    "stage": "setup_cicd",
                    "message": format!("CI/CD 설정 실패: {}", e),
                    "progress": 20,
                    "status": "error"
                })).ok();
                return Err(format!("Failed to setup CI/CD: {}", e));
            }
        }

        // GitHub Secrets 설정
        app.emit("deployment-progress", json!({
            "stage": "setup_secrets",
            "message": "GitHub Secrets 설정 중...",
            "progress": 50
        })).ok();

        println!("[GitHub Deploy] Setting up GitHub Secrets...");

        match setup_github_secrets(&repo_url, &access_token, &ec2_host, &ec2_user, &ssh_key).await {
            Ok(_) => {
                app.emit("deployment-progress", json!({
                    "stage": "setup_secrets",
                    "message": "GitHub Secrets가 성공적으로 설정되었습니다!",
                    "progress": 55
                })).ok();
                println!("[GitHub Deploy] GitHub Secrets setup completed");
            }
            Err(e) => {
                // Secrets 설정 실패는 경고로만 처리 (이미 설정되어 있을 수 있음)
                println!("[GitHub Deploy] Warning: Failed to setup secrets: {}", e);
                app.emit("deployment-progress", json!({
                    "stage": "setup_secrets",
                    "message": format!("Secrets 설정 경고: {} (이미 설정되어 있을 수 있습니다)", e),
                    "progress": 55,
                    "status": "warning"
                })).ok();
            }
        }
    } else {
        println!("[GitHub Deploy] All required files already exist");
        app.emit("deployment-progress", json!({
            "stage": "check_files",
            "message": "모든 필요한 파일이 존재합니다",
            "progress": 50
        })).ok();
    }

    // GitHub Actions 워크플로우 트리거
    app.emit("deployment-progress", json!({
        "stage": "trigger_workflow",
        "message": "워크플로우를 실행하고 있습니다...",
        "progress": 60
    })).ok();

    println!("[GitHub Deploy] Triggering workflow...");
    println!("[GitHub Deploy] Repo: {}, Branch: {}", repo_url, branch);

    let result = trigger_github_workflow(repo_url, branch, access_token).await;

    println!("[GitHub Deploy] Trigger result: {:?}", result);

    match result {
        Ok(status) => {
            app.emit("deployment-progress", json!({
                "stage": "deployment_complete",
                "message": "GitHub Actions 배포가 시작되었습니다! GitHub에서 진행 상황을 확인하세요.",
                "progress": 100
            })).ok();

            Ok(status)
        }
        Err(e) => {
            app.emit("deployment-progress", json!({
                "stage": "trigger_workflow",
                "message": format!("워크플로우 트리거 실패: {}", e),
                "progress": 60,
                "status": "error"
            })).ok();

            Err(e)
        }
    }
}

/// stack.yaml에서 framework 추출
fn extract_framework_from_stack(stack_content: &str) -> Option<String> {
    // stack.yaml 파싱
    use serde_yaml::Value;

    if let Ok(yaml) = serde_yaml::from_str::<Value>(stack_content) {
        // services에서 첫 번째 서비스의 image 또는 type 확인
        if let Some(services) = yaml.get("services").and_then(|s| s.as_mapping()) {
            for (_name, service) in services.iter() {
                // image 필드에서 framework 추출
                if let Some(image) = service.get("image").and_then(|i| i.as_str()) {
                    if image.contains("spring") || image.contains("java") {
                        return Some("springboot".to_string());
                    } else if image.contains("node") || image.contains("express") {
                        return Some("nodejs".to_string());
                    } else if image.contains("python") || image.contains("django") || image.contains("flask") {
                        return Some("python".to_string());
                    } else if image.contains("nginx") {
                        return Some("react".to_string());
                    }
                }

                // type 필드에서 framework 추출
                if let Some(service_type) = service.get("type").and_then(|t| t.as_str()) {
                    return Some(service_type.to_string());
                }
            }
        }
    }

    None
}

/// stack.yaml에서 첫 번째 서비스 이름 추출
fn extract_service_name_from_stack(stack_content: &str) -> Option<String> {
    use serde_yaml::Value;

    if let Ok(yaml) = serde_yaml::from_str::<Value>(stack_content) {
        // services에서 첫 번째 서비스의 이름 반환
        if let Some(services) = yaml.get("services").and_then(|s| s.as_mapping()) {
            if let Some((name, _)) = services.iter().next() {
                if let Some(name_str) = name.as_str() {
                    return Some(name_str.to_string());
                }
            }
        }
    }

    None
}

/// GitHub 워크플로우 파일이 존재하는지 확인
async fn check_github_workflow_exists(
    repo_url: &str,
    branch: &str,
    access_token: &str,
) -> Result<bool, String> {
    check_github_file_exists(repo_url, branch, access_token, ".github/workflows/deploy.yml").await
}

/// Dockerfile이 존재하는지 확인
async fn check_dockerfile_exists(
    repo_url: &str,
    branch: &str,
    access_token: &str,
) -> Result<bool, String> {
    check_github_file_exists(repo_url, branch, access_token, "Dockerfile").await
}

/// docker-compose.yml이 존재하는지 확인
async fn check_docker_compose_exists(
    repo_url: &str,
    branch: &str,
    access_token: &str,
) -> Result<bool, String> {
    check_github_file_exists(repo_url, branch, access_token, "docker-compose.yml").await
}

/// GitHub 파일 존재 확인을 위한 공통 함수
async fn check_github_file_exists(
    repo_url: &str,
    branch: &str,
    access_token: &str,
    file_path: &str,
) -> Result<bool, String> {
    let repo_path = repo_url
        .trim_end_matches('/')
        .split('/')
        .rev()
        .take(2)
        .collect::<Vec<&str>>()
        .into_iter()
        .rev()
        .collect::<Vec<&str>>()
        .join("/")
        .replace(".git", "");

    let check_url = format!(
        "https://api.github.com/repos/{}/contents/{}?ref={}",
        repo_path, file_path, branch
    );

    let client = reqwest::Client::new();
    let response = client
        .get(&check_url)
        .header("Authorization", format!("Bearer {}", access_token))
        .header("User-Agent", "ARFNI-App")
        .send()
        .await
        .map_err(|e| format!("Failed to check file {}: {}", file_path, e))?;

    Ok(response.status().is_success())
}

/// GitHub Secrets 설정 - EC2 배포에 필요한 credentials 저장
async fn setup_github_secrets(
    repo_url: &str,
    access_token: &str,
    ec2_host: &str,
    ec2_user: &str,
    ssh_key: &str,
) -> Result<(), String> {
    use serde_json::json;

    println!("[Secrets] Setting up GitHub Secrets for EC2 deployment...");

    let repo_path = repo_url
        .trim_end_matches('/')
        .split('/')
        .rev()
        .take(2)
        .collect::<Vec<&str>>()
        .into_iter()
        .rev()
        .collect::<Vec<&str>>()
        .join("/")
        .replace(".git", "");

    println!("[Secrets] Repository path: {}", repo_path);

    // 1. Get repository public key for encrypting secrets
    let pubkey_url = format!("https://api.github.com/repos/{}/actions/secrets/public-key", repo_path);

    let client = reqwest::Client::new();
    let pubkey_response = client
        .get(&pubkey_url)
        .header("Accept", "application/vnd.github+json")
        .header("Authorization", format!("Bearer {}", access_token))
        .header("User-Agent", "Arfni-GUI")
        .send()
        .await
        .map_err(|e| format!("Failed to get public key: {}", e))?;

    if !pubkey_response.status().is_success() {
        return Err(format!("Failed to get public key: HTTP {}", pubkey_response.status()));
    }

    let pubkey_data: serde_json::Value = pubkey_response
        .json()
        .await
        .map_err(|e| format!("Failed to parse public key response: {}", e))?;

    let key_id = pubkey_data["key_id"].as_str()
        .ok_or("Missing key_id in public key response")?;
    let public_key = pubkey_data["key"].as_str()
        .ok_or("Missing key in public key response")?;

    println!("[Secrets] Got public key with ID: {}", key_id);

    // 2. Encrypt and upload each secret
    let secrets = vec![
        ("EC2_HOST", ec2_host),
        ("EC2_USER", ec2_user),
        ("EC2_SSH_KEY", ssh_key),
    ];

    for (secret_name, secret_value) in secrets {
        println!("[Secrets] Setting secret: {}", secret_name);

        // Encrypt the secret using libsodium (sodium_crypto_box_seal)
        let encrypted_value = encrypt_secret(secret_value, public_key)?;

        let secret_url = format!("https://api.github.com/repos/{}/actions/secrets/{}", repo_path, secret_name);

        let response = client
            .put(&secret_url)
            .header("Accept", "application/vnd.github+json")
            .header("Authorization", format!("Bearer {}", access_token))
            .header("User-Agent", "Arfni-GUI")
            .json(&json!({
                "encrypted_value": encrypted_value,
                "key_id": key_id
            }))
            .send()
            .await
            .map_err(|e| format!("Failed to set secret {}: {}", secret_name, e))?;

        if !response.status().is_success() {
            let status = response.status();
            let error_body = response.text().await.unwrap_or_default();
            return Err(format!("Failed to set secret {}: HTTP {} - {}", secret_name, status, error_body));
        }

        println!("[Secrets] Successfully set secret: {}", secret_name);
    }

    println!("[Secrets] All GitHub Secrets configured successfully!");
    Ok(())
}

/// GitHub Actions Secrets 암호화
/// libsodium의 crypto_box_seal 사용
fn encrypt_secret(secret_value: &str, public_key_base64: &str) -> Result<String, String> {
    use base64::{Engine as _, engine::general_purpose};
    use sodiumoxide::crypto::box_::PublicKey;
    use sodiumoxide::crypto::sealedbox;

    // Initialize sodiumoxide
    sodiumoxide::init().map_err(|_| "Failed to initialize sodiumoxide")?;

    // Decode the public key from base64
    let public_key_bytes = general_purpose::STANDARD
        .decode(public_key_base64)
        .map_err(|e| format!("Failed to decode public key: {}", e))?;

    // Create PublicKey from bytes
    let public_key = PublicKey::from_slice(&public_key_bytes)
        .ok_or("Invalid public key length")?;

    // Encrypt the secret using sealed box
    let encrypted = sealedbox::seal(secret_value.as_bytes(), &public_key);

    // Encode to base64
    Ok(general_purpose::STANDARD.encode(&encrypted))
}

// Helper functions
async fn read_ec2_file_via_ssh(
    host: &str,
    user: &str,
    ssh_key: &str,
    file_path: &str,
) -> Result<String, String> {
    use std::fs;
    use std::path::PathBuf;
    use tokio::process::Command;

    // Write SSH key to temp file
    let temp_key_path = std::env::temp_dir().join(format!("arfni_key_{}.pem", chrono::Utc::now().timestamp_millis()));
    fs::write(&temp_key_path, ssh_key)
        .map_err(|e| format!("Failed to write temp SSH key: {}", e))?;

    // Set permissions (Unix only)
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&temp_key_path, fs::Permissions::from_mode(0o600))
            .map_err(|e| format!("Failed to set key permissions: {}", e))?;
    }

    // Read file from EC2
    let output = Command::new("ssh")
        .args(&[
            "-i", temp_key_path.to_str().unwrap(),
            "-o", "StrictHostKeyChecking=no",
            &format!("{}@{}", user, host),
            &format!("cat {}", file_path)
        ])
        .output()
        .await
        .map_err(|e| format!("Failed to execute SSH command: {}", e))?;

    // Cleanup temp key
    let _ = fs::remove_file(&temp_key_path);

    if output.status.success() {
        String::from_utf8(output.stdout)
            .map_err(|e| format!("Failed to parse output: {}", e))
    } else {
        Err(format!("SSH command failed: {}", String::from_utf8_lossy(&output.stderr)))
    }
}

fn extract_repo_name(repo_url: &str) -> Result<String, String> {
    // Extract repo name from URL (e.g., "https://github.com/user/repo" -> "repo")
    let parts: Vec<&str> = repo_url.trim_end_matches('/').split('/').collect();
    parts.last()
        .map(|name| name.replace(".git", ""))
        .ok_or_else(|| "Failed to extract repo name from URL".to_string())
}

fn detect_framework(project_path: &str) -> String {
    // Check for Spring Boot
    if std::path::Path::new(&format!("{}/build.gradle", project_path)).exists() ||
       std::path::Path::new(&format!("{}/pom.xml", project_path)).exists() {
        return "springboot".to_string();
    }

    // Check for Node.js
    if std::path::Path::new(&format!("{}/package.json", project_path)).exists() {
        return "nodejs".to_string();
    }

    // Default
    "springboot".to_string()
}

fn get_ec2_host(app: &AppHandle, server_id: &str) -> Result<String, String> {
    use crate::db::Database;
    use tauri::State;

    let db_state: State<'_, Database> = app.state();
    let conn = db_state.get_conn();
    let conn = conn.lock().unwrap();

    conn.query_row(
        "SELECT host FROM ec2_servers WHERE id = ?1",
        rusqlite::params![server_id],
        |row| row.get(0)
    ).map_err(|e| format!("Failed to get EC2 host: {}", e))
}

fn get_ec2_user(app: &AppHandle, server_id: &str) -> Result<String, String> {
    use crate::db::Database;
    use tauri::State;

    let db_state: State<'_, Database> = app.state();
    let conn = db_state.get_conn();
    let conn = conn.lock().unwrap();

    conn.query_row(
        "SELECT user FROM ec2_servers WHERE id = ?1",
        rusqlite::params![server_id],
        |row| row.get(0)
    ).map_err(|e| format!("Failed to get EC2 user: {}", e))
}

fn get_ec2_ssh_key(app: &AppHandle, server_id: &str) -> Result<String, String> {
    use crate::db::Database;
    use tauri::State;

    let db_state: State<'_, Database> = app.state();
    let conn = db_state.get_conn();
    let conn = conn.lock().unwrap();

    // First get pem_path
    let pem_path: String = conn.query_row(
        "SELECT pem_path FROM ec2_servers WHERE id = ?1",
        rusqlite::params![server_id],
        |row| row.get(0)
    ).map_err(|e| format!("Failed to get EC2 pem_path: {}", e))?;

    // Read the PEM file
    std::fs::read_to_string(&pem_path)
        .map_err(|e| format!("Failed to read PEM file {}: {}", pem_path, e))
}

// GitHub Actions 워크플로우 트리거
async fn trigger_github_workflow(
    repo_url: String,
    branch: String,
    access_token: String,
) -> Result<DeploymentStatus, String> {
    println!("[Trigger] Starting workflow trigger...");

    // GitHub API를 통해 워크플로우 디스패치
    let repo_path = repo_url
        .trim_end_matches('/')
        .split('/')
        .rev()
        .take(2)
        .collect::<Vec<&str>>()
        .into_iter()
        .rev()
        .collect::<Vec<&str>>()
        .join("/")
        .replace(".git", "");

    println!("[Trigger] Repository path: {}", repo_path);

    let dispatch_url = format!("https://api.github.com/repos/{}/actions/workflows/deploy.yml/dispatches", repo_path);

    println!("[Trigger] Dispatch URL: {}", dispatch_url);
    println!("[Trigger] Branch: {}", branch);

    let client = reqwest::Client::new();
    let response = client.post(&dispatch_url)
        .header("Accept", "application/vnd.github+json")
        .header("Authorization", format!("Bearer {}", access_token))
        .header("User-Agent", "Arfni-GUI")
        .json(&serde_json::json!({
            "ref": branch
        }))
        .send()
        .await
        .map_err(|e| {
            println!("[Trigger] Request failed: {}", e);
            format!("Failed to trigger workflow: {}", e)
        })?;

    println!("[Trigger] Response status: {}", response.status());

    if response.status().is_success() {
        println!("[Trigger] Workflow triggered successfully!");
        Ok(DeploymentStatus {
            status: "success".to_string(),
            message: Some(format!("GitHub Actions workflow triggered successfully for branch '{}'", branch)),
            outputs: None,
        })
    } else {
        let status = response.status();
        let error_text = response.text().await.unwrap_or_default();
        println!("[Trigger] Failed: {} - {}", status, error_text);
        Err(format!("Failed to trigger workflow: {} - {}", status, error_text))
    }
}

/// stack.yaml을 docker-compose.yml로 변환 (Rust에서 직접 파싱)
/// Returns: (docker-compose.yml content, Vec<(build_context, dockerfile_content)>)
fn generate_docker_files_with_go_binary(
    _app: &AppHandle,
    _temp_dir: &std::path::Path,
    stack_yaml_content: &str,
) -> Result<(String, Vec<(String, String)>), String> {
    println!("[Docker Generate] Converting stack.yaml to docker-compose.yml...");

    // stack.yaml을 파싱해서 docker-compose.yml 생성
    use serde_yaml::{Value, Mapping};

    let stack: Value = serde_yaml::from_str(stack_yaml_content)
        .map_err(|e| format!("Failed to parse stack.yaml: {}", e))?;

    // services 추출
    let services = stack.get("services")
        .and_then(|v| v.as_mapping())
        .ok_or("No services found in stack.yaml")?;

    // docker-compose.yml 구조 생성
    let mut compose = Mapping::new();
    compose.insert(
        Value::String("version".to_string()),
        Value::String("3.8".to_string())
    );

    let mut dc_services = Mapping::new();

    for (service_name, service_def) in services {
        println!("[Docker Generate] Processing service: {:?}", service_name);
        println!("[Docker Generate] Service definition: {:?}", service_def);

        let mut dc_service = Mapping::new();

        // Check if this is Kubernetes format (has 'spec') or Docker Compose format (no 'spec')
        let source = if let Some(spec) = service_def.get("spec").and_then(|v| v.as_mapping()) {
            println!("[Docker Generate] Found Kubernetes format (spec) for {}", service_name.as_str().unwrap_or("unknown"));
            spec
        } else if let Some(mapping) = service_def.as_mapping() {
            println!("[Docker Generate] Found Docker Compose format (no spec) for {}", service_name.as_str().unwrap_or("unknown"));
            mapping
        } else {
            println!("[Docker Generate] ⚠️ Unknown format for service {}", service_name.as_str().unwrap_or("unknown"));
            continue;
        };

        // build 정보
        // GitHub Actions 배포를 위해 build context를 "."로 override
        if let Some(build) = source.get("build") {
            // Always use "." as context for GitHub Actions deployment
            // Dockerfile will be in DEPLOY_ROOT/Dockerfile
            let mut build_config = Mapping::new();
            build_config.insert(Value::String("context".to_string()), Value::String(".".to_string()));
            build_config.insert(Value::String("dockerfile".to_string()), Value::String("./Dockerfile".to_string()));
            dc_service.insert(Value::String("build".to_string()), Value::Mapping(build_config));
        }

        // image
        if let Some(image) = source.get("image") {
            dc_service.insert(Value::String("image".to_string()), image.clone());
        }

        // ports
        if let Some(ports) = source.get("ports") {
            dc_service.insert(Value::String("ports".to_string()), ports.clone());
        }

        // environment (Kubernetes uses 'env', Docker Compose uses 'environment')
        if let Some(env) = source.get("env").or_else(|| source.get("environment")) {
            dc_service.insert(Value::String("environment".to_string()), env.clone());
        }

        // volumes
        if let Some(volumes) = source.get("volumes") {
            dc_service.insert(Value::String("volumes".to_string()), volumes.clone());
        }

        // restart
        if let Some(restart) = source.get("restart") {
            dc_service.insert(Value::String("restart".to_string()), restart.clone());
        }

        // container_name (Docker Compose specific)
        if let Some(container_name) = source.get("container_name") {
            dc_service.insert(Value::String("container_name".to_string()), container_name.clone());
        }

        dc_services.insert(service_name.clone(), Value::Mapping(dc_service));
    }

    compose.insert(Value::String("services".to_string()), Value::Mapping(dc_services));

    // YAML로 변환
    let compose_yaml = serde_yaml::to_string(&compose)
        .map_err(|e| format!("Failed to generate docker-compose.yml: {}", e))?;

    println!("[Docker Generate] ✅ docker-compose.yml generated successfully");
    println!("[Docker Generate] Content:\n{}", compose_yaml);

    // Dockerfile 생성
    let mut dockerfiles = Vec::new();

    println!("[Docker Generate] Generating Dockerfiles...");

    // 각 서비스에 대해 Dockerfile 생성
    for (service_name, service_def) in services {
        // Check if this service has a build configuration
        let source = if let Some(spec) = service_def.get("spec").and_then(|v| v.as_mapping()) {
            spec
        } else if let Some(mapping) = service_def.as_mapping() {
            mapping
        } else {
            continue;
        };

        // build 설정이 있는 경우에만 Dockerfile 생성
        if source.get("build").is_some() {
            // GitHub Actions 배포에서는 Dockerfile이 무조건 DEPLOY_ROOT에 위치
            // build_context는 항상 "."
            let build_context = ".".to_string();

            println!("[Docker Generate] Creating Dockerfile for service '{}' at context '{}'",
                     service_name.as_str().unwrap_or("unknown"), build_context);

            // 간단한 Spring Boot Dockerfile 생성
            // GitHub Actions 배포의 경우 런타임 전용 Dockerfile 사용
            let dockerfile_content = generate_springboot_runtime_dockerfile(&source);

            dockerfiles.push((build_context, dockerfile_content));
            println!("[Docker Generate] ✅ Dockerfile generated for '{}'", service_name.as_str().unwrap_or("unknown"));
        }
    }

    println!("[Docker Generate] ✅ Generated {} Dockerfile(s)", dockerfiles.len());

    Ok((compose_yaml, dockerfiles))
}

/// 디렉토리 내의 모든 Dockerfile을 찾아서 (build_context, content) 튜플로 반환
fn find_all_dockerfiles(project_dir: &std::path::Path) -> Result<Vec<(String, String)>, String> {
    use std::fs;
    use std::path::Path;

    let mut dockerfiles = Vec::new();

    // Recursively search for Dockerfiles
    fn search_dir(
        dir: &Path,
        base_dir: &Path,
        dockerfiles: &mut Vec<(String, String)>,
    ) -> Result<(), String> {
        if !dir.is_dir() {
            return Ok(());
        }

        let entries = fs::read_dir(dir)
            .map_err(|e| format!("Failed to read directory {:?}: {}", dir, e))?;

        for entry in entries {
            let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
            let path = entry.path();

            if path.is_file() && path.file_name().and_then(|n| n.to_str()) == Some("Dockerfile") {
                // Found a Dockerfile
                let content = fs::read_to_string(&path)
                    .map_err(|e| format!("Failed to read Dockerfile at {:?}: {}", path, e))?;

                // Get build context (directory containing the Dockerfile, relative to project_dir)
                if let Some(parent) = path.parent() {
                    let build_context = parent
                        .strip_prefix(base_dir)
                        .map_err(|e| format!("Failed to get relative path: {}", e))?
                        .to_string_lossy()
                        .to_string();

                    // Normalize path separators to forward slashes for consistency
                    let build_context = build_context.replace("\\", "/");
                    let build_context = if build_context.is_empty() { ".".to_string() } else { build_context };

                    println!("[Find Dockerfiles] Found Dockerfile in: {}", build_context);
                    dockerfiles.push((build_context, content));
                }
            } else if path.is_dir() {
                // Skip .git and other hidden directories
                if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                    if !name.starts_with('.') {
                        search_dir(&path, base_dir, dockerfiles)?;
                    }
                }
            }
        }

        Ok(())
    }

    search_dir(project_dir, project_dir, &mut dockerfiles)?;

    Ok(dockerfiles)
}

/// Public wrapper for generate_docker_files_with_go_binary
/// This is used by cicd.rs when Docker files are not provided
pub fn generate_docker_files_with_go_binary_public(
    app: &AppHandle,
    temp_dir: &std::path::Path,
    stack_yaml_content: &str,
) -> Result<(String, Vec<(String, String)>), String> {
    generate_docker_files_with_go_binary(app, temp_dir, stack_yaml_content)
}

/// Generate a Spring Boot runtime Dockerfile for GitHub Actions deployment
/// This Dockerfile is for EC2 and only runs pre-built JAR files
fn generate_springboot_runtime_dockerfile(source: &serde_yaml::Mapping) -> String {
    let java_version = source.get("java_version")
        .or_else(|| source.get("javaVersion"))
        .and_then(|v| v.as_str())
        .unwrap_or("17");

    // Extract port from either 'port' field or 'ports' array
    let port = if let Some(port_value) = source.get("port") {
        // Direct port field
        port_value.as_u64().unwrap_or(8080)
    } else if let Some(ports_array) = source.get("ports").and_then(|v| v.as_sequence()) {
        // ports array like ['8085:8085']
        if let Some(first_port) = ports_array.first() {
            if let Some(port_str) = first_port.as_str() {
                // Parse '8085:8085' -> extract first number
                port_str.split(':')
                    .next()
                    .and_then(|s| s.trim().parse::<u64>().ok())
                    .unwrap_or(8080)
            } else {
                8080
            }
        } else {
            8080
        }
    } else {
        8080
    };

    let profile = source.get("profile")
        .and_then(|v| v.as_str())
        .unwrap_or("production");

    let jvm_opts = source.get("jvm_opts")
        .or_else(|| source.get("jvmOpts"))
        .and_then(|v| v.as_str())
        .unwrap_or("-Xmx512m -Xms256m");

    // Runtime-only Dockerfile for pre-built JAR
    // This assumes:
    // - Dockerfile is in DEPLOY_ROOT/
    // - JAR file is in DEPLOY_ROOT/apps/app.jar
    // - docker-compose.yml build context is "."
    format!(r#"# Runtime Dockerfile for GitHub Actions deployment
FROM eclipse-temurin:{}-jre-jammy

WORKDIR /app

# Copy the pre-built JAR file (uploaded by GitHub Actions)
# Path is relative to build context (DEPLOY_ROOT)
COPY apps/app.jar /app/app.jar

ENV SPRING_PROFILES_ACTIVE={}
ENV JVM_OPTS="{}"

EXPOSE {}

ENTRYPOINT ["sh", "-c", "java $JVM_OPTS -jar /app/app.jar"]
"#, java_version, profile, jvm_opts, port)
}

/// Generate a Spring Boot Dockerfile from service configuration
/// This is for local builds with source code
fn generate_springboot_dockerfile(source: &serde_yaml::Mapping) -> String {
    // Extract configuration with defaults
    let java_version = source.get("java_version")
        .or_else(|| source.get("javaVersion"))
        .and_then(|v| v.as_str())
        .unwrap_or("17");

    let port = source.get("port")
        .and_then(|v| v.as_u64())
        .unwrap_or(8080);

    let profile = source.get("profile")
        .and_then(|v| v.as_str())
        .unwrap_or("production");

    let jvm_opts = source.get("jvm_opts")
        .or_else(|| source.get("jvmOpts"))
        .and_then(|v| v.as_str())
        .unwrap_or("-Xmx512m -Xms256m");

    // Generate Dockerfile content
    format!(r#"# Multi-stage build for Spring Boot application
# Build stage
FROM eclipse-temurin:{}-jdk-jammy AS builder

WORKDIR /build

# Copy Gradle/Maven files first for better caching
COPY gradlew* build.gradle* settings.gradle* gradle.properties* ./
COPY gradle ./gradle 2>/dev/null || true
COPY pom.xml ./pom.xml 2>/dev/null || true

# Make gradlew executable if it exists
RUN if [ -f gradlew ]; then chmod +x gradlew; fi

# Download dependencies (this layer will be cached)
RUN if [ -f gradlew ]; then \
        ./gradlew dependencies --no-daemon || true; \
    elif [ -f pom.xml ]; then \
        ./mvnw dependency:go-offline || true; \
    fi

# Copy source code
COPY src ./src

# Build the application
RUN if [ -f gradlew ]; then \
        ./gradlew clean bootJar --no-daemon; \
    elif [ -f pom.xml ]; then \
        ./mvnw clean package -DskipTests; \
    fi

# Find the built JAR file
RUN find build/libs -name "*.jar" -not -name "*-plain.jar" -exec cp {{}} app.jar \; 2>/dev/null || \
    find target -name "*.jar" -exec cp {{}} app.jar \;

# Runtime stage
FROM eclipse-temurin:{}-jre-jammy

WORKDIR /app

# Create a non-root user
RUN groupadd -r spring && useradd -r -g spring spring

# Copy the JAR from build stage
COPY --from=builder /build/app.jar ./app.jar

# Set ownership
RUN chown -R spring:spring /app

# Switch to non-root user
USER spring

# Expose port
EXPOSE {}

# Set environment variables
ENV SPRING_PROFILES_ACTIVE={}
ENV JAVA_OPTS="{}"

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:{}/actuator/health || exit 1

# Run the application
ENTRYPOINT ["sh", "-c", "java $JAVA_OPTS -jar app.jar"]
"#, java_version, java_version, port, profile, jvm_opts, port)
}