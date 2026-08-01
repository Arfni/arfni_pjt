//! 원격 Docker 조작을 **검증된 형태로만** 노출한다.
//!
//! 기존에는 프론트가 `ssh_exec_system`에 `docker start ${containerId}` 같은 문자열을
//! 직접 만들어 넘겼다. 그 문자열은 원격 셸이 그대로 해석하므로,
//! containerId에 `; rm -rf /` 가 섞이면 그대로 원격 명령 실행이 된다.
//! 컨테이너 id/이름을 엄격히 검증하고, 동작은 열거형으로 못 박아 그 경로를 없앤다.

use serde::Deserialize;

use crate::features::ssh_exec::exec_once_via_system_ssh;

#[derive(Debug, Deserialize)]
pub struct RemoteDockerParams {
    pub host: String,
    pub user: String,
    pub pem_path: String,
}

#[derive(Debug, Clone, Copy, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum DockerAction {
    Start,
    Stop,
    Restart,
    Remove,
}

impl DockerAction {
    fn argv(self) -> &'static [&'static str] {
        match self {
            DockerAction::Start => &["start"],
            DockerAction::Stop => &["stop"],
            DockerAction::Restart => &["restart"],
            // -f는 실행 중인 컨테이너도 지운다. UI에서 확인을 받고 호출한다.
            DockerAction::Remove => &["rm", "-f"],
        }
    }
}

/// Docker가 허용하는 컨테이너 id/이름만 통과시킨다.
///
/// - id: 소문자 16진수 (짧은 형태 12자, 전체 64자)
/// - 이름: `[a-zA-Z0-9][a-zA-Z0-9_.-]*` (Docker가 강제하는 규칙)
///
/// 셸 메타문자(`;`, `|`, `&`, `$`, 백틱, 공백, 개행 등)는 전부 여기서 막힌다.
pub fn is_valid_container_ref(s: &str) -> bool {
    if s.is_empty() || s.len() > 128 {
        return false;
    }
    let mut chars = s.chars();
    let first = chars.next().unwrap_or('\0');
    if !first.is_ascii_alphanumeric() {
        return false;
    }
    chars.all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '.' || c == '-')
}

/// 컨테이너 하나에 대한 동작. container_ref는 검증을 통과해야만 실행된다.
#[tauri::command]
pub async fn docker_container_action(
    params: RemoteDockerParams,
    action: DockerAction,
    container_ref: String,
) -> Result<String, String> {
    if !is_valid_container_ref(&container_ref) {
        return Err(format!("invalid container reference: {container_ref:?}"));
    }

    let cmd = format!("docker {} {}", action.argv().join(" "), container_ref);
    exec_once_via_system_ssh(&params.host, &params.user, &params.pem_path, &cmd)
        .map_err(|e| e.to_string())
}

/// 전체 컨테이너 시작/중지. 고정 명령이라 외부 입력이 끼어들 자리가 없다.
#[tauri::command]
pub async fn docker_all_containers(
    params: RemoteDockerParams,
    start: bool,
) -> Result<String, String> {
    let cmd = if start {
        "docker start $(docker ps -aq)"
    } else {
        "docker stop $(docker ps -q)"
    };
    exec_once_via_system_ssh(&params.host, &params.user, &params.pem_path, cmd)
        .map_err(|e| e.to_string())
}

/// 컨테이너 목록. 포맷 문자열도 고정이다.
#[tauri::command]
pub async fn docker_ps(params: RemoteDockerParams) -> Result<String, String> {
    const CMD: &str = r#"docker ps -a --format "{{.ID}}|{{.Names}}|{{.Image}}|{{.Status}}|{{.Command}}|{{.CreatedAt}}|{{.Ports}}""#;
    exec_once_via_system_ssh(&params.host, &params.user, &params.pem_path, CMD)
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_real_docker_ids_and_names() {
        assert!(is_valid_container_ref("b377d9bb5a79"));
        assert!(is_valid_container_ref(
            "b377d9bb5a79c1f2e3d4a5b6c7d8e9f0112233445566778899aabbccddeeff00"
        ));
        assert!(is_valid_container_ref("arfni-deploy-prometheus-1"));
        assert!(is_valid_container_ref("hermes_bot.v2"));
        assert!(is_valid_container_ref("a"));
    }

    #[test]
    fn rejects_shell_metacharacters() {
        // 이 값들이 통과하면 원격 셸에서 임의 명령이 실행된다
        for bad in [
            "abc; rm -rf /",
            "abc && whoami",
            "abc | tee /tmp/x",
            "abc`id`",
            "abc$(id)",
            "abc\nwhoami",
            "abc > /etc/passwd",
            "abc'",
            "abc\"",
            "abc\\",
            "abc *",
            "abc\tdef",
        ] {
            assert!(!is_valid_container_ref(bad), "must reject {bad:?}");
        }
    }

    #[test]
    fn rejects_leading_non_alphanumeric() {
        // 하이픈으로 시작하면 docker가 옵션으로 해석한다 (예: "--help", "-v")
        assert!(!is_valid_container_ref("-rf"));
        assert!(!is_valid_container_ref("--force"));
        assert!(!is_valid_container_ref(".hidden"));
        assert!(!is_valid_container_ref("_leading"));
    }

    #[test]
    fn rejects_empty_and_oversized() {
        assert!(!is_valid_container_ref(""));
        assert!(!is_valid_container_ref(&"a".repeat(129)));
        assert!(is_valid_container_ref(&"a".repeat(128)));
    }

    #[test]
    fn rejects_non_ascii() {
        // 유니코드 유사문자로 검증을 우회하지 못하게 한다
        assert!(!is_valid_container_ref("컨테이너"));
        assert!(!is_valid_container_ref("abcｉd"));
    }

    #[test]
    fn action_argv_is_fixed() {
        assert_eq!(DockerAction::Start.argv(), &["start"]);
        assert_eq!(DockerAction::Stop.argv(), &["stop"]);
        assert_eq!(DockerAction::Restart.argv(), &["restart"]);
        assert_eq!(DockerAction::Remove.argv(), &["rm", "-f"]);
    }
}
