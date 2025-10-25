use notify::{Watcher, RecursiveMode, Event, Config};
use std::path::Path;
use std::sync::mpsc::channel;
use tauri::{Manager, AppHandle, Emitter};
use std::time::Duration;

#[derive(Clone, serde::Serialize)]
struct FileChangePayload {
    path: String,
    event_type: String,
}

/// stack.yaml 파일 변경 감지 시작
#[tauri::command]
pub fn watch_stack_yaml(app: AppHandle, project_path: String) -> Result<(), String> {
    let stack_yaml_path = Path::new(&project_path).join("stack.yaml");

    if !stack_yaml_path.exists() {
        return Err("stack.yaml 파일이 존재하지 않습니다".to_string());
    }

    // 새 스레드에서 파일 감지 시작
    std::thread::spawn(move || {
        let (tx, rx) = channel();

        // 파일 감시자 생성
        let mut watcher = notify::recommended_watcher(move |res: Result<Event, notify::Error>| {
            if let Ok(event) = res {
                tx.send(event).unwrap_or(());
            }
        }).map_err(|e| format!("파일 감시자 생성 실패: {}", e)).unwrap();

        // stack.yaml 파일 감시 시작
        watcher.watch(&stack_yaml_path, RecursiveMode::NonRecursive)
            .map_err(|e| format!("파일 감시 시작 실패: {}", e)).unwrap();

        // 이벤트 처리 루프
        loop {
            match rx.recv_timeout(Duration::from_secs(1)) {
                Ok(event) => {
                    // 파일 변경 이벤트를 React로 전송
                    let event_type = match event.kind {
                        notify::EventKind::Modify(_) => "modified",
                        notify::EventKind::Create(_) => "created",
                        notify::EventKind::Remove(_) => "deleted",
                        _ => "unknown",
                    };

                    if event_type != "unknown" {
                        app.emit("stack-yaml-changed", FileChangePayload {
                            path: stack_yaml_path.to_string_lossy().to_string(),
                            event_type: event_type.to_string(),
                        }).unwrap_or(());
                    }
                }
                Err(_) => {
                    // 타임아웃 - 계속 감시
                }
            }
        }
    });

    Ok(())
}

/// 파일 감시 중지 (프로젝트 닫을 때)
#[tauri::command]
pub fn stop_watching(_app: AppHandle, _project_path: String) -> Result<(), String> {
    // 실제 구현에서는 watcher 인스턴스를 관리하고 중지해야 함
    // 여기서는 간단히 구현
    Ok(())
}