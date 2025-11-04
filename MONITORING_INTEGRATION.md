# Monitoring Integration Documentation

## Overview
GUI 애플리케이션에 BE 모니터링 스택 연동 및 자동 시작 기능 구현.

## Modified Files

### 1. Backend (Go)

#### C:\arfni_pjt_new\BE\arfni\pkg\stack\monitoring.go
- **Line 176**: Grafana 서비스 환경변수 추가
  - `GF_SECURITY_ALLOW_EMBEDDING: "true"` 추가
  - iframe 내 Grafana 임베딩 허용

#### C:\arfni_pjt_new\BE\arfni\cmd\arfni-monitoring\main.go
- **Line 676**: Local 모드 Grafana 컨테이너 시작 시 환경변수 추가
  - `"-e", "GF_SECURITY_ALLOW_EMBEDDING=true"` 추가
- **Line 699**: Hybrid/All-in-one 모드 Grafana 컨테이너 시작 시 환경변수 추가
  - `"-e", "GF_SECURITY_ALLOW_EMBEDDING=true"` 추가

### 2. Frontend (Tauri/React)

#### C:\arfni_pjt_new\arfni-gui\src-tauri\src\commands\monitoring.rs
- **전체 파일 생성**: 모니터링 관련 Tauri 명령어 구현
- **구현 함수**:
  - `prometheus_query()`: Prometheus API 쿼리 실행
  - `get_cpu_usage()`: CPU 사용률 조회
  - `get_memory_usage()`: 메모리 사용량 및 사용률 조회
  - `get_network_traffic()`: 네트워크 트래픽 조회
  - `get_disk_usage()`: 디스크 사용량 및 사용률 조회
  - `get_all_metrics()`: 모든 메트릭 일괄 조회
  - `get_monitoring_config()`: stack.yaml에서 모니터링 설정 읽기
  - `test_prometheus_connection()`: Prometheus 연결 테스트
  - `start_monitoring_stack()`: 모니터링 스택 자동 시작
  - `check_monitoring_running()`: Grafana 실행 상태 확인

#### C:\arfni_pjt_new\arfni-gui\src-tauri\src\commands\mod.rs
- **Line 추가**: `pub mod monitoring;` 모듈 선언

#### C:\arfni_pjt_new\arfni-gui\src-tauri\src\main.rs
- **Line 95-104**: invoke_handler에 10개 모니터링 명령어 등록

#### C:\arfni_pjt_new\arfni-gui\src-tauri\tauri.conf.json
- **Line 22**: CSP 정책 수정
  - `frame-src 'self' http://localhost:* https://localhost:*` 추가
  - localhost iframe 허용

#### C:\arfni_pjt_new\arfni-gui\src\pages\monitoring\ui\MonitoringPage.tsx
- **전체 파일 생성**: 모니터링 대시보드 페이지 컴포넌트
- **주요 기능**:
  - stack.yaml에서 모니터링 설정 자동 로드
  - Grafana 실행 상태 확인
  - 미실행 시 자동 시작 (최대 30초 대기)
  - Grafana 대시보드 목록 페이지 iframe 표시
  - 새 탭에서 열기 버튼 제공
  - 에러 상태 UI 및 해결 방법 안내

#### C:\arfni_pjt_new\arfni-gui\src\pages\logs\ui\LogPage.tsx
- **Line 809-816**: "Monitoring Logs" 버튼 활성화
  - `disabled` 속성 제거
  - `onClick` 핸들러 추가: MonitoringPage로 네비게이션
  - `disabled={!project || !ec2Server}` 조건부 비활성화

#### C:\arfni_pjt_new\arfni-gui\src\App.tsx
- **import 추가**: `import MonitoringPage from "./pages/monitoring/ui/MonitoringPage"`
- **Route 추가**: `<Route path="/monitoring" element={<MonitoringPage />} />`

## New Files Created

### Frontend
1. `C:\arfni_pjt_new\arfni-gui\src-tauri\src\commands\monitoring.rs`
   - 312 lines
   - Rust Tauri 백엔드 명령어

2. `C:\arfni_pjt_new\arfni-gui\src\pages\monitoring\ui\MonitoringPage.tsx`
   - 249 lines
   - React 모니터링 페이지 컴포넌트

## Technical Implementation

### Grafana iframe 임베딩
- **문제**: X-Frame-Options: deny 헤더로 인한 iframe 차단
- **해결**: GF_SECURITY_ALLOW_EMBEDDING=true 환경변수 설정
- **적용 위치**: monitoring.go (line 176), main.go (lines 676, 699)

### 자동 시작 로직
1. `get_monitoring_config()`: stack.yaml 파싱하여 설정 로드
2. `check_monitoring_running()`: Grafana 헬스체크 API 호출
3. `start_monitoring_stack()`: arfni-monitoring.exe 실행
4. 30초간 1초 간격으로 준비 상태 polling

### Dashboard URL 설정
- 초기: Grafana 홈 화면 (`http://localhost:3000`)
- 최종: 대시보드 목록 페이지 (`http://localhost:3000/dashboards`)
- 이유: UID 의존성 제거, 모든 설치 환경 호환

## Build Configuration

### 개발 모드
- `npm run tauri dev`: Go 파일 자동 빌드 없음
- 수동 빌드 필요: `npm run build:go`

### 프로덕션 빌드
- `npm run tauri build`: `beforeBuildCommand`로 `npm run build:all` 실행
- `build:all`: `build:go` 포함하여 모든 실행 파일 빌드

### 빌드된 실행 파일
- `C:\arfni_pjt_new\BE\arfni\bin\arfni-go.exe`
- `C:\arfni_pjt_new\BE\arfni\bin\arfni-monitoring.exe`
- `C:\arfni_pjt_new\BE\arfni\bin\ic.exe`

## Monitoring Stack Architecture

### Local Mode (default)
- Node Exporter: EC2
- Prometheus: Local machine
- Grafana: Local machine (port 3000)

### Hybrid Mode
- Node Exporter: EC2
- Prometheus: EC2
- Grafana: Local machine

### All-in-one Mode
- Node Exporter: EC2
- Prometheus: EC2
- Grafana: EC2

## Security Configuration

### Tauri CSP
```
frame-src 'self' http://localhost:* https://localhost:*
connect-src 'self' http://localhost:* https://localhost:* ws://localhost:* wss://localhost:*
```

### iframe sandbox
```
allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox
```

## Additional Updates (2025-01-04)

### CMD Window Suppression
**파일**: 모든 Windows Command 실행에 CREATE_NO_WINDOW 플래그 적용

#### arfni-gui/src-tauri/src/commands/monitoring.rs
- Line 6-7: CommandExt trait import 추가
- Line 268-269: start_monitoring_stack 함수에 CREATE_NO_WINDOW 상수 선언
- Line 280-283, 299-302: arfni-monitoring.exe 및 arfni-go.exe 실행 시 creation_flags 적용
- Line 237-318: ensure_docker_running 함수 추가 (Docker Desktop 자동 실행)
- Line 333-376: stop_monitoring_stack 함수 추가

#### arfni-gui/src-tauri/src/features/ssh_exec.rs
- Line 7-8: CommandExt trait import 추가
- Line 22-35: SSH 명령 실행 시 CREATE_NO_WINDOW 플래그 적용

#### arfni-gui/src-tauri/src/commands/port_check.rs
- Line 5-6: CommandExt trait import 추가
- Line 18-25, 53-60: netstat 명령 실행 시 CREATE_NO_WINDOW 플래그 적용

#### arfni-gui/src-tauri/src/commands/system.rs
- Line 4-5: CommandExt trait import 추가 (일관성 유지)

### Monitoring Stack Cleanup
**파일**: GUI 종료 시 모니터링 리소스 자동 정리

#### arfni-gui/src-tauri/src/main.rs
- Line 4: std::process::Command import 추가
- Line 31-75: on_window_event 핸들러 추가
  - CloseRequested 이벤트 처리
  - docker rm -f로 컨테이너 완전 삭제 (stop 대신 rm 사용)
  - taskkill로 ssh.exe 프로세스 종료
  - taskkill로 arfni-monitoring.exe 프로세스 종료
  - 모든 명령에 CREATE_NO_WINDOW 플래그 적용
- Line 105: stop_monitoring_stack 명령어 등록

#### arfni-gui/src/pages/monitoring/ui/MonitoringPage.tsx
- Line 29-44: useEffect cleanup 함수 추가
  - 컴포넌트 언마운트 시 stop_monitoring_stack 호출

### Docker Desktop Auto-Start
**파일**: Docker Desktop 미실행 시 자동 실행 기능

#### arfni-gui/src-tauri/src/commands/monitoring.rs
- Line 237-318: ensure_docker_running 함수 구현
  - docker info로 실행 상태 확인
  - 미실행 시 Docker Desktop.exe 자동 실행
  - 2개 경로 탐색: Program Files, Program Files (x86)
  - 최대 60초 대기 (1초 간격 polling)
  - 5초마다 진행 상황 로그 출력
- Line 325-326: start_monitoring_stack에서 ensure_docker_running 호출

### Browser Auto-Open Disabled
**파일**: Grafana 브라우저 자동 열기 비활성화

#### BE/arfni/cmd/arfni-monitoring/main.go
- Line 299: cfg.Options.AutoOpenBrowser = false 설정
  - GUI iframe으로 표시하므로 별도 브라우저 창 불필요

## Technical Details

### Windows Process Creation Flags
```rust
const CREATE_NO_WINDOW: u32 = 0x08000000;
cmd.creation_flags(CREATE_NO_WINDOW);
```
- Windows CreateProcess API의 CREATE_NO_WINDOW 플래그
- 콘솔 창 생성 억제
- 모든 subprocess 실행에 적용: docker, ssh, taskkill, netstat

### Docker Container Lifecycle
**변경 전**: docker stop (컨테이너 정지만)
**변경 후**: docker rm -f (강제 정지 및 삭제)
- 디스크 공간 절약
- 파일 잠금 문제 방지
- 다음 실행 시 깨끗한 상태 보장

### Resource Cleanup Timing
1. **페이지 이탈**: React useEffect cleanup 실행
2. **GUI 종료**: Tauri WindowEvent::CloseRequested 실행
3. **두 경로 모두 동일 로직**: docker rm -f, taskkill ssh.exe/arfni-monitoring.exe

### Docker Desktop Detection
1. docker info 실행으로 상태 확인
2. 실패 시 Docker Desktop.exe 경로 탐색
3. subprocess로 Docker Desktop 실행
4. 1초 간격 polling으로 준비 상태 확인
5. 60초 타임아웃 후 에러 메시지

## Cross-Platform Path Resolution Fix (2025-01-04)

### Issue
배포된 앱에서 monitoring 폴더를 찾지 못하는 문제 발생.
arfni-monitoring.exe가 docker-compose.yml을 찾지 못해 실행 실패.

### Root Cause Analysis
Tauri 번들 구조에서 실행 파일과 monitoring 폴더 위치:
- 실행 파일: `_up_/_up_/BE/arfni/bin/arfni-monitoring.exe`
- monitoring 폴더: `_up_/_up_/monitoring/`
- 필요한 상대 경로: `../../../monitoring` (3단계 상위)

기존 코드는 4단계 상위로 이동 후 다시 `_up_/_up_`를 추가하는 비효율적 경로 사용.

### Modified Files

#### BE/arfni/cmd/arfni-monitoring/main.go
- Line 1063-1074: findMonitoringDirectory 함수의 경로 탐색 로직 수정
- 변경 전:
  ```go
  filepath.Join(baseDir, "..", "..", "..", "..", "monitoring"),
  filepath.Join(baseDir, "..", "..", "..", "..", "_up_", "_up_", "monitoring"),
  ```
- 변경 후:
  ```go
  filepath.Join(baseDir, "..", "..", "..", "monitoring"),
  ```
- baseDir이 `_up_/_up_/BE/arfni/bin`일 때 3단계 상위로 `_up_/_up_`에 도달
- 추가 경로 탐색 없이 직접 monitoring 폴더 접근

#### arfni-gui/src-tauri/src/commands/monitoring.rs
- Line 388-418: start_monitoring_stack 함수 수정
- stdout/stderr를 null 대신 로그 파일로 리다이렉션
- 로그 파일 위치: 실행 파일과 동일 디렉토리의 monitoring.log
- 디버깅을 위해 stack.yaml 경로를 반환 메시지에 포함

### Technical Details

배포 환경의 디렉토리 구조:
```
C:\Users\[User]\Desktop\arfni-gui\
  ├─ arfni-gui.exe
  └─ _up_\
      └─ _up_\
          ├─ BE\
          │   └─ arfni\
          │       └─ bin\
          │           └─ arfni-monitoring.exe
          └─ monitoring\
              └─ docker-compose.yml
```

경로 계산:
- baseDir = filepath.Dir(os.Executable())
  = `C:\Users\[User]\Desktop\arfni-gui\_up_\_up_\BE\arfni\bin`
- filepath.Join(baseDir, "..", "..", "..", "monitoring")
  = `C:\Users\[User]\Desktop\arfni-gui\_up_\_up_\monitoring`

### Verification
로그 파일 내용 확인으로 문제 진단:
```
docker-compose.yml not found at: [incorrect path]
```
수정 후 정상 동작 확인.

## Summary

### Total Changes (Updated)
- **Modified files**: 13
- **New files**: 2
- **Lines added**: 780+
- **Go files modified**: 3
- **TypeScript/Rust files modified**: 10

### Implemented Features
- 모니터링 스택 자동 시작
- Grafana 대시보드 iframe 임베딩
- stack.yaml 기반 동적 설정
- 실행 상태 자동 감지 및 대기
- GUI 종료 시 자동 cleanup
- Docker 컨테이너 완전 삭제
- SSH 터널 프로세스 종료
- Docker Desktop 자동 실행
- CMD 창 완전 억제
- 브라우저 자동 열기 비활성화
- 크로스 플랫폼 경로 해결
- 모니터링 실행 로그 파일 생성
