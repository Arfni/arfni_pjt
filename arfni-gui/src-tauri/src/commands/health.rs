use crate::features::health_check::{
    check_http_health,
};


#[tauri::command]
pub async fn check_health(url:String)->bool{
    check_http_health(&url).await

}
