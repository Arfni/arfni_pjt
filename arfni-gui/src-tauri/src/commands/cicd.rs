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

    // 6. Check git status to see if there are changes
    let status_output = Command::new("git")
        .current_dir(&temp_dir)
        .args(&["status", "--porcelain"])
        .output()
        .map_err(|e| format!("Git status failed: {}", e))?;

    let status_output_str = String::from_utf8_lossy(&status_output.stdout);
    println!("[CI/CD] Git status:\n{}", status_output_str);

    // 7. Stage the workflow file
    let add_output = Command::new("git")
        .current_dir(&temp_dir)
        .args(&["add", ".github/workflows/deploy.yml"])
        .output()
        .map_err(|e| format!("Git add failed: {}", e))?;

    if !add_output.status.success() {
        let error_msg = String::from_utf8_lossy(&add_output.stderr);
        return Err(format!("Failed to stage workflow file: {}", error_msg));
    }

    println!("[CI/CD] Workflow file staged");

    // 8. Commit (skip if no changes)
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
        let stdout_msg = String::from_utf8_lossy(&commit_output.stdout);

        // Check if it's just "nothing to commit" (workflow already exists)
        if error_msg.contains("nothing to commit") || error_msg.contains("no changes added") {
            println!("[CI/CD] ⚠️ Workflow file already exists and is up to date, skipping commit");
        } else {
            println!("[CI/CD] ❌ Commit stderr: {}", error_msg);
            println!("[CI/CD] ❌ Commit stdout: {}", stdout_msg);
            return Err(format!("Failed to commit workflow file: {}", error_msg));
        }
    } else {
        println!("[CI/CD] Changes committed");
    }

    // 9. Push to remote (only if there were changes)
    let push_output = Command::new("git")
        .current_dir(&temp_dir)
        .args(&["push", "origin", &config.branch])
        .output()
        .map_err(|e| format!("Git push failed: {}", e))?;

    if !push_output.status.success() {
        let error_msg = String::from_utf8_lossy(&push_output.stderr);
        let stdout_msg = String::from_utf8_lossy(&push_output.stdout);

        // Check if it's just "everything up-to-date"
        if error_msg.contains("Everything up-to-date") || stdout_msg.contains("Everything up-to-date") {
            println!("[CI/CD] ⚠️ Repository already up to date, no push needed");
        } else {
            println!("[CI/CD] ❌ Push stderr: {}", error_msg);
            println!("[CI/CD] ❌ Push stdout: {}", stdout_msg);
            return Err(format!("Git push failed: {}", error_msg));
        }
    } else {
        println!("[CI/CD] Changes pushed to remote");
    }

    // 10. Configure GitHub Secrets
    println!("[CI/CD] Configuring GitHub Secrets...");
    let repo_full_name = extract_repo_name(&config.repository_url)?;
    println!("[CI/CD] Repository: {}", repo_full_name);
    println!("[CI/CD] EC2 Host: {}", config.ec2_host);
    println!("[CI/CD] EC2 User: {}", config.ec2_user);
    println!("[CI/CD] SSH Key length: {} bytes", ssh_key.len());

    match configure_github_secrets(
        &access_token,
        &repo_full_name,
        &config.ec2_host,
        &config.ec2_user,
        &ssh_key,
    ).await {
        Ok(_) => println!("[CI/CD] ✅ GitHub Secrets configured successfully"),
        Err(e) => {
            println!("[CI/CD] ❌ Failed to configure GitHub Secrets: {}", e);
            return Err(format!("Failed to configure GitHub Secrets: {}", e));
        }
    }

    // 11. Cleanup
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
        println!("[CI/CD] Setting secret: {} (value length: {} bytes)", secret_name, secret_value.len());

        // Debug: Print first and last line of SSH key (for debugging)
        if secret_name == "EC2_SSH_KEY" {
            let lines: Vec<&str> = secret_value.lines().collect();
            if !lines.is_empty() {
                println!("[CI/CD] SSH Key first line: {}", lines.first().unwrap_or(&""));
                println!("[CI/CD] SSH Key last line: {}", lines.last().unwrap_or(&""));
                println!("[CI/CD] SSH Key total lines: {}", lines.len());
            }
        }

        let encrypted = encrypt_secret(secret_value, key)?;
        println!("[CI/CD] Secret {} encrypted successfully (encrypted length: {} bytes)", secret_name, encrypted.len());

        let secret_url = format!(
            "https://api.github.com/repos/{}/actions/secrets/{}",
            repo_full_name, secret_name
        );

        let payload = serde_json::json!({
            "encrypted_value": encrypted,
            "key_id": key_id,
        });

        println!("[CI/CD] Sending PUT request to: {}", secret_url);

        let response = client
            .put(&secret_url)
            .header("Authorization", format!("Bearer {}", token))
            .header("User-Agent", "ARFNI-App")
            .header("Accept", "application/vnd.github+json")
            .json(&payload)
            .send()
            .await
            .map_err(|e| format!("Failed to set secret {}: {}", secret_name, e))?;

        let status = response.status();
        println!("[CI/CD] Response status for {}: {}", secret_name, status);

        if !status.is_success() {
            let body = response.text().await.unwrap_or_default();
            println!("[CI/CD] ❌ Error response body: {}", body);
            return Err(format!("Failed to set secret {}: {} - {}", secret_name, status, body));
        }

        println!("[CI/CD] ✅ Secret {} configured successfully", secret_name);
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

/// Update only the workflow file (without touching secrets)
#[tauri::command]
pub async fn update_workflow_file(
    app: AppHandle,
    config: CICDConfiguration,
    access_token: String,
) -> Result<String, String> {
    println!("[CI/CD] Updating workflow file for {}", config.repository_url);

    // 1. Load and render template
    let template_content = load_template(&app, &config.framework)?;
    println!("[CI/CD] Loaded template for framework: {}", config.framework);

    let rendered = render_template(&template_content, &config)?;
    println!("[CI/CD] Template rendered successfully");

    // 2. Get repository info
    let repo_full_name = extract_repo_name(&config.repository_url)?;
    println!("[CI/CD] Repository: {}", repo_full_name);

    // 3. Get current file SHA (required for update)
    let client = reqwest::Client::new();
    let file_url = format!(
        "https://api.github.com/repos/{}/contents/.github/workflows/deploy.yml",
        repo_full_name
    );

    let get_response = client
        .get(&file_url)
        .header("Authorization", format!("Bearer {}", access_token))
        .header("User-Agent", "ARFNI-App")
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .map_err(|e| format!("Failed to get current workflow file: {}", e))?;

    #[derive(Deserialize)]
    struct GitHubFile {
        sha: String,
    }

    let current_file: GitHubFile = if get_response.status().is_success() {
        get_response
            .json()
            .await
            .map_err(|e| format!("Failed to parse response: {}", e))?
    } else {
        return Err("Workflow file not found. Please run 'Setup CI/CD' first.".to_string());
    };

    println!("[CI/CD] Current file SHA: {}", current_file.sha);

    // 4. Update file via GitHub API
    use sodiumoxide::base64;
    let encoded_content = base64::encode(rendered.as_bytes(), base64::Variant::Original);

    #[derive(Serialize)]
    struct UpdateFileRequest {
        message: String,
        content: String,
        sha: String,
        branch: String,
    }

    let update_request = UpdateFileRequest {
        message: "chore: update CI/CD workflow template\n\nAutomatically updated by ARFNI".to_string(),
        content: encoded_content,
        sha: current_file.sha,
        branch: config.branch.clone(),
    };

    let put_response = client
        .put(&file_url)
        .header("Authorization", format!("Bearer {}", access_token))
        .header("User-Agent", "ARFNI-App")
        .header("Accept", "application/vnd.github+json")
        .json(&update_request)
        .send()
        .await
        .map_err(|e| format!("Failed to update workflow file: {}", e))?;

    if !put_response.status().is_success() {
        let error_text = put_response.text().await.unwrap_or_default();
        return Err(format!("GitHub API error: {}", error_text));
    }

    println!("[CI/CD] ✅ Workflow file updated successfully");

    Ok(format!("Workflow file updated successfully for {}", config.repository_url))
}

/// Complete CI/CD setup with correct order: Clone → stack.yaml → Workflow → Secrets
#[tauri::command]
pub async fn setup_complete_cicd(
    app: AppHandle,
    config: CICDConfiguration,
    ssh_key: String,
    project_id: String,
    ec2_server_id: String,
    access_token: String,
    stack_yaml_content: Option<String>,        // 사용자가 만든 stack.yaml 내용
    docker_compose_content: Option<String>,    // 생성된 docker-compose.yml 내용
    dockerfiles: Option<Vec<(String, String)>>, // 생성된 Dockerfiles: (build_context, content)
) -> Result<String, String> {
    use crate::db::Database;
    use tauri::State;

    println!("[CI/CD] Starting complete CI/CD setup...");
    println!("[CI/CD] Step 1/4: Cloning repository to EC2...");

    // Step 1: Clone repository to EC2 FIRST
    {
        let db_state: State<'_, Database> = app.state();
        crate::commands::project::clone_github_repo_on_ec2(
            db_state.clone(),
            project_id.clone(),
            ec2_server_id.clone()
        ).await.map_err(|e| format!("Failed to clone repo to EC2: {}", e))?;

        println!("[CI/CD] ✅ Repository cloned to EC2 successfully");
    }

    // Step 2: Use user's stack.yaml (or create a default one if not provided)
    println!("[CI/CD] Step 2/4: Preparing stack.yaml...");
    {
        // Use provided stack.yaml or create a minimal default
        let stack_yaml_content = match stack_yaml_content {
            Some(content) if !content.trim().is_empty() => {
                println!("[CI/CD] Using user-provided stack.yaml");
                content
            }
            _ => {
                println!("[CI/CD] No user stack.yaml found, creating minimal default...");
                // Create a minimal stack.yaml for CI/CD to work
                format!(r#"version: '3.8'

services:
  {}:
    build: .
    container_name: {}_container
    ports:
      - "8080:8080"
    environment:
      - SPRING_PROFILES_ACTIVE=prod
"#, config.docker_service, config.docker_service)
            }
        };

        println!("[CI/CD] stack.yaml content prepared");

        // Clone temp repo, add stack.yaml, and push
        let temp_dir = std::env::temp_dir().join(format!("arfni_cicd_{}", chrono::Utc::now().timestamp_millis()));
        std::fs::create_dir_all(&temp_dir).map_err(|e| format!("Failed to create temp directory: {}", e))?;

        // Clone repository
        let clone_output = Command::new("git")
            .args(&["clone", &config.repository_url, "."])
            .current_dir(&temp_dir)
            .output()
            .map_err(|e| format!("Failed to clone repository: {}", e))?;

        if !clone_output.status.success() {
            return Err(format!("Failed to clone repository: {}", String::from_utf8_lossy(&clone_output.stderr)));
        }

        // Configure git user for this repository (temporary)
        Command::new("git")
            .args(&["config", "user.email", "arfni@automated.com"])
            .current_dir(&temp_dir)
            .output()
            .map_err(|e| format!("Failed to set git email: {}", e))?;

        Command::new("git")
            .args(&["config", "user.name", "ARFNI CI/CD Bot"])
            .current_dir(&temp_dir)
            .output()
            .map_err(|e| format!("Failed to set git name: {}", e))?;

        // Pull latest changes first to avoid conflicts
        let pull_output = Command::new("git")
            .args(&["pull", "origin", &config.branch])
            .current_dir(&temp_dir)
            .output()
            .map_err(|e| format!("Failed to pull latest changes: {}", e))?;

        if !pull_output.status.success() {
            println!("[CI/CD] Warning: Pull failed, but continuing: {}", String::from_utf8_lossy(&pull_output.stderr));
        }

        // Write stack.yaml
        let stack_yaml_path = temp_dir.join("stack.yaml");
        std::fs::write(&stack_yaml_path, &stack_yaml_content)
            .map_err(|e| format!("Failed to write stack.yaml: {}", e))?;

        // Generate docker-compose.yml and Dockerfiles if not provided
        let (final_compose_content, final_dockerfiles) = if docker_compose_content.is_none() || dockerfiles.is_none() {
            println!("[CI/CD] Docker files not provided, generating from stack.yaml...");
            println!("[CI/CD] Stack YAML content to generate from:\n{}", stack_yaml_content);

            // Use generate_docker_files_with_go_binary from deployment module
            match crate::commands::deployment::generate_docker_files_with_go_binary_public(&app, &temp_dir, &stack_yaml_content) {
                Ok((compose, files)) => {
                    println!("[CI/CD] ✅ Docker files generated successfully");
                    println!("[CI/CD] Generated docker-compose.yml:\n{}", compose);
                    println!("[CI/CD] Generated {} Dockerfile(s)", files.len());
                    (Some(compose), Some(files))
                }
                Err(e) => {
                    eprintln!("[CI/CD] ❌ Failed to generate Docker files!");
                    eprintln!("[CI/CD] Error details: {}", e);
                    eprintln!("[CI/CD] This is a critical error - cannot proceed without Docker files");
                    return Err(format!("Failed to generate Docker files from stack.yaml: {}", e));
                }
            }
        } else {
            println!("[CI/CD] Using provided Docker files");
            (docker_compose_content, dockerfiles)
        };

        // Write docker-compose.yml
        if let Some(ref compose_content) = final_compose_content {
            println!("[CI/CD] Writing docker-compose.yml...");
            let compose_path = temp_dir.join("docker-compose.yml");
            std::fs::write(&compose_path, compose_content)
                .map_err(|e| format!("Failed to write docker-compose.yml: {}", e))?;
            println!("[CI/CD] ✅ docker-compose.yml written");
        } else {
            println!("[CI/CD] ⚠️ No docker-compose.yml to write");
        }

        // Write Dockerfiles
        if let Some(ref dockerfiles_vec) = final_dockerfiles {
            println!("[CI/CD] Writing {} Dockerfile(s)...", dockerfiles_vec.len());
            for (build_context, dockerfile_content) in dockerfiles_vec {
                let dockerfile_dir = temp_dir.join(build_context);
                std::fs::create_dir_all(&dockerfile_dir)
                    .map_err(|e| format!("Failed to create directory {}: {}", build_context, e))?;

                let dockerfile_path = dockerfile_dir.join("Dockerfile");
                std::fs::write(&dockerfile_path, dockerfile_content)
                    .map_err(|e| format!("Failed to write Dockerfile in {}: {}", build_context, e))?;

                println!("[CI/CD] ✅ Dockerfile written to {}/Dockerfile", build_context);
            }
        } else {
            println!("[CI/CD] ⚠️ No Dockerfiles to write");
        }

        println!("[CI/CD] Checking git status in temp directory: {:?}", temp_dir);

        // Check git status for all Docker files
        let check_status = Command::new("git")
            .args(&["status", "--porcelain"])
            .current_dir(&temp_dir)
            .output()
            .map_err(|e| {
                eprintln!("[CI/CD] ❌ Failed to run git status: {}", e);
                format!("Failed to check git status: {}", e)
            })?;

        if !check_status.status.success() {
            let error_msg = String::from_utf8_lossy(&check_status.stderr);
            eprintln!("[CI/CD] ❌ git status command failed!");
            eprintln!("[CI/CD] Error: {}", error_msg);
            return Err(format!("git status failed: {}", error_msg));
        }

        let status_output = String::from_utf8_lossy(&check_status.stdout);
        println!("[CI/CD] Git status output:\n{}", status_output);

        // Only commit and push if there are changes
        if !status_output.trim().is_empty() {
            println!("[CI/CD] Changes detected, adding files to git...");

            // Add Docker files one by one to avoid errors with non-existent files
            // First add stack.yaml and docker-compose.yml (always present)
            let add_output = Command::new("git")
                .args(&["add", "stack.yaml", "docker-compose.yml"])
                .current_dir(&temp_dir)
                .output()
                .map_err(|e| {
                    eprintln!("[CI/CD] ❌ Failed to run git add: {}", e);
                    format!("Failed to add Docker files: {}", e)
                })?;

            if !add_output.status.success() {
                let error_msg = String::from_utf8_lossy(&add_output.stderr);
                eprintln!("[CI/CD] ❌ git add failed!");
                eprintln!("[CI/CD] Error: {}", error_msg);
                return Err(format!("git add failed: {}", error_msg));
            }

            let add_stdout = String::from_utf8_lossy(&add_output.stdout);
            if !add_stdout.trim().is_empty() {
                println!("[CI/CD] Git add output: {}", add_stdout);
            }
            println!("[CI/CD] ✅ Files added to git (stack.yaml, docker-compose.yml)");

            // Try to add Dockerfiles if they exist (don't fail if they don't)
            let _ = Command::new("git")
                .args(&["add", "Dockerfile", "*/Dockerfile"])
                .current_dir(&temp_dir)
                .output(); // Ignore errors - these files may not exist

            println!("[CI/CD] Committing changes...");
            let commit_output = Command::new("git")
                .args(&["commit", "-m", "chore: add Docker files (stack.yaml, docker-compose.yml, Dockerfiles) for CI/CD deployment"])
                .current_dir(&temp_dir)
                .output()
                .map_err(|e| {
                    eprintln!("[CI/CD] ❌ Failed to run git commit: {}", e);
                    format!("Failed to commit Docker files: {}", e)
                })?;

            if !commit_output.status.success() {
                let error_msg = String::from_utf8_lossy(&commit_output.stderr);
                let out_msg = String::from_utf8_lossy(&commit_output.stdout);
                eprintln!("[CI/CD] ❌ git commit failed!");
                eprintln!("[CI/CD] Stderr: {}", error_msg);
                eprintln!("[CI/CD] Stdout: {}", out_msg);
                // Check if it's "nothing to commit" error
                if !error_msg.contains("nothing to commit") && !error_msg.contains("nothing added to commit") {
                    return Err(format!("Failed to commit: {}", error_msg));
                }
                println!("[CI/CD] Docker files already up to date, skipping commit");
            } else {
                let commit_stdout = String::from_utf8_lossy(&commit_output.stdout);
                println!("[CI/CD] ✅ Commit successful!");
                println!("[CI/CD] Commit output: {}", commit_stdout);

                // Push to remote only if commit was successful
                println!("[CI/CD] Pushing to remote...");
                let push_output = Command::new("git")
                    .args(&["push", "origin", &config.branch])
                    .current_dir(&temp_dir)
                    .output()
                    .map_err(|e| {
                        eprintln!("[CI/CD] ❌ Failed to run git push: {}", e);
                        format!("Failed to push Docker files: {}", e)
                    })?;

                if !push_output.status.success() {
                    let error_msg = String::from_utf8_lossy(&push_output.stderr);
                    let out_msg = String::from_utf8_lossy(&push_output.stdout);
                    eprintln!("[CI/CD] ❌ git push failed!");
                    eprintln!("[CI/CD] Stderr: {}", error_msg);
                    eprintln!("[CI/CD] Stdout: {}", out_msg);
                    return Err(format!("Failed to push: {}", error_msg));
                }
                println!("[CI/CD] ✅ Docker files pushed to GitHub");
            }
        } else {
            println!("[CI/CD] Docker files already exist and are up to date, skipping");
        }

        // Cleanup temp directory
        let _ = std::fs::remove_dir_all(&temp_dir);

        println!("[CI/CD] ✅ Docker files (stack.yaml, docker-compose.yml, Dockerfiles) created and pushed successfully");
    }

    // Step 3: Create workflow file
    println!("[CI/CD] Step 3/4: Creating GitHub workflow...");
    {
        // Load and render template
        let template_content = load_template(&app, &config.framework)?;
        let rendered = render_template(&template_content, &config)?;

        // Extract repository name from URL
        let repo_full_name = extract_repo_name(&config.repository_url)?;

        // Create workflow file using GitHub API
        let workflow_path = ".github/workflows/deploy.yml";
        let create_url = format!(
            "https://api.github.com/repos/{}/contents/{}",
            repo_full_name,
            workflow_path
        );

        use sodiumoxide::base64;
        let encoded_content = base64::encode(rendered.as_bytes(), base64::Variant::Original);

        #[derive(Serialize)]
        struct CreateFileRequest {
            message: String,
            content: String,
            branch: String,
        }

        let create_request = CreateFileRequest {
            message: format!("feat: add CI/CD workflow for {}\n\nAutomatically generated by ARFNI", config.framework),
            content: encoded_content,
            branch: config.branch.clone(),
        };

        let client = reqwest::Client::new();
        let response = client.put(&create_url)
            .header("Authorization", format!("Bearer {}", access_token))
            .header("User-Agent", "ARFNI-App")
            .header("Accept", "application/vnd.github+json")
            .json(&create_request)
            .send()
            .await
            .map_err(|e| format!("Failed to create workflow file: {}", e))?;

        if !response.status().is_success() {
            let error_text = response.text().await.unwrap_or_default();
            return Err(format!("Failed to create workflow file: {}", error_text));
        }

        println!("[CI/CD] ✅ Workflow file created successfully");
    }

    // Step 4: Configure GitHub Secrets
    println!("[CI/CD] Step 4/4: Configuring GitHub Secrets...");
    let repo_full_name = extract_repo_name(&config.repository_url)?;
    configure_github_secrets(
        &access_token,
        &repo_full_name,
        &config.ec2_host,
        &config.ec2_user,
        &ssh_key,
    ).await?;

    println!("[CI/CD] ✅ Complete CI/CD setup finished successfully!");

    Ok(format!("CI/CD setup completed successfully for {}", config.repository_url))
}

/// Update Docker files (stack.yaml, docker-compose.yml, Dockerfiles) only
/// Used when CI/CD is already configured but Docker files need updating
pub async fn update_docker_files_only(
    app: AppHandle,
    repository_url: String,
    branch: String,
    access_token: String,
    stack_yaml_content: String,
) -> Result<(), String> {
    use std::process::Command;

    println!("[Docker Update] Updating Docker files for repository: {}", repository_url);

    // Create temp directory
    let temp_dir = std::env::temp_dir().join(format!("arfni_docker_update_{}", chrono::Utc::now().timestamp_millis()));
    std::fs::create_dir_all(&temp_dir).map_err(|e| format!("Failed to create temp directory: {}", e))?;

    // Clone repository
    println!("[Docker Update] Cloning repository...");
    let clone_url = repository_url.replace("https://", &format!("https://{}@", access_token));
    let clone_output = Command::new("git")
        .args(&["clone", "-b", &branch, &clone_url, "."])
        .current_dir(&temp_dir)
        .output()
        .map_err(|e| format!("Failed to clone repository: {}", e))?;

    if !clone_output.status.success() {
        let _ = std::fs::remove_dir_all(&temp_dir);
        return Err(format!("Failed to clone repository: {}", String::from_utf8_lossy(&clone_output.stderr)));
    }

    // Configure git user
    Command::new("git")
        .args(&["config", "user.email", "arfni@automated.com"])
        .current_dir(&temp_dir)
        .output()
        .map_err(|e| format!("Failed to set git email: {}", e))?;

    Command::new("git")
        .args(&["config", "user.name", "ARFNI CI/CD Bot"])
        .current_dir(&temp_dir)
        .output()
        .map_err(|e| format!("Failed to set git name: {}", e))?;

    // Generate Docker files
    println!("[Docker Update] Generating Docker files from stack.yaml...");
    let (compose_content, dockerfiles) = crate::commands::deployment::generate_docker_files_with_go_binary_public(
        &app,
        &temp_dir,
        &stack_yaml_content
    ).map_err(|e| {
        let _ = std::fs::remove_dir_all(&temp_dir);
        format!("Failed to generate Docker files: {}", e)
    })?;

    println!("[Docker Update] ✅ Generated docker-compose.yml and {} Dockerfile(s)", dockerfiles.len());

    // Write docker-compose.yml
    let compose_path = temp_dir.join("docker-compose.yml");
    std::fs::write(&compose_path, &compose_content)
        .map_err(|e| format!("Failed to write docker-compose.yml: {}", e))?;

    // Write Dockerfiles
    for (build_context, dockerfile_content) in &dockerfiles {
        let dockerfile_dir = temp_dir.join(build_context);
        std::fs::create_dir_all(&dockerfile_dir)
            .map_err(|e| format!("Failed to create directory {}: {}", build_context, e))?;

        let dockerfile_path = dockerfile_dir.join("Dockerfile");
        std::fs::write(&dockerfile_path, dockerfile_content)
            .map_err(|e| format!("Failed to write Dockerfile in {}: {}", build_context, e))?;

        println!("[Docker Update] ✅ Dockerfile written to {}/Dockerfile", build_context);
    }

    // Check if there are changes
    let status_output = Command::new("git")
        .args(&["status", "--porcelain"])
        .current_dir(&temp_dir)
        .output()
        .map_err(|e| format!("Failed to check git status: {}", e))?;

    let status_str = String::from_utf8_lossy(&status_output.stdout);

    if status_str.trim().is_empty() {
        println!("[Docker Update] No changes detected, Docker files are up to date");
        let _ = std::fs::remove_dir_all(&temp_dir);
        return Ok(());
    }

    println!("[Docker Update] Changes detected:\n{}", status_str);

    // Add, commit, and push
    println!("[Docker Update] Adding Docker files...");
    Command::new("git")
        .args(&["add", "docker-compose.yml"])
        .current_dir(&temp_dir)
        .output()
        .map_err(|e| format!("Failed to add docker-compose.yml: {}", e))?;

    // Add all Dockerfiles
    for (build_context, _) in &dockerfiles {
        let dockerfile_path = format!("{}/Dockerfile", build_context);
        Command::new("git")
            .args(&["add", &dockerfile_path])
            .current_dir(&temp_dir)
            .output()
            .map_err(|e| format!("Failed to add {}: {}", dockerfile_path, e))?;
    }

    println!("[Docker Update] Committing changes...");
    let commit_output = Command::new("git")
        .args(&["commit", "-m", "chore: update Docker files from ARFNI"])
        .current_dir(&temp_dir)
        .output()
        .map_err(|e| format!("Failed to commit: {}", e))?;

    if !commit_output.status.success() {
        let error_msg = String::from_utf8_lossy(&commit_output.stderr);
        // Check if error is "nothing to commit"
        if error_msg.contains("nothing to commit") {
            println!("[Docker Update] Nothing to commit, files already up to date");
            let _ = std::fs::remove_dir_all(&temp_dir);
            return Ok(());
        }
        let _ = std::fs::remove_dir_all(&temp_dir);
        return Err(format!("Failed to commit: {}", error_msg));
    }

    println!("[Docker Update] Pushing to remote...");
    let push_output = Command::new("git")
        .args(&["push", "origin", &branch])
        .current_dir(&temp_dir)
        .output()
        .map_err(|e| format!("Failed to push: {}", e))?;

    if !push_output.status.success() {
        let error_msg = String::from_utf8_lossy(&push_output.stderr);
        let _ = std::fs::remove_dir_all(&temp_dir);
        return Err(format!("Failed to push: {}", error_msg));
    }

    // Cleanup
    let _ = std::fs::remove_dir_all(&temp_dir);

    println!("[Docker Update] ✅ Docker files updated and pushed successfully");
    Ok(())
}

/// Check if CI/CD is already configured for a repository
#[tauri::command]
pub async fn check_cicd_status(
    repository_url: String,
    access_token: String,
) -> Result<bool, String> {
    // Extract repository name from URL
    let repo_full_name = extract_repo_name(&repository_url)?;

    // Check if workflow file exists
    let workflow_url = format!(
        "https://api.github.com/repos/{}/contents/.github/workflows/deploy.yml",
        repo_full_name
    );

    let client = reqwest::Client::new();
    let response = client.get(&workflow_url)
        .header("Authorization", format!("Bearer {}", access_token))
        .header("User-Agent", "ARFNI-App")
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .map_err(|e| format!("Failed to check workflow: {}", e))?;

    // If status is 200, workflow exists
    Ok(response.status().is_success())
}
