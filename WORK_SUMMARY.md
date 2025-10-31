# Arfni Deploy & Monitoring 분리 작업 요약

날짜: 2025-10-29

## 작업 개요

GUI에서 deploy 버튼 클릭 시 Go 바이너리가 실행되는 구조를 분석하고, Deploy와 Monitoring 기능을 분리하여 독립적으로 실행할 수 있도록 개선했습니다.

---

## 1. 초기 문제 분석

### 문제 1: CLI 인자 구조 불일치

**증상:**
```
[ERROR] stack.yaml not found at: C:\Users\SSAFY\OneDrive\Desktop\test123\run
```

**원인:**
- Tauri deployment.rs가 호출하는 방식:
  ```rust
  Command::new(&go_binary_path)
      .arg("run")              // os.Args[1]
      .arg("-f")               // os.Args[2]
      .arg(&stack_yaml_path)   // os.Args[3]
      .arg("-project-dir")     // os.Args[4]
      .arg(&project_path)      // os.Args[5]
  ```

- deploy_and_monitor.go가 받는 방식:
  ```go
  stackFile := os.Args[1]  // "run"이 stackFile로 잘못 인식됨
  ```

**해결:**
`deploy_and_monitor.go`에 서브커맨드와 플래그 파싱 구조 추가:
```go
// 서브커맨드 파싱
sub := os.Args[1]
if sub != "run" {
    fmt.Printf("Unknown command: %s (use 'run')\n", sub)
    os.Exit(1)
}

// 플래그 파싱
fs := flag.NewFlagSet("run", flag.ExitOnError)
stackFileFlag := fs.String("f", "stack.yaml", "path to stack.yaml")
projectDirFlag := fs.String("project-dir", "", "project root directory")
fs.Parse(os.Args[2:])

stackFile := *stackFileFlag
```

---

### 문제 2: EC2 경로 문제

**증상:**
```
ERROR: unable to prepare context: path "/home/ec2-user/apps/python" not found
```

**원인:**
`scp -r` 명령이 디렉토리를 중첩해서 복사:
```
/home/ec2-user/apps/
└── apps/          <- 중첩됨!
    ├── spring/
    └── python/
```

실제 경로: `/home/ec2-user/apps/apps/python`
빌드 시도: `/home/ec2-user/apps/python` ❌

**해결 방안:**
stack.yaml의 workdir를 프로젝트별로 설정:
```yaml
targets:
  ec2:
    workdir: /home/ec2-user/test123
```

이렇게 하면:
- 업로드: `/home/ec2-user/test123/apps/`
- 빌드: `/home/ec2-user/test123/apps/python` ✅

---

## 2. Deploy와 Monitoring 분리

### 기존 구조 (복잡함)
```
arfni-go.exe (deploy_and_monitor)
  ↓
  ic.exe 호출 (배포)
  ↓
  start-monitoring-v2.exe 호출 (모니터링)
```

### 개선된 구조 (단순함)
```
Deploy 버튼 → arfni-go.exe → ic.exe (배포만)
Monitoring 버튼 → arfni-monitoring.exe → start-monitoring-v2.exe (모니터링만)
```

---

## 3. 생성된 파일

### deploy_only.go
**위치:** `BE/Arfni_test/src/deploy_only.go`
**역할:** ic.exe를 호출해서 배포만 수행

**주요 기능:**
- CLI 플래그 파싱 (`-f`, `-project-dir`)
- ic.exe 경로 탐색 (여러 위치 시도)
- ic.exe 실행 및 출력 전달

**빌드:**
```bash
cd BE/Arfni_test/src
go build -o ../deploy-only.exe deploy_only.go
cp ../deploy-only.exe ../../arfni/bin/arfni-go.exe
```

---

### monitoring_only.go
**위치:** `BE/Arfni_test/src/monitoring_only.go`
**역할:** start-monitoring-v2.exe를 호출해서 모니터링만 수행

**주요 기능:**
- stack.yaml 파싱하여 EC2 정보 추출
- start-monitoring-v2.exe 실행
- 인자 전달: `<host> <sshKey> <user> <stackFile>`

**빌드:**
```bash
cd BE/Arfni_test/src
go build -o ../monitoring-only.exe monitoring_only.go
cp ../monitoring-only.exe ../../arfni/bin/arfni-monitoring.exe
```

---

## 4. 최종 바이너리 위치

### BE/arfni/bin/ 디렉토리 구조
```
BE/arfni/bin/
├── arfni-go.exe              # Deploy 전용 (deploy_only.go)
├── arfni-monitoring.exe       # Monitoring 전용 (monitoring_only.go)
├── ic.exe                     # 배포 엔진 (ic-skeleton-fixed)
└── start-monitoring-v2.exe    # 모니터링 실행기
```

---

## 5. 사용법

### Deploy 실행
```bash
arfni-go.exe run -f /path/to/stack.yaml -project-dir /path/to/project
```

또는 Tauri에서:
```rust
Command::new("arfni-go.exe")
    .arg("run")
    .arg("-f")
    .arg(stack_yaml_path)
    .arg("-project-dir")
    .arg(project_path)
    .spawn()
```

### Monitoring 실행
```bash
arfni-monitoring.exe -f /path/to/stack.yaml
```

또는 Tauri에서:
```rust
Command::new("arfni-monitoring.exe")
    .arg("-f")
    .arg(stack_yaml_path)
    .spawn()
```

---

## 6. 주요 수정 사항

### 파일별 수정 내역

#### 1. deploy_and_monitor.go
- **수정 전:** 단순 위치 인자 파싱 (`os.Args[1]`)
- **수정 후:** 서브커맨드 + 플래그 파싱 (`run -f <file> -project-dir <dir>`)
- **추가된 기능:**
  - `flag` 패키지를 사용한 플래그 파싱
  - `-project-dir` 플래그 지원

#### 2. ic-skeleton-fixed/cmd/ic/main.go
- **추가:** `-project-dir` 플래그 지원
- **기능:** workdir을 명시적으로 지정 가능

#### 3. deploy_only.go (신규)
- ic.exe만 호출하는 경량 래퍼
- 모니터링 관련 코드 제거

#### 4. monitoring_only.go (신규)
- start-monitoring-v2.exe만 호출하는 경량 래퍼
- stack.yaml 파싱하여 EC2 정보 추출

---

## 7. Go 바이너리 찾기 우선순위

deployment.rs의 `find_go_binary` 함수:

1. **환경변수**: `ARFNI_GO_BINARY_PATH`
2. **Resource 경로** (배포 환경):
   - `Resource/arfni-go.exe`
   - `Resource/_up_/_up_/BE/arfni/bin/arfni-go.exe`
   - `Resource/BE/arfni/bin/arfni-go.exe`
3. **개발 경로**: `../../BE/arfni/bin/arfni-go.exe`
4. **프로젝트 루트** 기반 경로

---

## 8. 개선 효과

### Before
- Deploy와 Monitoring이 강하게 결합
- 에러 발생 시 어느 단계인지 파악 어려움
- 모니터링 없이 배포만 하기 불가능

### After
- ✅ Deploy와 Monitoring이 독립적으로 동작
- ✅ 사용자가 필요할 때만 모니터링 시작 가능
- ✅ 코드가 단순해지고 유지보수 용이
- ✅ 각 도구의 책임이 명확함

---

## 9. 남은 작업

1. **workdir 경로 이슈 해결**
   - `scp` 중복 업로드 문제 해결
   - stack.yaml에서 workdir을 명시적으로 설정하도록 안내

2. **모니터링 옵션 전달**
   - `--monitoring=hybrid` 같은 플래그 지원
   - stack.yaml metadata를 통한 설정 지원

3. **에러 처리 개선**
   - 더 명확한 에러 메시지
   - 각 단계별 상태 표시

4. **Tauri GUI 통합**
   - Deploy 버튼과 Monitoring 버튼 분리
   - 각 버튼에서 해당 바이너리 호출

---

## 10. 트러블슈팅

### 이전 바이너리가 계속 실행되는 경우
**해결:** Tauri 앱을 완전히 종료하고 재시작

### docker-compose not found 에러
**원인:** docker-compose v1이 설치되지 않음
**해결:** docker compose (v2, plugin)를 사용하도록 ic.exe 수정

### Permission denied: /home/app
**원인:** workdir에 쓰기 권한 없음
**해결:** workdir을 `/home/ec2-user/<project>` 형식으로 변경

---

## 참고 사항

- 모든 바이너리는 `BE/arfni/bin/` 디렉토리에 위치
- ic.exe와 start-monitoring-v2.exe는 같은 디렉토리에 있어야 함
- stack.yaml은 프로젝트 루트에 위치해야 함
- SSH 키 파일 경로는 절대 경로로 지정 권장

---

# GUI 로그 표시 문제 분석 (2025-10-30)

날짜: 2025-10-30

## 문제 상황
- GUI에서 deploy 버튼을 누르면 로그가 표시됨
- 정상적인 메시지(`#10 DONE`, `naming to docker.io/...`)도 빨간색 `[ERROR]`로 표시됨
- 실제로는 성공했는데 에러처럼 보이는 문제

## 원인 분석

### 1. Docker Buildx의 특성
- `docker buildx build` 명령은 **정상적인 빌드 진행 메시지도 stderr로 출력**
- 이는 Docker의 설계 방식임 (진행 상황, 레이어 정보 등이 stderr로 전송)
- 예: `#10 DONE`, `naming to docker.io/library/...`

### 2. 로그 흐름

```
Docker buildx
    ↓ (stderr 출력)
ic.exe (internal/sys/exec.go)
    ↓ (stderr → os.Stderr)
deploy_and_monitor.exe
    ↓ (stderr 그대로 전달)
Tauri Rust (deployment.rs)
    ↓ (stderr → level: "error")
GUI LogViewer
    ↓ (level: "error" → 빨간색)
사용자에게 빨간색 [ERROR]로 표시
```

### 3. 관련 파일 및 위치

#### Backend (Go)
**`BE/Arfni_test/ic-skeleton-fixed/internal/sys/exec.go:32-33`**
```go
stdout := io.MultiWriter(os.Stdout, &outBuf)
stderr := io.MultiWriter(os.Stderr, &outBuf)  // stderr를 그대로 os.Stderr로 전달
```

#### Frontend (Tauri Rust)
**`arfni-gui/src-tauri/src/commands/deployment.rs:195-206`**
```rust
// stderr 읽기 스레드
let stderr_handle = stderr.map(|stderr| {
    std::thread::spawn(move || {
        let reader = BufReader::new(stderr);
        for line in reader.lines() {
            if let Ok(line) = line {
                // stderr는 에러 레벨로 처리 ← 문제!
                app_clone_stderr.emit("deployment-log", DeploymentLog {
                    timestamp: chrono::Utc::now().to_rfc3339(),
                    level: "error".to_string(),  // ← 무조건 error!
                    message: line,
                    data: None,
                }).unwrap_or(());
            }
        }
    })
});
```

#### Frontend (React)
**`arfni-gui/src/widgets/log-viewer/ui/LogViewer.tsx:35-42`**
```typescript
const getLogColor = (level: DeploymentLog['level']) => {
  switch (level) {
    case 'info':
      return 'text-blue-400';
    case 'warning':
      return 'text-yellow-400';
    case 'error':
      return 'text-red-400';  // ← 빨간색으로 표시
    case 'success':
      return 'text-green-400';
    default:
      return 'text-gray-400';
  }
};
```

## 해결 방법

### 방법 1: Rust에서 stderr 메시지 내용 분석 (추천 ✅)
**파일:** `arfni-gui/src-tauri/src/commands/deployment.rs:195-206`

```rust
// stderr 읽기 스레드
let stderr_handle = stderr.map(|stderr| {
    std::thread::spawn(move || {
        let reader = BufReader::new(stderr);
        for line in reader.lines() {
            if let Ok(line) = line {
                // stderr 메시지 내용 분석하여 레벨 결정
                let level = if line.to_lowercase().contains("error:")
                           || line.to_lowercase().contains("failed")
                           || line.to_lowercase().contains("fatal") {
                    "error".to_string()
                } else if line.to_lowercase().contains("warning")
                       || line.to_lowercase().contains("warn") {
                    "warning".to_string()
                } else {
                    // Docker buildx 정상 메시지는 info로
                    "info".to_string()
                };

                app_clone_stderr.emit("deployment-log", DeploymentLog {
                    timestamp: chrono::Utc::now().to_rfc3339(),
                    level,
                    message: line,
                    data: None,
                }).unwrap_or(());
            }
        }
    })
});
```

**장점:**
- 실제 에러는 여전히 에러로 표시
- 정상 메시지는 info로 표시
- Go 코드 수정 불필요

**단점:**
- 키워드 매칭 방식이라 완벽하지 않을 수 있음

### 방법 2: Go에서 stderr를 stdout으로 통합
**파일:** `BE/Arfni_test/ic-skeleton-fixed/internal/sys/exec.go:32-33`

```go
// stderr도 stdout으로 통합
stdout := io.MultiWriter(os.Stdout, &outBuf)
stderr := io.MultiWriter(os.Stdout, &outBuf)  // os.Stderr → os.Stdout
```

**장점:**
- 간단한 수정
- 모든 메시지가 stdout으로 처리되어 info로 표시됨

**단점:**
- 실제 에러도 info로 표시될 수 있음
- 에러 판단은 exit code로만 해야 함

### 방법 3: Exit code 기반 판단
프로세스 종료 후 exit code가 0이면 모든 로그를 재분류하거나,
실시간으로는 모두 info로 표시하고 실패 시에만 에러 메시지 추가

**장점:**
- 가장 정확한 판단

**단점:**
- 실시간 피드백이 부정확할 수 있음

---

## 권장 사항
**방법 1 (Rust에서 stderr 내용 분석)**을 권장합니다.
- 실제 에러는 여전히 빨간색으로 표시
- Docker buildx 정상 메시지는 파란색(info)로 표시
- Go 코드 변경 없이 Rust만 수정

---

# 배포 단계별 표시 로직 (2025-10-30)

## 위치
**파일:** `BE/Arfni_test/ic-skeleton-fixed/internal/runner/run.go`

## EC2 배포 단계

### 1. Docker 설치 확인 및 설치
**함수:** `ec2EnsureDocker()` (run.go:229-)
```go
fmt.Println("[INFO] Checking Docker installation on EC2...")
echo "[INFO] Docker not found. Installing Docker..."
echo "[INFO] Detected Amazon Linux. Installing Docker..."
echo "[INFO] Starting Docker service..."
echo "[INFO] Installing Docker Compose plugin..."
```

### 2. 앱 소스 업로드
**위치:** run.go:76-85
```go
fmt.Println("[INFO] Uploading application source code to EC2...")
// scp 실행
fmt.Println("[SUCCESS] Application source uploaded successfully!")
```

### 3. 빌드 (각 서비스별)
**위치:** run.go:102-107
```go
fmt.Printf("Building %s...\n", svcName)
// remoteBuildImage() 호출
```

**빌드 세부 정보 출력:** run.go:313-315
```go
fmt.Printf("[INFO] Building Docker image: %s\n", tag)
fmt.Printf("[INFO] Build context: %s\n", ctxDir)
fmt.Printf("[INFO] Dockerfile: %s\n", dfPath)
```

### 4. Docker Compose 설정 업로드
**위치:** run.go:121-128
```go
fmt.Println("[INFO] Uploading Docker Compose configuration to EC2...")
// scp로 docker-compose.yaml, .env 업로드
fmt.Println("[SUCCESS] Configuration files uploaded successfully!")
```

### 5. 볼륨 파일 업로드
**위치:** run.go:131-195
```go
fmt.Println("[INFO] Uploading volume files to EC2...")
// 각 볼륨별로 업로드
fmt.Printf("[INFO] Uploaded volume directory: %s\n", vol.Host)
fmt.Printf("[INFO] Uploaded volume file: %s\n", vol.Host)
```

### 6. Docker Compose 실행
**위치:** run.go:204-
```go
fmt.Println("[INFO] Starting Docker Compose on EC2...")
// docker compose up -d 실행
```

## 로컬 배포 단계

**위치:** run.go:419-446

로컬 배포는 별도의 단계 표시 없이 단순 실행:
```go
func runLocal(ctx context.Context, st *stack.Stack, stackDir, envPath, outDir string) error {
    // Docker 확인
    sys.Run(ctx, "docker", "version")
    sys.Run(ctx, "docker", "compose", "version")

    // Docker Compose 실행 (빌드 포함)
    sys.Run(ctx, "docker", "compose",
        "-f", composePath, "--env-file", envPath, "up", "-d", "--build")

    return nil
}
```

## 메시지 패턴

### INFO 메시지
- `[INFO]` - 진행 상황 정보
- 예: `[INFO] Uploading application source code to EC2...`

### SUCCESS 메시지
- `[SUCCESS]` - 단계 완료
- 예: `[SUCCESS] Application source uploaded successfully!`

### 빌드 메시지
- `Building <service>...` - 서비스 빌드 시작
- 예: `Building spring...`, `Building python...`

### ERROR 메시지
- 일반 에러 메시지 (stderr로 전달)

## 단계 흐름도 (EC2)

```
1. Docker 확인/설치 [INFO]
    ↓
2. 앱 소스 업로드 [INFO] → [SUCCESS]
    ↓
3. 각 서비스 빌드 (Building ...) → [INFO] × 3
    ├─ spring [INFO] Building Docker image...
    ├─ python [INFO] Building Docker image...
    └─ nginx [INFO] Building Docker image...
    ↓
4. Compose 설정 업로드 [INFO] → [SUCCESS]
    ↓
5. 볼륨 파일 업로드 [INFO] → [INFO] (각 파일별)
    ↓
6. Compose 실행 [INFO]
    ↓
완료
```

## GUI에서 단계 표시 개선 아이디어

현재 GUI는 모든 로그를 시간순으로 나열하지만, 단계별로 구분하면 더 보기 좋을 것입니다:

### 제안 1: 진행 바 추가
```
[1/6] Docker 확인/설치        ✓ 완료
[2/6] 앱 소스 업로드          ✓ 완료
[3/6] 이미지 빌드             → 진행 중
[4/6] 설정 업로드             대기 중
[5/6] 볼륨 업로드             대기 중
[6/6] 컨테이너 실행           대기 중
```

### 제안 2: 접이식 단계 표시
```
▼ 1. Docker 확인/설치 (2.3초)
  [INFO] Checking Docker installation...
  [INFO] Docker is already installed.

▼ 2. 앱 소스 업로드 (5.1초)
  [INFO] Uploading application source code...
  [SUCCESS] Application source uploaded!

▶ 3. 이미지 빌드 (진행 중...)
```

### 제안 3: 메시지 파싱하여 단계 감지
**React 코드 예시:**
```typescript
const detectStage = (message: string) => {
  if (message.includes('Checking Docker installation')) return 1;
  if (message.includes('Uploading application source')) return 2;
  if (message.includes('Building Docker image')) return 3;
  if (message.includes('Uploading Docker Compose')) return 4;
  if (message.includes('Uploading volume')) return 5;
  if (message.includes('Starting Docker Compose')) return 6;
  return null;
};
```

---

# 2025-10-30 수정 내역

## 1. GUI 단계별 진행도 표시 기능 구현
**파일:** BE/Arfni_test/ic-skeleton-fixed/internal/runner/run.go (라인 71, 77, 90, 124, 208)
**문제:** GUI가 배포 단계를 인식하지 못해 진행도가 표시되지 않음
**수정:** EC2 배포 5단계마다 "Phase X/5" 메시지 출력 추가 (준비, 소스 업로드, 빌드, 설정 업로드, 컨테이너 시작)

## 2. 빌드 진행률 및 서비스 정보 출력
**파일:** BE/Arfni_test/ic-skeleton-fixed/internal/runner/run.go (라인 89-124, 241-244)
**문제:** 빌드 단계가 실제 빌드 전에 종료되어 단계 표시가 부정확하고, 배포 완료 시 서비스 개수가 GUI에 표시되지 않음
**수정:** 빌드할 서비스 목록을 사전 수집하여 실제 빌드 시작 시에만 Phase 3 출력, 각 서비스 빌드 완료 시 진행률 표시, 배포 완료 시 __OUTPUTS__ 형식으로 서비스 개수 및 컨테이너 개수 출력

## 3. 로그 레벨 분류 개선
**파일:** arfni-gui/src-tauri/src/commands/deployment.rs (라인 177-190)
**문제:** Docker buildx의 정상 메시지(stderr 출력)가 모두 빨간색 ERROR로 표시됨
**수정:** stderr 메시지 내용을 분석하여 error/failed/fatal/panic은 error로, warning/warn은 warning으로, 나머지는 info로 분류

## 4. Windows 콘솔 창 숨김 처리
**파일:** arfni-gui/src-tauri/src/commands/deployment.rs (라인 10-11, 107-123, 299-300, 313-317)
**문제:** Go 바이너리 실행 시 별도의 CMD 창이 표시됨
**수정:** Windows에서 CREATE_NO_WINDOW 플래그를 사용하여 배포 실행 및 프로세스 중지 시 콘솔 창 숨김 처리

---

# 2025-10-31 Windows 콘솔 창 완전 제거 작업

## 문제 상황
프로젝트를 병합(`ic-skeleton-fixed` → `BE/arfni`) 후 다음 문제들이 발생:
1. 배포 실패 (`docker-compose: command not found`)
2. Windows에서 검은 CMD 창이 계속 표시됨
3. GUI에서 서비스 개수, 엔드포인트가 표시되지 않음
4. OpenSSL vendored 빌드 실패 (Perl 모듈 누락)

## 해결 작업 내역

### 1. Docker Compose v2 명령어 수정
**문제:** `docker-compose` 명령어가 EC2에 설치되지 않음
**해결:**
- 모든 `docker-compose` → `docker compose` (v2) 변경
- 파일: `internal/core/workflow/ssh.go`, `internal/core/workflow/runner.go`

### 2. Windows 콘솔 창 완전 제거
**문제:** 모든 단계(배포, SSH 연결, 테스트)에서 검은 CMD 창이 표시됨

#### 2.1 Go 코드 수정
**파일:**
- `BE/arfni/internal/core/workflow/ssh.go` (SSH/SCP 명령)
- `BE/arfni/internal/core/workflow/runner.go` (Docker 명령)
- `BE/arfni/internal/sys/exec.go` (일반 명령 실행)
- `BE/arfni/cmd/arfni-go/main.go` (ic.exe 실행)

**수정 내용:**
```go
// Windows에서 콘솔 창 숨김 (강화)
if runtime.GOOS == "windows" {
    cmd.SysProcAttr = &syscall.SysProcAttr{
        HideWindow:    true,
        CreationFlags: 0x08000000 | 0x00000200, // CREATE_NO_WINDOW | CREATE_NEW_PROCESS_GROUP
    }
}
```

**SSH 옵션 추가:**
```go
args := []string{
    "-i", keyPath,
    "-o", "StrictHostKeyChecking=no",
    "-o", "BatchMode=yes",           // 인터랙티브 프롬프트 비활성화
    "-o", "LogLevel=ERROR",          // 불필요한 출력 숨김
    fmt.Sprintf("%s@%s", user, host),
    command,
}
```

#### 2.2 Rust/Tauri 코드 수정
**파일:**
- `arfni-gui/src-tauri/src/commands/deployment.rs` (배포, Docker 체크)
- `arfni-gui/src-tauri/src/commands/plugin.rs` (플러그인 실행)
- `arfni-gui/src-tauri/src/features/ssh_rt.rs` (SSH 인터랙티브 터미널)

**수정 내용:**
```rust
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

let mut command = Command::new("ssh");
command.arg("...").stdin(...).stdout(...);

#[cfg(target_os = "windows")]
{
    const CREATE_NO_WINDOW: u32 = 0x08000000;
    const CREATE_NEW_PROCESS_GROUP: u32 = 0x00000200;
    command.creation_flags(CREATE_NO_WINDOW | CREATE_NEW_PROCESS_GROUP);
}

let child = command.spawn()?;
```

#### 2.3 SSH 연결 테스트 Command 추가
**파일:** `arfni-gui/src-tauri/src/commands/deployment.rs`

**새 함수 추가:**
```rust
#[tauri::command]
pub fn test_ssh_connection(host: String, user: String, key_path: String) -> Result<String, String> {
    let mut command = Command::new("ssh");
    command
        .arg("-i").arg(&key_path)
        .arg("-o").arg("StrictHostKeyChecking=no")
        .arg("-o").arg("BatchMode=yes")
        .arg("-o").arg("ConnectTimeout=10")
        .arg("-o").arg("LogLevel=ERROR")
        .arg(format!("{}@{}", user, host))
        .arg("echo 'Connection successful'")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    #[cfg(target_os = "windows")]
    {
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        const CREATE_NEW_PROCESS_GROUP: u32 = 0x00000200;
        command.creation_flags(CREATE_NO_WINDOW | CREATE_NEW_PROCESS_GROUP);
    }

    // 실행 및 결과 반환
}
```

**GUI 연동:**
`arfni-gui/src/pages/projects/ui/AddServerModal.tsx`:
```typescript
// 기존: sshCommands.execSystem() 사용
// 변경: invoke<string>('test_ssh_connection', { host, user, keyPath })
```

### 3. __OUTPUTS__ JSON 파싱 구현
**문제:** 배포 완료 후 서비스 개수, 엔드포인트가 GUI에 표시되지 않음
**원인:** Rust 코드에서 `__OUTPUTS__` JSON 파싱이 TODO로 남아 있었음

**파일:** `arfni-gui/src-tauri/src/commands/deployment.rs`

**수정 전:**
```rust
outputs: None // TODO: outputs parsing
```

**수정 후:**
```rust
// stdout 읽기 스레드에서 __OUTPUTS__ 파싱
if line.contains("__OUTPUTS__") {
    if let Some(json_start) = line.find("__OUTPUTS__") {
        let json_str = &line[json_start + 11..];
        if let Ok(outputs_json) = serde_json::from_str::<serde_json::Value>(json_str) {
            if let Ok(mut outputs_guard) = outputs_clone.lock() {
                *outputs_guard = Some(outputs_json);
            }
        }
    }
    continue;
}

// 배포 완료 이벤트 전송
if let Ok(outputs_guard) = outputs_arc.lock() {
    app_handle.emit("deployment-success", DeploymentStatus {
        status: "success".to_string(),
        message: Some("배포가 성공적으로 완료되었습니다".to_string()),
        outputs: outputs_guard.clone(),
    }).ok();
}
```

### 4. OpenSSL 의존성 제거 및 rustls 전환
**문제:** OpenSSL vendored 빌드 시 Perl 모듈(Locale::Maketext::Simple) 누락으로 실패
**환경:** MSYS Perl이 Strawberry Perl보다 우선순위가 높아 모듈 설치 불가

**파일:** `arfni-gui/src-tauri/Cargo.toml`

**수정 전:**
```toml
openssl = { version = "0.10", features = ["vendored"] }
reqwest = { version = "0.12.24", features = ["json"] }
```

**수정 후:**
```toml
# openssl 제거
reqwest = { version = "0.12.24", features = ["json", "rustls-tls"], default-features = false }
```

**이점:**
- ✅ Perl 빌드 의존성 제거
- ✅ 크로스 플랫폼 지원 (Windows, macOS, Linux)
- ✅ 더 안전한 메모리 관리 (Rust native)
- ✅ 빌드 속도 향상
- ✅ SSH는 `ssh2` crate가 시스템 SSH 라이브러리 사용하므로 영향 없음

### 5. 자동 빌드 프로세스 개선
**파일:** `arfni-gui/package.json`, `arfni-gui/src-tauri/tauri.conf.json`

**수정 내용:**
```json
// package.json
"scripts": {
  "build:go": "cd ../BE/arfni && go build -o ./bin/ic.exe ./cmd/ic && go build -o ./bin/arfni-go.exe ./cmd/arfni-go",
  "build:all": "npm run build:go && npm run build"
}

// tauri.conf.json
"build": {
  "beforeBuildCommand": "npm run build:all"
}
```

**효과:**
- `npm run tauri build` 실행 시 Go 바이너리 자동 빌드
- 수동 `build.bat` 실행 불필요

## 수정된 파일 목록

### Backend (Go)
1. `BE/arfni/internal/core/workflow/ssh.go`
   - SSH/SCP 명령에 Windows 콘솔 숨김 추가
   - SSH 옵션 추가 (BatchMode, LogLevel)

2. `BE/arfni/internal/core/workflow/runner.go`
   - Docker compose 명령에 Windows 콘솔 숨김 추가
   - 4군데 exec.Command 수정

3. `BE/arfni/internal/sys/exec.go`
   - Run(), RunWithLiveOutput() 함수에 Windows 콘솔 숨김 추가

4. `BE/arfni/cmd/arfni-go/main.go`
   - ic.exe, start-monitoring-v2.exe 실행 시 Windows 콘솔 숨김 추가

### Frontend (Rust/Tauri)
1. `arfni-gui/src-tauri/Cargo.toml`
   - OpenSSL 제거, rustls-tls 전환

2. `arfni-gui/src-tauri/src/commands/deployment.rs`
   - arfni-go.exe 실행 시 Windows 콘솔 숨김
   - Docker 체크 명령들에 Windows 콘솔 숨김
   - __OUTPUTS__ JSON 파싱 구현
   - test_ssh_connection 명령 추가

3. `arfni-gui/src-tauri/src/commands/plugin.rs`
   - 플러그인 실행 시 Windows 콘솔 숨김 (3가지 모드)

4. `arfni-gui/src-tauri/src/features/ssh_rt.rs`
   - SSH 인터랙티브 터미널에 Windows 콘솔 숨김
   - SSH 옵션 추가

### Frontend (React/TypeScript)
1. `arfni-gui/src/pages/projects/ui/AddServerModal.tsx`
   - SSH 연결 테스트를 새 test_ssh_connection command로 변경

### Build Config
1. `arfni-gui/package.json`
   - build:go, build:all 스크립트 추가

2. `arfni-gui/src-tauri/tauri.conf.json`
   - beforeBuildCommand에 build:all 설정

## 테스트 결과

### ✅ 성공한 항목
1. Local 배포 - CMD 창 안 뜸
2. EC2 배포 - CMD 창 안 뜸
3. SSH 연결 테스트 - CMD 창 안 뜸
4. SSH 인터랙티브 터미널 - CMD 창 안 뜸
5. 서비스 개수, 컨테이너 개수 표시됨
6. 엔드포인트 주소 표시됨
7. 프로덕션 빌드 성공 (Perl 에러 없음)
8. 개발 모드 정상 작동
9. Docker compose v2 명령 정상 작동

### CreationFlags 설명
```
0x08000000 (CREATE_NO_WINDOW):
  - 프로세스에 콘솔 창을 생성하지 않음
  - 표준 I/O는 파이프로 리다이렉션 가능

0x00000200 (CREATE_NEW_PROCESS_GROUP):
  - 프로세스를 새로운 프로세스 그룹으로 분리
  - 부모 프로세스의 콘솔과 완전히 독립
  - Ctrl+C 시그널 전파 방지
```

## 최종 빌드 위치
```
C:\arfni_pjt_new\arfni-gui\src-tauri\target\release\bundle\nsis\arfni-gui_0.1.0_x64-setup.exe
```

## 다음 작업 필요
1. **Prometheus/Node Exporter 자동 설치 로직 복원**
   - 이전 로직에서 hybrid/allinone 형태에 따라 monitoring 컴포넌트를 자동으로 설치하는 기능 확인 필요
   - MIGRATION.md에서 해당 기능이 어디로 이동했는지 확인
