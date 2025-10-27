use serde::{Deserialize, Serialize};
use std::process::{Command, Stdio};
use std::io::{BufRead, BufReader};
use tauri::{AppHandle, Manager, Emitter};
use std::path::Path;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};

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

    // 배포 시작 플래그 설정
    DEPLOYMENT_RUNNING.store(true, Ordering::SeqCst);

    // 배포 시작 이벤트 전송
    app.emit("deployment-started", DeploymentStatus {
        status: "deploying".to_string(),
        message: Some("배포를 시작합니다...".to_string()),
        outputs: None,
    }).unwrap_or(());

    // Go 백엔드 실행 파일 경로 찾기
    let go_binary_path = find_go_binary(&app)?;

    // 새 스레드에서 배포 실행
    let app_clone = app.clone();
    std::thread::spawn(move || {
        // 배포 명령 실행 - Go 바이너리 직접 실행
        let mut cmd = Command::new(&go_binary_path)
            .arg("run")
            .arg("-f")
            .arg(&stack_yaml_path)
            .arg("-project-dir")
            .arg(&project_path)
            .current_dir(&project_path)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn();

        match cmd {
            Ok(mut child) => {
                // stdout 읽기
                if let Some(stdout) = child.stdout.take() {
                    let reader = BufReader::new(stdout);
                    for line in reader.lines() {
                        if let Ok(line) = line {
                            // NDJSON 파싱 시도
                            if let Ok(log_entry) = parse_ndjson_log(&line) {
                                // 로그 이벤트 전송
                                app_clone.emit("deployment-log", log_entry).unwrap_or(());
                            } else {
                                // 일반 텍스트 로그
                                app_clone.emit("deployment-log", DeploymentLog {
                                    timestamp: chrono::Utc::now().to_rfc3339(),
                                    level: "info".to_string(),
                                    message: line,
                                    data: None,
                                }).unwrap_or(());
                            }
                        }
                    }
                }

                // 프로세스 종료 대기
                match child.wait() {
                    Ok(status) => {
                        if status.success() {
                            app_clone.emit("deployment-completed", DeploymentStatus {
                                status: "success".to_string(),
                                message: Some("배포가 성공적으로 완료되었습니다".to_string()),
                                outputs: None, // TODO: outputs 파싱
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

/// Docker 설치 확인
#[tauri::command]
pub fn check_docker() -> Result<bool, String> {
    match Command::new("docker").arg("--version").output() {
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
    match Command::new("docker-compose").arg("--version").output() {
        Ok(output) => Ok(output.status.success()),
        Err(_) => {
            // docker compose (v2) 시도
            match Command::new("docker").arg("compose").arg("version").output() {
                Ok(output) => Ok(output.status.success()),
                Err(_) => Ok(false),
            }
        }
    }
}

/// Docker 데몬 실행 상태 확인
#[tauri::command]
pub fn check_docker_running() -> Result<bool, String> {
    match Command::new("docker").arg("ps").output() {
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

/// Go 바이너리 경로 찾기
fn find_go_binary(app: &AppHandle) -> Result<String, String> {
    // OS별 실행 파일 확장자
    let extension = if cfg!(windows) { ".exe" } else { "" };
    let binary_name = format!("arfni-go{}", extension);

    // 1. 절대 경로로 빌드된 Go 바이너리 시도
    let absolute_go_path = Path::new("C:\\Users\\SSAFY\\Desktop\\code\\arfni_pjt\\BE\\arfni\\bin")
        .join(&binary_name);
    if absolute_go_path.exists() {
        println!("✅ Found Go binary at: {:?}", absolute_go_path);
        return Ok(absolute_go_path.to_string_lossy().to_string());
    }

    // 2. 상대 경로로 시도 (개발 모드)
    let relative_go_path = Path::new("../../BE/arfni/bin").join(&binary_name);
    if relative_go_path.exists() {
        println!("✅ Found Go binary at: {:?}", relative_go_path);
        return Ok(relative_go_path.to_string_lossy().to_string());
    }

    // 3. 타겟 폴더 시도
    let dev_go_path = Path::new("../BE/arfni/bin").join(&binary_name);
    if dev_go_path.exists() {
        println!("✅ Found Go binary at: {:?}", dev_go_path);
        return Ok(dev_go_path.to_string_lossy().to_string());
    }

    // 4. 프로덕션 모드: resources/bin/
    if let Ok(resource_path) = app.path().resource_dir() {
        let prod_path = resource_path.join("bin").join(&binary_name);
        if prod_path.exists() {
            println!("✅ Found Go binary at: {:?}", prod_path);
            return Ok(prod_path.to_string_lossy().to_string());
        }
    }

    Err(format!("Go 바이너리를 찾을 수 없습니다: {}. 경로를 확인하세요:\n  - {:?}\n  - {:?}",
        binary_name, absolute_go_path, relative_go_path))
}

/// Go 플러그인 경로 찾기 (레거시 - 사용하지 않음)
fn find_plugin_path(app: &AppHandle, plugin_name: &str) -> Result<String, String> {
    use tauri::Manager;

    // OS별 실행 파일 확장자
    let extension = if cfg!(windows) { ".exe" } else { "" };

    // 1. 개발 모드: BE/arfni 바이너리 직접 사용
    let be_path = Path::new("..").join("BE").join(format!("arfni{}", extension));
    if be_path.exists() {
        println!("✅ Found Go binary at: {:?}", be_path);
        return Ok(be_path.to_string_lossy().to_string());
    }

    // 2. 상대 경로로 한 번 더 시도
    let be_path_alt = Path::new("../../BE").join(format!("arfni{}", extension));
    if be_path_alt.exists() {
        println!("✅ Found Go binary at: {:?}", be_path_alt);
        return Ok(be_path_alt.to_string_lossy().to_string());
    }

    // 3. 절대 경로로 시도 (bin 폴더 - PowerShell 스크립트)
    let absolute_be_path_ps1 = Path::new("C:\\Users\\SSAFY\\Desktop\\code\\arfni_pjt\\BE\\arfni\\bin")
        .join("arfni.exe.ps1");
    if absolute_be_path_ps1.exists() {
        println!("✅ Found PowerShell script at: {:?}", absolute_be_path_ps1);
        return Ok(absolute_be_path_ps1.to_string_lossy().to_string());
    }

    // 4. .exe 시도
    let absolute_be_path = Path::new("C:\\Users\\SSAFY\\Desktop\\code\\arfni_pjt\\BE\\arfni\\bin")
        .join(format!("arfni{}", extension));
    if absolute_be_path.exists() {
        println!("✅ Found Go binary at: {:?}", absolute_be_path);
        return Ok(absolute_be_path.to_string_lossy().to_string());
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

    // 개발 모드: src-tauri/plugins/
    let dev_path = Path::new("src-tauri")
        .join("plugins")
        .join(plugin_name)
        .join(&plugin_filename);

    if dev_path.exists() {
        return Ok(dev_path.to_string_lossy().to_string());
    }

    // 프로덕션 모드: resources/plugins/
    if let Ok(resource_path) = app.path().resource_dir() {
        let prod_path = resource_path
            .join("plugins")
            .join(plugin_name)
            .join(&plugin_filename);

        if prod_path.exists() {
            return Ok(prod_path.to_string_lossy().to_string());
        }
    }

    Err(format!("플러그인을 찾을 수 없습니다: {}. 경로를 확인하세요:\n  - {:?}\n  - {:?}\n  - {:?}",
        plugin_name, be_path, be_path_alt, absolute_be_path))
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