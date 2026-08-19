#![allow(dead_code)]
use anyhow::{Result, Context};
use serde::{Serialize, Deserialize};
use std::{fs, path::{PathBuf}, io::Write, process::Command};
use regex::Regex;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

const DATA_DIR_NAME: &str = "data";
const FILE_NAME: &str = "ssh_targets.json";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SshParams {
    pub host: String,     // "ec2-13-...amazonaws.com"
    pub user: String,     // "ec2-user"
    pub pem_path: String, // 키 파일 절대 경로
}

pub fn exec_once_via_system_ssh(host: &str, user: &str, pem: &str, cmd: &str) -> Result<String> {
    let target = format!("{user}@{host}");
    let mut command = Command::new("ssh");
    command.args([
            "-i", pem,
            // Records known_hosts on first contact; tighten this if policy requires it
            "-o", "StrictHostKeyChecking=accept-new",
            &target,
            cmd,
        ]);

    #[cfg(target_os = "windows")]
    {
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        command.creation_flags(CREATE_NO_WINDOW);
    }

    let out = command
        .output()
        .with_context(|| "failed to spawn ssh")?;

    if !out.status.success() {
        let err = String::from_utf8_lossy(&out.stderr);
        anyhow::bail!("ssh exited with status {:?}: {}", out.status.code(), err);
    }
    Ok(String::from_utf8_lossy(&out.stdout).to_string())
}

pub fn list_ec2_listening_ports(host: &str, user: &str, pem: &str) -> Result<Vec<u16>> {
    // Command to run inside the EC2 host
    let cmd = "sudo ss -tuln";

    let output = exec_once_via_system_ssh(host, user, pem, cmd)?;

    // e.g. "tcp   LISTEN 0 4096 0.0.0.0:3306  ..."
    let re = Regex::new(r":(\d+)\s+").unwrap();
    let mut ports = vec![];

    for line in output.lines() {
        if !line.contains("LISTEN") {
            continue;
        }

        if let Some(cap) = re.captures(line) {
            if let Ok(port) = cap[1].parse::<u16>() {
                if !ports.contains(&port) {
                    ports.push(port);
                }
            }
        }
    }

    ports.sort_unstable();
    Ok(ports)
}

/// Manual test that needs a real server: fill in host and pem, then run
/// `cargo test -- --ignored test_ssh_via_system`. Excluded from the suite because the
/// empty credentials make it fail on a normal run.
#[test]
#[ignore = "requires a live host and pem path"]
fn test_ssh_via_system() {
    let host = "";
    let user = "ec2-user";
    let pem  = r"";
    let cmd  = "docker ps";

    let out = exec_once_via_system_ssh(host, user, pem, cmd).expect("system ssh failed");
    println!("SSH via system:\n{out}");
}


// File path checks
fn data_dir_near_exe() -> anyhow::Result<PathBuf> {
    let exe = std::env::current_exe()?;
    let exe_dir = exe.parent().ok_or_else(|| anyhow::anyhow!("no exe parent"))?;
    let mut base = exe_dir.to_path_buf();
    base.push(DATA_DIR_NAME);
    if !base.exists() {
        fs::create_dir_all(&base)?;
    }
    Ok(base)
}

// Path of the json file
fn json_path() -> Result<PathBuf> {
    Ok(data_dir_near_exe()?.join(FILE_NAME))
}

/// Existence check only
fn ssh_file_check() -> Result<bool> {
    Ok(json_path()?.exists())
}

/// Reads the file, returning an empty vector when it is missing
fn load_all() -> Result<Vec<SshParams>> {
    let path = json_path()?;
    if !path.exists() {
        return Ok(vec![]);
    }
    let bytes = fs::read(&path)
        .with_context(|| format!("failed to read {:?}", path))?;
    if bytes.is_empty() {
        return Ok(vec![]);
    }
    let list: Vec<SshParams> = serde_json::from_slice(&bytes)
        .with_context(|| format!("failed to parse json {:?}", path))?;
    Ok(list)
}

fn save_all(list: &[SshParams]) -> Result<()> {
    let path = json_path()?;
    let tmp = path.with_extension("json.tmp");
    {
        let mut f = fs::File::create(&tmp)
            .with_context(|| format!("failed to create {:?}", tmp))?;
        let data = serde_json::to_vec_pretty(list)
            .context("failed to serialize json")?;
        f.write_all(&data).context("failed to write json")?;
        f.flush().ok();
    }
    fs::rename(&tmp, &path)
        .with_context(|| format!("failed to rename {:?} -> {:?}", tmp, path))?;
    Ok(())
}

/// Adds an entry; a duplicate host and user only updates pem_path
pub fn add_or_update_entry(new_item: SshParams) -> Result<()> {
    let mut list = load_all()?;

    if let Some(existing) = list.iter_mut()
        .find(|x| x.host == new_item.host && x.user == new_item.user) {
        // A duplicate is an update, e.g. the pem path changed
        existing.pem_path = new_item.pem_path;
    } else {
        list.push(new_item);
    }

    // Sorted by host then user for readability
    list.sort_by(|a, b| (a.host.as_str(), a.user.as_str())
        .cmp(&(b.host.as_str(), b.user.as_str())));
    save_all(&list)
}

/// Reads every entry
pub fn read_all_entries() -> Result<Vec<SshParams>> {
    load_all()
}

/// Deletes by host and user
pub fn delete_entry(host: &str, user: &str) -> Result<bool> {
    let mut list = load_all()?;
    let before = list.len();
    list.retain(|x| !(x.host == host && x.user == user));
    let changed = list.len() != before;
    if changed {
        save_all(&list)?;
    }
    Ok(changed)
}

/// Partial update: changes only the given fields when the entry exists
pub fn update_entry(host: &str, user: &str, new_pem_path: Option<String>) -> Result<bool> {
    let mut list = load_all()?;
    let mut changed = false;
    if let Some(item) = list.iter_mut().find(|x| x.host == host && x.user == user) {
        if let Some(p) = new_pem_path {
            if item.pem_path != p {
                item.pem_path = p;
                changed = true;
            }
        }
    }
    if changed {
        save_all(&list)?;
    }
    Ok(changed)
}
