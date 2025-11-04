use serde::{Deserialize, Serialize};
use tauri::command;
use std::process::{Command, Stdio};
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[derive(Debug, Serialize, Deserialize)]
pub struct PrometheusMetric {
    pub timestamp: f64,
    pub value: f64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct MetricsData {
    pub cpu_usage: f64,
    pub memory_used_mb: f64,
    pub memory_usage_percent: f64,
    pub disk_used_gb: f64,
    pub disk_usage_percent: f64,
    pub network_inbound_mb: f64,
    pub network_outbound_mb: f64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct MonitoringConfig {
    pub mode: String,
    pub prometheus_url: String,
    pub grafana_url: String,
    pub prometheus_port: u16,
    pub grafana_port: u16,
}

/// Prometheus API에서 PromQL 쿼리 실행
#[command]
pub async fn prometheus_query(
    prometheus_url: String,
    query: String,
) -> Result<Vec<PrometheusMetric>, String> {
    let client = reqwest::Client::new();
    let url = format!("{}/api/v1/query", prometheus_url);

    let response = client
        .get(&url)
        .query(&[("query", query)])
        .send()
        .await
        .map_err(|e| format!("Failed to query Prometheus: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("Prometheus returned error: {}", response.status()));
    }

    let body: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    let result = body
        .get("data")
        .and_then(|d| d.get("result"))
        .and_then(|r| r.as_array())
        .ok_or("Invalid response format")?;

    let mut metrics = Vec::new();
    for item in result {
        if let Some(value_arr) = item.get("value").and_then(|v| v.as_array()) {
            if value_arr.len() >= 2 {
                let timestamp = value_arr[0].as_f64().unwrap_or(0.0);
                let value_str = value_arr[1].as_str().unwrap_or("0");
                let value = value_str.parse::<f64>().unwrap_or(0.0);
                metrics.push(PrometheusMetric { timestamp, value });
            }
        }
    }

    Ok(metrics)
}

/// CPU 사용률 가져오기 (0-100%)
#[command]
pub async fn get_cpu_usage(prometheus_url: String) -> Result<f64, String> {
    let query = r#"100 - (avg by (instance) (rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)"#;
    let metrics = prometheus_query(prometheus_url, query.to_string()).await?;

    Ok(metrics.first().map(|m| m.value).unwrap_or(0.0))
}

/// 메모리 사용량 가져오기 (MB, %)
#[command]
pub async fn get_memory_usage(
    prometheus_url: String,
) -> Result<(f64, f64), String> {
    // 사용 중인 메모리 (MB)
    let used_query = r#"(node_memory_MemTotal_bytes - node_memory_MemAvailable_bytes) / 1024 / 1024"#;
    let used_metrics = prometheus_query(prometheus_url.clone(), used_query.to_string()).await?;
    let used_mb = used_metrics.first().map(|m| m.value).unwrap_or(0.0);

    // 메모리 사용률 (%)
    let percent_query = r#"100 * (1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes))"#;
    let percent_metrics = prometheus_query(prometheus_url, percent_query.to_string()).await?;
    let usage_percent = percent_metrics.first().map(|m| m.value).unwrap_or(0.0);

    Ok((used_mb, usage_percent))
}

/// 네트워크 트래픽 가져오기 (MB, 24h)
#[command]
pub async fn get_network_traffic(
    prometheus_url: String,
) -> Result<(f64, f64), String> {
    // Inbound (수신)
    let inbound_query = r#"sum(rate(node_network_receive_bytes_total[24h])) / 1024 / 1024"#;
    let inbound_metrics = prometheus_query(prometheus_url.clone(), inbound_query.to_string()).await?;
    let inbound_mb = inbound_metrics.first().map(|m| m.value).unwrap_or(0.0);

    // Outbound (송신)
    let outbound_query = r#"sum(rate(node_network_transmit_bytes_total[24h])) / 1024 / 1024"#;
    let outbound_metrics = prometheus_query(prometheus_url, outbound_query.to_string()).await?;
    let outbound_mb = outbound_metrics.first().map(|m| m.value).unwrap_or(0.0);

    Ok((inbound_mb, outbound_mb))
}

/// 디스크 사용량 가져오기 (GB, %)
#[command]
pub async fn get_disk_usage(
    prometheus_url: String,
) -> Result<(f64, f64), String> {
    // 사용 중인 디스크 (GB)
    let used_query = r#"(node_filesystem_size_bytes{mountpoint="/"} - node_filesystem_avail_bytes{mountpoint="/"}) / 1024 / 1024 / 1024"#;
    let used_metrics = prometheus_query(prometheus_url.clone(), used_query.to_string()).await?;
    let used_gb = used_metrics.first().map(|m| m.value).unwrap_or(0.0);

    // 디스크 사용률 (%)
    let percent_query = r#"100 * (1 - (node_filesystem_avail_bytes{mountpoint="/"} / node_filesystem_size_bytes{mountpoint="/"}))"#;
    let percent_metrics = prometheus_query(prometheus_url, percent_query.to_string()).await?;
    let usage_percent = percent_metrics.first().map(|m| m.value).unwrap_or(0.0);

    Ok((used_gb, usage_percent))
}

/// 모든 메트릭을 한번에 가져오기
#[command]
pub async fn get_all_metrics(
    prometheus_url: String,
) -> Result<MetricsData, String> {
    let cpu_usage = get_cpu_usage(prometheus_url.clone()).await?;
    let (memory_used_mb, memory_usage_percent) = get_memory_usage(prometheus_url.clone()).await?;
    let (network_inbound_mb, network_outbound_mb) = get_network_traffic(prometheus_url.clone()).await?;
    let (disk_used_gb, disk_usage_percent) = get_disk_usage(prometheus_url).await?;

    Ok(MetricsData {
        cpu_usage,
        memory_used_mb,
        memory_usage_percent,
        disk_used_gb,
        disk_usage_percent,
        network_inbound_mb,
        network_outbound_mb,
    })
}

/// 프로젝트의 모니터링 설정 가져오기
#[command]
pub async fn get_monitoring_config(
    project_path: String,
) -> Result<MonitoringConfig, String> {
    // project_path는 디렉토리이므로 stack.yaml 경로를 구성
    let stack_yaml_path = std::path::Path::new(&project_path).join("stack.yaml");

    // stack.yaml 파일 읽기
    let stack_content = std::fs::read_to_string(&stack_yaml_path)
        .map_err(|e| format!("Failed to read stack.yaml at {:?}: {}", stack_yaml_path, e))?;

    // YAML 파싱
    let stack: serde_yaml::Value = serde_yaml::from_str(&stack_content)
        .map_err(|e| format!("Failed to parse stack.yaml: {}", e))?;

    // metadata.monitoring.mode 가져오기
    let mode = stack
        .get("metadata")
        .and_then(|m| m.get("monitoring"))
        .and_then(|mon| mon.get("mode"))
        .and_then(|m| m.as_str())
        .unwrap_or("local")
        .to_string();

    // 포트 설정 (기본값 또는 사용자 정의)
    let prometheus_port = stack
        .get("metadata")
        .and_then(|m| m.get("monitoring"))
        .and_then(|mon| mon.get("prometheus_port"))
        .and_then(|p| p.as_u64())
        .unwrap_or(9090) as u16;

    let grafana_port = stack
        .get("metadata")
        .and_then(|m| m.get("monitoring"))
        .and_then(|mon| mon.get("grafana_port"))
        .and_then(|p| p.as_u64())
        .unwrap_or(3000) as u16;

    // URL 구성
    let prometheus_url = format!("http://localhost:{}", prometheus_port);
    let grafana_url = format!("http://localhost:{}", grafana_port);

    Ok(MonitoringConfig {
        mode,
        prometheus_url,
        grafana_url,
        prometheus_port,
        grafana_port,
    })
}

/// Prometheus 연결 테스트
#[command]
pub async fn test_prometheus_connection(
    prometheus_url: String,
) -> Result<bool, String> {
    let client = reqwest::Client::new();
    let url = format!("{}/api/v1/query", prometheus_url);

    let response = client
        .get(&url)
        .query(&[("query", "up")])
        .timeout(std::time::Duration::from_secs(5))
        .send()
        .await
        .map_err(|e| format!("Connection failed: {}", e))?;

    Ok(response.status().is_success())
}

/// Docker Desktop 실행 확인 및 자동 시작
async fn ensure_docker_running() -> Result<(), String> {
    #[cfg(target_os = "windows")]
    const CREATE_NO_WINDOW: u32 = 0x08000000;

    // Docker 상태 확인
    let mut check_cmd = Command::new("docker");
    check_cmd.arg("info");

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        check_cmd.creation_flags(CREATE_NO_WINDOW);
    }

    let result = check_cmd.output();

    // Docker가 실행 중이면 OK
    if result.is_ok() && result.unwrap().status.success() {
        return Ok(());
    }

    // Docker가 실행 중이 아니면 Docker Desktop 실행
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;

        // Docker Desktop 경로 찾기
        let docker_paths = vec![
            "C:\\Program Files\\Docker\\Docker\\Docker Desktop.exe",
            "C:\\Program Files (x86)\\Docker\\Docker\\Docker Desktop.exe",
        ];

        let mut docker_path: Option<String> = None;
        for path in docker_paths {
            if PathBuf::from(path).exists() {
                docker_path = Some(path.to_string());
                break;
            }
        }

        let docker_exe = docker_path.ok_or("Docker Desktop이 설치되어 있지 않습니다. Docker Desktop을 먼저 설치해주세요.")?;

        // Docker Desktop 실행
        let mut start_cmd = Command::new(&docker_exe);
        start_cmd.stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null());

        start_cmd.creation_flags(CREATE_NO_WINDOW);

        start_cmd.spawn()
            .map_err(|e| format!("Docker Desktop 실행 실패: {}", e))?;

        // Docker가 준비될 때까지 대기 (최대 60초)
        for i in 0..60 {
            tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;

            let mut check_cmd = Command::new("docker");
            check_cmd.arg("info");
            check_cmd.creation_flags(CREATE_NO_WINDOW);

            if let Ok(output) = check_cmd.output() {
                if output.status.success() {
                    return Ok(());
                }
            }

            // 5초마다 로그 출력
            if i % 5 == 0 && i > 0 {
                println!("Docker Desktop 시작 대기 중... ({}초)", i);
            }
        }

        return Err("Docker Desktop이 시작되지 않았습니다. 수동으로 Docker Desktop을 실행해주세요.".to_string());
    }

    #[cfg(not(target_os = "windows"))]
    {
        return Err("Docker가 실행 중이 아닙니다. Docker Desktop을 먼저 실행해주세요.".to_string());
    }
}

/// 모니터링 스택 자동 시작
#[command]
pub async fn start_monitoring_stack(
    app: AppHandle,
    project_path: String,
) -> Result<String, String> {
    // Docker Desktop 확인 및 자동 시작
    ensure_docker_running().await?;
    // project_path는 디렉토리이므로 stack.yaml 경로를 구성
    let stack_yaml_path = PathBuf::from(&project_path).join("stack.yaml");

    if !stack_yaml_path.exists() {
        return Err(format!("stack.yaml not found at {:?}", stack_yaml_path));
    }

    // BE 폴더의 모니터링 실행 파일 경로 찾기
    let mut possible_paths = vec![];

    // 1. Tauri 리소스 경로 (배포된 앱에서 사용)
    if let Ok(resource_path) = app.path().resource_dir() {
        possible_paths.push(resource_path.join("arfni-monitoring.exe"));
        possible_paths.push(resource_path.join("arfni-go.exe"));
    }

    // 2. 현재 작업 디렉토리 기준 (개발 환경)
    if let Ok(cwd) = std::env::current_dir() {
        possible_paths.push(cwd.join("BE").join("arfni").join("bin").join("arfni-monitoring.exe"));
        possible_paths.push(cwd.join("BE").join("arfni").join("bin").join("arfni-go.exe"));
    }

    let mut exe_path: Option<PathBuf> = None;
    for path in &possible_paths {
        if path.exists() {
            exe_path = Some(path.clone());
            break;
        }
    }

    let exe_path = exe_path.ok_or_else(|| {
        let tried_paths: Vec<String> = possible_paths.iter()
            .map(|p| p.display().to_string())
            .collect();
        format!(
            "Monitoring executable not found.\n\
            Tried paths:\n  - {}\n\
            \n\
            Solution: Run 'npm run build:go' in the project root to build required executables.",
            tried_paths.join("\n  - ")
        )
    })?;

    #[cfg(target_os = "windows")]
    const CREATE_NO_WINDOW: u32 = 0x08000000;

    // 실행 파일 이름으로 판단
    let exe_name = exe_path.file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("");

    // arfni-monitoring.exe 또는 start-monitoring-v2.exe 사용 시
    if exe_name.contains("arfni-monitoring") || exe_name.contains("start-monitoring-v2") {
        // 백그라운드로 실행 (stack.yaml 경로를 인자로 전달)
        let mut cmd = Command::new(&exe_path);
        cmd.arg(stack_yaml_path.to_string_lossy().to_string())
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null());

        #[cfg(target_os = "windows")]
        {
            cmd.creation_flags(CREATE_NO_WINDOW);
        }

        cmd.spawn()
            .map_err(|e| format!("Failed to start monitoring stack: {}", e))?;

        Ok(format!("Monitoring stack starting with {}", exe_path.display()))
    } else {
        // arfni-go.exe monitor 명령어 사용
        let mut cmd = Command::new(&exe_path);
        cmd.arg("monitor")
            .arg("-f")
            .arg(stack_yaml_path.to_string_lossy().to_string())
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null());

        #[cfg(target_os = "windows")]
        {
            cmd.creation_flags(CREATE_NO_WINDOW);
        }

        cmd.spawn()
            .map_err(|e| format!("Failed to start monitoring stack: {}", e))?;

        Ok(format!("Monitoring stack starting with {}", exe_path.display()))
    }
}

/// 모니터링 스택이 실행 중인지 확인
#[command]
pub async fn check_monitoring_running(
    grafana_url: String,
) -> Result<bool, String> {
    let client = reqwest::Client::new();

    // Grafana 헬스체크
    let response = client
        .get(&format!("{}/api/health", grafana_url))
        .timeout(std::time::Duration::from_secs(3))
        .send()
        .await;

    match response {
        Ok(resp) => Ok(resp.status().is_success()),
        Err(_) => Ok(false), // 연결 실패는 false 반환 (에러 아님)
    }
}

/// 모니터링 스택 종료
#[command]
pub async fn stop_monitoring_stack() -> Result<String, String> {
    #[cfg(target_os = "windows")]
    const CREATE_NO_WINDOW: u32 = 0x08000000;

    // Docker 컨테이너 완전 삭제 (stop + rm을 -f로 한번에)
    let mut cmd = Command::new("docker");
    cmd.args(&["rm", "-f", "grafana", "prometheus"]);

    #[cfg(target_os = "windows")]
    {
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    // 실행 (에러 무시 - 컨테이너가 없을 수도 있음)
    let _ = cmd.output();

    // SSH 터널 프로세스 종료 (Windows)
    #[cfg(target_os = "windows")]
    {
        let mut kill_cmd = Command::new("taskkill");
        kill_cmd.args(&["/F", "/IM", "ssh.exe"]);
        kill_cmd.creation_flags(CREATE_NO_WINDOW);
        let _ = kill_cmd.output();
    }

    // arfni-monitoring.exe 프로세스 종료 (Windows)
    #[cfg(target_os = "windows")]
    {
        let mut kill_monitoring = Command::new("taskkill");
        kill_monitoring.args(&["/F", "/IM", "arfni-monitoring.exe"]);
        kill_monitoring.creation_flags(CREATE_NO_WINDOW);
        let _ = kill_monitoring.output();
    }

    // SSH 터널 프로세스 종료 (Unix)
    #[cfg(not(target_os = "windows"))]
    {
        let mut kill_cmd = Command::new("pkill");
        kill_cmd.args(&["-f", "ssh.*9090"]);
        let _ = kill_cmd.output();
    }

    Ok("Monitoring stack stopped".to_string())
}
