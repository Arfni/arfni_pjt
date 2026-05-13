use tauri::State;
use serde::{Deserialize, Serialize};

use crate::db::{Database};
use crate::db::api_key as repo;

#[derive(Serialize)]
pub struct ApiKeyMetaDto {
  pub id: String,
  pub provider: String,
  pub label: String,
  pub created_at: String,
  pub updated_at: String,
  pub last_used_at: Option<String>,
  pub is_active: bool,
}

impl From<repo::ApiKeyMeta> for ApiKeyMetaDto {
  fn from(v: repo::ApiKeyMeta) -> Self {
    Self {
      id: v.id, provider: v.provider, label: v.label,
      created_at: v.created_at, updated_at: v.updated_at,
      last_used_at: v.last_used_at, is_active: v.is_active
    }
  }
}

#[derive(Deserialize)]
pub struct AddKeyParams {
  pub provider: String,
  pub label: String,
  pub api_key: String,
  pub set_active: bool,
}

#[tauri::command]
pub fn add_api_key(db :State<Database>, params:AddKeyParams)->Result<(),String>{
  repo::add_or_update_api_key(&db, &params.provider, &params.label, &params.api_key, params.set_active)
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_api_keys(db: State<Database>) -> Result<Vec<ApiKeyMetaDto>, String> {
  repo::list(&db).map(|v| v.into_iter().map(Into::into).collect()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_api_key(db: State<Database>, id: String) -> Result<(), String> {
  repo::delete(&db, &id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_active_api_key(db: State<Database>, id: String) -> Result<(), String> {
  repo::set_active(&db, &id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_active_api_key(db: State<Database>, provider: String) -> Result<Option<String>, String> {
  repo::get_active_value(&db, &provider).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn deactivate_all_api_keys(db: State<Database>) -> Result<(), String> {
  repo::deactivate_all(&db).map_err(|e| e.to_string())
}