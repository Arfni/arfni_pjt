# Arfni Migration 문서

날짜: 2025-10-30

## 개요

ic-skeleton-fixed에서 개발된 개선사항을 BE/arfni 프로덕션 코드베이스로 이식한 과정을 기록합니다.

## 이식 배경

### 발견된 문제점

1. GUI 배포 시 EC2 연결 테스트 중 CMD 창이 표시됨
2. 로컬 배포 시 docker-compose.yml이 자동 생성되지 않음
3. 배포 결과 정보(서비스 수, 컨테이너 수, 엔드포인트)가 출력되지 않음
4. deploy와 monitor 기능이 별도 실행 파일로 분리됨

### 해결 방향

ic-skeleton-fixed에서 구현된 6단계 workflow 시스템을 BE/arfni로 이식하여 문제를 해결

## 주요 변경사항

### 1. 모듈 경로 변경

**이전:** `ic.local/ic`
**현재:** `github.com/arfni/arfni`

모든 import 문을 실제 모듈 경로로 변경

### 2. Stack 구조 통일

**파일:** `pkg/stack/stack.go`

**변경사항:**
- `Spec` → `ServiceSpec` 이름 변경
- `DependsOn` 필드를 Service 레벨로 이동
- `Command` 필드 추가
- `HealthCheck` 구조체 분리

```go
// 이전
type Service struct {
    Spec Spec `yaml:"spec"`
}

// 현재
type Service struct {
    Spec      ServiceSpec `yaml:"spec"`
    DependsOn []string    `yaml:"dependsOn,omitempty"`
}
```

### 3. Workflow 시스템 구현

**새로 추가된 파일:**
- `internal/workflow/runner.go` - 6단계 실행기
- `internal/workflow/generate.go` - docker-compose.yml 생성기
- `internal/workflow/health.go` - 헬스체크

**6단계 파이프라인:**

```
Phase 1/6: Preflight
    - Docker 설치 확인
    - EC2 SSH 연결 확인 (해당 시)

Phase 2/6: Generate
    - stack.yaml → docker-compose.yml 변환
    - .arfni/compose/ 디렉토리 생성

Phase 3/6: Build
    - Dockerfile 기반 이미지 빌드
    - 로컬: docker compose build
    - EC2: buildx 원격 빌드

Phase 4/6: Deploy
    - 컨테이너 시작
    - 로컬: docker compose up -d
    - EC2: SCP + 원격 실행

Phase 5/6: Post-deploy
    - 추가 초기화 작업

Phase 6/6: Health Check
    - 컨테이너 상태 확인
    - 엔드포인트 추출
```

### 4. CLI 통합

**파일:** `cmd/arfni-go/main.go`

deploy와 monitor를 하나의 실행 파일로 통합:

```go
switch command {
case "deploy", "run":
    runDeploy(os.Args[2:])
case "monitor", "monitoring":
    runMonitoring(os.Args[2:])
}
```

### 5. 출력 형식 추가

**위치:** `internal/workflow/runner.go`

GUI 파싱을 위한 JSON 출력 추가:

```json
__OUTPUTS__{
  "status": "success",
  "service_count": 2,
  "container_count": 3,
  "compose_dir": "/path/to/.arfni/compose",
  "endpoints": ["http://localhost:8080", "http://localhost:3306"]
}
```

### 6. Windows 처리 개선

**파일:** `internal/sys/exec.go`

SSH/SCP 실행 시 콘솔 창 숨김 처리:

```go
if runtime.GOOS == "windows" {
    cmd.SysProcAttr = &syscall.SysProcAttr{
        CreationFlags: 0x08000000, // CREATE_NO_WINDOW
    }
}
```

## 빌드 시스템

### Windows

**파일:** `build.bat`

```batch
cd cmd\ic
go build -o ..\..\bin\ic.exe .

cd ..\arfni-go
go build -o ..\..\bin\arfni-go.exe .
```

### Linux/macOS

**파일:** `build.sh`

```bash
cd cmd/ic
go build -o ../../bin/ic .

cd ../arfni-go
go build -o ../../bin/arfni-go .
```

## 디렉토리 구조 변화

```
BE/arfni/
├─ cmd/
│  ├─ arfni-go/       새로 추가 (deploy + monitor 통합)
│  └─ ic/             workflow 시스템 적용
├─ internal/
│  ├─ workflow/       새로 추가 (6단계 파이프라인)
│  ├─ events/         기존 유지 (이벤트 스트리밍)
│  ├─ deploy/         기존 유지 (local/ec2 드라이버)
│  └─ sys/            새로 추가 (exec 유틸)
└─ pkg/
   └─ stack/          구조체 통일
```

## 코드 변경 세부사항

### runner.go

**추가된 주요 함수:**

```go
func NewRunner(s *stack.Stack, projectDir string) *Runner
func (r *Runner) Execute(stream *events.Stream) error
func (r *Runner) preflight(stream *events.Stream) error
func (r *Runner) generate(stream *events.Stream) error
func (r *Runner) build(stream *events.Stream) error
func (r *Runner) deploy(stream *events.Stream) error
func (r *Runner) postDeploy(stream *events.Stream) error
func (r *Runner) healthCheck(stream *events.Stream) error
```

**엔드포인트 추출:**

```go
func (r *Runner) extractEndpoints() []string
func (r *Runner) extractEndpointsEC2(ec2 *stack.Target) []string
```

### generate.go

**docker-compose.yml 생성:**

```go
func GenerateDockerCompose(s *stack.Stack, projectDir string) (string, error)
func WriteDockerCompose(s *stack.Stack, projectDir string) error
```

stack.yaml의 services를 docker-compose.yml 형식으로 변환

### main.go (ic)

**workflow 적용:**

```go
stream := events.NewStream(true)
runner := workflow.NewRunner(st, stackDir)
if err := runner.Execute(stream); err != nil {
    fmt.Fprintf(os.Stderr, "[error] run: %v\n", err)
    os.Exit(1)
}
```

## 테스트 결과

### 로컬 배포

```bash
cd examples/local
../../bin/arfni-go.exe deploy -f stack.yaml
```

**확인사항:**
- docker-compose.yml 자동 생성됨 (.arfni/compose/)
- 컨테이너 정상 시작
- JSON 출력 정상 확인

### EC2 배포

```bash
cd examples/ec2
../../bin/arfni-go.exe deploy -f stack.yaml
```

**확인사항:**
- SCP로 파일 전송 완료
- 원격 빌드 및 배포 성공
- 엔드포인트 출력 정상

### 모니터링

```bash
../../bin/arfni-go.exe monitor -f stack.yaml
```

**확인사항:**
- EC2 타겟에서만 실행됨
- start-monitoring-v2.exe 정상 호출

## 이식 과정에서 발생한 이슈

### 1. import 경로 충돌

**문제:** ic.local/ic로 정의된 import 경로
**해결:** 모든 파일에서 github.com/arfni/arfni로 변경

### 2. Stream.Warning 메서드 없음

**문제:** workflow에서 stream.Warning() 호출 시 메서드 없음
**해결:** stream.Info()로 변경하고 "Warning:" 접두사 추가

### 3. 중복 events 정의

**문제:** events.go와 stream.go에 Stream 구조체 중복
**해결:** events.go 제거, 기존 stream.go의 NewStream(true) 사용

### 4. MySQL 포트 충돌

**문제:** 로컬 MySQL 서비스가 3306 포트 사용 중
**해결:** 테스트 시 로컬 MySQL 중지 또는 포트 변경

## 변경된 경로 및 파일명

| 항목 | 이전 | 현재 |
|------|------|------|
| compose 디렉토리 | .infracanvas/compose/ | .arfni/compose/ |
| compose 파일명 | docker-compose.yaml | docker-compose.yml |
| CLI 실행 파일 | deploy-only.exe | arfni-go.exe |

## 트러블슈팅

### ic.exe not found

**원인:** arfni-go.exe와 ic.exe가 같은 위치에 없음
**해결:** build.bat 재실행

### compose not found

**원인:** docker-compose.yml 생성 안됨
**해결:** workflow 시스템이 적용된 ic.exe 사용 확인

### port already in use

**원인:** 로컬 서비스가 포트 사용 중
**해결:** netstat으로 확인 후 프로세스 종료 또는 포트 변경

### EC2 연결 실패

**원인:** SSH 키 권한 또는 잘못된 호스트
**해결:**
- chmod 600 <keyfile>
- stack.yaml의 host, user, sshKey 확인

## 참고

- 작업 요약: `WORK_SUMMARY.md`
- 사용 가이드: `README.md`
