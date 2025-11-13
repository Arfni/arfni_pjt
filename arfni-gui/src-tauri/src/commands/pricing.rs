use serde::{Deserialize, Serialize};
use std::process::Command;
use tauri::State;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

use crate::db::{Database, api_key as repo};

#[derive(Debug, Serialize, Deserialize)]
pub struct EstimateCostRequest {
    pub stack_path: String,
}

#[derive(Debug, Serialize, Deserialize, Default)]
pub struct CostItem {
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub instance_type: String,
    #[serde(default)]
    pub count: i32,
    #[serde(default)]
    pub unit_price: f64,
    #[serde(default)]
    pub total_price: f64,
    #[serde(default)]
    pub description: String,
}

#[derive(Debug, Serialize, Deserialize, Default)]
pub struct CostDetails {
    #[serde(default)]
    pub ec2_items: Vec<CostItem>,
    #[serde(default)]
    pub rds_items: Vec<CostItem>,
    #[serde(default)]
    pub cache_items: Vec<CostItem>,
    #[serde(default)]
    pub storage_items: Vec<CostItem>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TierCostBreakdown {
    pub tier_name: String,
    pub description: String,
    pub instance_type: String,
    pub total_monthly_usd: f64,
    pub ec2_cost: f64,
    pub rds_cost: f64,
    pub cache_cost: f64,
    pub storage_cost: f64,
    pub load_balancer_cost: f64,
    pub data_transfer_cost: f64,
    #[serde(default)]
    pub warnings: Vec<String>,
    #[serde(default)]
    pub details: CostDetails,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CostEstimationResult {
    pub budget_tier: TierCostBreakdown,
    pub recommended_tier: TierCostBreakdown,
    pub performance_tier: TierCostBreakdown,
    pub optimization_tips: Vec<String>,
}

// Optimization Report Types
#[derive(Debug, Serialize, Deserialize)]
pub struct ActualUsageMetrics {
    pub cpu_usage_percent: f64,
    pub memory_used_mb: f64,
    pub memory_usage_percent: f64,
    pub disk_used_gb: f64,
    pub disk_usage_percent: f64,
    pub network_inbound_mb_24h: f64,
    pub network_outbound_mb_24h: f64,
    pub instance_type: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CostAnalysis {
    pub current_instance_type: String,
    pub current_monthly_cost: f64,
    pub estimated_data_transfer_cost: f64,
    pub actual_data_transfer_cost: f64,
    pub potential_savings: f64,
    pub savings_percent: f64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PerformanceAnalysis {
    pub cpu_bottleneck: bool,
    pub memory_bottleneck: bool,
    pub disk_bottleneck: bool,
    pub bottlenecks: Vec<String>,
    pub health_status: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Recommendation {
    pub priority: String,
    pub category: String,
    pub title: String,
    pub description: String,
    pub impact: String,
    #[serde(default)]
    pub savings: f64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct OptimizationReport {
    pub actual_usage: ActualUsageMetrics,
    pub cost_analysis: CostAnalysis,
    pub performance_analysis: PerformanceAnalysis,
    pub recommendations: Vec<Recommendation>,
}

#[tauri::command]
pub async fn estimate_cost(
    db: State<'_, Database>,
    stack_path: String,
    language: Option<String>,
) -> Result<CostEstimationResult, String> {
    #[cfg(target_os = "windows")]
    const CREATE_NO_WINDOW: u32 = 0x08000000;

    // Get API key from database
    let api_key = repo::get_active_value(&db, "etc")
        .map_err(|e| format!("Failed to get API key: {}", e))?
        .ok_or_else(|| "No active API key found in 'etc' provider. Please add an API key in settings.".to_string())?;

    // Find arfni-go.exe
    let exe_path = find_arfni_go_executable()?;

    // Use default language if not provided
    let lang = language.unwrap_or_else(|| "en".to_string());

    // Build command
    let mut cmd = Command::new(&exe_path);
    cmd.arg("estimate-cost")
        .arg("-f")
        .arg(&stack_path)
        .arg("-language")
        .arg(&lang)
        .env("GMS_KEY", api_key);

    #[cfg(target_os = "windows")]
    {
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    // Execute command
    let output = cmd.output()
        .map_err(|e| format!("Failed to execute estimate command: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        eprintln!("[RUST DEBUG] Command failed. stderr: {}", stderr);
        eprintln!("[RUST DEBUG] Command failed. stdout: {}", stdout);
        return Err(format!("Cost estimation failed: {}\n{}", stderr, stdout));
    }

    // Parse output
    let stdout = String::from_utf8_lossy(&output.stdout);

    // Find JSON output (starts with __COST_ESTIMATION__)
    let json_marker = "__COST_ESTIMATION__";
    if let Some(json_start) = stdout.find(json_marker) {
        let json_str = &stdout[json_start + json_marker.len()..];
        let result: CostEstimationResult = serde_json::from_str(json_str)
            .map_err(|e| format!("Failed to parse estimate result: {}", e))?;
        Ok(result)
    } else {
        Err("No cost estimation result found in output".to_string())
    }
}

#[tauri::command]
pub async fn optimize(
    db: State<'_, Database>,
    prometheus_url: Option<String>,
    language: Option<String>,
) -> Result<OptimizationReport, String> {
    #[cfg(target_os = "windows")]
    const CREATE_NO_WINDOW: u32 = 0x08000000;

    // Get API key from database
    let api_key = repo::get_active_value(&db, "etc")
        .map_err(|e| format!("Failed to get API key: {}", e))?
        .ok_or_else(|| "No active API key found in 'etc' provider. Please add an API key in settings.".to_string())?;

    // Find arfni-go.exe
    let exe_path = find_arfni_go_executable()?;

    // Use default Prometheus URL if not provided
    let prometheus = prometheus_url.unwrap_or_else(|| "http://localhost:9090".to_string());

    // DEBUG: Print language value before using it
    eprintln!("[RUST DEBUG] optimize called with language: {:?}", language);

    // Use default language if not provided
    let lang = language.unwrap_or_else(|| "en".to_string());

    eprintln!("[RUST DEBUG] normalized language: {}", lang);

    // Build command
    let mut cmd = Command::new(&exe_path);
    cmd.arg("optimize")
        .arg("-prometheus")
        .arg(&prometheus)
        .arg("-language")
        .arg(&lang)
        .env("GMS_KEY", api_key);

    #[cfg(target_os = "windows")]
    {
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    // Execute command
    let output = cmd.output()
        .map_err(|e| format!("Failed to execute optimize command: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Optimize command failed: {}", stderr));
    }

    // Parse output
    let stdout = String::from_utf8_lossy(&output.stdout);

    // Find JSON output (starts with __OPTIMIZATION_REPORT__)
    let json_marker = "__OPTIMIZATION_REPORT__";
    if let Some(json_start) = stdout.find(json_marker) {
        let json_str = &stdout[json_start + json_marker.len()..];
        let result: OptimizationReport = serde_json::from_str(json_str)
            .map_err(|e| format!("Failed to parse optimization result: {}", e))?;
        Ok(result)
    } else {
        Err("No optimization report found in output".to_string())
    }
}

fn find_arfni_go_executable() -> Result<std::path::PathBuf, String> {
    let mut possible_paths = vec![];

    // 1. Bundled app paths (Tauri resources)
    // Tauri bundles resources to exe_dir/resources/
    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            possible_paths.push(exe_dir.join("resources").join("bin").join("arfni-go.exe"));
        }
    }

    // 2. Development environment
    if let Ok(cwd) = std::env::current_dir() {
        possible_paths.push(cwd.join("BE").join("arfni").join("bin").join("arfni-go.exe"));
        possible_paths.push(cwd.join("..").join("BE").join("arfni").join("bin").join("arfni-go.exe"));
    }

    // Find first existing path
    for path in &possible_paths {
        if path.exists() {
            return Ok(path.clone());
        }
    }

    let tried_paths: Vec<String> = possible_paths.iter()
        .map(|p| p.display().to_string())
        .collect();

    Err(format!(
        "arfni-go.exe not found. Tried paths:\n  - {}",
        tried_paths.join("\n  - ")
    ))
}
