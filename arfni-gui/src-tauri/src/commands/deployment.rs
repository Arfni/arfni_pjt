use serde::{Deserialize, Serialize};
use std::process::{Command, Stdio};
use std::io::{BufRead, BufReader};
use tauri::{AppHandle, Manager, Emitter};
use std::path::Path;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};

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

// 배포 프로세스 관리를 위한 전역 상태
static DEPLOYMENT_RUNNING: AtomicBool = AtomicBool::new(false);

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
) -> Result<DeploymentStatus, String> {
    // 이미 배포가 진행 중인지 확인
    if DEPLOYMENT_RUNNING.load(Ordering::SeqCst) {
        return Err("이미 배포가 진행 중입니다".to_string());
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

        // 배포 명령 실행 - Go 바이너리 직접 실행
        let mut command = Command::new(&go_binary_path);
        command
            .arg("run")
            .arg("-f")
            .arg(&stack_yaml_path)
            .arg("-project-dir")
            .arg(&project_path)
            .current_dir(&project_path)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        // Windows에서 콘솔 창 숨김
        #[cfg(target_os = "windows")]
        {
            const CREATE_NO_WINDOW: u32 = 0x08000000;
            command.creation_flags(CREATE_NO_WINDOW);
        }

        let mut cmd = command.spawn();

        match cmd {
            Ok(mut child) => {
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
                            app_clone.emit("deployment-failed", DeploymentStatus {
                                status: "failed".to_string(),
                                message: Some(format!("배포 실패: 종료 코드 {}", status.code().unwrap_or(-1))),
                                outputs: None,
                            }).unwrap_or(());
                        }
                    }
                    Err(e) => {
                        app_clone.emit("deployment-failed", DeploymentStatus {
                            status: "failed".to_string(),
                            message: Some(format!("배포 프로세스 오류: {}", e)),
                            outputs: None,
                        }).unwrap_or(());
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

        // 배포 종료 플래그 해제
        DEPLOYMENT_RUNNING.store(false, Ordering::SeqCst);
    });

    Ok(DeploymentStatus {
        status: "deploying".to_string(),
        message: Some("배포가 백그라운드에서 실행 중입니다".to_string()),
        outputs: None,
    })
}

/// 배포 중단
#[tauri::command]
pub fn stop_deployment() -> Result<(), String> {
    // TODO: 실제 프로세스 종료 구현
    DEPLOYMENT_RUNNING.store(false, Ordering::SeqCst);
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

    // 2. Resource 경로들 시도 (배포 환경)
    let resource_patterns = vec![
        binary_name.clone(),  // Resource/arfni-go.exe
        format!("_up_/_up_/BE/arfni/bin/{}", binary_name),  // Resource/_up_/_up_/BE/arfni/bin/arfni-go.exe
        format!("BE/arfni/bin/{}", binary_name),  // Resource/BE/arfni/bin/arfni-go.exe
    ];

    for pattern in resource_patterns {
        if let Ok(path) = app.path().resolve(&pattern, BaseDirectory::Resource) {
            if path.exists() {
                println!("✅ Found Go binary in resources: {:?}", path);
                return Ok(path.to_string_lossy().to_string());
            }
        }
    }

    // 3. 개발 경로들 시도 (CARGO_MANIFEST_DIR 기준)
    let mut dev_path = PathBuf::from(env!("CARGO_MANIFEST_DIR")); // src-tauri
    dev_path.push("../../BE/arfni/bin");
    dev_path.push(&binary_name);
    if dev_path.exists() {
        println!("✅ Found Go binary (dev): {:?}", dev_path);
        return Ok(dev_path.to_string_lossy().to_string());
    }

    // 4. 프로젝트 루트 찾기 (개발 모드 보조)
    if let Ok(current_dir) = env::current_dir() {
        if let Some(project_root) = find_project_root(&current_dir) {
            let root_based_path = project_root.join("BE").join("arfni").join("bin").join(&binary_name);
            if root_based_path.exists() {
                println!("✅ Found Go binary at project root: {:?}", root_based_path);
                return Ok(root_based_path.to_string_lossy().to_string());
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