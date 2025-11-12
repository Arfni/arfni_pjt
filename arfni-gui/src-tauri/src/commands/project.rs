use serde::{Deserialize, Serialize};
use std::fs;
use std::fs::File;
use std::path::{Path, PathBuf};
use tauri::{State, Manager};
use rusqlite::params;
use crate::db::Database;
use std::sync::Mutex;

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
    pub github_repo_url: Option<String>,
    pub github_branch: Option<String>,
    pub github_access_token: Option<String>,
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

/// 프로젝트 잠금 파일을 관리하는 구조체
pub struct ProjectLock {
    pub file: Option<File>,
    pub path: Option<String>,
}

impl ProjectLock {
    pub fn new() -> Self {
        ProjectLock {
            file: None,
            path: None,
        }
    }
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
    github_repo_url: Option<String>,
    github_branch: Option<String>,
    github_access_token: Option<String>,
    workdir: Option<String>,
) -> Result<Project, String> {
    // 환경 검증
    if environment != "local" && environment != "ec2" {
        return Err("환경은 'local' 또는 'ec2'여야 합니다".to_string());
    }

    // EC2인 경우 서버 ID 필수
    if environment == "ec2" && ec2_server_id.is_none() {
        return Err("EC2 환경에서는 서버 ID가 필요합니다".to_string());
    }

    // GitHub 프로젝트인지 확인
    let is_github_project = github_repo_url.is_some();

    let project_path = Path::new(&path).join(&name);
    let arfni_path = project_path.join(".arfni");

    // DB에서 같은 경로의 프로젝트가 있는지 확인하고 있으면 삭제
    let conn = db.get_conn();
    let conn_lock = conn.lock().unwrap();
    let project_path_str = project_path.to_string_lossy().to_string();

    conn_lock.execute(
        "DELETE FROM projects WHERE path = ?1",
        params![&project_path_str],
    ).map_err(|e| format!("기존 프로젝트 DB 정리 실패: {}", e))?;

    drop(conn_lock);

    // GitHub 프로젝트가 아닌 경우에만 로컬 디렉토리 생성
    if !is_github_project {
        // 프로젝트 경로가 이미 존재하는지 확인
        if project_path.exists() {
            return Err(format!("해당 경로에 프로젝트 폴더가 이미 존재합니다: {}", project_path.display()));
        }

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
    }

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
        workdir: if environment == "ec2" {
            Some(workdir.unwrap_or_else(|| "arfni-deploy".to_string()))
        } else {
            None
        },
        created_at: created_at.clone(),
        updated_at: created_at.clone(),
        stack_yaml_path: Some(stack_yaml_path),
        description: description.clone(),
        github_repo_url: github_repo_url.clone(),
        github_branch: github_branch.clone(),
        github_access_token: github_access_token.clone(),
    };

    // 데이터베이스에 프로젝트 저장
    let conn = db.get_conn();
    let conn = conn.lock().unwrap();

    conn.execute(
        "INSERT INTO projects (id, name, path, environment, ec2_server_id, mode, workdir, created_at, updated_at, description, stack_yaml_path, github_repo_url, github_branch, github_access_token)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
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
            &project.github_repo_url,
            &project.github_branch,
            &project.github_access_token,
        ],
    ).map_err(|e| format!("프로젝트 DB 저장 실패: {}", e))?;

    // GitHub 프로젝트가 아닌 경우에만 초기 stack.yaml 생성
    if !is_github_project {
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
    }

    println!("✅ 프로젝트 생성 완료: {} (GitHub: {})", name, is_github_project);
    Ok(project)
}

/// 프로젝트 열기 (DB에서 조회)
#[tauri::command]
pub fn open_project(
    db: State<Database>,
    project_id: String,
    app_handle: tauri::AppHandle,
) -> Result<Project, String> {
    let conn = db.get_conn();
    let conn = conn.lock().unwrap();

    let mut stmt = conn.prepare(
        "SELECT id, name, path, environment, ec2_server_id, mode, workdir, created_at, updated_at, description, stack_yaml_path, github_repo_url, github_branch, github_access_token
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
            github_repo_url: row.get(11)?,
            github_branch: row.get(12)?,
            github_access_token: row.get(13)?,
        })
    }).map_err(|e| format!("프로젝트 조회 실패: {}", e))?;

    // GitHub 프로젝트가 아닌 경우에만 폴더 존재 확인
    if project.github_repo_url.is_none() {
        // 프로젝트 폴더 존재 여부 확인
        let project_path = Path::new(&project.path);
        if !project_path.exists() {
            return Err(format!("PROJECT_FOLDER_NOT_FOUND:{}", project.path));
        }

        // .arfni 디렉토리 존재 여부 확인 (ARFNI 프로젝트인지 검증)
        let arfni_path = project_path.join(".arfni");
        if !arfni_path.exists() {
            return Err(format!("PROJECT_FOLDER_NOT_FOUND:{}", project.path));
        }
    }

    // 업데이트 시간 갱신
    let updated_at = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE projects SET updated_at = ?1 WHERE id = ?2",
        params![&updated_at, &project_id],
    ).map_err(|e| format!("업데이트 시간 갱신 실패: {}", e))?;

    // 기존 잠금 파일 해제
    if let Some(lock) = app_handle.try_state::<Mutex<ProjectLock>>() {
        let mut lock_guard = lock.lock().unwrap();
        lock_guard.file = None;
        lock_guard.path = None;
    }

    // GitHub 프로젝트가 아닌 경우에만 잠금 파일 생성
    if project.github_repo_url.is_none() {
        let project_path = Path::new(&project.path);
        let lock_file_path = project_path.join(".arfni").join(".lock");

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::fs::OpenOptionsExt;
        match fs::OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(true)
            .share_mode(0) // Windows에서 배타적 접근 - 다른 프로세스가 파일에 접근하지 못하도록 함
            .open(&lock_file_path)
        {
            Ok(file) => {
                // 잠금 파일을 전역 상태로 저장
                if let Some(lock) = app_handle.try_state::<Mutex<ProjectLock>>() {
                    let mut lock_guard = lock.lock().unwrap();
                    lock_guard.file = Some(file);
                    lock_guard.path = Some(project.path.clone());
                }
            }
            Err(e) => {
                eprintln!("잠금 파일 생성 경고: {}", e);
                // 잠금 파일 생성 실패는 치명적이지 않으므로 계속 진행
            }
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        match fs::OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(true)
            .open(&lock_file_path)
        {
            Ok(file) => {
                // 잠금 파일을 전역 상태로 저장
                if let Some(lock) = app_handle.try_state::<Mutex<ProjectLock>>() {
                    let mut lock_guard = lock.lock().unwrap();
                    lock_guard.file = Some(file);
                    lock_guard.path = Some(project.path.clone());
                }
            }
            Err(e) => {
                eprintln!("잠금 파일 생성 경고: {}", e);
                // 잠금 파일 생성 실패는 치명적이지 않으므로 계속 진행
            }
        }
    }
    }

    Ok(project)
}

/// 프로젝트 경로로 열기 (기존 호환성)
#[tauri::command]
pub fn open_project_by_path(
    db: State<Database>,
    path: String,
    app_handle: tauri::AppHandle,
) -> Result<Project, String> {
    let conn = db.get_conn();
    let conn = conn.lock().unwrap();

    let mut stmt = conn.prepare(
        "SELECT id, name, path, environment, ec2_server_id, mode, workdir, created_at, updated_at, description, stack_yaml_path, github_repo_url, github_branch, github_access_token
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
            github_repo_url: row.get(11)?,
            github_branch: row.get(12)?,
            github_access_token: row.get(13)?,
        })
    }).map_err(|e| format!("프로젝트 조회 실패: {}", e))?;

    // GitHub 프로젝트가 아닌 경우에만 폴더 존재 확인
    if project.github_repo_url.is_none() {
        // 프로젝트 폴더 존재 여부 확인
        let project_path = Path::new(&project.path);
        if !project_path.exists() {
            return Err(format!("PROJECT_FOLDER_NOT_FOUND:{}", project.path));
        }

        // .arfni 디렉토리 존재 여부 확인 (ARFNI 프로젝트인지 검증)
        let arfni_path = project_path.join(".arfni");
        if !arfni_path.exists() {
            return Err(format!("PROJECT_FOLDER_NOT_FOUND:{}", project.path));
        }
    }

    // 기존 잠금 파일 해제
    if let Some(lock) = app_handle.try_state::<Mutex<ProjectLock>>() {
        let mut lock_guard = lock.lock().unwrap();
        lock_guard.file = None;
        lock_guard.path = None;
    }

    // GitHub 프로젝트가 아닌 경우에만 잠금 파일 생성
    if project.github_repo_url.is_none() {
        let project_path = Path::new(&project.path);
        let lock_file_path = project_path.join(".arfni").join(".lock");

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::fs::OpenOptionsExt;
        match fs::OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(true)
            .share_mode(0) // Windows에서 배타적 접근 - 다른 프로세스가 파일에 접근하지 못하도록 함
            .open(&lock_file_path)
        {
            Ok(file) => {
                // 잠금 파일을 전역 상태로 저장
                if let Some(lock) = app_handle.try_state::<Mutex<ProjectLock>>() {
                    let mut lock_guard = lock.lock().unwrap();
                    lock_guard.file = Some(file);
                    lock_guard.path = Some(project.path.clone());
                }
            }
            Err(e) => {
                eprintln!("잠금 파일 생성 경고: {}", e);
                // 잠금 파일 생성 실패는 치명적이지 않으므로 계속 진행
            }
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        match fs::OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(true)
            .open(&lock_file_path)
        {
            Ok(file) => {
                // 잠금 파일을 전역 상태로 저장
                if let Some(lock) = app_handle.try_state::<Mutex<ProjectLock>>() {
                    let mut lock_guard = lock.lock().unwrap();
                    lock_guard.file = Some(file);
                    lock_guard.path = Some(project.path.clone());
                }
            }
            Err(e) => {
                eprintln!("잠금 파일 생성 경고: {}", e);
                // 잠금 파일 생성 실패는 치명적이지 않으므로 계속 진행
            }
        }
    }
    }

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
    // DB에서 프로젝트가 GitHub 프로젝트인지 확인
    let conn = db.get_conn();
    let conn = conn.lock().unwrap();

    let mut stmt = conn.prepare(
        "SELECT github_repo_url FROM projects WHERE path = ?1"
    ).map_err(|e| format!("쿼리 준비 실패: {}", e))?;

    let github_url: Option<String> = stmt
        .query_row(params![&project_path], |row| row.get(0))
        .ok();

    drop(stmt);

    // GitHub 프로젝트가 아닌 경우에만 로컬 파일에 저장
    if github_url.is_none() {
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
    }

    // DB에서 프로젝트 업데이트 시간 갱신
    let updated_at = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE projects SET updated_at = ?1 WHERE path = ?2",
        params![&updated_at, &project_path],
    ).map_err(|e| format!("프로젝트 업데이트 실패: {}", e))?;

    Ok(())
}

/// stack.yaml 읽기
#[tauri::command]
pub fn read_stack_yaml(
    db: State<Database>,
    project_path: String
) -> Result<String, String> {
    // DB에서 프로젝트가 GitHub 프로젝트인지 확인
    let conn = db.get_conn();
    let conn = conn.lock().unwrap();

    let mut stmt = conn.prepare(
        "SELECT github_repo_url, name FROM projects WHERE path = ?1"
    ).map_err(|e| format!("쿼리 준비 실패: {}", e))?;

    let project_info: Option<(Option<String>, String)> = stmt
        .query_row(params![&project_path], |row| Ok((row.get(0)?, row.get(1)?)))
        .ok();

    drop(stmt);
    drop(conn);

    // GitHub 프로젝트면 기본 stack.yaml 반환
    if let Some((Some(_github_url), project_name)) = project_info {
        let default_yaml = format!(r#"apiVersion: v0.1
name: {}

targets:
  ec2:
    type: ec2.ssh

services:
  # 서비스를 여기에 추가하세요
"#, project_name);
        return Ok(default_yaml);
    }

    let stack_yaml_path = Path::new(&project_path).join("stack.yaml");

    if !stack_yaml_path.exists() {
        return Err("stack.yaml 파일이 존재하지 않습니다".to_string());
    }

    fs::read_to_string(stack_yaml_path)
        .map_err(|e| format!("stack.yaml 읽기 실패: {}", e))
}

/// Canvas 상태 읽기 (프로젝트 열 때 Canvas 복원용)
#[tauri::command]
pub fn load_canvas_state(
    db: State<Database>,
    project_path: String
) -> Result<StackYamlData, String> {
    // DB에서 프로젝트가 GitHub 프로젝트인지 확인
    let conn = db.get_conn();
    let conn = conn.lock().unwrap();

    let mut stmt = conn.prepare(
        "SELECT github_repo_url FROM projects WHERE path = ?1"
    ).map_err(|e| format!("쿼리 준비 실패: {}", e))?;

    let github_url: Option<String> = stmt
        .query_row(params![&project_path], |row| row.get(0))
        .ok();

    drop(stmt);
    drop(conn);

    // GitHub 프로젝트면 빈 상태 반환 (로컬 파일 없음)
    if github_url.is_some() {
        return Ok(StackYamlData {
            nodes: vec![],
            edges: vec![],
            project_name: String::new(),
            secrets: vec![],
        });
    }

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
        "SELECT id, name, path, environment, ec2_server_id, mode, workdir, created_at, updated_at, description, stack_yaml_path, github_repo_url, github_branch, github_access_token
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
            github_repo_url: row.get(11)?,
            github_branch: row.get(12)?,
            github_access_token: row.get(13)?,
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
        "SELECT id, name, path, environment, ec2_server_id, mode, workdir, created_at, updated_at, description, stack_yaml_path, github_repo_url, github_branch, github_access_token
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
            github_repo_url: row.get(11)?,
            github_branch: row.get(12)?,
            github_access_token: row.get(13)?,
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
        "SELECT id, name, path, environment, ec2_server_id, mode, workdir, created_at, updated_at, description, stack_yaml_path, github_repo_url, github_branch, github_access_token
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
            github_repo_url: row.get(11)?,
            github_branch: row.get(12)?,
            github_access_token: row.get(13)?,
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
        "SELECT p.id, p.name, p.path, p.environment, p.ec2_server_id, p.mode, p.workdir, p.created_at, p.updated_at, p.description, p.stack_yaml_path, p.github_repo_url, p.github_branch, p.github_access_token
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
            github_repo_url: row.get(11)?,
            github_branch: row.get(12)?,
            github_access_token: row.get(13)?,
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

/// 프로젝트 닫기 (잠금 파일 해제)
#[tauri::command]
pub fn close_project(app_handle: tauri::AppHandle) -> Result<(), String> {
    if let Some(lock) = app_handle.try_state::<Mutex<ProjectLock>>() {
        let mut lock_guard = lock.lock().unwrap();

        // 잠금 파일 경로 저장
        if let Some(ref path) = lock_guard.path {
            let lock_file_path = Path::new(path).join(".arfni").join(".lock");

            // 파일 핸들 먼저 해제
            lock_guard.file = None;
            lock_guard.path = None;

            // 잠금 파일 삭제 시도
            if lock_file_path.exists() {
                if let Err(e) = fs::remove_file(&lock_file_path) {
                    eprintln!("잠금 파일 삭제 경고: {}", e);
                }
            }
        } else {
            lock_guard.file = None;
            lock_guard.path = None;
        }
    }

    Ok(())
}

/// 프로젝트 DB에서만 삭제 (파일 시스템은 유지)
#[tauri::command]
pub fn delete_project_from_db_only(db: State<Database>, project_id: String) -> Result<(), String> {
    // DB에서 삭제 (CASCADE로 recent_projects도 자동 삭제됨)
    let conn = db.get_conn();
    let conn = conn.lock().unwrap();

    conn.execute(
        "DELETE FROM projects WHERE id = ?1",
        params![&project_id],
    ).map_err(|e| format!("DB에서 프로젝트 삭제 실패: {}", e))?;

    println!("✅ 프로젝트 DB에서 제거 완료 (파일은 유지): {}", project_id);

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
    app_handle: tauri::AppHandle,
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
    open_project(db, project_id, app_handle)
}

/// 프로젝트 완전 삭제 (파일 시스템에서 삭제 + DB에서 제거)
#[tauri::command]
pub fn delete_project(
    db: State<Database>,
    project_id: String,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    // DB에서 프로젝트 정보 조회 (open_project를 사용하지 않음 - 잠금 파일을 열지 않기 위해)
    let conn = db.get_conn();
    let conn = conn.lock().unwrap();

    let project: Project = conn.query_row(
        "SELECT id, name, path, environment, ec2_server_id, mode, workdir, created_at, updated_at, stack_yaml_path, description
         FROM projects WHERE id = ?1",
        params![&project_id],
        |row| {
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
                stack_yaml_path: row.get(9)?,
                description: row.get(10)?,
            })
        },
    ).map_err(|e| format!("프로젝트를 찾을 수 없습니다: {}", e))?;

    drop(conn); // DB 연결을 먼저 해제

    // 현재 열려있는 프로젝트라면 잠금 파일 핸들 해제
    if let Some(lock) = app_handle.try_state::<Mutex<ProjectLock>>() {
        let mut lock_guard = lock.lock().unwrap();
        if let Some(ref locked_path) = lock_guard.path {
            if locked_path == &project.path {
                // 잠금 파일 핸들 해제
                lock_guard.file = None;
                lock_guard.path = None;
                println!("🔓 프로젝트 잠금 해제: {}", project.path);
            }
        }
    }

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

/// Write content to a file, creating parent directories if needed
#[tauri::command]
pub fn write_file(path: String, content: String) -> Result<(), String> {
    let file_path = Path::new(&path);

    // Create parent directories if they don't exist
    if let Some(parent) = file_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create directories: {}", e))?;
    }

    // Write the file
    fs::write(file_path, content)
        .map_err(|e| format!("Failed to write file: {}", e))?;

    Ok(())
}

/// EC2에서 GitHub 레포지토리 클론
#[tauri::command]
pub async fn clone_github_repo_on_ec2(
    db: State<'_, Database>,
    project_id: String,
    ec2_server_id: String,
) -> Result<String, String> {
    println!("[GitHub Clone] Starting GitHub clone for project: {}", project_id);

    // 프로젝트 정보 조회
    let conn = db.get_conn();
    let conn_lock = conn.lock().unwrap();

    let mut stmt = conn_lock.prepare(
        "SELECT github_repo_url, github_branch, github_access_token, name, workdir
         FROM projects WHERE id = ?1"
    ).map_err(|e| format!("프로젝트 조회 실패: {}", e))?;

    let (repo_url, branch, access_token, project_name, workdir): (Option<String>, Option<String>, Option<String>, String, Option<String>) = stmt
        .query_row(params![&project_id], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?))
        })
        .map_err(|e| format!("프로젝트 정보 조회 실패: {}", e))?;

    drop(stmt);
    drop(conn_lock);

    // GitHub 정보 확인
    let repo_url = repo_url.ok_or("GitHub repository URL not found")?;
    let branch = branch.unwrap_or("main".to_string());
    let access_token = access_token.ok_or("GitHub access token not found")?;
    let workdir = workdir.unwrap_or("arfni-deploy".to_string());

    // EC2 서버 정보 조회
    let conn = db.get_conn();
    let conn_lock = conn.lock().unwrap();

    let mut stmt = conn_lock.prepare(
        "SELECT host, user, pem_path FROM ec2_servers WHERE id = ?1"
    ).map_err(|e| format!("EC2 서버 조회 실패: {}", e))?;

    let (host, user, pem_path): (String, String, String) = stmt
        .query_row(params![&ec2_server_id], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?))
        })
        .map_err(|e| format!("EC2 서버 정보 조회 실패: {}", e))?;

    drop(stmt);
    drop(conn_lock);

    println!("[GitHub Clone] Cloning {} to EC2 {}@{}", repo_url, user, host);

    // 토큰을 포함한 클론 URL 생성
    let clone_url = if repo_url.starts_with("https://github.com/") {
        repo_url.replace("https://github.com/", &format!("https://{}@github.com/", access_token))
    } else {
        format!("https://{}@{}", access_token, repo_url.trim_start_matches("https://"))
    };

    // EC2에서 실행할 명령어들
    let remote_path = format!("~/{}/{}", workdir, project_name);

    let commands = vec![
        // 작업 디렉토리 생성
        format!("mkdir -p ~/{}", workdir),
        // 기존 프로젝트 디렉토리가 있으면 삭제
        format!("rm -rf {}", remote_path),
        // Git clone
        format!("git clone --branch {} {} {}", branch, clone_url, remote_path),
        // .arfni 디렉토리 생성
        format!("mkdir -p {}/.arfni", remote_path),
        format!("mkdir -p {}/.arfni/data", remote_path),
        format!("mkdir -p {}/.arfni/compose", remote_path),
    ];

    // SSH로 명령어 실행
    for (i, cmd) in commands.iter().enumerate() {
        println!("[GitHub Clone] Executing command {}/{}: {}", i + 1, commands.len(), cmd);

        // 토큰이 포함된 명령어는 로그에서 숨김
        let log_cmd = if cmd.contains(&access_token) {
            cmd.replace(&access_token, "***TOKEN***")
        } else {
            cmd.clone()
        };

        let output = std::process::Command::new("ssh")
            .args(&[
                "-i", &pem_path,
                "-o", "StrictHostKeyChecking=no",
                "-o", "UserKnownHostsFile=/dev/null",
                &format!("{}@{}", user, host),
                cmd,
            ])
            .output()
            .map_err(|e| format!("SSH 명령 실행 실패: {}", e))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("명령 실패 ({}): {}", log_cmd, stderr));
        }

        println!("[GitHub Clone] Command {} completed successfully", i + 1);
    }

    println!("[GitHub Clone] ✅ GitHub repository cloned successfully to EC2");
    Ok(format!("Repository cloned to {}", remote_path))
}

/// stack.yaml을 GitHub에 커밋하고 푸시
#[tauri::command]
pub async fn commit_stack_yaml_to_github(
    db: State<'_, Database>,
    project_id: String,
    yaml_content: String,
) -> Result<String, String> {
    println!("[GitHub Commit] Committing stack.yaml for project: {}", project_id);

    // 프로젝트 정보 조회
    let conn = db.get_conn();
    let conn_lock = conn.lock().unwrap();

    let mut stmt = conn_lock.prepare(
        "SELECT github_repo_url, github_branch, github_access_token, name, workdir, ec2_server_id
         FROM projects WHERE id = ?1"
    ).map_err(|e| format!("프로젝트 조회 실패: {}", e))?;

    let (repo_url, branch, access_token, project_name, workdir, ec2_server_id):
        (Option<String>, Option<String>, Option<String>, String, Option<String>, Option<String>) = stmt
        .query_row(params![&project_id], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?, row.get(5)?))
        })
        .map_err(|e| format!("프로젝트 정보 조회 실패: {}", e))?;

    drop(stmt);

    // GitHub 프로젝트가 아니면 에러
    let repo_url = repo_url.ok_or("Not a GitHub project")?;
    let branch = branch.unwrap_or("main".to_string());
    let access_token = access_token.ok_or("GitHub access token not found")?;
    let workdir = workdir.unwrap_or("arfni-deploy".to_string());
    let ec2_server_id = ec2_server_id.ok_or("EC2 server ID not found")?;

    // EC2 서버 정보 조회
    let mut stmt = conn_lock.prepare(
        "SELECT host, user, pem_path FROM ec2_servers WHERE id = ?1"
    ).map_err(|e| format!("EC2 서버 조회 실패: {}", e))?;

    let (host, user, pem_path): (String, String, String) = stmt
        .query_row(params![&ec2_server_id], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?))
        })
        .map_err(|e| format!("EC2 서버 정보 조회 실패: {}", e))?;

    drop(stmt);
    drop(conn_lock);

    let remote_path = format!("~/{}/{}", workdir, project_name);

    println!("[GitHub Commit] Writing stack.yaml to EC2");

    // EC2에 stack.yaml 파일 쓰기 (SSH로 전송)
    let stack_yaml_path = format!("{}/stack.yaml", remote_path);

    // 임시 파일에 yaml_content 저장
    let temp_file = std::env::temp_dir().join(format!("stack_{}.yaml", project_id));
    fs::write(&temp_file, &yaml_content)
        .map_err(|e| format!("임시 파일 쓰기 실패: {}", e))?;

    // SCP로 파일 전송
    let scp_output = std::process::Command::new("scp")
        .args(&[
            "-i", &pem_path,
            "-o", "StrictHostKeyChecking=no",
            "-o", "UserKnownHostsFile=/dev/null",
            temp_file.to_str().unwrap(),
            &format!("{}@{}:{}", user, host, stack_yaml_path),
        ])
        .output()
        .map_err(|e| format!("SCP 명령 실행 실패: {}", e))?;

    // 임시 파일 삭제
    let _ = fs::remove_file(&temp_file);

    if !scp_output.status.success() {
        let stderr = String::from_utf8_lossy(&scp_output.stderr);
        return Err(format!("stack.yaml 전송 실패: {}", stderr));
    }

    println!("[GitHub Commit] stack.yaml uploaded to EC2");

    // Git 명령어들
    let commands = vec![
        format!("cd {} && git config user.email 'arfni@example.com'", remote_path),
        format!("cd {} && git config user.name 'ARFNI'", remote_path),
        format!("cd {} && git add stack.yaml", remote_path),
        format!("cd {} && git diff --staged --quiet || git commit -m 'Update stack.yaml via ARFNI'", remote_path),
        format!("cd {} && git push origin {}", remote_path, branch),
    ];

    // SSH로 Git 명령어 실행
    for (i, cmd) in commands.iter().enumerate() {
        println!("[GitHub Commit] Executing git command {}/{}", i + 1, commands.len());

        let output = std::process::Command::new("ssh")
            .args(&[
                "-i", &pem_path,
                "-o", "StrictHostKeyChecking=no",
                "-o", "UserKnownHostsFile=/dev/null",
                &format!("{}@{}", user, host),
                cmd,
            ])
            .output()
            .map_err(|e| format!("SSH 명령 실행 실패: {}", e))?;

        // git commit 명령은 변경사항이 없으면 실패할 수 있으므로 무시
        if !output.status.success() && !cmd.contains("git commit") {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("Git 명령 실패: {}", stderr));
        }

        println!("[GitHub Commit] Git command {} completed", i + 1);
    }

    println!("[GitHub Commit] ✅ stack.yaml committed and pushed to GitHub");
    Ok("stack.yaml committed successfully".to_string())
}
