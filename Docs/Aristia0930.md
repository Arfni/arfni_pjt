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
🧾 개발일지 — 2025.10.30

🛠️ 주요 개발 내용

🔹 CI/CD 파이프라인 설계 및 GitHub Actions 연동 (Spring Boot + Docker + EC2)
1. GitHub Actions 기반 CI/CD 구축

Java CI with Gradle 기본 워크플로우 분석 및 적용

on.push / on.pull_request 이벤트를 활용해 main 브랜치에 코드가 올라갈 때 자동 빌드 수행

./gradlew build 명령을 통해 Spring Boot JAR 자동 생성

actions/upload-artifact 액션을 추가하여 빌드된 JAR 파일을 GitHub Artifacts로 업로드하도록 설정
→ Actions 탭에서 직접 다운로드 가능하도록 구성

2. PEM 키 기반 원격 배포 자동화

appleboy/scp-action과 appleboy/ssh-action을 이용해 EC2 서버로 배포 자동화 구성

로컬 PEM 키 파일 대신, GitHub Secrets에 PEM 파일 내용을 문자열로 저장하여 보안 유지

SSH 접속 후 다음 스크립트를 실행하도록 설정:

기존 프로세스 종료 → 새 JAR 업로드 → nohup java -jar 로 자동 재실행

Actions 실행 시 빌드–전송–실행까지 완전 자동화

3. Docker + GHCR 기반 배포 구조 설계

GitHub Actions에서 docker/build-push-action을 이용해 Docker 이미지 빌드 및 GHCR(GitHub Container Registry) 푸시 구성 초안 작성

EC2 서버에서는 docker compose pull && up -d 로 자동 업데이트 가능하도록 설계

서비스별 이미지 태그를 latest + ${{ github.sha }} 로 관리하여 버전 롤백 용이성 확보

PEM 기반 SSH 자동 로그인 및 Health Check 후 자동 재시작 로직 구상

🧾 개발일지 — 2025.11.03
🛠️ 주요 개발 내용
포트 검사 기능 (Local + EC2) 구현 — Rust + React + SSH
🦀 Rust (Tauri Backend)
1️⃣ 로컬 포트 검사 기능 추가

명령 실행:
netstat -ano 명령어를 실행하여 현재 열린 포트 목록을 수집.

정규식 파싱:
regex 크레이트를 이용해 :포트번호 패턴만 추출.

구현 함수:

list_open_ports() → 전체 포트 원문 문자열 반환

list_listening_ports() → LISTENING 상태의 포트만 Vec<u16> 형태로 반환

기타 처리:

중복 포트 제거 및 정렬

Windows 환경에서 CP949 → UTF-8 변환(String::from_utf8_lossy) 적용으로 한글 깨짐 방지

2️⃣ EC2 포트 검사 기능 추가

SSH 명령 실행:
기존 SSH 유틸 함수 exec_once_via_system_ssh() 재활용
→ 원격 EC2 서버에서 sudo ss -tuln 명령 실행

포트 필터링:
LISTEN 상태의 TCP/UDP 포트만 정규식으로 추출하여 Vec<u16> 형태로 반환

Tauri 커맨드 등록:

#[tauri::command]
pub async fn list_ec2_listening_ports(params: SshSimpleParams)


React에서 invoke("list_ec2_listening_ports", { params }) 로 호출 가능

⚛️ React (Frontend)
1️⃣ PortTest.tsx 신규 작성

로컬 포트 검사 기능

invoke("list_open_ports") → 전체 netstat 결과 출력

invoke("list_listening_ports") → LISTENING 포트만 표시

EC2 포트 검사 기능

입력 필드: host, user, pem_path

invoke("list_ec2_listening_ports", { host, user, pem_path }) 호출로 EC2 LISTENING 포트 조회

UI 구성

LISTENING 포트 → 태그(Chip) 형태로 시각화

전체 포트 결과 → textarea 출력

오류/로딩 상태 표시

TailwindCSS 기반 반응형 레이아웃

✅ 결과

로컬 및 EC2의 LISTENING 포트를 한 화면에서 실시간 확인 가능

SSH 인증키를 활용하여 터미널 없이 GUI에서 원격 포트 스캔 가능

개발 및 운영 환경의 포트 개방 상태 점검 자동화 기반 기능 완성

🧾 개발일지 — 2025.11.04
🛠️ 주요 개발 내용
1. YMLGEN 플러그인 구조 완성 (Go)

기존 단일 하드코딩 템플릿 구조 → 외부 템플릿(.yaml.tmpl) + 메타데이터(.meta.json) 기반으로 개선

Payload 구조 설계: template, template_file, output, vars 로 구성

findTemplateByKey() 구현

exe 경로 기준 templates/ 폴더 자동 탐색

YMLGEN_TEMPLATES 환경 변수로 외부 디렉토리 지정 가능

다중 경로(exeDir, cwd, ENV) 순회하여 템플릿 검색 지원

mode: "list" 명령으로 .meta.json 자동 스캔 → 템플릿 정보(JSON)로 반환

mode: "stdin" 명령으로 전달된 변수(vars) 바인딩 → YAML 렌더링 성공

YMLGEN_DEBUG=1 환경 변수 추가 → 실행 시 템플릿 스캔 경로 출력 가능

2. React – Tauri – Go 연동 구현

React에서 invoke("run_plugin_with_mode") 로 Go 플러그인 직접 호출

mode: "list" → 템플릿 목록(JSON) 수신 후 동적 렌더링

mode: "stdin" → 선택된 템플릿 + 변수값을 전달해 YML 파일 생성

기존 하드코딩된 buildSpringYaml() 제거, 완전한 동적 구조로 변경

Tauri Rust 코드에서 YMLGEN_TEMPLATES 환경 변수 세팅 → 플러그인이 exe 옆 templates/ 폴더 인식

3. 템플릿 자동 인식 및 UI 렌더링

templates/*.meta.json 기반으로 React가 자동 폼 구성

각 템플릿별로 name, description, vars 필드 동적 반영

변수 입력 폼과 YML 미리보기 자동 갱신

PowerShell 및 React 모두에서 템플릿 2개(s, spring) 정상 인식 확인

4. 테스트 및 결과

PowerShell에서 {"mode": "list"} 입력 → 모든 템플릿 메타데이터 출력 확인

React UI에서 목록 자동 로드 및 선택 가능

YML 생성 버튼 클릭 시 YAML 텍스트 정상 렌더링 및 복사 기능 확인
🧾 개발일지 — 2025.11.05
🛠️ 주요 개발 내용

API Key 관리 기능 (DB + Tauri Command + React UI) 구현

🔹 1. SQLite 기반 api_keys 테이블 스키마 설계 및 마이그레이션 추가

새로운 마이그레이션 파일 004_add_api_keys.sql 생성

컬럼:

id, provider, label, api_key, created_at, updated_at, last_used_at, is_active

(provider, label) 기준 UNIQUE 제약 설정

Provider별로 항상 1개의 활성 키만 존재하도록 설계 (is_active 관리)

run_migrations() 함수에 버전 4 마이그레이션 로직 추가

기존 DB에서 api_key 컬럼 누락 오류 발생 → ALTER TABLE로 컬럼 추가 및 DB 재생성으로 해결

🔹 2. Rust (Tauri) 백엔드 기능 구현

경로: src-tauri/src/db/api_key.rs, src-tauri/src/commands/api_key.rs

add_or_update_api_key()
→ Provider + Label 중복 시 UPDATE, 없으면 INSERT (UPSERT)
→ set_active 플래그가 true면 같은 provider의 다른 키는 모두 비활성화
→ 트랜잭션(transaction())을 사용해 일관성 보장

list()
→ 전체 키 목록 조회 및 ApiKeyMeta 구조체로 매핑

set_active()
→ 선택한 id의 provider를 찾아 모든 키를 비활성화 후, 해당 키만 활성화

delete()
→ 지정된 id의 키 삭제

get_active_value()
→ 활성화된 키의 평문 값을 반환 (로그용 / 복사용)

#[tauri::command]로 등록된 프론트엔드용 함수
→ add_api_key, list_api_keys, delete_api_key, set_active_api_key, get_active_api_key

🔹 3. React 프론트엔드 UI 구현

파일: src/pages/ApiKeysPage.tsx

Tauri invoke() 기반 CRUD 호출 구현

주요 기능:

새 키 추가 / 업데이트 (Provider, Label, API Key 입력)

저장 후 활성화 여부 선택 (set_active 체크박스)

저장된 키 목록 조회 / 새로고침

활성화 상태 표시 (Active 배지)

키 삭제 및 활성화 전환

현재 활성 키 복사(Copy Active)

Tailwind 기반 레이아웃 구성:

상단 Add / Update 폼

하단 Saved Keys 목록

실시간 반영: 추가·삭제·활성화 시 자동 fetchList()로 갱신

🔹 4. 버그 수정 및 개선

cannot mutate immutable variable 'conn' 오류 해결
→ let mut conn = conn.lock().unwrap(); 로 변경

Rusqlite params![] 문법으로 execute 인자 수정

DB 컬럼 누락(no column named api_key) 오류 해결
→ 새 마이그레이션 파일 추가 및 DB 재생성으로 해결

Rust 반환 타입 불일치 오류 해결
→ Result<()> vs Result<String> 정리, 커맨드 함수는 Result<(), String> 형태로 통일

🔹 5. 결과 및 확인

API Key 저장, 삭제, 활성화 전환, 목록 조회, 복사 기능 모두 정상 동작 확인

Tauri <-> React 간 통신 정상 (invoke 기반)

데이터는 SQLite에 영구 저장, Provider별 단일 활성화 정책 정상 작동

🧾 개발일지 — 2025.11.07

🛠️ 오늘의 개발 내용
1. Git 클론 로직 정리 및 Rust 코드화

Git 저장소를 특정 폴더에 클론하거나, 일부 하위 폴더만 희소 체크아웃(sparse checkout)으로 받는 로직을 Rust 코드로 직접 구현했다.

std::process::Command를 사용해 로컬 Git CLI를 호출하는 형태로 구성했으며, 별도 라이브러리 없이 동작하도록 최소 의존성 설계를 유지했다.

2. 핵심 함수 구현

run_git(): Git 명령 실행 유틸리티 함수. 실행 로그를 콘솔에 출력하고 실패 시 오류 메시지를 반환.

clone_full(): 저장소 전체를 지정한 경로로 클론하는 함수.

clone_sparse(): Git 2.25+의 Sparse Checkout 기능을 활용해 특정 하위 폴더만 받는 함수.

--filter=blob:none, --sparse, --depth 1 등으로 빠른 얕은 클론 구현.

여러 디렉터리(docs, tools 등)를 동시에 지정 가능하도록 설계.

update_sparse_paths(): 이미 클론된 저장소에서 희소 체크아웃 경로를 변경하거나 추가할 수 있는 함수.

⚙️ Tauri 명령(github_commands.rs) 개선
문제점

git_clone_full 함수가 에러를 무시하고 항상 Ok(()) 반환하는 문제.

git clone 실행이 메인 스레드에서 동작해, UI 프리징(UI 정지) 가능성 존재.

개선사항

비동기 처리 적용:
tauri::async_runtime::spawn_blocking을 사용해 클론 작업을 백그라운드 스레드로 이관.
UI 응답성을 유지하며, 긴 작업(대형 저장소 클론 등) 중에도 앱이 멈추지 않도록 함.

에러 전파 개선:
io::Error를 String으로 변환하여 프론트엔드에 명확한 오류 메시지 전달.

예: Git 미설치, 네트워크 끊김 등 실제 문제를 사용자에게 보여줌.

📅 개발일지 – 2025.11.11 (화)
🔧 작업 개요

오늘은 EC2 환경에서 Nginx Reverse Proxy + HTTPS 설정을 완성하고,
기존에 배포되어 있던 landingpage-react 컨테이너를 HTTPS로 서비스하도록 구성했습니다.
DuckDNS 도메인(arfni.duckdns.org)을 이용하여 인증서를 발급받고,
리버스 프록시 및 SSL 구성을 마무리했습니다.

🧩 주요 진행 내용
1. 디렉토리 및 환경 구성

/home/ubuntu/afrninginx 디렉토리 생성
→ nginx/conf.d, nginx/logs, certbot-www, letsencrypt 구조 정리

docker-compose.yml 구성 후 Nginx 컨테이너 기동

공통 네트워크(web) 생성하여 Nginx와 React 컨테이너 간 내부 통신 연결

2. 도메인 연결 및 인증서 발급

DuckDNS에서 arfni.duckdns.org 도메인을 EC2 공인 IP로 매핑

임시 Nginx 설정(arfni.duckdns.org.temp.conf)을 이용해 HTTP-01 검증 경로 개방

certbot/certbot 컨테이너를 통한 Let’s Encrypt 인증서 발급 성공

/home/ubuntu/afrninginx/letsencrypt/live/arfni.duckdns.org/에 인증서 생성

fullchain.pem, privkey.pem 확보

3. Nginx HTTPS 설정

임시 conf 제거 후 최종 설정(arfni.duckdns.org.conf) 작성

React 앱(landingpage-react-1:3000)으로 요청을 프록시하도록 설정

HTTP → HTTPS 리다이렉트 및 WebSocket(HMR) 대응 헤더 추가

최신 문법(http2 on;)으로 수정하여 경고 제거

docker exec nginxAfrnin nginx -t && docker restart nginxAfrnin 명령으로 설정 반영

4. 내부 네트워크 연결

nginxAfrnin, landingpage-react-1 두 컨테이너를 web 네트워크에 연결

Nginx 컨테이너 내에서 wget http://landingpage-react-1:3000 테스트로 내부 통신 확인 완료

✅ 성과

https://arfni.duckdns.org 접속 시 React 프론트엔드 정상 노출

인증서 및 자동 리다이렉트, WebSocket 통신 모두 정상 동작

보안 프로토콜(TLS 1.2/1.3) 적용 완료

이후 자동 갱신(crontab)까지 설정 완료로 운영 안정성 확보