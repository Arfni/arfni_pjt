use crate::features::health_check::{
    check_http_health,
};


// remember to call `.manage(MyState::default())`
#[tauri::command]
pub async fn check_health(url:String)->bool{
    check_http_health(&url).await

}
