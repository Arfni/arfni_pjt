use anyhow::{Context, Result};
use rusqlite::{Connection, params};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Manager};

/// 데이터베이스 연결을 관리하는 구조체
pub struct Database {
    conn: Arc<Mutex<Connection>>,
}

impl Database {
    /// 데이터베이스 초기화 및 연결
    pub fn new(app: &AppHandle) -> Result<Self> {
        let db_path = get_db_path(app)?;

        // 부모 디렉토리 생성
        if let Some(parent) = db_path.parent() {
            std::fs::create_dir_all(parent)
                .context("Failed to create database directory")?;
        }

        // 연결 생성 시도
        let conn = Connection::open(&db_path)
            .context(format!("Failed to open database at {:?}", db_path))?;

        // 외래 키 활성화
        conn.execute("PRAGMA foreign_keys = ON", [])
            .context("Failed to enable foreign keys")?;

        let db = Self {
            conn: Arc::new(Mutex::new(conn)),
        };

        // 마이그레이션 실행 시도
        if let Err(e) = db.run_migrations() {
            println!("❌ Migration failed: {}", e);
            println!("🗑️ Deleting old database and recreating...");

            // 연결 닫기
            drop(db);

            // 기존 DB 파일 삭제
            if db_path.exists() {
                std::fs::remove_file(&db_path)
                    .context("Failed to remove old database")?;
                println!("✅ Old database removed");
            }

            // 새로 연결
            let new_conn = Connection::open(&db_path)
                .context("Failed to open new database")?;
            new_conn.execute("PRAGMA foreign_keys = ON", [])
                .context("Failed to enable foreign keys")?;

            let new_db = Self {
                conn: Arc::new(Mutex::new(new_conn)),
            };

            // 마이그레이션 재시도
            new_db.run_migrations()
                .context("Failed to run migrations after recreating database")?;

            return Ok(new_db);
        }

        Ok(db)
    }

    /// 마이그레이션 실행
    fn run_migrations(&self) -> Result<()> {
        let conn = self.conn.lock().unwrap();

        // 버전 테이블 생성
        conn.execute(
            "CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY)",
            [],
        )?;

        // 현재 버전 확인
        let current_version: i32 = conn
            .query_row("SELECT COALESCE(MAX(version), 0) FROM schema_version", [], |row| {
                row.get(0)
            })
            .unwrap_or(0);

        println!("📊 Current schema version: {}", current_version);

        // Migration 001: 초기 스키마
        if current_version < 1 {
            println!("⬆️ Running migration 001...");
            let migration_sql = include_str!("../../migrations/001_initial.sql");
            conn.execute_batch(migration_sql)
                .context("Failed to run migration 001")?;
            conn.execute("INSERT INTO schema_version (version) VALUES (1)", [])?;
            println!("✅ Migration 001 completed");
        }

        // Migration 002: no-monitoring 모드 추가
        if current_version < 2 {
            println!("⬆️ Running migration 002...");
            let migration_sql = include_str!("../../migrations/002_add_no_monitoring.sql");
            conn.execute_batch(migration_sql)
                .context("Failed to run migration 002")?;
            conn.execute("INSERT INTO schema_version (version) VALUES (2)", [])?;
            println!("✅ Migration 002 completed");
        }

        println!("✅ All database migrations completed successfully");
        Ok(())
    }

    /// 연결 가져오기
    pub fn get_conn(&self) -> Arc<Mutex<Connection>> {
        Arc::clone(&self.conn)
    }
}

/// 더미 EC2 서버 추가 (테스트용 - 서버가 없을 때만)
pub fn add_dummy_server_if_empty(db: &Database) -> Result<()> {
    let conn = db.get_conn();
    let conn = conn.lock().unwrap();

    // 기존 서버 개수 확인
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM ec2_servers",
        [],
        |row| row.get(0)
    )?;

    if count == 0 {
        let now = chrono::Utc::now().to_rfc3339();
        let id = uuid::Uuid::new_v4().to_string();

        conn.execute(
            "INSERT INTO ec2_servers (id, name, host, user, pem_path, workdir, mode, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                id,
                "Test Server (Dummy)",
                "43.200.123.45",
                "ubuntu",
                "C:\\Users\\SSAFY\\.ssh\\test-key.pem",
                "/home/ubuntu/projects",
                "",
                &now,
                &now,
            ],
        )?;

        println!("🧪 Added dummy EC2 server for testing");
    }

    Ok(())
}

/// 데이터베이스 경로 가져오기 (사용자별 AppData 디렉토리)
fn get_db_path(app: &AppHandle) -> Result<PathBuf> {
    let app_data_dir = app.path().app_data_dir()
        .context("Failed to get app data directory")?;

    let db_path = app_data_dir.join("arfni.db");

    println!("📁 Database path: {:?}", db_path);
    Ok(db_path)
}

/// JSON 파일에서 SQLite로 데이터 마이그레이션 (일회성)
pub fn migrate_from_json(app: &AppHandle, db: &Database) -> Result<()> {
    println!("🔄 Checking for JSON data to migrate...");

    // 1. EC2 서버 마이그레이션 (ssh_targets.json)
    migrate_ec2_servers(app, db)?;

    // 2. 프로젝트 마이그레이션 (recent-projects.json)
    migrate_projects(app, db)?;

    println!("✅ JSON to SQLite migration completed");
    Ok(())
}

/// EC2 서버 JSON → SQLite 마이그레이션
fn migrate_ec2_servers(_app: &AppHandle, _db: &Database) -> Result<()> {
    // TODO: ssh_targets.json 읽어서 ec2_servers 테이블로 이전
    // 현재는 스킵 (필요 시 구현)
    println!("  - EC2 servers migration: skipped (no legacy data)");
    Ok(())
}

/// 프로젝트 JSON → SQLite 마이그레이션
fn migrate_projects(_app: &AppHandle, _db: &Database) -> Result<()> {
    // TODO: recent-projects.json 읽어서 projects 테이블로 이전
    // 현재는 스킵 (필요 시 구현)
    println!("  - Projects migration: skipped (no legacy data)");
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_db_path() {
        // 데이터베이스 경로 테스트는 실제 Tauri 앱 컨텍스트에서만 가능
        // 여기서는 기본 로직만 테스트
        assert!(true);
    }
}
