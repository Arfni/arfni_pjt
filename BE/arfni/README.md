# Arfni - Infrastructure Deployment Automation CLI

> 귀찮고 복잡한 인프라 구축 배포 자동화

## 📋 프로젝트 개요

Arfni는 Docker Compose 기반 인프라 배포를 자동화하는 CLI 도구입니다.

### 주요 기능

- **선언적 배포**: `stack.yaml`로 인프라 정의
- **다중 타겟 지원**: 로컬 Docker, EC2, Kubernetes
- **5단계 워크플로우**: Generate → Build → Deploy → Post → Health
- **GUI 연동**: NDJSON 이벤트 스트림으로 실시간 통신
- **원클릭 배포**: 한 번의 명령으로 전체 인프라 배포
- **자동 롤백**: 문제 발생 시 이전 상태로 복구

## 🚀 빠른 시작

### 설치

```bash
# 바이너리 다운로드 (향후 제공)
# 또는 소스에서 빌드
go build -o arfni ./cmd/arfni
```

### 기본 사용법

```bash
# stack.yaml 검증
arfni validate stack.yaml

# 배포 계획 확인
arfni plan stack.yaml

# 배포 실행
arfni apply stack.yaml

# 인프라 삭제
arfni destroy

# 시스템 진단
arfni doctor
```

## 📁 프로젝트 구조

```
arfni/
├─ cmd/arfni/           # CLI 엔트리포인트
├─ internal/            # 내부 패키지
│  ├─ core/            # 핵심 로직
│  ├─ drivers/         # 배포 드라이버
│  ├─ generator/       # 코드 생성
│  ├─ events/          # 이벤트 시스템
│  └─ utils/           # 유틸리티
├─ pkg/                # 공개 패키지
├─ examples/           # 예제 파일
└─ scripts/            # 빌드 스크립트
```

## 🛠️ 개발

### 요구사항

- Go 1.21+
- Docker Desktop (로컬 테스트)
- SSH 클라이언트 (EC2 배포)

### 빌드

```bash
# 개발 빌드
go build -o arfni ./cmd/arfni

# 릴리스 빌드
make build

# 테스트
make test
```

## 📝 Stack YAML 예제

```yaml
apiVersion: v0.1
name: my-app
targets:
  local:
    type: docker-desktop
services:
  web:
    kind: docker.container
    target: local
    spec:
      image: nginx:latest
      ports: ["80:80"]
```

## 🤝 기여

자세한 내용은 `PROGRESS.md`와 `PROJECT_CONTEXT.md`를 참조하세요.

## 📄 라이선스

MIT License
