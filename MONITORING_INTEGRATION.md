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

## Summary

### Total Changes
- **Modified files**: 7
- **New files**: 2
- **Lines added**: 561
- **Go files modified**: 2
- **TypeScript/Rust files modified**: 5

### Key Features
- 모니터링 스택 자동 시작
- Grafana 대시보드 iframe 임베딩
- stack.yaml 기반 동적 설정
- 실행 상태 자동 감지 및 대기
- 에러 처리 및 사용자 안내
