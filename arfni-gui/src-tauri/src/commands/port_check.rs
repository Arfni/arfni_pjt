use std::process::Command;
use regex::Regex;

#[tauri::command]
pub fn list_open_ports() -> Result<Vec<u16>, String> {
    // netstat 실행
    let output = Command::new("netstat")
        .args(&["-ano"])
        .output()
        .map_err(|e| e.to_string())?;

    // 결과를 CP949 → UTF-8로 변환 (한글깨짐 방지)
    let text = String::from_utf8_lossy(&output.stdout);

    // 정규식으로 ":포트번호" 패턴 추출
    let re = Regex::new(r":(\d+)\s+").unwrap();
    let mut ports = vec![];

    for cap in re.captures_iter(&text) {
        if let Ok(port) = cap[1].parse::<u16>() {
            // 중복 제거
            if !ports.contains(&port) {
                ports.push(port);
            }
        }
    }

    ports.sort_unstable();
    Ok(ports)
}


#[tauri::command]
pub fn list_listening_ports() -> Result<Vec<u16>, String> {
    let output = Command::new("netstat")
        .args(&["-ano"])
        .output()
        .map_err(|e| e.to_string())?;

    let text = String::from_utf8_lossy(&output.stdout);

    // LISTENING이 포함된 줄만 필터링
    let mut ports = vec![];
    let re = Regex::new(r":(\d+)\s+").unwrap();

    for line in text.lines() {
        if !line.contains("LISTENING") {
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


#[tauri::command]
pub fn scan_ports() -> Result<Vec<u16>, String> {
    let output = Command::new("netstat")
        .args(&["-ano"])
        .output()
        .map_err(|e| e.to_string())?;

    let text = String::from_utf8_lossy(&output.stdout);

    // LISTENING이 포함된 줄만 필터링
    let mut ports = vec![];
    let re = Regex::new(r":(\d+)\s+").unwrap();

    for line in text.lines() {
        if !line.contains("LISTENING") {
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