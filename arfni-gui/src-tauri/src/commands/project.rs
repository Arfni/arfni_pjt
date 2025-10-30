use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::State;
use rusqlite::params;
use crate::db::Database;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Project {
    pub id: String,
    pub name: String,
    pub path: String,
    pub environment: String, // "local" | "ec2"
    pub ec2_server_id: Option<String>,
    pub mode: Option<String>, // "all-in-one" | "hybrid" | "no-monitoring"
    pub workdir: Option<String>,
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

/// 프로젝트 생성 - 프로젝트 폴더와 .arfni 디렉토리 생성 + DB 저장
#[tauri::command]
pub fn create_project(
    db: State<Database>,
    name: String,
    path: String,
    environment: String, // "local" | "ec2"
    ec2_server_id: Option<String>,
    description: Option<String>,
) -> Result<Project, String> {
    // 환경 검증
    if environment != "local" && environment != "ec2" {
        return Err("환경은 'local' 또는 'ec2'여야 합니다".to_string());
    }

    // EC2인 경우 서버 ID 필수
    if environment == "ec2" && ec2_server_id.is_none() {
        return Err("EC2 환경에서는 서버 ID가 필요합니다".to_string());
    }

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
    let project_id = uuid::Uuid::new_v4().to_string();
    let created_at = chrono::Utc::now().to_rfc3339();
    let stack_yaml_path = project_path.join("stack.yaml").to_string_lossy().to_string();

    let project = Project {
        id: project_id.clone(),
        name: name.clone(),
        path: project_path.to_string_lossy().to_string(),
        environment: environment.clone(),
        ec2_server_id: ec2_server_id.clone(),
        mode: if environment == "ec2" { Some("all-in-one".to_string()) } else { None },
        workdir: if environment == "ec2" { Some("arfni-deploy".to_string()) } else { None },
        created_at: created_at.clone(),
        updated_at: created_at.clone(),
        stack_yaml_path: Some(stack_yaml_path),
        description: description.clone(),
    };

    // 데이터베이스에 프로젝트 저장
    let conn = db.get_conn();
    let conn = conn.lock().unwrap();

    conn.execute(
        "INSERT INTO projects (id, name, path, environment, ec2_server_id, mode, workdir, created_at, updated_at, description, stack_yaml_path)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
        params![
            &project.id,
            &project.name,
            &project.path,
            &project.environment,
            &project.ec2_server_id,
            &project.mode,
            &project.workdir,
            &project.created_at,
            &project.updated_at,
            &project.description,
            &project.stack_yaml_path,
        ],
    ).map_err(|e| format!("프로젝트 DB 저장 실패: {}", e))?;

    // 초기 stack.yaml 생성 (환경에 따라 다르게)
    let initial_stack = if environment == "local" {
        format!(r#"apiVersion: v0.1
name: {}

targets:
  local:
    type: docker-desktop

services:
  # 서비스를 여기에 추가하세요
"#, name)
    } else {
        // EC2는 TypeScript에서 서버 정보를 포함하여 생성할 것임
        format!(r#"apiVersion: v0.1
name: {}

targets:
  ec2:
    type: ec2.ssh
    # EC2 서버 정보는 프론트엔드에서 추가됩니다

services:
  # 서비스를 여기에 추가하세요
"#, name)
    };

    fs::write(project_path.join("stack.yaml"), initial_stack)
        .map_err(|e| format!("초기 stack.yaml 생성 실패: {}", e))?;

    Ok(project)
}

/// 프로젝트 열기 (DB에서 조회)
#[tauri::command]
pub fn open_project(db: State<Database>, project_id: String) -> Result<Project, String> {
    let conn = db.get_conn();
    let conn = conn.lock().unwrap();

    let mut stmt = conn.prepare(
        "SELECT id, name, path, environment, ec2_server_id, mode, workdir, created_at, updated_at, description, stack_yaml_path
         FROM projects WHERE id = ?1"
    ).map_err(|e| format!("쿼리 준비 실패: {}", e))?;

    let project = stmt.query_row(params![&project_id], |row| {
        Ok(Project {
            id: row.get(0)?,
            name: row.get(1)?,
            path: row.get(2)?,
            environment: row.get(3)?,
            ec2_server_id: row.get(4)?,
            mode: row.get(5)?,
            workdir: row.get(6)?,
            created_at: row.get(7)?,
            updated_at: row.get(8)?,
            description: row.get(9)?,
            stack_yaml_path: row.get(10)?,
        })
    }).map_err(|e| format!("프로젝트 조회 실패: {}", e))?;

    // 업데이트 시간 갱신
    let updated_at = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE projects SET updated_at = ?1 WHERE id = ?2",
        params![&updated_at, &project_id],
    ).map_err(|e| format!("업데이트 시간 갱신 실패: {}", e))?;

    Ok(project)
}

/// 프로젝트 경로로 열기 (기존 호환성)
#[tauri::command]
pub fn open_project_by_path(db: State<Database>, path: String) -> Result<Project, String> {
    let conn = db.get_conn();
    let conn = conn.lock().unwrap();

    let mut stmt = conn.prepare(
        "SELECT id, name, path, environment, ec2_server_id, mode, workdir, created_at, updated_at, description, stack_yaml_path
         FROM projects WHERE path = ?1"
    ).map_err(|e| format!("쿼리 준비 실패: {}", e))?;

    let project = stmt.query_row(params![&path], |row| {
        Ok(Project {
            id: row.get(0)?,
            name: row.get(1)?,
            path: row.get(2)?,
            environment: row.get(3)?,
            ec2_server_id: row.get(4)?,
            mode: row.get(5)?,
            workdir: row.get(6)?,
            created_at: row.get(7)?,
            updated_at: row.get(8)?,
            description: row.get(9)?,
            stack_yaml_path: row.get(10)?,
        })
    }).map_err(|e| format!("프로젝트 조회 실패: {}", e))?;

    Ok(project)
}

/// stack.yaml 저장 (Canvas 데이터를 YAML로 변환하여 저장)
#[tauri::command]
pub fn save_stack_yaml(
    db: State<Database>,
    project_path: String,
    yaml_content: String,
    canvas_data: StackYamlData,
) -> Result<(), String> {
    let project_path_buf = Path::new(&project_path);
    let stack_yaml_path = project_path_buf.join("stack.yaml");
    let arfni_path = project_path_buf.join(".arfni");

    // stack.yaml 파일 저장
    fs::write(&stack_yaml_path, yaml_content)
        .map_err(|e| format!("stack.yaml 저장 실패: {}", e))?;

    // Canvas 상태를 .arfni/canvas-state.json에 저장
    let canvas_json = serde_json::to_string_pretty(&canvas_data)
        .map_err(|e| format!("Canvas 데이터 직렬화 실패: {}", e))?;

    fs::write(arfni_path.join("canvas-state.json"), canvas_json)
        .map_err(|e| format!("Canvas 상태 저장 실패: {}", e))?;

    // DB에서 프로젝트 업데이트 시간 갱신
    let conn = db.get_conn();
    let conn = conn.lock().unwrap();

    let updated_at = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE projects SET updated_at = ?1 WHERE path = ?2",
        params![&updated_at, &project_path],
    ).map_err(|e| format!("프로젝트 업데이트 실패: {}", e))?;

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

/// 모든 프로젝트 가져오기
#[tauri::command]
pub fn get_all_projects(db: State<Database>) -> Result<Vec<Project>, String> {
    let conn = db.get_conn();
    let conn = conn.lock().unwrap();

    let mut stmt = conn.prepare(
        "SELECT id, name, path, environment, ec2_server_id, mode, workdir, created_at, updated_at, description, stack_yaml_path
         FROM projects ORDER BY updated_at DESC"
    ).map_err(|e| format!("쿼리 준비 실패: {}", e))?;

    let projects = stmt.query_map([], |row| {
        Ok(Project {
            id: row.get(0)?,
            name: row.get(1)?,
            path: row.get(2)?,
            environment: row.get(3)?,
            ec2_server_id: row.get(4)?,
            mode: row.get(5)?,
            workdir: row.get(6)?,
            created_at: row.get(7)?,
            updated_at: row.get(8)?,
            description: row.get(9)?,
            stack_yaml_path: row.get(10)?,
        })
    }).map_err(|e| format!("프로젝트 조회 실패: {}", e))?
    .collect::<Result<Vec<_>, _>>()
    .map_err(|e| format!("프로젝트 목록 변환 실패: {}", e))?;

    Ok(projects)
}

/// 환경별 프로젝트 가져오기
#[tauri::command]
pub fn get_projects_by_environment(db: State<Database>, environment: String) -> Result<Vec<Project>, String> {
    let conn = db.get_conn();
    let conn = conn.lock().unwrap();

    let mut stmt = conn.prepare(
        "SELECT id, name, path, environment, ec2_server_id, mode, workdir, created_at, updated_at, description, stack_yaml_path
         FROM projects WHERE environment = ?1 ORDER BY updated_at DESC"
    ).map_err(|e| format!("쿼리 준비 실패: {}", e))?;

    let projects = stmt.query_map(params![&environment], |row| {
        Ok(Project {
            id: row.get(0)?,
            name: row.get(1)?,
            path: row.get(2)?,
            environment: row.get(3)?,
            ec2_server_id: row.get(4)?,
            mode: row.get(5)?,
            workdir: row.get(6)?,
            created_at: row.get(7)?,
            updated_at: row.get(8)?,
            description: row.get(9)?,
            stack_yaml_path: row.get(10)?,
        })
    }).map_err(|e| format!("프로젝트 조회 실패: {}", e))?
    .collect::<Result<Vec<_>, _>>()
    .map_err(|e| format!("프로젝트 목록 변환 실패: {}", e))?;

    Ok(projects)
}

/// EC2 서버별 프로젝트 가져오기
#[tauri::command]
pub fn get_projects_by_server(db: State<Database>, server_id: String) -> Result<Vec<Project>, String> {
    let conn = db.get_conn();
    let conn = conn.lock().unwrap();

    let mut stmt = conn.prepare(
        "SELECT id, name, path, environment, ec2_server_id, mode, workdir, created_at, updated_at, description, stack_yaml_path
         FROM projects WHERE ec2_server_id = ?1 ORDER BY updated_at DESC"
    ).map_err(|e| format!("쿼리 준비 실패: {}", e))?;

    let projects = stmt.query_map(params![&server_id], |row| {
        Ok(Project {
            id: row.get(0)?,
            name: row.get(1)?,
            path: row.get(2)?,
            environment: row.get(3)?,
            ec2_server_id: row.get(4)?,
            mode: row.get(5)?,
            workdir: row.get(6)?,
            created_at: row.get(7)?,
            updated_at: row.get(8)?,
            description: row.get(9)?,
            stack_yaml_path: row.get(10)?,
        })
    }).map_err(|e| format!("프로젝트 조회 실패: {}", e))?
    .collect::<Result<Vec<_>, _>>()
    .map_err(|e| format!("프로젝트 목록 변환 실패: {}", e))?;

    Ok(projects)
}

/// 최근 프로젝트 목록 가져오기 (최근 열은 순서)
#[tauri::command]
pub fn get_recent_projects(db: State<Database>) -> Result<Vec<Project>, String> {
    let conn = db.get_conn();
    let conn = conn.lock().unwrap();

    let mut stmt = conn.prepare(
        "SELECT p.id, p.name, p.path, p.environment, p.ec2_server_id, p.mode, p.workdir, p.created_at, p.updated_at, p.description, p.stack_yaml_path
         FROM projects p
         INNER JOIN recent_projects r ON p.id = r.project_id
         ORDER BY r.opened_at DESC
         LIMIT 10"
    ).map_err(|e| format!("쿼리 준비 실패: {}", e))?;

    let projects = stmt.query_map([], |row| {
        Ok(Project {
            id: row.get(0)?,
            name: row.get(1)?,
            path: row.get(2)?,
            environment: row.get(3)?,
            ec2_server_id: row.get(4)?,
            mode: row.get(5)?,
            workdir: row.get(6)?,
            created_at: row.get(7)?,
            updated_at: row.get(8)?,
            description: row.get(9)?,
            stack_yaml_path: row.get(10)?,
        })
    }).map_err(|e| format!("최근 프로젝트 조회 실패: {}", e))?
    .collect::<Result<Vec<_>, _>>()
    .map_err(|e| format!("프로젝트 목록 변환 실패: {}", e))?;

    Ok(projects)
}

/// 최근 프로젝트 목록에 추가
#[tauri::command]
pub fn add_to_recent_projects(db: State<Database>, project_id: String) -> Result<(), String> {
    let conn = db.get_conn();
    let conn = conn.lock().unwrap();

    let opened_at = chrono::Utc::now().to_rfc3339();

    // REPLACE INTO: 이미 있으면 업데이트, 없으면 삽입
    conn.execute(
        "REPLACE INTO recent_projects (project_id, opened_at) VALUES (?1, ?2)",
        params![&project_id, &opened_at],
    ).map_err(|e| format!("최근 프로젝트 추가 실패: {}", e))?;

    Ok(())
}

/// 최근 프로젝트 목록에서 제거
#[tauri::command]
pub fn remove_from_recent_projects(db: State<Database>, project_id: String) -> Result<(), String> {
    let conn = db.get_conn();
    let conn = conn.lock().unwrap();

    conn.execute(
        "DELETE FROM recent_projects WHERE project_id = ?1",
        params![&project_id],
    ).map_err(|e| format!("최근 프로젝트 제거 실패: {}", e))?;

    Ok(())
}

/// 프로젝트 업데이트 (mode, workdir 등)
#[tauri::command]
pub fn update_project(
    db: State<Database>,
    project_id: String,
    mode: Option<String>,
    workdir: Option<String>,
) -> Result<Project, String> {
    let conn = db.get_conn();
    let conn = conn.lock().unwrap();

    let updated_at = chrono::Utc::now().to_rfc3339();

    // 필드별로 업데이트
    if let Some(m) = &mode {
        conn.execute(
            "UPDATE projects SET mode = ?1, updated_at = ?2 WHERE id = ?3",
            params![m, &updated_at, &project_id],
        )
        .map_err(|e| format!("프로젝트 mode 업데이트 실패: {}", e))?;
    }

    if let Some(w) = &workdir {
        conn.execute(
            "UPDATE projects SET workdir = ?1, updated_at = ?2 WHERE id = ?3",
            params![w, &updated_at, &project_id],
        )
        .map_err(|e| format!("프로젝트 workdir 업데이트 실패: {}", e))?;
    }

    // 업데이트된 프로젝트 반환
    drop(conn);
    open_project(db, project_id)
}

/// 프로젝트 완전 삭제 (파일 시스템에서 삭제 + DB에서 제거)
#[tauri::command]
pub fn delete_project(db: State<Database>, project_id: String) -> Result<(), String> {
    // DB에서 프로젝트 조회
    let project = open_project(db.clone(), project_id.clone())?;

    let project_path_buf = PathBuf::from(&project.path);

    // 프로젝트 경로가 존재하면 파일 시스템에서 삭제
    if project_path_buf.exists() {
        // .arfni 디렉토리가 있는지 확인 (ARFNI 프로젝트인지 검증)
        let arfni_path = project_path_buf.join(".arfni");
        if !arfni_path.exists() {
            println!("⚠️ Warning: .arfni 디렉토리가 없습니다. 그래도 삭제를 진행합니다.");
        }

        // 프로젝트 폴더 전체 삭제
        fs::remove_dir_all(&project_path_buf)
            .map_err(|e| format!("프로젝트 삭제 실패: {}", e))?;

        println!("✅ 프로젝트 파일 삭제 완료: {}", project.path);
    } else {
        println!("⚠️ 프로젝트 경로가 존재하지 않습니다. DB에서만 제거합니다: {}", project.path);
    }

    // DB에서 삭제 (CASCADE로 recent_projects도 자동 삭제됨)
    let conn = db.get_conn();
    let conn = conn.lock().unwrap();

    conn.execute(
        "DELETE FROM projects WHERE id = ?1",
        params![&project_id],
    ).map_err(|e| format!("DB에서 프로젝트 삭제 실패: {}", e))?;

    Ok(())
}
