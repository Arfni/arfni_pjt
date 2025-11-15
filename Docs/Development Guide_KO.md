# Development Guide

개발자 및 기여자를 위한 Arfni 프로젝트 개발 가이드입니다.

## 프로젝트 구조

```
arfni_pjt/
├── arfni-gui/                    # Tauri 기반 데스크톱 애플리케이션
│   ├── src/                      # React 프론트엔드 (Feature-Sliced Design)
│   │   ├── app/                  # 앱 초기화, 전역 스타일
│   │   ├── pages/                # 페이지 컴포넌트
│   │   │   ├── canvas/           # 시각적 프로젝트 편집기
│   │   │   ├── deployment/       # 배포 페이지
│   │   │   ├── logs/             # 로그 및 모니터링 페이지
│   │   │   │   └── ui/
│   │   │   │       ├── LogPage.tsx
│   │   │   │       ├── MonitoringPage.tsx
│   │   │   │       ├── MonitoringView.tsx
│   │   │   │       ├── OptimizeView.tsx      # EC2 최적화 및 비용 추정
│   │   │   │       ├── ContainersView.tsx
│   │   │   │       └── TerminalView.tsx
│   │   │   ├── projects/         # 프로젝트 목록
│   │   │   ├── settings/         # 설정 페이지
│   │   │   └── test/             # 테스트 페이지
│   │   ├── features/             # 비즈니스 로직 기능
│   │   │   ├── canvas/           # Canvas 드래그앤드롭 로직
│   │   │   │   ├── hooks/        # Canvas hooks
│   │   │   │   ├── lib/          # yamlConverter 등
│   │   │   │   ├── model/        # Canvas 상태 관리
│   │   │   │   └── ui/           # Canvas UI 컴포넌트
│   │   │   ├── deployment/       # 배포 상태 관리
│   │   │   │   └── model/
│   │   │   └── project/          # 프로젝트 관리 로직
│   │   │       └── model/
│   │   ├── entities/             # 비즈니스 엔티티
│   │   │   ├── service/          # 서비스 노드
│   │   │   │   └── ui/
│   │   │   └── target/           # 타겟 노드
│   │   │       └── ui/
│   │   ├── shared/               # 공유 컴포넌트/유틸
│   │   │   ├── api/tauri/        # Tauri IPC 호출
│   │   │   ├── config/i18n/      # 다국어 설정
│   │   │   └── ui/               # 공통 UI 컴포넌트
│   │   └── widgets/              # 복합 UI 위젯
│   │       ├── canvas-editor/    # Canvas 편집기
│   │       ├── log-viewer/       # 로그 뷰어
│   │       ├── node-palette/     # 노드 팔레트
│   │       ├── property-panel/   # 속성 패널
│   │       ├── titlebar/         # 타이틀바
│   │       ├── toolbar/          # 툴바
│   │       │   └── ui/dialogs/
│   │       │       └── OptimizeDialog.tsx    # 최적화 다이얼로그
│   │       └── yaml-editor/      # YAML 에디터
│   │
│   └── src-tauri/                # Rust 백엔드 (Tauri Commands)
│       ├── src/
│       │   ├── commands/         # Tauri 명령어 모듈
│       │   │   ├── project.rs    # 프로젝트 CRUD, stack.yaml 생성
│       │   │   ├── deployment.rs # 배포 실행 (Go 바이너리 호출)
│       │   │   ├── monitoring.rs # 모니터링 서비스 제어
│       │   │   ├── plugin.rs     # 플러그인 관리
│       │   │   ├── ssh.rs        # SSH 키 관리
│       │   │   ├── health.rs     # 컨테이너 헬스 체크
│       │   │   └── pricing.rs    # EC2 가격 계산
│       │   ├── db/               # SQLite 데이터베이스
│       │   │   ├── mod.rs        # DB 초기화, 마이그레이션
│       │   │   └── api_key.rs    # API 키 저장소
│       │   └── features/         # 기능 모듈
│       │       ├── health_check.rs  # 헬스체크 로직
│       │       └── ssh_rt.rs     # 실시간 SSH 터미널
│       │
│       └── resources/            # 리소스 파일 (바이너리에 번들)
│           ├── bin/              # Go 바이너리 (arfni-go, ic, monitoring)
│           └── plugins/          # 번들된 플러그인
│               └── bundled/
│                   ├── framework/        # 프레임워크 플러그인
│                   │   ├── react/
│                   │   ├── nextjs/
│                   │   ├── springboot/
│                   │   ├── fastapi/
│                   │   ├── flask/
│                   │   └── nodejs/
│                   ├── database/         # 데이터베이스 플러그인
│                   │   ├── mysql/
│                   │   ├── postgresql/
│                   │   └── mongodb/
│                   ├── cache/            # 캐시 플러그인
│                   │   └── redis/
│                   └── monitoring/       # 모니터링 플러그인
│                       ├── prometheus/
│                       ├── grafana/
│                       └── node-exporter/
│
├── BE/arfni/                     # Go 백엔드 엔진
│   ├── cmd/                      # 엔트리포인트
│   │   ├── arfni-go/             # 통합 CLI (run, status 명령)
│   │   │   └── main.go
│   │   ├── ic/                   # IC 엔진 (배포 파이프라인 실행)
│   │   │   └── main.go
│   │   └── arfni-monitoring/     # 모니터링 서비스 (Prometheus 데이터 수집)
│   │       └── main.go
│   │
│   ├── internal/                 # 내부 로직 (외부 노출 금지)
│   │   ├── core/                 # 핵심 비즈니스 로직
│   │   │   ├── workflow/         # 배포 워크플로우
│   │   │   │   ├── runner.go     # 배포 파이프라인 오케스트레이션
│   │   │   │   ├── ssh.go        # EC2 SSH/SCP 통신
│   │   │   │   ├── arfniignore.go # 파일 제외 패턴 매칭
│   │   │   │   ├── dockerfile.go # Dockerfile 빌드 타입 감지
│   │   │   │   └── dockerfile_writer.go # Dockerfile 템플릿 생성
│   │   │   ├── stack/            # stack.yaml 파싱/검증
│   │   │   ├── plugin/           # 플러그인 로더
│   │   │   ├── monitoring/       # 모니터링 설정 생성
│   │   │   └── state/            # 상태 저장소
│   │   │
│   │   ├── generator/            # 파일 생성기
│   │   │   ├── compose/          # docker-compose.yml 생성
│   │   │   │   └── generator.go
│   │   │   └── dockerfile/       # Dockerfile 생성 (템플릿 기반)
│   │   │       └── generator.go
│   │   │
│   │   ├── drivers/              # 외부 드라이버
│   │   │   └── ec2/              # AWS EC2 연동
│   │   │
│   │   ├── events/               # 이벤트 스트림 (로그 전송)
│   │   │   └── stream.go
│   │   │
│   │   ├── pricing/              # EC2 가격 계산 로직
│   │   │   └── data/             # 가격 데이터
│   │   │
│   │   └── utils/                # 유틸리티
│   │       ├── logger/           # 로깅
│   │       ├── config/           # 설정 관리
│   │       ├── secrets/          # 비밀 정보 처리
│   │       └── version/          # 버전 관리
│   │
│   ├── pkg/                      # 외부 노출 가능한 패키지
│   │   └── stackschema/          # stack.yaml JSON Schema
│   │
│   ├── bin/                      # 빌드된 바이너리 출력
│   ├── examples/                 # 예제 프로젝트
│   └── scripts/                  # 빌드 스크립트
│
├── FE/                           # 랜딩 페이지 (별도 React 프로젝트)
├── Docs/                         # 문서
└── TEST/                         # 테스트 프로젝트
```

---

## 개발 환경 설정

### 필수 도구

| 도구 | 버전 | 근거 | 용도 |
| --- | --- | --- | --- |
| Node.js | 18+ | React 19.1.0 요구사항 | React 프론트엔드 빌드 |
| Rust | 1.70+ | Tauri 2.9 최소 요구사항 | Tauri 백엔드 빌드 |
| Go | 1.25.2 | `BE/arfni/go.mod` | IC 엔진 빌드 |
| Docker Desktop | Latest | - | 로컬 배포 테스트 |
| npm/pnpm | Latest | - | 패키지 매니저 |

### Windows 개발 환경 추가 요구사항

| 도구 | 버전 | 용도 |
| --- | --- | --- |
| Perl | 5.30+ | Rust 네이티브 의존성 빌드 (ssh2 크레이트의 OpenSSL 컴파일) |
| Visual Studio Build Tools | 2019+ | Rust MSVC 툴체인 |

**Perl 설치**:
- Strawberry Perl 권장: https://strawberryperl.com/
- 또는 ActivePerl: https://www.activestate.com/products/perl/

설치 후 확인:

```bash
perl --version
```

**Visual Studio Build Tools 설치**:
- https://visualstudio.microsoft.com/downloads/
- “C++ 빌드 도구” 워크로드 선택

### 사용 중인 주요 라이브러리 버전

| 라이브러리 | 버전 | 파일 |
| --- | --- | --- |
| React | 19.1.0 | `arfni-gui/package.json` |
| TypeScript | 5.8.3 | `arfni-gui/package.json` |
| Tauri | 2.9 | `arfni-gui/src-tauri/Cargo.toml` |
| Vite | 7.0.4 | `arfni-gui/package.json` |

### 초기 설정

```bash
# 1. 저장소 클론git clone https://github.com/Arfni/arfni_pjt.git
cd arfni_pjt
# 2. GUI 프론트엔드 의존성 설치cd arfni-gui
npm install
# 3. Go 의존성 설치cd ../BE/arfni
go mod download
# 4. Tauri 개발 모드 실행 (첫 실행 시 Rust 의존성 자동 설치)cd ../../arfni-gui
npm run tauri dev
```

---

## 빌드 방법

### GUI 애플리케이션

```bash
cd arfni-gui
# 개발 모드 (핫 리로드)npm run tauri dev
# 프로덕션 빌드npm run tauri build
```

출력 위치: `arfni-gui/src-tauri/target/release/`

### Go 엔진

```bash
cd BE/arfni
# arfni-go (통합 CLI)go build -o bin/arfni-go.exe ./cmd/arfni-go
# ic (배포 엔진)go build -o bin/ic.exe ./cmd/ic
# arfni-monitoring (모니터링 서비스)go build -o bin/arfni-monitoring.exe ./cmd/arfni-monitoring
```

출력 위치: `BE/arfni/bin/`

---

## 주요 기능별 파일 위치

### 1. 프로젝트 생성/관리

**파일 위치**
- **Rust**: `arfni-gui/src-tauri/src/commands/project.rs`
- **React**: `arfni-gui/src/features/project/`

**주요 함수**
- `create_project()`: 프로젝트 폴더 생성, stack.yaml 초기화, .arfniignore 생성
- `open_project()`: 프로젝트 열기, 잠금 파일 관리
- `save_stack_yaml()`: stack.yaml 저장 + Canvas 상태 저장 (.arfni/canvas-state.json)
- `load_canvas_state()`: Canvas 상태 복원

**생성되는 파일**

`create_project()` 함수에서 자동 생성:
- `stack.yaml`: 프로젝트 초기 구성 (services, targets 정의)
- `.arfniignore`: 배포 시 제외할 파일 패턴 (node_modules, venv 등)
- `.arfni/` 디렉토리: 프로젝트 메타데이터 저장
- `.arfni/data/`: Docker 볼륨 데이터
- `.arfni/compose/`: 생성된 docker-compose.yml 저장
- `.arfni/canvas-state.json`: Canvas 편집 상태

**수정 시나리오**
- 프로젝트 생성 시 추가 파일 필요: `create_project()` 함수 수정
- stack.yaml 스키마 변경: `BE/arfni/pkg/stackschema/` 동시 수정 필요

---

### 2. 배포 (Deployment)

**파일 위치**
- **Go 엔진**: `BE/arfni/internal/core/workflow/runner.go`
- **Rust 명령**: `arfni-gui/src-tauri/src/commands/deployment.rs`
- **React UI**: `arfni-gui/src/pages/deployment/`

**배포 파이프라인 (5단계)**

`ExecuteWithPlugins()` 함수에서 실행하는 5개 Phase:

| Phase | 설명 | 호출 함수 |
| --- | --- | --- |
| Phase 1/5 | Preflight checks (설정 검증) | - |
| Phase 2/5 | Generating Docker files | `generateFiles()` |
| Phase 3/5 | Building images | `buildImages()` |
| Phase 4/5 | Deploying containers | `deployContainers()` |
| Phase 5/5 | Health checks | `healthChecks()` |

**주요 함수**

**`generateFiles()`**
- docker-compose.yml 생성: `GenerateDockerComposeWithTarget()` 호출
- Dockerfile 생성:
- `DetectBuildType()`: 프레임워크 자동 감지 (plugin.yaml 기반)
- `WriteDockerfileWithBundled()`: 템플릿 기반 Dockerfile 생성
- Grafana provisioning 준비 (All-in-one 모드인 경우)

**`buildImages()`**
- Local/EC2 타겟 분기:
- Local: `buildImagesLocal()` → docker-compose build 실행
- EC2: `buildImagesEC2()` → SSH를 통한 원격 빌드
- `CheckDockerInstalled()`: Docker 설치 확인/자동 설치
- `PrepareWorkdir()`: 작업 디렉토리 준비
- `UploadFile()`, `UploadDirectory()`: 파일 전송
- 원격에서 docker compose build 실행

**`deployContainers()`**
- Local: `deployContainersLocal()` → docker compose up -d
- EC2: `deployContainersEC2()` → 원격 docker compose up

**`healthChecks()`**
- Local: `healthChecksLocal()` → docker compose ps
- EC2: `healthChecksEC2()` → SSH를 통한 원격 상태 확인

**수정 시나리오**
- 배포 단계 추가/수정: `runner.go`의 `ExecuteWithPlugins()` 함수
- EC2 배포 로직 변경: `buildImagesEC2()`, `deployContainersEC2()` 함수
- 로컬 배포 로직 변경: `buildImagesLocal()`, `deployContainersLocal()` 함수

---

### 3. 서비스 감지 (Framework Detection)

**파일 위치**
- **플러그인 정의**: `arfni-gui/src-tauri/resources/plugins/bundled/framework/`
- **Go 감지 로직**: `BE/arfni/internal/core/workflow/dockerfile.go`
- **Dockerfile 생성**: `BE/arfni/internal/core/workflow/dockerfile_writer.go`

**플러그인 구조**

```
framework/springboot/
├── plugin.yaml           # 감지 규칙 정의
└── templates/
    └── Dockerfile.tmpl   # Dockerfile 템플릿
```

**plugin.yaml 구조** (예: react/plugin.yaml)

```yaml
apiVersion: v0.1name: reactdisplayName: Reactversion: 1.1.0category: frameworkdetection:  enabled: true  priority: 10               # 높을수록 우선순위 높음  required_files:    - package.json  file_content_patterns:    package.json:      contains: ["\"react\""]provides:  service_kinds:    - app.react
```

**감지 프로세스**

1. `DetectBuildType()` 함수 호출
2. 플러그인 디렉토리 스캔 (bundled 및 installed)
3. `required_files` 존재 확인
4. `file_content_patterns` 매칭
5. `priority` 순서대로 정렬하여 첫 번째 매칭 반환

**새 프레임워크 추가 방법**

1. `plugins/bundled/framework/[name]/` 폴더 생성
2. `plugin.yaml` 작성:
    - `detection`: 감지 규칙 (required_files, file_content_patterns, priority)
    - `provides`: 제공하는 service_kinds
3. `templates/Dockerfile.tmpl` 작성
4. 테스트 프로젝트로 검증

---

### 4. SSH 및 파일 업로드

**파일 위치**
- **Go**: `BE/arfni/internal/core/workflow/ssh.go`
- **Rust**: `arfni-gui/src-tauri/src/commands/ssh.rs` (SSH 키 관리)

**주요 함수**

- `NewSSHClient()`: SSH 클라이언트 생성, .arfniignore 로드
- `UploadFile()`: 단일 파일 SCP 전송
- `UploadDirectory()`: 디렉토리 재귀 전송, .arfniignore 패턴 자동 적용
- `RunCommand()`: SSH 명령 실행
- `RunCommandWithOutput()`: SSH 명령 실행 및 출력 반환
- `CheckDockerInstalled()`: Docker 설치 확인, 없으면 자동 설치
- `PrepareWorkdir()`: EC2 작업 디렉토리 준비

**파일 업로드 시 제외 처리**

`UploadDirectory()` 함수에서 .arfniignore 패턴 자동 적용:

```go
if c.arfniIgnore != nil && c.arfniIgnore.ShouldIgnore(localPath) {    stream.Info(fmt.Sprintf("Skipping ignored item: %s", entry.Name()))    continue}
```

**수정 시나리오**
- 파일 전송 최적화: `UploadDirectory()` 함수 수정
- SSH 연결 풀 구현: `SSHClient` 구조체 확장

---

### 5. arfniignore 시스템

**파일 위치**
- **Go 파서**: `BE/arfni/internal/core/workflow/arfniignore.go`
- **초기 생성**: `arfni-gui/src-tauri/src/commands/project.rs` (create_project 함수)
- **적용**: `ssh.go` (UploadDirectory 함수)

**작동 방식**

1. 프로젝트 생성 시 `.arfniignore` 파일 자동 생성
2. SSH 클라이언트 생성 시 `LoadArfniIgnore()` 호출
3. 파일 업로드 시 `ShouldIgnore()` 함수로 패턴 매칭
4. 매칭되면 업로드 제외

**주요 함수**

- `LoadArfniIgnore()`: .arfniignore 파일 파싱, 없으면 기본 패턴 사용
- `ShouldIgnore()`: 파일 경로가 제외 패턴에 매칭되는지 확인
- `matchPattern()`: 패턴 매칭 로직 (와일드카드, 정확한 이름, 디렉토리)
- `getDefaultIgnorePatterns()`: 기본 제외 패턴 반환

**지원 패턴**

```
node_modules/    # 정확한 이름
*.log            # 와일드카드
build/           # 디렉토리
**/*.pyc         # 재귀 패턴
# comment        # 주석
```

**수정 시나리오**
- 기본 패턴 변경: `getDefaultIgnorePatterns()` 함수 수정
- 패턴 매칭 로직 개선: `matchPattern()` 함수 수정

---

### 6. Canvas (시각적 편집기)

**파일 위치**
- **React Features**: `arfni-gui/src/features/canvas/`
- **React Pages**: `arfni-gui/src/pages/canvas/`
- **Widgets**: `arfni-gui/src/widgets/canvas-editor/`
- **Entities**: `arfni-gui/src/entities/`

**주요 파일**
- `features/canvas/hooks/useCanvasNodes.ts`: 노드 상태 관리
- `features/canvas/lib/yamlConverter.ts`: YAML ↔︎ Canvas 변환
- `entities/service/ui/ServiceNode.tsx`: 서비스 노드 컴포넌트
- `entities/target/ui/TargetNode.tsx`: 타겟 노드 컴포넌트

**노드 타입**
- `service`: 애플리케이션 서비스 (React, Spring Boot 등)
- `target`: 배포 타겟 (Local, EC2)
- `database`: 데이터베이스 (MySQL, PostgreSQL 등)
- `monitoring`: 모니터링 (Prometheus, Grafana)

**수정 시나리오**
- 새 노드 타입 추가: `entities/` 아래 새 폴더 생성
- YAML 변환 로직: `features/canvas/lib/yamlConverter.ts` 수정

---

### 7. 모니터링

**파일 위치**
- **Go**: `BE/arfni/cmd/arfni-monitoring/main.go`
- **Rust**: `arfni-gui/src-tauri/src/commands/monitoring.rs`
- **React**: `arfni-gui/src/pages/logs/ui/MonitoringView.tsx`

**모니터링 모드**
- `all-in-one`: Prometheus + Grafana 로컬 실행
- `hybrid`: Prometheus 로컬, Grafana 원격
- `no-monitoring`: 모니터링 비활성화

**Prometheus 설정 생성**
- `BE/arfni/internal/core/monitoring/prometheus.go`

**수정 시나리오**
- 모니터링 메트릭 추가: `prometheus.go` 수정
- Grafana 대시보드: `plugins/bundled/monitoring/grafana/provisioning/` 수정

---

### 8. EC2 최적화 및 비용 추정

**파일 위치**
- **React UI**: `arfni-gui/src/pages/logs/ui/OptimizeView.tsx`
- **다이얼로그**: `arfni-gui/src/widgets/toolbar/ui/dialogs/OptimizeDialog.tsx`
- **Rust 명령**: `arfni-gui/src-tauri/src/commands/pricing.rs`
- **Go 로직**: `BE/arfni/internal/pricing/`

**기능**
- EC2 인스턴스 타입별 가격 조회
- 서비스 리소스 요구사항 분석
- 최적 인스턴스 타입 추천
- 월간 비용 추정

**수정 시나리오**
- 가격 데이터 업데이트: `BE/arfni/internal/pricing/data/` 수정
- 추천 로직 개선: `pricing.rs` 수정
- UI 개선: `OptimizeView.tsx` 또는 `OptimizeDialog.tsx` 수정

---

### 9. 로그 시스템

**파일 위치**
- **Go 이벤트 스트림**: `BE/arfni/internal/events/stream.go`
- **Rust 로그 수신**: `arfni-gui/src-tauri/src/commands/deployment.rs`
- **React 로그 뷰어**: `arfni-gui/src/pages/logs/ui/LogPage.tsx`
- **위젯**: `arfni-gui/src/widgets/log-viewer/`

**로그 레벨**
- `INFO`: 일반 정보
- `SUCCESS`: 성공 메시지
- `WARNING`: 경고
- `ERROR`: 에러

**수정 시나리오**
- 로그 포맷 변경: `stream.go` 수정
- 로그 필터링: `LogPage.tsx` 수정

---

## 아키텍처

### 전체 데이터 흐름

```
User (GUI)
    ↓ invoke()
Tauri Command (Rust)
    ↓ spawn Go binary
Go IC Engine
    ↓ SSH/Docker API
Docker / EC2
```

### 배포 시퀀스

```
1. 사용자 Deploy 클릭
2. React → invoke('deploy', projectPath)
3. Tauri deployment.rs → spawn arfni-go binary
4. Go IC Engine → ExecuteWithPlugins()
5. Phase 1-5 실행:
   - Phase 2: generateFiles() → Dockerfile, docker-compose.yml 생성
   - Phase 3: buildImages() → 이미지 빌드
   - Phase 4: deployContainers() → 컨테이너 배포
   - Phase 5: healthChecks() → 상태 확인
6. 이벤트 스트림으로 로그 전송 (stream.Info, stream.Success 등)
7. Tauri → React 로그 표시
8. 완료 알림
```

---

## 디버깅

### Go 로그 확인

```bash
# IC 엔진 로그 (배포 중)tail -f /path/to/project/.arfni/logs/ic.log
# 모니터링 로그tail -f monitoring.log
```

### Rust 디버그 모드

```bash
cd arfni-gui
npm run tauri dev  # Chromium DevTools 자동 열림
```

### React DevTools

Tauri 개발 모드에서 Chromium DevTools 사용 가능
- Windows: `Ctrl+Shift+I`
- Mac: `Cmd+Option+I`

---

## 코딩 컨벤션

### Go

- 포맷터: `gofmt`
- 린터: `golangci-lint`
- 파일명: `snake_case.go`
- 함수: `PascalCase` (public), `camelCase` (private)

### Rust

- 포맷터: `cargo fmt`
- 린터: `cargo clippy`
- 파일명: `snake_case.rs`
- 함수: `snake_case`

### TypeScript/React

- 포맷터: `Prettier`
- 린터: `ESLint`
- 파일명: `PascalCase.tsx` (컴포넌트), `camelCase.ts` (유틸)
- 컴포넌트: `PascalCase`
- 함수: `camelCase`

---

## 테스트

### Go 테스트

```bash
cd BE/arfni
go test ./...
```

### Rust 테스트

```bash
cd arfni-gui/src-tauri
cargo test
```

---

## 기여하기

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 버그 리포트

버그를 발견하거나 개선 사항을 제안하고 싶으신 경우, 이메일로 연락 주시기 바랍니다.

**Contact: arfni201@googlegroups.com**