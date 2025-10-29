📅 개발일지 — 2025.10.22
🎯 목표

Tauri 애플리케이션에서 실행 파일(.exe)과 동일한 경로를 기준으로

/plugins 폴더의 플러그인 목록을 스캔하고

data/plugins.json으로 저장한 뒤

React 프론트엔드에서 목록을 읽어오는 기능을 구현한다.

🛠️ 구현 개요
1. 플러그인 스캔 (list_targets)

plugins/ 폴더에서 -x86_64-pc-windows-msvc.exe 확장자를 가진 파일 탐색

파일 이름에서 타겟명 추출

크기(size) 및 경로(path) 메타데이터 수집

결과를 Vec<TargetEntry> 형태로 리턴

동시에 data/plugins.json 파일로 저장

2. 🧱 Tauri & Vite 빌드 관련

NSIS 설치 스크립트 관련 오류 수정 진행

tauri.conf.json 내 bundle > windows > nsis 설정 오류

customNsisScript, installerHooks 옵션 구조가 스키마와 맞지 않아 빌드 실패

NSIS 스크립트(installer.nsi) 커스터마이징 작업 중

🧾 개발일지 — 2025.10.23
🛠️ 주요 개발 내용
1. EC2 SSH 정보 관리 기능 구현

Rust 측에서 SshParams 구조체 및 JSON CRUD 함수(add_or_update_entry, read_all_entries, delete_entry, update_entry) 완성

EC2 호스트, 사용자, PEM 파일 경로를 JSON으로 저장하는 로직 구현

Tauri Command 등록:

ssh_exec_system — SSH 명령 실행 (system ssh)

ec2_add_entry — SSH 항목 추가/수정

➡️ React에서 invoke()를 통해 Rust 함수 호출 가능

2. 파일 저장 경로 문제 해결

기존에는 Program Files 내부(C:\Program Files (x86)\Arfni\data\...)에 저장되어 쓰기 권한 문제 발생

해결:

JSON 저장 경로를 사용자 폴더(AppData/Roaming/Arfni/ssh_targets.json)로 이동

dirs 크레이트를 사용하여 OS별 안전한 config 디렉토리 자동 탐색

일반 사용자 권한으로 파일 생성 및 수정 가능하게 개선

3. Tauri v2 플러그인 기반 파일 다이얼로그 연동

@tauri-apps/plugin-dialog 및 tauri-plugin-dialog 등록

React의 “파일 선택” 버튼에서 PEM 파일 선택 기능 연결

취소/에러 핸들링 및 로깅 처리

open() 호출 시 결과 로그 추가로 디버깅 강화

📅 개발일지 — 2025.10.24
🛠️ 주요 개발 내용
1. 기능 명세서 작성
2. EC2 SSH 정보 관리 기능 구현

저장된 JSON 파일 수정 삭제

Tauri Command 등록:

ec2_delete_entry — SSH 항목 삭제
ec2_read_entry — 전제 조회
🧾 개발일지 — 2025.10.27

🛠️ 주요 개발 내용
1. 실시간 SSH 세션 기능 구현 (Tauri v2 + Rust)

Rust 측

ssh_rt.rs 모듈 신규 작성

ssh2 크레이트 기반 실시간 인터랙티브 SSH 세션 구현

주요 구조체 및 로직

SshParams: 호스트, 사용자, PEM 경로

start_interactive_session: SSH 접속 및 세션 생성

send_command: 실시간 명령 송신

close_session: 세션 종료 및 정리

AppHandle.emit()을 활용해 stdout/stderr를 프런트로 이벤트 스트리밍

전역 세션 관리용 OnceCell<Mutex<HashMap<Uuid, SshHandle>>> 구조 설계

🧾 개발일지 — 2025.10.29

🛠️ 주요 개발 내용

HTTP 기반 헬스체크 기능 구현 (Rust + React + Spring)

Rust (Tauri Backend)

reqwest 크레이트를 활용한 HTTP Health Check 모듈 신규 작성

HealthResponse 구조체 정의 (status, service 필드)

check_http_health_internal() 함수에서

지정된 URL로 GET 요청

JSON 응답({"status": "UP"}) 또는 HTTP 상태 코드 기반 성공 판정

React에서 호출 가능한 Tauri 커맨드로 #[tauri::command] pub async fn check_http_health() 등록

비정상 응답 시 에러 로그 출력 및 false 반환 로직 추가

React (프론트엔드)

HealthWatcher.tsx 컴포넌트 신규 작성

invoke("check_http_health", { url }) 로 Rust 커맨드 호출

5초 간격으로 /health 엔드포인트를 폴링하여 상태 표시

상태에 따라 🟢 UP / 🔴 DOWN / ⚠️ Error 아이콘 표시

Start / Stop 버튼을 통한 헬스체크 주기적 감시 제어 기능 추가

UI는 Tailwind 기반으로 제작

Spring (서버)

테스트용 TestController 작성 (GET / → "테스트")

헬스체크용 /health 엔드포인트 추가 ({"status": "UP"} 반환)

Actuator 설정(application.properties) 추가:

management.endpoints.web.exposure.include=health
management.endpoint.health.show-details=always
management.endpoint.health.probes.enabled=true


/actuator/health, /actuator/health/liveness 등 프로브 활성화 확인 완료

결과

EC2 및 로컬 Spring 서버 상태를 Rust 기반으로 주기적 감시 가능

GUI 상에서 서버 상태를 실시간으로 시각화

추후 Docker 컨테이너 헬스체크 및 자동 재시작 로직으로 확장 예정