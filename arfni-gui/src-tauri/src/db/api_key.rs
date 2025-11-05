use rusqlite::{params, OptionalExtension};
use chrono::Utc;
use uuid::Uuid;

use super::Database;


#[derive(Debug, Clone)]
pub struct ApiKeyMeta {
    pub id: String,
    pub provider: String,
    pub label: String,
    pub created_at: String,
    pub updated_at: String,
    pub last_used_at: Option<String>,
    pub is_active: bool,
}

//추가 or 업데이트
pub fn add_or_update_api_key(
    db: &Database,
    provider: &str,
    label: &str,
    api_key: &str,
    set_active: bool,
)-> anyhow::Result<()>{
    let now = Utc::now().to_rfc2822();
    let id=Uuid::new_v4().to_string();

    let conn_arc = db.get_conn();
    let mut conn = conn_arc.lock().unwrap();
    let tx=conn.transaction()?;

    if set_active {
        tx.execute("UPDATE api_keys SET is_active=0 WHERE provider=?1", [provider])?;
    }
    tx.execute(
        "INSERT INTO api_keys (id, provider, label, api_key, created_at, updated_at, is_active)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
        ON CONFLICT(provider, label)
        DO UPDATE SET
            api_key=excluded.api_key,
            updated_at=excluded.updated_at,
            is_active=CASE WHEN excluded.is_active=1 THEN 1 ELSE api_keys.is_active END",
        rusqlite::params![id, provider, label, api_key, now, now, if set_active { 1 } else { 0 }],
    )?;




    tx.commit()?;
    Ok(())
    
}


//전체 목록 조회
pub fn list(db: &Database)->anyhow::Result<Vec<ApiKeyMeta>>{

    let conn = db.get_conn();
    let conn = conn.lock().unwrap();

    let mut stmt = conn.prepare(
        "SELECT id, provider, label, created_at, updated_at, last_used_at, is_active
         FROM api_keys ORDER BY provider, label",
    )?;

    let rows = stmt.query_map([], |r| {
        Ok(ApiKeyMeta {
            id: r.get(0)?,
            provider: r.get(1)?,
            label: r.get(2)?,
            created_at: r.get(3)?,
            updated_at: r.get(4)?,
            last_used_at: r.get(5)?,
            is_active: r.get::<_, i64>(6)? == 1,
        })
    })?;

    let mut out=Vec::new();
    for row in rows{
        out.push(row?);
    }
    Ok(out)

}

//활성화 된 api 키 조회

pub fn get_active_value(db : &Database,provider: &str)->anyhow::Result<Option<String>>{


    let conn = db.get_conn();
    let conn = conn.lock().unwrap();

    let val : Option<String>= conn.query_row(
        "SELECT api_key FROM api_keys WHERE provider=?1 AND is_active=1 LIMIT 1",
        params![provider],|r| r.get(0),).optional()?;

    if val.is_some() {
        conn.execute(
            "UPDATE api_keys SET last_used_at=?1 WHERE provider=?2 AND is_active=1",
            params![Utc::now().to_rfc3339(), provider],
        )
        .ok();
    }
    Ok(val)
}



//활성화 전환
pub fn set_active(db: &Database, id: &str) -> anyhow::Result<()> {
    let conn = db.get_conn();
    let mut conn = conn.lock().unwrap();
    let tx = conn.transaction()?;

    let provider: String = tx.query_row(
        "SELECT provider FROM api_keys WHERE id=?1",
        params![id],
        |r| r.get(0),
    )?;

    tx.execute("UPDATE api_keys SET is_active=0 WHERE provider=?1", params![&provider])?;
    tx.execute(
        "UPDATE api_keys SET is_active=1, updated_at=?2 WHERE id=?1",
        params![id, Utc::now().to_rfc3339()],
    )?;

    tx.commit()?;
    Ok(())
}

pub fn delete(db:&Database,id: &str)->anyhow::Result<()>{

    let conn=db.get_conn();
    let conn=conn.lock().unwrap();
    conn.execute("DELETE FROM api_keys WHERE id=?1", params![id])?;
    Ok(())
}