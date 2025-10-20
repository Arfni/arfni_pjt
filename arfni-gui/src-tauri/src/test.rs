use tauri::command;
use serde::Serialize;

#[derive(Serialize)]
pub struct HelloResponse {
    pub msg: String,
}

#[command]
pub fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[command]
pub fn hello() -> HelloResponse {
    HelloResponse {
        msg: "Hi there! This is a message from Rust 🎯".to_string(),
    }
}
