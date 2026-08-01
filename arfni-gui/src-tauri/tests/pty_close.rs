//! 세션 종료/재개 경로 검증.
//!
//! 증상: "disconnect 하면 화면이 멈추고 새 세션이 안 열린다".
//!
//! `close_session()`이 하는 순서(kill → wait → master drop)를 그대로 재현해서
//! 어느 단계가 블로킹되는지 특정한다. 워치독이 붙어 있어 절대 무한정 매달리지 않는다.

use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use std::io::Read;
use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use std::time::Duration;

const HELLO: &str = "SESSION_ALIVE";
const WATCHDOG_SECS: u64 = 25;

/// 현재 단계를 기록해 두고, 정해진 시간을 넘기면 그 단계 이름과 함께 프로세스를 죽인다.
#[derive(Clone)]
struct Step(Arc<Mutex<&'static str>>);

impl Step {
    fn start() -> Self {
        let s = Step(Arc::new(Mutex::new("init")));
        let watch = s.clone();
        std::thread::spawn(move || {
            std::thread::sleep(Duration::from_secs(WATCHDOG_SECS));
            let stuck = *watch.0.lock().unwrap();
            eprintln!("\n=== WATCHDOG: '{stuck}' 단계에서 {WATCHDOG_SECS}초 넘게 멈춤 ===");
            std::process::exit(9);
        });
        s
    }

    fn set(&self, name: &'static str) {
        *self.0.lock().unwrap() = name;
        eprintln!("[step] {name}");
    }
}

struct Session {
    master: Box<dyn MasterPty + Send>,
    child: Box<dyn Child + Send + Sync>,
    rx: mpsc::Receiver<String>,
    reader: std::thread::JoinHandle<()>,
}

/// ssh_rt::start_interactive_session과 같은 구조로 PTY 세션을 연다.
fn spawn_session() -> Session {
    let pair = native_pty_system()
        .openpty(PtySize { rows: 24, cols: 80, pixel_width: 0, pixel_height: 0 })
        .expect("openpty failed");

    let mut cmd = if cfg!(windows) {
        let mut c = CommandBuilder::new("cmd.exe");
        // 출력을 내고 계속 살아 있는 자식. `timeout`은 콘솔 입력을 타므로 ping을 쓴다.
        c.args(["/c", &format!("echo {HELLO} & ping -n 60 127.0.0.1 >nul")]);
        c
    } else {
        let mut c = CommandBuilder::new("sh");
        c.args(["-c", &format!("echo {HELLO}; sleep 60")]);
        c
    };
    cmd.env("TERM", "xterm-256color");

    let child = pair.slave.spawn_command(cmd).expect("spawn failed");
    drop(pair.slave);

    let mut reader = pair.master.try_clone_reader().expect("clone reader failed");
    let (tx, rx) = mpsc::channel::<String>();
    let handle = std::thread::spawn(move || {
        let mut buf = [0u8; 8192];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    let _ = tx.send(String::from_utf8_lossy(&buf[..n]).to_string());
                }
                Err(e) if e.kind() == std::io::ErrorKind::Interrupted => continue,
                Err(_) => break,
            }
        }
    });

    Session { master: pair.master, child, rx, reader: handle }
}

fn wait_for_hello(rx: &mpsc::Receiver<String>, label: &str) {
    let deadline = std::time::Instant::now() + Duration::from_secs(10);
    let mut acc = String::new();
    while std::time::Instant::now() < deadline {
        match rx.recv_timeout(Duration::from_millis(200)) {
            Ok(s) => {
                acc.push_str(&s);
                if acc.contains(HELLO) {
                    return;
                }
            }
            Err(mpsc::RecvTimeoutError::Timeout) => continue,
            Err(mpsc::RecvTimeoutError::Disconnected) => break,
        }
    }
    panic!("{label} 세션에서 출력이 오지 않았다. 읽은 내용: {acc:?}");
}

fn join_within(handle: std::thread::JoinHandle<()>, secs: u64, what: &str) {
    let start = std::time::Instant::now();
    while !handle.is_finished() {
        assert!(
            start.elapsed() < Duration::from_secs(secs),
            "{what}이(가) {secs}초 안에 끝나지 않았다"
        );
        std::thread::sleep(Duration::from_millis(50));
    }
    handle.join().unwrap();
}

#[test]
fn closing_a_session_lets_a_new_one_open() {
    let step = Step::start();

    step.set("1차 세션 열기");
    let s1 = spawn_session();

    step.set("1차 세션 출력 대기");
    wait_for_hello(&s1.rx, "첫 번째");

    let Session { master, mut child, reader, rx: _rx1 } = s1;

    // close_session()과 같은 절차를 별도 스레드에서 밟아, 어느 호출이 매달리는지 본다.
    step.set("kill + wait + master drop");
    let closing = std::thread::spawn(move || {
        let _ = child.kill();
        let _ = child.wait();
        drop(master);
    });
    join_within(closing, 10, "kill/wait/master drop");

    step.set("reader 스레드 종료 대기");
    join_within(reader, 10, "reader 스레드");

    step.set("2차 세션 열기");
    let s2 = spawn_session();

    step.set("2차 세션 출력 대기");
    wait_for_hello(&s2.rx, "두 번째");

    step.set("정리");
    let Session { master, mut child, reader, rx: _rx2 } = s2;
    let _ = child.kill();
    let _ = child.wait();
    drop(master);
    let _ = reader.join();

    step.set("완료");
}
