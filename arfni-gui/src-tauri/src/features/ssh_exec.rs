use anyhow::{Result, Context};
use serde::{Serialize, Deserialize};
use std::{fs, path::{Path, PathBuf}, io::Write, process::Command};

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


//파일 경로 체크
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

//json 파일 경로
fn json_path() -> Result<PathBuf> {
    Ok(data_dir_near_exe()?.join(FILE_NAME))
}

/// 파일 존재 여부만 체크
fn ssh_file_check() -> Result<bool> {
    Ok(json_path()?.exists())
}

/// 파일 읽기(없으면 빈 벡터)
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

/// 항목 추가(중복 host+user이면 pem_path만 갱신)
pub fn add_or_update_entry(new_item: SshParams) -> Result<()> {
    let mut list = load_all()?;

    if let Some(existing) = list.iter_mut()
        .find(|x| x.host == new_item.host && x.user == new_item.user) {
        // 중복이면 업데이트(예: pem 경로 변경)
        existing.pem_path = new_item.pem_path;
    } else {
        list.push(new_item);
    }

    // 정렬(보기 좋게 host, user 순)
    list.sort_by(|a, b| (a.host.as_str(), a.user.as_str())
        .cmp(&(b.host.as_str(), b.user.as_str())));
    save_all(&list)
}

/// 전체 조회
pub fn read_all_entries() -> Result<Vec<SshParams>> {
    load_all()
}

/// 삭제(host+user 기준)
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

/// 부분 수정(존재 시 원하는 필드만 변경)
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