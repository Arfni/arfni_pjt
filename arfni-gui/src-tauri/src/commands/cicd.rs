use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};
use std::process::Command;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Repository {
    pub id: String,
    pub name: String,
    #[serde(rename = "fullName")]
    pub full_name: String,
    pub url: String,
    #[serde(rename = "defaultBranch")]
    pub default_branch: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CICDConfiguration {
    pub platform: String,
    #[serde(rename = "repositoryUrl")]
    pub repository_url: String,
    pub branch: String,
    pub framework: String,
    #[serde(rename = "javaVersion")]
    pub java_version: Option<String>,
    #[serde(rename = "nodeVersion")]
    pub node_version: Option<String>,
    #[serde(rename = "pythonVersion")]
    pub python_version: Option<String>,
    #[serde(rename = "ec2Host")]
    pub ec2_host: String,
    #[serde(rename = "ec2User")]
    pub ec2_user: String,
    #[serde(rename = "deployRoot")]
    pub deploy_root: String,
    #[serde(rename = "dockerService")]
    pub docker_service: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct AuthResult {
    pub token: String,
    pub user: String,
}

/// Authenticate with GitHub using OAuth or token
#[tauri::command]
pub async fn authenticate_github(
    _app: AppHandle,
    method: String,
) -> Result<AuthResult, String> {
    if method == "oauth" {
        // For OAuth flow, we would need to:
        // 1. Start a local HTTP server to receive the callback
        // 2. Open the browser with GitHub OAuth URL
        // 3. Wait for the callback with the code
        // 4. Exchange the code for an access token

        // For now, return an error as full OAuth implementation requires additional setup
        Err("OAuth authentication requires additional setup. Please use personal access token for now.".to_string())
    } else {
        Err("Token authentication should be handled on the frontend".to_string())
    }
}

/// Fetch user repositories from GitHub
#[tauri::command]
pub async fn fetch_github_repositories(
    token: String,
) -> Result<Vec<Repository>, String> {
    let client = reqwest::Client::new();
    let response = client
        .get("https://api.github.com/user/repos")
        .header("Authorization", format!("Bearer {}", token))
        .header("User-Agent", "ARFNI-App")
        .header("Accept", "application/vnd.github+json")
        .query(&[("per_page", "100"), ("sort", "updated")])
        .send()
        .await
        .map_err(|e| format!("Failed to fetch repositories: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("GitHub API error: {}", response.status()));
    }

    let repos: Vec<serde_json::Value> = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    let parsed_repos = repos
        .iter()
        .filter_map(|repo| {
            Some(Repository {
                id: repo["id"].as_u64()?.to_string(),
                name: repo["name"].as_str()?.to_string(),
                full_name: repo["full_name"].as_str()?.to_string(),
                url: repo["html_url"].as_str()?.to_string(),
                default_branch: repo["default_branch"].as_str().unwrap_or("main").to_string(),
            })
        })
        .collect();

    Ok(parsed_repos)
}

/// Setup CI/CD pipeline
#[tauri::command]
pub async fn setup_cicd(
    app: AppHandle,
    config: CICDConfiguration,
    access_token: String,
    ssh_key: String,
) -> Result<String, String> {
    println!("[CI/CD] Starting CI/CD setup for {}", config.repository_url);

    // 1. Create temp directory for git operations
    let temp_dir = std::env::temp_dir().join(format!("arfni-cicd-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&temp_dir)
        .map_err(|e| format!("Failed to create temp dir: {}", e))?;

    println!("[CI/CD] Created temp directory: {:?}", temp_dir);

    // 2. Clone repository (shallow clone for speed)
    let clone_url = if config.repository_url.starts_with("https://github.com/") {
        config.repository_url.replace("https://github.com/", &format!("https://{}@github.com/", access_token))
    } else {
        format!("https://{}@{}", access_token, config.repository_url.trim_start_matches("https://"))
    };

    println!("[CI/CD] Cloning repository...");
    let clone_output = Command::new("git")
        .args(&[
            "clone",
            "--depth",
            "1",
            "--branch",
            &config.branch,
            &clone_url,
            temp_dir.to_str().unwrap(),
        ])
        .output()
        .map_err(|e| format!("Failed to execute git clone: {}", e))?;

    if !clone_output.status.success() {
        let error_msg = String::from_utf8_lossy(&clone_output.stderr);
        return Err(format!("Git clone failed: {}", error_msg));
    }

    println!("[CI/CD] Repository cloned successfully");

    // 3. Load and render template
    let template_content = load_template(&app, &config.framework)?;
    println!("[CI/CD] Loaded template for framework: {}", config.framework);

    let rendered = render_template(&template_content, &config)?;
    println!("[CI/CD] Template rendered successfully");

    // 4. Write workflow file
    let workflow_dir = temp_dir.join(".github").join("workflows");
    std::fs::create_dir_all(&workflow_dir)
        .map_err(|e| format!("Failed to create workflow dir: {}", e))?;

    let workflow_path = workflow_dir.join("deploy.yml");
    std::fs::write(&workflow_path, rendered)
        .map_err(|e| format!("Failed to write workflow file: {}", e))?;

    println!("[CI/CD] Workflow file written to {:?}", workflow_path);

    // 5. Configure git user (required for commit)
    Command::new("git")
        .current_dir(&temp_dir)
        .args(&["config", "user.email", "arfni@example.com"])
        .output()
        .map_err(|e| format!("Failed to set git user email: {}", e))?;

    Command::new("git")
        .current_dir(&temp_dir)
        .args(&["config", "user.name", "ARFNI"])
        .output()
        .map_err(|e| format!("Failed to set git user name: {}", e))?;

    // 6. Stage the workflow file
    let add_output = Command::new("git")
        .current_dir(&temp_dir)
        .args(&["add", ".github/workflows/deploy.yml"])
        .output()
        .map_err(|e| format!("Git add failed: {}", e))?;

    if !add_output.status.success() {
        return Err("Failed to stage workflow file".to_string());
    }

    println!("[CI/CD] Workflow file staged");

    // 7. Commit
    let commit_msg = format!(
        "feat: add ARFNI CI/CD workflow for {}\n\nAutomatically generated by ARFNI\nFramework: {}\nBranch: {}",
        config.framework,
        config.framework,
        config.branch
    );

    let commit_output = Command::new("git")
        .current_dir(&temp_dir)
        .args(&["commit", "-m", &commit_msg])
        .output()
        .map_err(|e| format!("Git commit failed: {}", e))?;

    if !commit_output.status.success() {
        let error_msg = String::from_utf8_lossy(&commit_output.stderr);
        return Err(format!("Failed to commit workflow file: {}", error_msg));
    }

    println!("[CI/CD] Changes committed");

    // 8. Push to remote
    let push_output = Command::new("git")
        .current_dir(&temp_dir)
        .args(&["push", "origin", &config.branch])
        .output()
        .map_err(|e| format!("Git push failed: {}", e))?;

    if !push_output.status.success() {
        let error_msg = String::from_utf8_lossy(&push_output.stderr);
        return Err(format!("Git push failed: {}", error_msg));
    }

    println!("[CI/CD] Changes pushed to remote");

    // 9. Configure GitHub Secrets
    let repo_full_name = extract_repo_name(&config.repository_url)?;
    configure_github_secrets(
        &access_token,
        &repo_full_name,
        &config.ec2_host,
        &config.ec2_user,
        &ssh_key,
    ).await?;

    println!("[CI/CD] GitHub Secrets configured");

    // 10. Cleanup
    std::fs::remove_dir_all(&temp_dir).ok();
    println!("[CI/CD] Cleanup completed");

    Ok(format!("CI/CD setup completed successfully for {}", config.repository_url))
}

/// Load template from bundled resources
fn load_template(app: &AppHandle, framework: &str) -> Result<String, String> {
    let template_name = match framework {
        "springboot" => "springboot.yml.tmpl",
        "nodejs" => "nodejs.yml.tmpl",
        "react" => "react.yml.tmpl",
        "nextjs" => "nextjs.yml.tmpl",
        "python" | "fastapi" | "flask" => "python.yml.tmpl",
        _ => return Err(format!("Unsupported framework: {}", framework)),
    };

    // Try to load from resource directory
    let resource_path = app
        .path()
        .resource_dir()
        .map_err(|e| format!("Failed to get resource dir: {}", e))?
        .join("plugins")
        .join("bundled")
        .join("cicd")
        .join(template_name);

    if resource_path.exists() {
        std::fs::read_to_string(&resource_path)
            .map_err(|e| format!("Failed to read template: {}", e))
    } else {
        // TODO: FIX PATH - 템플릿 파일 경로를 올바르게 설정해야 함
        // 현재는 개발 환경 임시 경로를 사용중
        // 배포 시에는 resource_path에 템플릿 파일들을 번들링해야 함
        // Fallback: try the github-actions templates directory
        let fallback_path = PathBuf::from("C:\\Users\\SSAFY\\Desktop\\github-actions\\templates")
            .join(template_name);

        if fallback_path.exists() {
            std::fs::read_to_string(&fallback_path)
                .map_err(|e| format!("Failed to read template from fallback: {}", e))
        } else {
            Err(format!("Template not found: {}. Checked paths: {:?} and {:?}",
                template_name, resource_path, fallback_path))
        }
    }
}

/// Render template with configuration values
fn render_template(template: &str, config: &CICDConfiguration) -> Result<String, String> {
    let mut rendered = template.to_string();

    // Replace common variables
    rendered = rendered.replace("{{ .branch }}", &config.branch);
    rendered = rendered.replace("{{ .deploy_root }}", &config.deploy_root);
    rendered = rendered.replace("{{ .docker_service }}", &config.docker_service);

    // Framework-specific replacements
    match config.framework.as_str() {
        "springboot" => {
            let java_version = config.java_version.as_deref().unwrap_or("17");
            rendered = rendered.replace("{{ .java_version }}", java_version);
        }
        "nodejs" | "react" | "nextjs" => {
            let node_version = config.node_version.as_deref().unwrap_or("20");
            rendered = rendered.replace("{{ .node_version }}", node_version);
        }
        "python" | "fastapi" | "flask" => {
            let python_version = config.python_version.as_deref().unwrap_or("3.11");
            rendered = rendered.replace("{{ .python_version }}", python_version);
        }
        _ => {}
    }

    Ok(rendered)
}

/// Extract repository owner/name from URL
fn extract_repo_name(url: &str) -> Result<String, String> {
    // Example: https://github.com/owner/repo -> owner/repo
    let parts: Vec<&str> = url.trim_end_matches('/').split('/').collect();
    if parts.len() < 2 {
        return Err("Invalid repository URL".to_string());
    }

    let owner = parts.get(parts.len() - 2)
        .ok_or("Invalid repository URL")?;
    let repo = parts.last()
        .ok_or("Invalid repository URL")?
        .trim_end_matches(".git");

    Ok(format!("{}/{}", owner, repo))
}

/// Configure GitHub repository secrets
async fn configure_github_secrets(
    token: &str,
    repo_full_name: &str,  // format: "owner/repo"
    ec2_host: &str,
    ec2_user: &str,
    ssh_key: &str,
) -> Result<(), String> {
    println!("[CI/CD] Configuring GitHub Secrets for {}", repo_full_name);

    // Get repository public key for encryption
    let client = reqwest::Client::new();
    let public_key_url = format!(
        "https://api.github.com/repos/{}/actions/secrets/public-key",
        repo_full_name
    );

    let pub_key_response = client
        .get(&public_key_url)
        .header("Authorization", format!("Bearer {}", token))
        .header("User-Agent", "ARFNI-App")
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .map_err(|e| format!("Failed to get public key: {}", e))?;

    if !pub_key_response.status().is_success() {
        return Err(format!("Failed to get public key: {}", pub_key_response.status()));
    }

    let pub_key: serde_json::Value = pub_key_response
        .json()
        .await
        .map_err(|e| format!("Failed to parse public key: {}", e))?;

    let key = pub_key["key"].as_str().ok_or("Invalid public key")?;
    let key_id = pub_key["key_id"].as_str().ok_or("Invalid key ID")?;

    // Set secrets
    let secrets = vec![
        ("EC2_HOST", ec2_host),
        ("EC2_USER", ec2_user),
        ("EC2_SSH_KEY", ssh_key),
    ];

    for (secret_name, secret_value) in secrets {
        println!("[CI/CD] Setting secret: {}", secret_name);

        let encrypted = encrypt_secret(secret_value, key)?;

        let secret_url = format!(
            "https://api.github.com/repos/{}/actions/secrets/{}",
            repo_full_name, secret_name
        );

        let payload = serde_json::json!({
            "encrypted_value": encrypted,
            "key_id": key_id,
        });

        let response = client
            .put(&secret_url)
            .header("Authorization", format!("Bearer {}", token))
            .header("User-Agent", "ARFNI-App")
            .header("Accept", "application/vnd.github+json")
            .json(&payload)
            .send()
            .await
            .map_err(|e| format!("Failed to set secret {}: {}", secret_name, e))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(format!("Failed to set secret {}: {} - {}", secret_name, status, body));
        }

        println!("[CI/CD] Secret {} configured successfully", secret_name);
    }

    Ok(())
}

/// Encrypt secret using libsodium (GitHub requires this)
fn encrypt_secret(secret: &str, public_key_base64: &str) -> Result<String, String> {
    use sodiumoxide::crypto::sealedbox;
    use sodiumoxide::crypto::box_::PublicKey;
    use sodiumoxide::base64;

    sodiumoxide::init().map_err(|_| "Failed to initialize sodiumoxide")?;

    // Decode the public key
    let public_key_bytes = base64::decode(public_key_base64, base64::Variant::Original)
        .map_err(|_| "Failed to decode public key")?;

    let public_key = PublicKey::from_slice(&public_key_bytes)
        .ok_or("Invalid public key")?;

    // Encrypt the secret using sealed box (anonymous encryption)
    let encrypted = sealedbox::seal(secret.as_bytes(), &public_key);

    // Encode to base64
    Ok(base64::encode(encrypted, base64::Variant::Original))
}
