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
