//! PTY 계층 검증.
//!
//! 이전 SSH 터미널 구현은 `Stdio::piped()` + `BufReader::lines()` 였다.
//! 그 경우 자식이 개행 없이 출력하면(= codex/vim/htop 같은 full-screen TUI의 동작 방식)
//! 프론트로 아무것도 전달되지 않았다.
//!
//! 여기서는 실제 로컬 PTY(윈도우는 ConPTY)를 열어
//!   1) 개행 없는 출력이 바이트 단위로 흘러나오는지
//!   2) 터미널 크기가 자식 프로세스에 협상되는지
//! 를 확인한다.

use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use std::io::Read;
use std::sync::mpsc;
use std::time::Duration;

const MARKER: &str = "PARTIAL_NO_NEWLINE";

fn read_with_timeout(mut reader: Box<dyn Read + Send>, secs: u64) -> String {
    let (tx, rx) = mpsc::channel::<String>();
    std::thread::spawn(move || {
        let mut acc = Vec::new();
        let mut buf = [0u8; 4096];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    acc.extend_from_slice(&buf[..n]);
                    // 청크가 도착할 때마다 중간 결과를 보고한다.
                    let _ = tx.send(String::from_utf8_lossy(&acc).to_string());
                }
                Err(_) => break,
            }
        }
        let _ = tx.send(String::from_utf8_lossy(&acc).to_string());
    });

    let deadline = std::time::Instant::now() + Duration::from_secs(secs);
    let mut last = String::new();
    while std::time::Instant::now() < deadline {
        match rx.recv_timeout(Duration::from_millis(200)) {
            Ok(s) => {
                last = s;
                if last.contains(MARKER) {
                    break;
                }
            }
            Err(mpsc::RecvTimeoutError::Timeout) => continue,
            Err(mpsc::RecvTimeoutError::Disconnected) => break,
        }
    }
    last
}

/// 개행 없이 출력된 텍스트가 PTY를 통해 전달되어야 한다.
/// (구 구현의 `BufReader::lines()`로는 절대 관측할 수 없던 케이스)
#[test]
fn pty_streams_output_without_newline() {
    let pair = native_pty_system()
        .openpty(PtySize {
            rows: 30,
            cols: 120,
            pixel_width: 0,
            pixel_height: 0,
        })
        .expect("openpty failed");

    let mut cmd = if cfg!(windows) {
        let mut c = CommandBuilder::new("cmd.exe");
        c.arg("/c");
        // set /p 은 개행 없이 프롬프트만 출력한다.
        c.arg(format!("set /p _dummy={}<nul & timeout /t 3 >nul", MARKER));
        c
    } else {
        let mut c = CommandBuilder::new("sh");
        c.arg("-c");
        c.arg(format!("printf '{}'; sleep 3", MARKER));
        c
    };
    cmd.env("TERM", "xterm-256color");

    let mut child = pair.slave.spawn_command(cmd).expect("spawn failed");
    drop(pair.slave);

    let reader = pair.master.try_clone_reader().expect("clone reader failed");
    let out = read_with_timeout(reader, 8);

    let _ = child.kill();
    let _ = child.wait();
    drop(pair.master);

    assert!(
        out.contains(MARKER),
        "개행 없는 출력이 PTY로 전달되지 않았다. 읽은 내용: {:?}",
        out
    );
}

/// PTY 크기가 자식 프로세스에 실제로 전달되어야 한다 (TUI 레이아웃의 전제).
#[test]
fn pty_size_is_negotiated_to_child() {
    let pair = native_pty_system()
        .openpty(PtySize {
            rows: 40,
            cols: 137, // 기본값(80/24)과 확실히 구분되는 값
            pixel_width: 0,
            pixel_height: 0,
        })
        .expect("openpty failed");

    let mut cmd = if cfg!(windows) {
        let mut c = CommandBuilder::new("powershell.exe");
        c.arg("-NoProfile");
        c.arg("-Command");
        c.arg("Write-Host ('COLS=' + $Host.UI.RawUI.WindowSize.Width); Start-Sleep -Seconds 3");
        c
    } else {
        let mut c = CommandBuilder::new("sh");
        c.arg("-c");
        c.arg("printf 'COLS=%s\\n' \"$(tput cols)\"; sleep 3");
        c
    };
    cmd.env("TERM", "xterm-256color");

    let mut child = pair.slave.spawn_command(cmd).expect("spawn failed");
    drop(pair.slave);

    let mut reader = pair.master.try_clone_reader().expect("clone reader failed");
    let (tx, rx) = mpsc::channel::<String>();
    std::thread::spawn(move || {
        let mut acc = Vec::new();
        let mut buf = [0u8; 4096];
        while let Ok(n) = reader.read(&mut buf) {
            if n == 0 {
                break;
            }
            acc.extend_from_slice(&buf[..n]);
            let s = String::from_utf8_lossy(&acc).to_string();
            let done = s.contains("COLS=");
            let _ = tx.send(s);
            if done {
                break;
            }
        }
    });

    let deadline = std::time::Instant::now() + Duration::from_secs(10);
    let mut out = String::new();
    while std::time::Instant::now() < deadline {
        match rx.recv_timeout(Duration::from_millis(200)) {
            Ok(s) => {
                out = s;
                if out.contains("COLS=") {
                    break;
                }
            }
            Err(mpsc::RecvTimeoutError::Timeout) => continue,
            Err(mpsc::RecvTimeoutError::Disconnected) => break,
        }
    }

    let _ = child.kill();
    let _ = child.wait();
    drop(pair.master);

    assert!(
        out.contains("COLS=137"),
        "PTY 폭(137)이 자식에게 전달되지 않았다. 읽은 내용: {:?}",
        out
    );
}
