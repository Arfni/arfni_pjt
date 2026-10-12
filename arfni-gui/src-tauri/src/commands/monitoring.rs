use serde::{Deserialize, Serialize};
use serde_yaml;
use tauri::command;
use std::process::{Command, Stdio};
use std::path::PathBuf;
use std::collections::HashMap;
use tauri::{AppHandle, Manager};
use once_cell::sync::OnceCell;
use parking_lot::Mutex as ParkingMutex;
use tokio::sync::Mutex;

static MONITORING_START_STOP_LOCK: OnceCell<Mutex<()>> = OnceCell::new();
fn monitoring_start_stop_lock() -> &'static Mutex<()> {
    MONITORING_START_STOP_LOCK.get_or_init(|| Mutex::new(()))
}

#[derive(Clone)]
struct LocalMonitoringRuntime {
    runtime_dir: PathBuf,
    project_name: String,
}

struct LocalMonitoringChild {
    child: std::process::Child,
    runtime: LocalMonitoringRuntime,
}

static LOCAL_MONITORING_CHILDREN: OnceCell<ParkingMutex<HashMap<String, LocalMonitoringChild>>> = OnceCell::new();
fn local_monitoring_children() -> &'static ParkingMutex<HashMap<String, LocalMonitoringChild>> {
    LOCAL_MONITORING_CHILDREN.get_or_init(|| ParkingMutex::new(HashMap::new()))
}

fn local_monitoring_runtime(project_path: &str) -> Result<LocalMonitoringRuntime, String> {
    let canonical = std::fs::canonicalize(project_path)
        .map_err(|e| format!("Failed to resolve project path {}: {}", project_path, e))?;
    let normalized = if cfg!(windows) {
        canonical.to_string_lossy().to_lowercase()
    } else {
        canonical.to_string_lossy().into_owned()
    };
    let hash = normalized.as_bytes().iter().fold(0xcbf29ce484222325u64, |hash, byte| {
        (hash ^ u64::from(*byte)).wrapping_mul(0x100000001b3)
    });
    Ok(LocalMonitoringRuntime {
        runtime_dir: canonical.join(".arfni").join("monitoring"),
        project_name: format!("arfni{:016x}", hash),
    })
}

fn compose_down_command(compose_file: &std::path::Path, project_name: &str) -> Command {
    let mut command = Command::new("docker");
    command.args(["compose", "-p", project_name, "-f"])
        .arg(compose_file)
        .arg("down");
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    command
}

fn configure_local_monitoring_command(command: &mut Command, runtime: &LocalMonitoringRuntime) {
    command.env("ARFNI_MONITORING_RUNTIME_DIR", &runtime.runtime_dir)
        .env("COMPOSE_PROJECT_NAME", &runtime.project_name);
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        command.process_group(0);
    }
}

#[cfg(windows)]
fn owned_process_tree_command(pid: u32) -> Command {
    use std::os::windows::process::CommandExt;
    let mut command = Command::new("taskkill");
    command.args(["/PID", &pid.to_string(), "/T", "/F"]);
    command.creation_flags(0x08000000);
    command
}

#[cfg(unix)]
fn owned_process_group_command(pid: u32, signal: &str) -> Command {
    let mut command = Command::new("kill");
    command.args([signal, "--", &format!("-{}", pid)]);
    command
}

fn stop_local_child_tree(child: &mut std::process::Child) -> Result<(), String> {
    match child.try_wait() {
        Ok(Some(_)) => return Ok(()),
        Ok(None) => {},
        Err(e) => return Err(format!("Failed to inspect monitoring process: {}", e)),
    }

    #[cfg(windows)]
    let result = owned_process_tree_command(child.id()).output();
    #[cfg(unix)]
    let result = owned_process_group_command(child.id(), "-KILL").output();
    #[cfg(not(any(windows, unix)))]
    {
        child.kill().map_err(|e| format!("Failed to stop monitoring process: {}", e))?;
        child.wait().map_err(|e| format!("Failed to wait for monitoring process: {}", e))?;
        return Ok(());
    }

    #[cfg(any(windows, unix))]
    {
        let output = result.map_err(|e| format!("Failed to terminate monitoring process tree: {}", e))?;
        if !output.status.success() {
            return Err(format!(
                "Failed to terminate monitoring process tree: {}",
                String::from_utf8_lossy(&output.stderr).trim()
            ));
        }
        child.wait().map_err(|e| format!("Failed to wait for monitoring process: {}", e))?;
        Ok(())
    }
}

fn spawn_owned_local_monitoring(
    mut command: Command,
    project_path: &str,
    runtime: LocalMonitoringRuntime,
) -> Result<(), String> {
    configure_local_monitoring_command(&mut command, &runtime);
    let child = command.spawn()
        .map_err(|e| format!("Failed to start monitoring stack: {}", e))?;
    local_monitoring_children().lock().insert(
        project_path.to_string(),
        LocalMonitoringChild { child, runtime },
    );
    Ok(())
}

fn stop_owned_monitoring(app: &AppHandle, project_path: &str) -> Result<String, String> {
    crate::features::ssh_rt::close_owned_tunnels(app, project_path);

    let runtime = {
        let mut children = local_monitoring_children().lock();
        if let Some(owned) = children.get_mut(project_path) {
            stop_local_child_tree(&mut owned.child)?;
            Some(owned.runtime.clone())
        } else {
            local_monitoring_runtime(project_path).ok()
        }
    };

    if let Some(runtime) = runtime {
        let compose_file = runtime.runtime_dir.join("docker-compose.yml");
        if compose_file.exists() {
            let output = compose_down_command(&compose_file, &runtime.project_name)
                .output()
                .map_err(|e| format!("Failed to stop project monitoring containers: {}", e))?;
            if !output.status.success() {
                return Err(format!(
                    "Failed to stop project monitoring containers: {}",
                    String::from_utf8_lossy(&output.stderr).trim()
                ));
            }
        }
    }
    local_monitoring_children().lock().remove(project_path);
    Ok("Project monitoring stopped".to_string())
}

pub fn cleanup_owned_monitoring_on_exit(app: &AppHandle) {
    // App exit runs on a background thread; let any pending start register its children first.
    let _guard = monitoring_start_stop_lock().blocking_lock();
    crate::features::ssh_rt::close_all_tunnels(app);
    let projects: Vec<String> = local_monitoring_children().lock().keys().cloned().collect();
    for project in projects {
        if let Err(error) = stop_owned_monitoring(app, &project) {
            eprintln!("[monitoring] cleanup failed for {}: {}", project, error);
        }
    }
}

fn finish_monitoring_pair(
    prometheus: crate::features::ssh_rt::TunnelOpen,
    grafana: anyhow::Result<crate::features::ssh_rt::TunnelOpen>,
    rollback: impl FnOnce(uuid::Uuid),
) -> Result<(uuid::Uuid, uuid::Uuid), String> {
    match grafana {
        Ok(grafana) => Ok((prometheus.id, grafana.id)),
        Err(error) => {
            if prometheus.created {
                rollback(prometheus.id);
            }
            Err(format!("Failed to create Grafana tunnel: {:#}", error))
        }
    }
}

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
    pub dashboard_uid: Option<String>,
}

#[derive(Debug, Deserialize)]
struct StackYaml {
    targets: HashMap<String, Target>,
    services: HashMap<String, Service>,
}

#[derive(Debug, Clone, Deserialize)]
struct Target {
    #[serde(rename = "type")]
    target_type: String,
    #[serde(default)]
    host: String,
    #[serde(default)]
    user: String,
    #[serde(rename = "sshKey", default)]
    ssh_key: String,
}

#[derive(Debug, Deserialize)]
struct Service {
    target: String,
}

/// Opens the pair of tunnels all-in-one monitoring needs, rolling back on failure.
///
/// Leaving a half-open pair behind poisoned every later attempt: the tunnel that did come
/// up kept holding its local port, so the next call failed on that port instead of on the
/// real problem, and the UI only ever showed the generic connection-failed panel. A tunnel
/// that was reused rather than created belongs to whoever opened it, so it is not rolled
/// back here.
fn open_monitoring_tunnels(
    app: &AppHandle,
    params: crate::features::ssh_rt::SshParams,
    project_path: &str,
    prometheus_port: u16,
    grafana_port: u16,
) -> Result<(uuid::Uuid, uuid::Uuid), String> {
    use crate::features::ssh_rt::{close_tunnel, open_local_tunnel_owned, retire_outdated_owned_tunnels};

    retire_outdated_owned_tunnels(app, project_path, &params, prometheus_port, grafana_port);

    // Prometheus on EC2:9090 -> configured local port.
    let prometheus = open_local_tunnel_owned(app.clone(), params.clone(), prometheus_port, 9090, project_path.to_string())
        .map_err(|e| format!("Failed to create Prometheus tunnel: {:#}", e))?;
    println!(
        "[open_monitoring_tunnels] Prometheus tunnel {} ({})",
        prometheus.id,
        if prometheus.created { "created" } else { "reused" }
    );

    // Grafana on EC2:3200 -> configured local port.
    let grafana = open_local_tunnel_owned(app.clone(), params, grafana_port, 3200, project_path.to_string());
    if let Ok(tunnel) = &grafana {
        println!(
            "[open_monitoring_tunnels] Grafana tunnel {} ({})",
            tunnel.id,
            if tunnel.created { "created" } else { "reused" }
        );
    }
    finish_monitoring_pair(prometheus, grafana, |id| {
        println!("[open_monitoring_tunnels] rolling back tunnel {}", id);
        let _ = close_tunnel(app, id);
    })
}

/// All-in-one 모드에서 SSH 터널을 통한 모니터링 시작
async fn start_monitoring_with_tunnel(
    app: AppHandle,
    target: Target,
    project_path: String,
    prometheus_port: u16,
    grafana_port: u16,
) -> Result<String, String> {
    use crate::features::ssh_rt::SshParams;

    let ssh_params = SshParams {
        host: target.host.clone(),
        user: target.user.clone(),
        pem_path: target.ssh_key.clone(),
    };

    println!("[start_monitoring_with_tunnel] Opening SSH tunnels...");
    println!("  Host: {}", target.host);
    println!("  User: {}", target.user);

    // open_monitoring_tunnels waits for each forward to actually serve, so it blocks for
    // as long as the ssh handshake takes; keep it off the async runtime.
    let (prometheus_tunnel_id, grafana_tunnel_id) = {
        let app = app.clone();
        tokio::task::spawn_blocking(move || open_monitoring_tunnels(&app, ssh_params, &project_path, prometheus_port, grafana_port))
            .await
            .map_err(|e| format!("Tunnel setup task failed: {}", e))??
    };

    println!("[start_monitoring_with_tunnel] SSH tunnels are ready. Access Grafana at http://localhost:{}", grafana_port);

    Ok(format!(
        "All-in-one monitoring started via SSH tunnels\n\
        Prometheus: http://localhost:{}\n\
        Grafana: http://localhost:{}\n\
        Tunnel IDs: prometheus={}, grafana={}",
        prometheus_port, grafana_port, prometheus_tunnel_id, grafana_tunnel_id
    ))
}

/// stack.yaml 파싱 및 배포 모드 감지
fn detect_deployment_mode(stack_yaml_path: &PathBuf) -> Result<(String, Option<Target>), String> {
    let content = std::fs::read_to_string(stack_yaml_path)
        .map_err(|e| format!("Failed to read stack.yaml: {}", e))?;

    let stack: StackYaml = serde_yaml::from_str(&content)
        .map_err(|e| format!("Failed to parse stack.yaml: {}", e))?;

    // Prometheus와 Grafana 서비스 찾기
    let prometheus_service = stack.services.get("prometheus");
    let grafana_service = stack.services.get("grafana");

    if prometheus_service.is_none() && grafana_service.is_none() {
        return Ok(("none".to_string(), None));
    }

    // Target 정보 가져오기
    let prometheus_target = prometheus_service
        .and_then(|s| stack.targets.get(&s.target));
    let grafana_target = grafana_service
        .and_then(|s| stack.targets.get(&s.target));

    let prometheus_is_ec2 = prometheus_target
        .map(|t| t.target_type == "ec2.ssh" || t.target_type == "ec2")
        .unwrap_or(false);
    let grafana_is_ec2 = grafana_target
        .map(|t| t.target_type == "ec2.ssh" || t.target_type == "ec2")
        .unwrap_or(false);
    let grafana_is_local = grafana_target
        .map(|t| t.target_type == "local" || t.target_type == "docker-desktop")
        .unwrap_or(false);
    let prometheus_is_local = prometheus_target
        .map(|t| t.target_type == "local" || t.target_type == "docker-desktop")
        .unwrap_or(false);

    // 모드 감지
    if grafana_is_local && prometheus_is_ec2 {
        // Hybrid: Grafana local, Prometheus EC2
        Ok(("hybrid".to_string(), prometheus_target.cloned()))
    } else if grafana_is_ec2 && prometheus_is_ec2 {
        // All-in-one: 둘 다 EC2
        Ok(("all-in-one".to_string(), grafana_target.cloned()))
    } else if grafana_is_local && prometheus_is_local {
        // Local: 둘 다 local
        Ok(("local".to_string(), None))
    } else {
        Ok(("none".to_string(), None))
    }
}

fn monitoring_ports(stack: &serde_yaml::Value, mode: &str) -> Result<(u16, u16), String> {
    let monitoring = stack.get("metadata").and_then(|m| m.get("monitoring"));
    let port = |name: &str, default: u16| -> Result<u16, String> {
        match monitoring.and_then(|m| m.get(name)) {
            None => Ok(default),
            Some(value) => value.as_u64()
                .and_then(|n| u16::try_from(n).ok())
                .filter(|n| *n > 0)
                .ok_or_else(|| format!("metadata.monitoring.{} must be a port from 1 to 65535", name)),
        }
    };
    let prometheus = port("prometheus_port", if mode == "all-in-one" { 9091 } else { 9090 })?;
    let grafana = port("grafana_port", 3200)?;
    if prometheus == grafana {
        return Err("Prometheus and Grafana local ports must differ".to_string());
    }
    Ok((prometheus, grafana))
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
    app: AppHandle,
    project_path: String,
) -> Result<MonitoringConfig, String> {
    let stack_yaml_path = PathBuf::from(project_path).join("stack.yaml");
    let mut config = monitoring_config_for_stack(&stack_yaml_path)?;
    config.dashboard_uid = read_dashboard_uid(&app);
    Ok(config)
}

fn monitoring_config_for_stack(stack_yaml_path: &PathBuf) -> Result<MonitoringConfig, String> {
    let stack_content = std::fs::read_to_string(stack_yaml_path)
        .map_err(|e| format!("Failed to read stack.yaml at {:?}: {}", stack_yaml_path, e))?;
    let stack: serde_yaml::Value = serde_yaml::from_str(&stack_content)
        .map_err(|e| format!("Failed to parse stack.yaml: {}", e))?;
    let (mode, _) = detect_deployment_mode(stack_yaml_path)?;
    let (prometheus_port, grafana_port) = monitoring_ports(&stack, &mode)?;

    Ok(MonitoringConfig {
        mode,
        prometheus_url: format!("http://localhost:{}", prometheus_port),
        grafana_url: format!("http://localhost:{}", grafana_port),
        prometheus_port,
        grafana_port,
        dashboard_uid: None,
    })
}

/// Grafana 대시보드 JSON 파일에서 UID 읽기
fn read_dashboard_uid(app: &AppHandle) -> Option<String> {
    use tauri::path::BaseDirectory;

    // 리소스 경로에서 node-exporter-full.json 읽기
    let resource_path = "resources/plugins/bundled/monitoring/grafana/provisioning/dashboards/node-exporter-full.json";

    // 1. 프로덕션 경로 시도 (번들된 리소스)
    if let Ok(resolved_path) = app.path().resolve(resource_path, BaseDirectory::Resource) {
        if let Ok(content) = std::fs::read_to_string(&resolved_path) {
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
                if let Some(uid) = json.get("uid").and_then(|v| v.as_str()).map(|s| s.to_string()) {
                    eprintln!("Dashboard UID loaded from production path: {}", uid);
                    return Some(uid);
                }
            }
        }
    }

    // 2. 개발 경로로 fallback
    match std::fs::read_to_string(resource_path) {
        Ok(content) => {
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
                if let Some(uid) = json.get("uid").and_then(|v| v.as_str()).map(|s| s.to_string()) {
                    eprintln!("Dashboard UID loaded from dev path: {}", uid);
                    return Some(uid);
                }
            }
            eprintln!("Failed to parse dashboard JSON from dev path");
            None
        },
        Err(e) => {
            eprintln!("Failed to read dashboard JSON from both production and dev paths: {}", e);
            None
        }
    }
}

#[cfg(test)]
mod monitoring_tests {
    use super::*;

    #[cfg(windows)]
    #[test]
    fn local_stop_targets_only_the_owned_process_tree() {
        let command = owned_process_tree_command(4242);
        let args: Vec<String> = command.get_args().map(|arg| arg.to_string_lossy().into_owned()).collect();
        assert_eq!(command.get_program(), "taskkill");
        assert_eq!(args, ["/PID", "4242", "/T", "/F"]);
    }

    #[cfg(unix)]
    #[test]
    fn local_stop_signals_only_the_spawned_process_group() {
        let command = owned_process_group_command(4242, "-KILL");
        let args: Vec<String> = command.get_args().map(|arg| arg.to_string_lossy().into_owned()).collect();
        assert_eq!(command.get_program(), "kill");
        assert_eq!(args, ["-KILL", "--", "-4242"]);
    }

    #[test]
    fn local_runtime_is_unique_to_canonical_project() {
        let base = std::env::temp_dir().join(format!("arfni-monitoring-runtime-{}", uuid::Uuid::new_v4()));
        let a = base.join("a");
        let b = base.join("b");
        std::fs::create_dir_all(&a).unwrap();
        std::fs::create_dir_all(&b).unwrap();

        let first = local_monitoring_runtime(a.to_str().unwrap()).unwrap();
        let again = local_monitoring_runtime(a.to_str().unwrap()).unwrap();
        let second = local_monitoring_runtime(b.to_str().unwrap()).unwrap();

        assert_eq!(first.runtime_dir, a.canonicalize().unwrap().join(".arfni").join("monitoring"));
        assert_eq!(first.project_name, again.project_name);
        assert_ne!(first.project_name, second.project_name);
        assert!(first.project_name.starts_with("arfni"));
        let _ = std::fs::remove_dir_all(base);
    }

    #[test]
    fn compose_down_command_names_only_the_project_runtime() {
        let compose_file = PathBuf::from("example").join(".arfni").join("monitoring").join("docker-compose.yml");
        let command = compose_down_command(&compose_file, "arfni1234");
        let args: Vec<String> = command.get_args().map(|arg| arg.to_string_lossy().into_owned()).collect();

        assert_eq!(args, vec!["compose", "-p", "arfni1234", "-f", compose_file.to_str().unwrap(), "down"]);
    }

    #[test]
    fn local_monitoring_child_receives_owned_runtime_environment() {
        let runtime = LocalMonitoringRuntime {
            runtime_dir: PathBuf::from("example").join(".arfni").join("monitoring"),
            project_name: "arfni1234".into(),
        };
        let mut command = Command::new("arfni-monitoring");
        configure_local_monitoring_command(&mut command, &runtime);
        let env: HashMap<String, String> = command.get_envs()
            .filter_map(|(key, value)| Some((key.to_string_lossy().into_owned(), value?.to_string_lossy().into_owned())))
            .collect();

        assert_eq!(env.get("ARFNI_MONITORING_RUNTIME_DIR"), Some(&runtime.runtime_dir.to_string_lossy().into_owned()));
        assert_eq!(env.get("COMPOSE_PROJECT_NAME"), Some(&"arfni1234".to_string()));
    }

    #[test]
    fn second_tunnel_failure_rolls_back_only_a_new_first_tunnel() {
        use crate::features::ssh_rt::TunnelOpen;
        let id = uuid::Uuid::new_v4();
        let mut closed = Vec::new();

        let result = finish_monitoring_pair(
            TunnelOpen { id, created: true },
            Err(anyhow::anyhow!("Grafana bind failed")),
            |id| closed.push(id),
        );
        assert!(result.is_err());
        assert_eq!(closed, vec![id]);

        closed.clear();
        let result = finish_monitoring_pair(
            TunnelOpen { id, created: false },
            Err(anyhow::anyhow!("Grafana bind failed")),
            |id| closed.push(id),
        );
        assert!(result.is_err());
        assert!(closed.is_empty());
    }

    #[test]
    fn config_infers_all_in_one_when_metadata_has_no_mode() {
        let path = std::env::temp_dir().join(format!("arfni-monitoring-{}.yaml", uuid::Uuid::new_v4()));
        std::fs::write(&path, "targets:\n  server:\n    type: ec2.ssh\n    host: example.com\n    user: ubuntu\n    sshKey: key.pem\nservices:\n  prometheus:\n    target: server\n  grafana:\n    target: server\nmetadata: {}\n").unwrap();

        let config = monitoring_config_for_stack(&path).unwrap();
        let _ = std::fs::remove_file(path);

        assert_eq!(config.mode, "all-in-one");
        assert_eq!(config.prometheus_url, "http://localhost:9091");
        assert_eq!(config.grafana_url, "http://localhost:3200");
    }

    #[test]
    fn all_in_one_config_defaults_to_tunnel_ports() {
        let yaml: serde_yaml::Value = serde_yaml::from_str("metadata: {}\n").unwrap();
        assert_eq!(monitoring_ports(&yaml, "all-in-one").unwrap(), (9091, 3200));
        assert_eq!(monitoring_ports(&yaml, "local").unwrap(), (9090, 3200));
    }

    #[test]
    fn custom_config_ports_are_used_for_local_tunnel_endpoints() {
        let yaml: serde_yaml::Value = serde_yaml::from_str(
            "metadata:\n  monitoring:\n    prometheus_port: 9191\n    grafana_port: 3300\n",
        ).unwrap();
        assert_eq!(monitoring_ports(&yaml, "all-in-one").unwrap(), (9191, 3300));
    }

    #[test]
    fn invalid_config_port_is_rejected_instead_of_wrapping() {
        let yaml: serde_yaml::Value = serde_yaml::from_str(
            "metadata:\n  monitoring:\n    prometheus_port: 65536\n",
        ).unwrap();
        assert!(monitoring_ports(&yaml, "all-in-one").is_err());
    }
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

/// 서버 상태 확인 (up 메트릭 조회)
#[command]
pub async fn check_server_status(
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
        .map_err(|e| format!("Failed to check server status: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("Prometheus API error: {}", response.status()));
    }

    let json: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    // Extract the metric value
    if let Some(result) = json["data"]["result"].as_array() {
        if let Some(first_result) = result.first() {
            if let Some(value) = first_result["value"].as_array() {
                if value.len() >= 2 {
                    if let Some(status_str) = value[1].as_str() {
                        let status: f64 = status_str.parse().unwrap_or(0.0);
                        return Ok(status == 1.0);
                    }
                }
            }
        }
    }

    Err("No server status data available".to_string())
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
    let _guard = monitoring_start_stop_lock().lock().await;
    // project_path는 디렉토리이므로 stack.yaml 경로를 구성
    let stack_yaml_path = PathBuf::from(&project_path).join("stack.yaml");

    if !stack_yaml_path.exists() {
        return Err(format!("stack.yaml not found at {:?}", stack_yaml_path));
    }

    // 배포 모드 감지
    let (mode, ec2_target) = detect_deployment_mode(&stack_yaml_path)?;

    println!("[start_monitoring_stack] Detected mode: {}", mode);

    // All-in-one 모드: SSH 터널 생성
    if mode == "all-in-one" {
        if let Some(target) = ec2_target {
            let config = monitoring_config_for_stack(&stack_yaml_path)?;
            return start_monitoring_with_tunnel(app, target, project_path, config.prometheus_port, config.grafana_port).await;
        } else {
            return Err("All-in-one mode detected but EC2 target not found".to_string());
        }
    }

    // Hybrid/Local 모드: 로컬 Docker 사용
    let runtime = local_monitoring_runtime(&project_path)?;
    {
        let mut children = local_monitoring_children().lock();
        let running = children.get_mut(&project_path)
            .map(|owned| matches!(owned.child.try_wait(), Ok(None)))
            .unwrap_or(false);
        if running {
            return Ok("Project monitoring is already starting".to_string());
        }
        children.remove(&project_path);
    }

    // Docker Desktop 확인 및 자동 시작
    ensure_docker_running().await?;

    // BE 폴더의 모니터링 실행 파일 경로 찾기
    let mut possible_paths = vec![];

    // 1. 실행 파일 위치 기준 (배포된 앱)
    // Tauri가 resources/bin/* glob으로 resources/bin 폴더 구조 유지
    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            // 프로덕션: resources/bin 폴더에 있음
            possible_paths.push(exe_dir.join("resources").join("bin").join("arfni-monitoring.exe"));
            possible_paths.push(exe_dir.join("resources").join("bin").join("arfni-go.exe"));
        }
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
            .stdin(Stdio::null());

        // 로그 파일로 출력 (디버깅용)
        if let Ok(exe_dir) = std::env::current_exe().and_then(|p| p.parent().map(|d| d.to_path_buf()).ok_or_else(|| std::io::Error::new(std::io::ErrorKind::NotFound, "No parent"))) {
            let log_path = exe_dir.join("monitoring.log");
            match std::fs::File::create(&log_path) {
                Ok(log_file) => {
                    if let Ok(log_file2) = log_file.try_clone() {
                        cmd.stdout(Stdio::from(log_file))
                           .stderr(Stdio::from(log_file2));
                    }
                },
                Err(_) => {
                    // 로그 파일 생성 실패시 null로 fallback
                    cmd.stdout(Stdio::null()).stderr(Stdio::null());
                }
            }
        } else {
            cmd.stdout(Stdio::null()).stderr(Stdio::null());
        }

        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(CREATE_NO_WINDOW);
        }

        let project_key = project_path.clone();
        let owned_runtime = runtime.clone();
        tokio::task::spawn_blocking(move || spawn_owned_local_monitoring(cmd, &project_key, owned_runtime))
            .await
            .map_err(|e| format!("Monitoring startup task failed: {}", e))??;

        Ok(format!("Monitoring stack starting with {} (stack: {})", exe_path.display(), stack_yaml_path.display()))
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
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(CREATE_NO_WINDOW);
        }

        tokio::task::spawn_blocking(move || spawn_owned_local_monitoring(cmd, &project_path, runtime))
            .await
            .map_err(|e| format!("Monitoring startup task failed: {}", e))??;

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
pub async fn stop_monitoring_stack(app: AppHandle, project_path: String) -> Result<String, String> {
    let _guard = monitoring_start_stop_lock().lock().await;
    tokio::task::spawn_blocking(move || stop_owned_monitoring(&app, &project_path))
        .await
        .map_err(|e| format!("Monitoring cleanup task failed: {}", e))?
}
