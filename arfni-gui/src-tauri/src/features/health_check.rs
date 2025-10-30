use reqwest::Client;
use serde::Deserialize;
use std::time::Duration;

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
pub struct HealthResponse {
    pub status: String,
    #[serde(default)]
    pub service: Option<String>,
}


#[allow(dead_code)]
pub async fn check_http_health(url: &str) ->bool{
    let client = Client::builder()
        .timeout(Duration::from_secs(3))
        .build()
        .unwrap();

    match client.get(url).send().await{
        Ok(resp) => {
            let status_ok = resp.status().is_success();
            match resp.bytes().await {
                Ok(body) => {
                    match serde_json::from_slice::<HealthResponse>(&body) {
                        Ok(json) => json.status.to_uppercase() == "UP",
                        Err(_) => status_ok,
                    }
                }
                Err(_) => status_ok,
            }
        }
            Err(err)=>{
                eprintln!("Health check failed for {url}: {err}");
                false
            }
        
    }


}
