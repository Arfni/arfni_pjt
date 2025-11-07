use std::io;
use serde::{Deserialize};
use crate::features::github::{
    clone_full,
};


#[derive(Deserialize)]
pub struct GitParams {
  pub url: String,
  pub dest: String,
}


// remember to call `.manage(MyState::default())`
#[tauri::command]
pub async fn git_clone_full(params : GitParams) -> Result<(), String> {
    // Run potentially long-running git operation off the async executor thread
    let url = params.url;
    let dest = params.dest;
    tauri::async_runtime::spawn_blocking(move || clone_full(&url, &dest))
        .await
        .map_err(|e| format!("failed to join clone task: {}", e))?
        .map_err(|e| e.to_string())
}
