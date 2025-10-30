use serde::{Deserialize, Serialize};
use anyhow::Result;
use tauri::State;
use rusqlite::params;
use crate::db::Database;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct EC2Server {
    pub id: String,
    pub name: String,
    pub host: String,
    pub user: String,
    pub pem_path: String,
    pub created_at: String,
    pub updated_at: String,
    pub last_connected_at: Option<String>,
}

#[derive(Deserialize)]
pub struct SshSimpleParams {
    pub host: String,
    pub user: String,
    pub pem_path: String,
    pub cmd: String,
}

#[derive(Deserialize)]
pub struct CreateEC2ServerParams {
    pub name: String,
    pub host: String,
    pub user: String,
    pub pem_path: String,
}

#[derive(Deserialize)]
pub struct UpdateEC2ServerParams {
    pub id: String,
    pub name: Option<String>,
    pub host: Option<String>,
    pub user: Option<String>,
    pub pem_path: Option<String>,
}

#[derive(Deserialize)]
pub struct DeletePayload {
    pub host: String,
    pub user: String,
}

// ============================================
// EC2 단일 커맨드 호출 (기존 유지)
// ============================================
#[tauri::command]
pub async fn ssh_exec_system(params: SshSimpleParams) -> Result<String, String> {
    crate::features::ssh_exec::exec_once_via_system_ssh(
        &params.host,
        &params.user,
        &params.pem_path,
        &params.cmd,
    )
    .map_err(|e| e.to_string())
}

// ============================================
// EC2 서버 관리 (SQLite 기반)
// ============================================

/// EC2 서버 생성
#[tauri::command]
pub fn create_ec2_server(db: State<Database>, params: CreateEC2ServerParams) -> Result<EC2Server, String> {
    let server_id = uuid::Uuid::new_v4().to_string();
    let created_at = chrono::Utc::now().to_rfc3339();

    let server = EC2Server {
        id: server_id.clone(),
        name: params.name.clone(),
        host: params.host.clone(),
        user: params.user.clone(),
        pem_path: params.pem_path.clone(),
        created_at: created_at.clone(),
        updated_at: created_at.clone(),
        last_connected_at: None,
    };

    let conn = db.get_conn();
    let conn = conn.lock().unwrap();

    conn.execute(
        "INSERT INTO ec2_servers (id, name, host, user, pem_path, created_at, updated_at, last_connected_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![
            &server.id,
            &server.name,
            &server.host,
            &server.user,
            &server.pem_path,
            &server.created_at,
            &server.updated_at,
            &server.last_connected_at,
        ],
    )
    .map_err(|e| {
        if e.to_string().contains("UNIQUE constraint failed") {
            format!("이미 존재하는 서버입니다: {}@{}", params.user, params.host)
        } else {
            format!("EC2 서버 생성 실패: {}", e)
        }
    })?;

    Ok(server)
}

/// 모든 EC2 서버 조회
#[tauri::command]
pub fn get_all_ec2_servers(db: State<Database>) -> Result<Vec<EC2Server>, String> {
    let conn = db.get_conn();
    let conn = conn.lock().unwrap();

    let mut stmt = conn
        .prepare(
            "SELECT id, name, host, user, pem_path, created_at, updated_at, last_connected_at
             FROM ec2_servers ORDER BY updated_at DESC",
        )
        .map_err(|e| format!("쿼리 준비 실패: {}", e))?;

    let servers = stmt
        .query_map([], |row| {
            Ok(EC2Server {
                id: row.get(0)?,
                name: row.get(1)?,
                host: row.get(2)?,
                user: row.get(3)?,
                pem_path: row.get(4)?,
                created_at: row.get(5)?,
                updated_at: row.get(6)?,
                last_connected_at: row.get(7)?,
            })
        })
        .map_err(|e| format!("EC2 서버 조회 실패: {}", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("EC2 서버 목록 변환 실패: {}", e))?;

    Ok(servers)
}

/// ID로 EC2 서버 조회
#[tauri::command]
pub fn get_ec2_server_by_id(db: State<Database>, server_id: String) -> Result<EC2Server, String> {
    let conn = db.get_conn();
    let conn = conn.lock().unwrap();

    let mut stmt = conn
        .prepare(
            "SELECT id, name, host, user, pem_path, created_at, updated_at, last_connected_at
             FROM ec2_servers WHERE id = ?1",
        )
        .map_err(|e| format!("쿼리 준비 실패: {}", e))?;

    let server = stmt
        .query_row(params![&server_id], |row| {
            Ok(EC2Server {
                id: row.get(0)?,
                name: row.get(1)?,
                host: row.get(2)?,
                user: row.get(3)?,
                pem_path: row.get(4)?,
                created_at: row.get(5)?,
                updated_at: row.get(6)?,
                last_connected_at: row.get(7)?,
            })
        })
        .map_err(|e| format!("EC2 서버 조회 실패: {}", e))?;

    Ok(server)
}

/// EC2 서버 업데이트
#[tauri::command]
pub fn update_ec2_server(db: State<Database>, params: UpdateEC2ServerParams) -> Result<EC2Server, String> {
    let conn = db.get_conn();
    let conn = conn.lock().unwrap();

    let updated_at = chrono::Utc::now().to_rfc3339();

    // 개별 필드를 직접 업데이트
    if let Some(name) = &params.name {
        conn.execute("UPDATE ec2_servers SET name = ?1, updated_at = ?2 WHERE id = ?3",
            params![name, &updated_at, &params.id])
            .map_err(|e| format!("서버 업데이트 실패: {}", e))?;
    }
    if let Some(host) = &params.host {
        conn.execute("UPDATE ec2_servers SET host = ?1, updated_at = ?2 WHERE id = ?3",
            params![host, &updated_at, &params.id])
            .map_err(|e| format!("서버 업데이트 실패: {}", e))?;
    }
    if let Some(user) = &params.user {
        conn.execute("UPDATE ec2_servers SET user = ?1, updated_at = ?2 WHERE id = ?3",
            params![user, &updated_at, &params.id])
            .map_err(|e| format!("서버 업데이트 실패: {}", e))?;
    }
    if let Some(pem_path) = &params.pem_path {
        conn.execute("UPDATE ec2_servers SET pem_path = ?1, updated_at = ?2 WHERE id = ?3",
            params![pem_path, &updated_at, &params.id])
            .map_err(|e| format!("서버 업데이트 실패: {}", e))?;
    }

    // 업데이트된 서버 조회
    drop(conn);
    get_ec2_server_by_id(db, params.id)
}

/// EC2 서버 삭제
#[tauri::command]
pub fn delete_ec2_server(db: State<Database>, server_id: String) -> Result<(), String> {
    let conn = db.get_conn();
    let conn = conn.lock().unwrap();

    let rows_affected = conn
        .execute("DELETE FROM ec2_servers WHERE id = ?1", params![&server_id])
        .map_err(|e| format!("EC2 서버 삭제 실패: {}", e))?;

    if rows_affected == 0 {
        return Err("존재하지 않는 서버입니다".to_string());
    }

    Ok(())
}

/// 마지막 접속 시간 업데이트
#[tauri::command]
pub fn update_ec2_server_last_connected(db: State<Database>, server_id: String) -> Result<(), String> {
    let conn = db.get_conn();
    let conn = conn.lock().unwrap();

    let last_connected_at = chrono::Utc::now().to_rfc3339();

    conn.execute(
        "UPDATE ec2_servers SET last_connected_at = ?1 WHERE id = ?2",
        params![&last_connected_at, &server_id],
    )
    .map_err(|e| format!("마지막 접속 시간 업데이트 실패: {}", e))?;

    Ok(())
}

// ============================================
// 레거시 함수 (호환성 유지)
// ============================================

/// 레거시: SSH 추가 (내부적으로 create_ec2_server 호출)
#[tauri::command]
pub fn ec2_add_entry(db: State<Database>, params: CreateEC2ServerParams) -> Result<(), String> {
    create_ec2_server(db, params)?;
    Ok(())
}

/// 레거시: SSH 목록 조회 (EC2Server를 SshParams 형태로 변환)
#[tauri::command]
pub fn ec2_read_entry(db: State<Database>) -> Result<Vec<crate::features::ssh_exec::SshParams>, String> {
    let servers = get_all_ec2_servers(db)?;

    let ssh_params = servers
        .into_iter()
        .map(|server| crate::features::ssh_exec::SshParams {
            host: server.host,
            user: server.user,
            pem_path: server.pem_path,
        })
        .collect();

    Ok(ssh_params)
}

/// 레거시: host + user로 서버 삭제
#[tauri::command]
pub fn ec2_delete_entry(db: State<Database>, params: DeletePayload) -> Result<bool, String> {
    let conn = db.get_conn();
    let conn = conn.lock().unwrap();

    let rows_affected = conn
        .execute(
            "DELETE FROM ec2_servers WHERE host = ?1 AND user = ?2",
            params![&params.host, &params.user],
        )
        .map_err(|e| format!("EC2 서버 삭제 실패: {}", e))?;

    Ok(rows_affected > 0)
}
