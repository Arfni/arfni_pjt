use serde::{Deserialize, Serialize};
use std::process::Command;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

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

#[tauri::command]
pub async fn estimate_cost(
    stack_path: String,
) -> Result<CostEstimationResult, String> {
    #[cfg(target_os = "windows")]
    const CREATE_NO_WINDOW: u32 = 0x08000000;

    // Find arfni-go.exe
    let exe_path = find_arfni_go_executable()?;

    // Build command
    let mut cmd = Command::new(&exe_path);
    cmd.arg("estimate-cost")
        .arg("-f")
        .arg(&stack_path);

    #[cfg(target_os = "windows")]
    {
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    // Execute command
    let output = cmd.output()
        .map_err(|e| format!("Failed to execute estimate command: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Estimate command failed: {}", stderr));
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

fn find_arfni_go_executable() -> Result<std::path::PathBuf, String> {
    let mut possible_paths = vec![];

    // 1. Bundled app paths (Tauri resources)
    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            possible_paths.push(exe_dir.join("_up_").join("_up_").join("BE").join("arfni").join("bin").join("arfni-go.exe"));
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
