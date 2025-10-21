use anyhow::{Result, Context};
use std::process::Command;

pub fn exec_once_via_system_ssh(host: &str, user: &str, pem: &str, cmd: &str) -> Result<String> {
    let target = format!("{user}@{host}");
    let out = Command::new("ssh")
        .args([
            "-i", pem,
            // 최초 접속 시 known_hosts 자동 등록. 보안정책에 맞춰 조정 가능
            "-o", "StrictHostKeyChecking=accept-new",
            &target,
            cmd,
        ])
        .output()
        .with_context(|| "failed to spawn ssh")?;

    if !out.status.success() {
        let err = String::from_utf8_lossy(&out.stderr);
        anyhow::bail!("ssh exited with status {:?}: {}", out.status.code(), err);
    }
    Ok(String::from_utf8_lossy(&out.stdout).to_string())
}
#[test]
fn test_ssh_via_system() {
    let host = "";
    let user = "ec2-user";
    let pem  = r"";
    let cmd  = "docker ps";

    let out = exec_once_via_system_ssh(host, user, pem, cmd).expect("system ssh failed");
    println!("SSH via system:\n{out}");
}
