# ARFNI 시스템 아키텍처 문서

## 📋 목차
1. [전체 시스템 구조](#1-전체-시스템-구조)
2. [데이터베이스 구조 (SQLite)](#2-데이터베이스-구조-sqlite)
3. [프로젝트 생성 플로우](#3-프로젝트-생성-플로우)
4. [배포 플로우](#4-배포-플로우)
5. [데이터 저장 및 조회](#5-데이터-저장-및-조회)
6. [주요 기술 스택](#6-주요-기술-스택)

---

## 1. 전체 시스템 구조

```
┌─────────────────────────────────────────────────────────┐
│                    ARFNI GUI (Tauri)                     │
├─────────────────────────────────────────────────────────┤
│  Frontend (React + TypeScript)                           │
│  ├─ React Flow (Canvas)                                  │
│  ├─ Redux Toolkit (상태 관리)                            │
│  └─ React Router (페이지 라우팅)                         │
├─────────────────────────────────────────────────────────┤
│  Backend (Rust + Tauri)                                  │
│  ├─ SQLite (arfni.db) - 프로젝트, EC2 서버 정보          │
│  ├─ 파일 시스템 - stack.yaml, Canvas 상태                │
│  └─ Go Backend 실행 (arfni-go.exe)                       │
├─────────────────────────────────────────────────────────┤
│  Go Backend (arfni-go)                                   │
│  ├─ stack.yaml 파싱                                      │
│  ├─ Docker/Docker Compose 실행                           │
│  ├─ SSH 연결 (EC2)                                       │
│  └─ 배포 워크플로우 실행                                  │
└─────────────────────────────────────────────────────────┘
```

---

## 2. 데이터베이스 구조 (SQLite)

### 2.1 데이터베이스 위치
- **경로**: `%APPDATA%/com.ssafy.arfni-gui/arfni.db`
- **예시**: `C:\Users\사용자명\AppData\Roaming\com.ssafy.arfni-gui\arfni.db`

### 2.2 테이블 스키마

#### `projects` 테이블
프로젝트 정보 저장

```sql
CREATE TABLE projects (
    id TEXT PRIMARY KEY,              -- UUID
    name TEXT NOT NULL,               -- 프로젝트 이름
    path TEXT NOT NULL UNIQUE,        -- 프로젝트 경로 (절대 경로)
    environment TEXT NOT NULL,        -- 'local' 또는 'ec2'
    ec2_server_id TEXT,               -- EC2 서버 ID (FK)
    description TEXT,                 -- 프로젝트 설명
    created_at TEXT NOT NULL,         -- 생성 시간 (ISO8601)
    updated_at TEXT NOT NULL,         -- 수정 시간 (ISO8601)
    FOREIGN KEY (ec2_server_id) REFERENCES ec2_servers(id)
);
```

#### `recent_projects` 테이블
최근 열었던 프로젝트 기록

```sql
CREATE TABLE recent_projects (
    project_id TEXT PRIMARY KEY,      -- 프로젝트 ID (FK)
    last_opened_at TEXT NOT NULL,     -- 마지막 열람 시간
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);
```

#### `ec2_servers` 테이블
EC2 서버 정보 저장

```sql
CREATE TABLE ec2_servers (
    id TEXT PRIMARY KEY,              -- UUID
    name TEXT NOT NULL,               -- 서버 이름
    host TEXT NOT NULL,               -- IP 또는 도메인
    user TEXT NOT NULL,               -- SSH 사용자명
    pem_path TEXT NOT NULL,           -- PEM 키 경로
    workdir TEXT,                     -- 작업 디렉토리 (기본: /home/ubuntu)
    mode TEXT,                        -- 모니터링 모드: all-in-one, hybrid, no-monitoring
    created_at TEXT NOT NULL,         -- 생성 시간
    updated_at TEXT NOT NULL,         -- 수정 시간
    last_connected_at TEXT            -- 마지막 연결 시간
);
```

### 2.3 데이터베이스 초기화

- **위치**: `src-tauri/src/db/mod.rs`
- **시점**: 앱 시작 시 (main.rs의 `setup` hook)
- **마이그레이션**:
  - 스키마 버전 관리 (`schema_version` 테이블)
  - 자동 마이그레이션 실행 (`apply_migrations()`)

```rust
// src-tauri/src/lib.rs
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            // 데이터베이스 초기화
            let app_dir = app.path().app_data_dir()?;
            let db_path = app_dir.join("arfni.db");
            println!("📁 Database path: {:?}", db_path);

            let conn = db::init_database(&db_path)?;
            db::apply_migrations(&conn)?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![...])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

---

## 3. 프로젝트 생성 플로우

### 3.1 Local 프로젝트 생성

```
[사용자] ProjectsPage > "새 프로젝트" 버튼 클릭
    ↓
[Frontend] NewProjectModal 표시
    ↓
[사용자] 프로젝트 정보 입력
    - 이름
    - 경로 (폴더 선택)
    - 환경: Local 선택
    - (옵션) 설명
    ↓
[Frontend] Redux - createProject() dispatch
    ↓
[Rust] project::create_project() 실행
    ├─ 1. 프로젝트 폴더 생성 (path)
    ├─ 2. SQLite에 저장
    │   INSERT INTO projects (id, name, path, environment, ...)
    ├─ 3. 빈 stack.yaml 파일 생성
    │   path/stack.yaml
    ├─ 4. Canvas 상태 파일 생성
    │   path/.arfni/canvas_state.json
    └─ 5. 반환: Project 객체
    ↓
[Frontend] Redux 상태 업데이트
    - currentProject 설정
    - recentProjects에 추가
    ↓
[Frontend] /canvas 페이지로 이동
    - Canvas 초기 상태 (빈 캔버스)
```

### 3.2 EC2 프로젝트 생성

```
[사용자] ProjectsPage > EC2 탭 > "새 프로젝트" 버튼
    ↓
[사용자] EC2 서버 선택 또는 추가
    ├─ "서버 선택" 버튼 클릭
    ├─ ServerSelectionModal 표시
    │   - 기존 서버 목록 (from ec2_servers 테이블)
    │   - "서버 추가" 버튼
    │       ↓
    │   AddServerModal 표시
    │   - 이름, Host, User, PEM 경로, Workdir, 모니터링 모드
    │   - SSH 연결 테스트 (필수)
    │       ↓
    │   [Rust] ssh_exec_system() 실행
    │       echo "connection_test"
    │       ↓
    │   연결 성공 시 서버 저장
    │       INSERT INTO ec2_servers (...)
    └─ 서버 선택
    ↓
[Frontend] NewProjectModal 표시
    - 프로젝트 정보 입력
    - 선택된 EC2 서버 정보 표시
    ↓
[Rust] project::create_project() 실행
    - environment='ec2'
    - ec2_server_id 설정
    ↓
[Frontend] Canvas에 EC2 Target 노드 자동 생성
    - type: 'target'
    - data: { type: 'ec2.ssh', host, user, sshKey, workdir, mode }
```

### 3.3 Canvas 상태 저장

```
[사용자] Canvas에서 노드/엣지 추가/수정
    ↓
[Frontend] React Flow onChange
    ↓
[Redux] canvasSlice 상태 업데이트
    - nodes: Node[]
    - edges: Edge[]
    - isDirty: true
    ↓
[사용자] "Save" 버튼 클릭
    ↓
[Frontend] stackYamlGenerator 실행
    ├─ Canvas 상태 → stack.yaml 변환
    └─ StackYamlData 생성
    ↓
[Rust] project::save_stack_yaml() 실행
    ├─ 1. stack.yaml 파일 저장
    │   {project_path}/stack.yaml
    ├─ 2. Canvas 상태 JSON 저장
    │   {project_path}/.arfni/canvas_state.json
    │   { nodes, edges, ... }
    └─ 3. projects 테이블 updated_at 갱신
    ↓
[Redux] lastSaved 타임스탬프 업데이트
    - isDirty: false
```

---

## 4. 배포 플로우

### 4.1 Local 배포

```
[사용자] Canvas > "Deploy" 버튼 클릭
    ↓
[Frontend] Toolbar - handleDeploy() 실행
    ├─ 1. 저장되지 않은 변경사항 확인
    │   isDirty === true → 저장 여부 확인
    │
    ├─ 2. Docker 검증 (Local만!)
    │   [Rust] check_docker() - docker --version
    │   [Rust] check_docker_running() - docker ps
    │   실패 시 → 에러 알림 & 중단
    │
    ├─ 3. Redux - startDeployment() dispatch
    │   deploymentSlice: status='deploying'
    │
    ├─ 4. navigate('/deployment')
    │   DeploymentPage로 이동
    │
    └─ 5. [Rust] deploy_stack() 실행
        ├─ Go 바이너리 경로 찾기
        │   arfni-go.exe 위치 탐색
        │
        ├─ 백그라운드 스레드 생성
        │   Command::new(arfni-go.exe)
        │       .arg("run")
        │       .arg("-f").arg(stack.yaml)
        │       .arg("-project-dir").arg(project_path)
        │
        ├─ 프로세스 ID 저장 (DEPLOYMENT_PROCESS)
        │   전역 Mutex<Option<u32>>
        │
        ├─ stdout/stderr 스트리밍
        │   ├─ NDJSON 파싱
        │   │   {"level":"info","message":"..."}
        │   │   → deployment-log 이벤트 발생
        │   │
        │   └─ __OUTPUTS__ 감지
        │       __OUTPUTS__{"service_count":4,"endpoints":[...]}
        │       → JSON 파싱 → outputs_data 저장
        │
        └─ 프로세스 종료 대기
            ├─ 성공: deployment-completed 이벤트
            │   { status, message, outputs }
            │
            └─ 실패: deployment-failed 이벤트
                { status, message, error }
```

### 4.2 Go Backend 배포 워크플로우

```
[Go] arfni-go run -f stack.yaml -project-dir ./
    ↓
1. stack.yaml 파싱
   internal/core/stack/parser.go
    ↓
2. 5단계 워크플로우 실행
   internal/core/workflow/runner.go

   Phase 1/5: Preflight checks
   - stack.yaml 검증
   - Docker 연결 확인
   - 타겟 접근성 확인

   Phase 2/5: Generating Docker files
   - docker-compose.yml 생성
   - Dockerfile 생성 (build가 있는 경우)
   - .arfni/compose/ 디렉토리에 저장

   Phase 3/5: Building images
   - docker-compose build 실행
   - 이미지 빌드 로그 스트리밍

   Phase 4/5: Deploying containers
   - docker-compose up -d 실행
   - 컨테이너 시작

   Phase 5/5: Health checks
   - HTTP/TCP 헬스체크 실행
   - 서비스 정상 동작 확인
    ↓
3. 배포 결과 출력
   __OUTPUTS__{
     "status": "success",
     "service_count": 4,
     "container_count": 4,
     "compose_dir": ".arfni/compose",
     "endpoints": [
       {"name":"react","url":"http://localhost:3000","type":"service"},
       {"name":"spring","url":"http://localhost:8080","type":"service"},
       ...
     ]
   }
```

### 4.3 DeploymentPage UI 업데이트

```
[Frontend] DeploymentPage
    ├─ useEffect - 이벤트 리스너 등록
    │   ├─ onDeploymentLog
    │   │   Redux - addLog() dispatch
    │   │   로그 실시간 표시
    │   │
    │   ├─ onDeploymentCompleted
    │   │   ├─ outputs 파싱
    │   │   │   service_count, endpoints 추출
    │   │   └─ Redux - deploymentSuccess() dispatch
    │   │       status='success'
    │   │
    │   └─ onDeploymentFailed
    │       Redux - deploymentFailed() dispatch
    │       status='failed'
    │
    ├─ 진행 중 (status='deploying')
    │   ├─ Log/Canvas 탭
    │   ├─ 6단계 진행 표시
    │   │   준비 → 생성 → 빌드 → 시작 → 후처리 → 상태확인
    │   │   (로그 "Phase X/5" 파싱)
    │   ├─ 실시간 로그
    │   └─ 중지 버튼
    │
    ├─ 성공 (status='success')
    │   ├─ 배포 통계
    │   │   - 소요 시간
    │   │   - 서비스 개수
    │   ├─ 엔드포인트 목록
    │   │   각 서비스의 URL (클릭 가능)
    │   └─ "확인" 버튼 → /projects
    │
    └─ 실패 (status='failed')
        ├─ 에러 메시지
        ├─ 최근 로그 (마지막 20줄)
        └─ "Canvas로 돌아가기" 버튼 → /canvas
```

### 4.4 배포 중지

```
[사용자] DeploymentPage > "중지" 버튼
    ↓
[Frontend] handleStopDeployment()
    ↓
[Rust] stop_deployment() 실행
    ├─ DEPLOYMENT_PROCESS에서 PID 가져오기
    │
    ├─ Windows: taskkill /F /PID <pid> /T
    │   Unix/Mac: kill -TERM <pid> → kill -KILL <pid>
    │
    ├─ PID 제거
    └─ DEPLOYMENT_RUNNING = false
```

---

## 5. 데이터 저장 및 조회

### 5.1 프로젝트 데이터 구조

```
프로젝트 폴더 (예: C:/Projects/my-app/)
├─ stack.yaml                    # 배포 정의 파일
├─ .arfni/
│  ├─ canvas_state.json          # Canvas 상태
│  │  {
│  │    "nodes": [...],
│  │    "edges": [...]
│  │  }
│  └─ compose/                   # 생성된 Docker 파일들
│     ├─ docker-compose.yml
│     └─ Dockerfile (필요시)
└─ (사용자 소스 코드)
```

### 5.2 SQLite 조회 흐름

#### 프로젝트 목록 조회
```
[Frontend] ProjectsPage 렌더링
    ↓
[Redux] loadRecentProjects() thunk
    ↓
[Rust] project::get_recent_projects()
    ↓
SELECT p.*
FROM projects p
INNER JOIN recent_projects r ON p.id = r.project_id
ORDER BY r.last_opened_at DESC
LIMIT 10
    ↓
[Frontend] recentProjects 상태 업데이트
    - Local 탭: environment='local' 필터링
    - EC2 탭: environment='ec2' 필터링
```

#### 프로젝트 열기
```
[사용자] ProjectsPage > 프로젝트 "Edit" 버튼
    ↓
[Redux] openProject(path) thunk
    ↓
[Rust] project::open_project_by_path()
    ├─ 1. projects 테이블 조회
    │   SELECT * FROM projects WHERE path = ?
    │
    ├─ 2. Canvas 상태 로드
    │   {path}/.arfni/canvas_state.json 읽기
    │
    ├─ 3. EC2 프로젝트인 경우
    │   SELECT * FROM ec2_servers WHERE id = ?
    │   → Target 노드 자동 생성/업데이트
    │
    └─ 4. recent_projects 업데이트
        INSERT OR REPLACE INTO recent_projects
        (project_id, last_opened_at)
    ↓
[Redux] Canvas 상태 로드
    - loadCanvasState({ nodes, edges })
    ↓
[Frontend] /canvas 이동
```

#### EC2 서버 조회
```
[Frontend] ServerSelectionModal
    ↓
[Rust] ec2_server::list_servers()
    ↓
SELECT * FROM ec2_servers
ORDER BY last_connected_at DESC NULLS LAST, created_at DESC
    ↓
[Frontend] 서버 목록 표시
    - 이름, Host, 마지막 연결 시간
```

### 5.3 파일 와처

```
[Rust] file_watcher::watch_stack_yaml(path)
    ├─ notify 라이브러리 사용
    ├─ stack.yaml 변경 감지
    └─ 'file-changed' 이벤트 발생
        { path, event_type: 'modified' }
    ↓
[Frontend] 이벤트 리스너
    - 외부에서 stack.yaml 수정 감지
    - 사용자에게 알림 (미구현)
```

---

## 6. 주요 기술 스택

### 6.1 Frontend
- **프레임워크**: React 18 + TypeScript
- **상태 관리**: Redux Toolkit
- **라우팅**: React Router v6
- **Canvas**: React Flow
- **UI**: Tailwind CSS
- **아이콘**: Lucide React
- **HTTP 클라이언트**: Tauri invoke (IPC)

### 6.2 Backend (Rust)
- **프레임워크**: Tauri 2.0
- **데이터베이스**: rusqlite (SQLite)
- **파일 감시**: notify
- **SSH**: 없음 (Go backend에서 처리)
- **비동기**: tokio

### 6.3 Backend (Go)
- **프레임워크**: 표준 라이브러리
- **YAML 파싱**: gopkg.in/yaml.v3
- **SSH**: golang.org/x/crypto/ssh
- **Docker**: os/exec (docker, docker-compose 명령어)

### 6.4 데이터베이스
- **종류**: SQLite 3
- **파일 위치**:
  - Windows: `%APPDATA%/com.ssafy.arfni-gui/arfni.db`
  - Mac: `~/Library/Application Support/com.ssafy.arfni-gui/arfni.db`
  - Linux: `~/.local/share/com.ssafy.arfni-gui/arfni.db`

---

## 7. 주요 파일 경로

### Frontend
```
arfni-gui/src/
├─ app/
│  └─ store.ts                    # Redux store
├─ features/
│  ├─ canvas/
│  │  ├─ model/canvasSlice.ts    # Canvas 상태
│  │  └─ lib/stackYamlGenerator.ts # YAML 생성
│  ├─ project/
│  │  └─ model/projectSlice.ts   # 프로젝트 상태
│  └─ deployment/
│     └─ model/deploymentSlice.ts # 배포 상태
├─ pages/
│  ├─ logs/ui/ProjectsPage.tsx   # 프로젝트 목록
│  ├─ canvas/ui/CanvasPage.tsx   # Canvas 편집
│  └─ deployment/ui/DeploymentPage.tsx # 배포 진행
├─ widgets/
│  └─ toolbar/ui/Toolbar.tsx     # Save, Validate, Deploy
└─ shared/api/tauri/commands.ts  # Tauri 명령어 래퍼
```

### Backend (Rust)
```
arfni-gui/src-tauri/src/
├─ lib.rs                        # Tauri 앱 진입점
├─ db/
│  ├─ mod.rs                     # DB 초기화
│  └─ migrations.rs              # 스키마 마이그레이션
├─ commands/
│  ├─ project.rs                 # 프로젝트 CRUD
│  ├─ deployment.rs              # 배포 실행
│  ├─ ec2_server.rs              # EC2 서버 관리
│  └─ file_watcher.rs            # 파일 감시
└─ Cargo.toml                    # 의존성
```

### Backend (Go)
```
BE/arfni/
├─ cmd/arfni/main.go             # CLI 진입점
├─ internal/
│  ├─ core/
│  │  ├─ stack/
│  │  │  ├─ parser.go            # YAML 파싱
│  │  │  └─ types.go             # 타입 정의
│  │  └─ workflow/
│  │     ├─ runner.go            # 5단계 워크플로우
│  │     ├─ docker.go            # Docker 실행
│  │     └─ ssh.go               # EC2 SSH
│  └─ events/
│     └─ stream.go               # 로그 스트리밍
└─ bin/
   └─ arfni-go.exe               # 빌드된 바이너리
```

---

## 8. 환경 변수 및 설정

### Tauri 앱 ID
- `com.ssafy.arfni-gui`
- 데이터 디렉토리 경로 결정에 사용

### Go 바이너리 경로 탐색 순서
1. `{project_path}/../bin/arfni-go.exe`
2. `{exe_dir}/../bin/arfni-go.exe`
3. `{exe_dir}/../../BE/arfni/bin/arfni-go.exe` (개발 환경)

### Docker 요구사항
- Docker Desktop 설치 (Local 배포)
- Docker Compose V2
- Docker daemon 실행 중

---

## 9. 에러 처리

### Docker 검증 실패
- **시점**: Local 배포 시작 전
- **검증 항목**:
  1. `docker --version` 성공
  2. `docker ps` 성공 (daemon 확인)
- **실패 시**: Alert 표시 + 배포 중단

### SSH 연결 실패
- **시점**: EC2 서버 추가/선택 시
- **검증**: `echo "connection_test"` 실행
- **실패 시**: 에러 메시지 표시 + 서버 추가 불가

### Go 바이너리 없음
- **시점**: 배포 실행 시
- **탐색 실패**: deployment-failed 이벤트 발생
- **에러**: "Go 바이너리를 찾을 수 없습니다"

### 배포 실패
- **시점**: Go backend 실행 중
- **처리**:
  1. stderr 로그 수집
  2. deployment-failed 이벤트
  3. DeploymentPage에 에러 표시
  4. "Canvas로 돌아가기" 버튼 제공

---

## 10. 보안 고려사항

### PEM 키 저장
- **저장 위치**: SQLite의 `ec2_servers.pem_path` (파일 경로만)
- **실제 키**: 사용자 파일 시스템에 보관
- **전송**: Go backend에 경로만 전달

### SQLite 보안
- **암호화**: 없음 (로컬 데이터)
- **권한**: 사용자 AppData 디렉토리 (OS 권한 관리)

### SSH 연결
- **방식**: Key-based authentication
- **라이브러리**: Go `golang.org/x/crypto/ssh`

---

이 문서는 ARFNI 시스템의 전체 아키텍처와 데이터 흐름을 설명합니다.
세부 구현은 각 소스 코드 파일의 주석을 참고하세요.
