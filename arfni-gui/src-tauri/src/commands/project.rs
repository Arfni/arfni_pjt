use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::AppHandle;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Project {
    pub id: String,
    pub name: String,
    pub path: String,
    pub created_at: String,
    pub updated_at: String,
    pub stack_yaml_path: Option<String>,
    pub description: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct StackYamlData {
    pub nodes: Vec<CanvasNode>,
    pub edges: Vec<CanvasEdge>,
    pub project_name: String,
    pub secrets: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CanvasNode {
    pub id: String,
    pub node_type: String, // "service", "target", "database"
    pub data: serde_json::Value,
    pub position: NodePosition,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct NodePosition {
    pub x: f64,
    pub y: f64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CanvasEdge {
    pub id: String,
    pub source: String,
    pub target: String,
}

/// 프로젝트 생성 - 프로젝트 폴더와 .arfni 디렉토리 생성
#[tauri::command]
pub fn create_project(
    name: String,
    path: String,
    description: Option<String>,
) -> Result<Project, String> {
    let project_path = Path::new(&path).join(&name);
    let arfni_path = project_path.join(".arfni");

    // 프로젝트 디렉토리 생성
    fs::create_dir_all(&project_path)
        .map_err(|e| format!("프로젝트 폴더 생성 실패: {}", e))?;

    // .arfni 디렉토리 생성
    fs::create_dir_all(&arfni_path)
        .map_err(|e| format!(".arfni 폴더 생성 실패: {}", e))?;

    // .arfni/data 디렉토리 생성 (Docker 볼륨용)
    fs::create_dir_all(arfni_path.join("data"))
        .map_err(|e| format!("data 폴더 생성 실패: {}", e))?;

    // .arfni/compose 디렉토리 생성 (생성된 docker-compose.yaml 저장용)
    fs::create_dir_all(arfni_path.join("compose"))
        .map_err(|e| format!("compose 폴더 생성 실패: {}", e))?;

    // 프로젝트 메타데이터 생성
    let project = Project {
        id: uuid::Uuid::new_v4().to_string(),
        name: name.clone(),
        path: project_path.to_string_lossy().to_string(),
        created_at: chrono::Utc::now().to_rfc3339(),
        updated_at: chrono::Utc::now().to_rfc3339(),
        stack_yaml_path: Some(project_path.join("stack.yaml").to_string_lossy().to_string()),
        description,
    };

    // 프로젝트 메타데이터 저장
    let project_json = serde_json::to_string_pretty(&project)
        .map_err(|e| format!("프로젝트 직렬화 실패: {}", e))?;

    fs::write(arfni_path.join("project.json"), project_json)
        .map_err(|e| format!("프로젝트 메타데이터 저장 실패: {}", e))?;

    // 초기 stack.yaml 생성
    let initial_stack = r#"apiVersion: v0.1
name: %PROJECT_NAME%

targets:
  local:
    type: docker-desktop

services:
  # 서비스를 여기에 추가하세요
"#.replace("%PROJECT_NAME%", &name);

    fs::write(project_path.join("stack.yaml"), initial_stack)
        .map_err(|e| format!("초기 stack.yaml 생성 실패: {}", e))?;

    Ok(project)
}

/// 프로젝트 열기
#[tauri::command]
pub fn open_project(path: String) -> Result<Project, String> {
    let project_path = Path::new(&path);
    let arfni_path = project_path.join(".arfni");
    let project_json_path = arfni_path.join("project.json");

    if !project_json_path.exists() {
        return Err("유효한 ARFNI 프로젝트가 아닙니다".to_string());
    }

    let project_json = fs::read_to_string(project_json_path)
        .map_err(|e| format!("프로젝트 파일 읽기 실패: {}", e))?;

    let mut project: Project = serde_json::from_str(&project_json)
        .map_err(|e| format!("프로젝트 파일 파싱 실패: {}", e))?;

    // 업데이트 시간 갱신
    project.updated_at = chrono::Utc::now().to_rfc3339();

    Ok(project)
}

/// stack.yaml 저장 (Canvas 데이터를 YAML로 변환하여 저장)
#[tauri::command]
pub fn save_stack_yaml(
    project_path: String,
    yaml_content: String,
    canvas_data: StackYamlData,
) -> Result<(), String> {
    let project_path = Path::new(&project_path);
    let stack_yaml_path = project_path.join("stack.yaml");
    let arfni_path = project_path.join(".arfni");

    // stack.yaml 파일 저장
    fs::write(&stack_yaml_path, yaml_content)
        .map_err(|e| format!("stack.yaml 저장 실패: {}", e))?;

    // Canvas 상태를 .arfni/canvas-state.json에 저장 (나중에 불러오기 위해)
    let canvas_json = serde_json::to_string_pretty(&canvas_data)
        .map_err(|e| format!("Canvas 데이터 직렬화 실패: {}", e))?;

    fs::write(arfni_path.join("canvas-state.json"), canvas_json)
        .map_err(|e| format!("Canvas 상태 저장 실패: {}", e))?;

    // 프로젝트 메타데이터 업데이트
    if let Ok(mut project) = open_project(project_path.to_string_lossy().to_string()) {
        project.updated_at = chrono::Utc::now().to_rfc3339();

        let project_json = serde_json::to_string_pretty(&project)
            .map_err(|e| format!("프로젝트 직렬화 실패: {}", e))?;

        fs::write(arfni_path.join("project.json"), project_json)
            .map_err(|e| format!("프로젝트 메타데이터 업데이트 실패: {}", e))?;
    }

    Ok(())
}

/// stack.yaml 읽기
#[tauri::command]
pub fn read_stack_yaml(project_path: String) -> Result<String, String> {
    let stack_yaml_path = Path::new(&project_path).join("stack.yaml");

    if !stack_yaml_path.exists() {
        return Err("stack.yaml 파일이 존재하지 않습니다".to_string());
    }

    fs::read_to_string(stack_yaml_path)
        .map_err(|e| format!("stack.yaml 읽기 실패: {}", e))
}

/// Canvas 상태 읽기 (프로젝트 열 때 Canvas 복원용)
#[tauri::command]
pub fn load_canvas_state(project_path: String) -> Result<StackYamlData, String> {
    let canvas_state_path = Path::new(&project_path).join(".arfni").join("canvas-state.json");

    if !canvas_state_path.exists() {
        // Canvas 상태가 없으면 빈 상태 반환
        return Ok(StackYamlData {
            nodes: vec![],
            edges: vec![],
            project_name: String::new(),
            secrets: vec![],
        });
    }

    let canvas_json = fs::read_to_string(canvas_state_path)
        .map_err(|e| format!("Canvas 상태 읽기 실패: {}", e))?;

    serde_json::from_str(&canvas_json)
        .map_err(|e| format!("Canvas 상태 파싱 실패: {}", e))
}

/// 최근 프로젝트 목록 가져오기
#[tauri::command]
pub fn get_recent_projects(app: AppHandle) -> Result<Vec<Project>, String> {
    use tauri::Manager;

    let app_data_dir = app.path()
        .app_data_dir()
        .map_err(|e| format!("앱 데이터 디렉토리를 찾을 수 없습니다: {}", e))?;

    let recent_projects_file = app_data_dir.join("recent-projects.json");

    if !recent_projects_file.exists() {
        return Ok(vec![]);
    }

    let json = fs::read_to_string(recent_projects_file)
        .map_err(|e| format!("최근 프로젝트 목록 읽기 실패: {}", e))?;

    serde_json::from_str(&json)
        .map_err(|e| format!("최근 프로젝트 목록 파싱 실패: {}", e))
}

/// 최근 프로젝트 목록에 추가
#[tauri::command]
pub fn add_to_recent_projects(app: AppHandle, project: Project) -> Result<(), String> {
    use tauri::Manager;

    let app_data_dir = app.path()
        .app_data_dir()
        .map_err(|e| format!("앱 데이터 디렉토리를 찾을 수 없습니다: {}", e))?;

    // 앱 데이터 디렉토리가 없으면 생성
    fs::create_dir_all(&app_data_dir)
        .map_err(|e| format!("앱 데이터 디렉토리 생성 실패: {}", e))?;

    let recent_projects_file = app_data_dir.join("recent-projects.json");

    // 기존 최근 프로젝트 목록 읽기
    let mut recent_projects = if recent_projects_file.exists() {
        let json = fs::read_to_string(&recent_projects_file)
            .map_err(|e| format!("최근 프로젝트 목록 읽기 실패: {}", e))?;

        serde_json::from_str::<Vec<Project>>(&json).unwrap_or_default()
    } else {
        vec![]
    };

    // 중복 제거 (같은 경로의 프로젝트가 있으면 제거)
    recent_projects.retain(|p| p.path != project.path);

    // 새 프로젝트를 맨 앞에 추가
    recent_projects.insert(0, project);

    // 최대 10개까지만 유지
    recent_projects.truncate(10);

    // 저장
    let json = serde_json::to_string_pretty(&recent_projects)
        .map_err(|e| format!("최근 프로젝트 목록 직렬화 실패: {}", e))?;

    fs::write(recent_projects_file, json)
        .map_err(|e| format!("최근 프로젝트 목록 저장 실패: {}", e))?;

    Ok(())
}