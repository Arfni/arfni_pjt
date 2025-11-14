# 프로젝트 컨텍스트

> 이 문서는 Claude Code와 새로운 세션을 시작할 때 프로젝트 컨텍스트를 빠르게 공유하기 위한 문서입니다.

## 📋 프로젝트 개요

**프로젝트 이름**: [arfni]

**프로젝트 설명**:
[귀찮고 복잡한 인프라 구축 배포 자동화]

**프로젝트 목표**:
- [GUI에서 기술 스택(로고 블록)을 연결하면 내부적으로 stack.yaml을 생성하고, 버튼 한 번으로 로컬(Windows/macOS/Linux) 또는 EC2에 Generate → Build → Up → Post → Health까지 실행한다.]
- [2. 원클릭 배포 파이프라인
Preflight 체크 → Generate → Build → Deploy → Health Check
Preflight: Docker 설치, 포트 충돌, 권한 등 사전 검증
자동 빌드: 언어별 최적화된 Dockerfile 생성 (Java/Node/Python)
헬스체크: HTTP/TCP 자동 검증 및 재시도
원클릭 롤백: 문제 발생 시 이전 버전으로 즉시 복구
]
- [3. 실시간 모니터링
로그 스트리밍: 배포 과정 실시간 확인
에러 가이드: 실패 원인과 해결 방법 즉시 안내 
상태 확인: 각 서비스별 헬스 상태 대시보드 / 로컬에서 Prometeus, grafana를 사용하여 모니터링 할 수 있도록 node exporter를 활용하여 매트릭를 전달하는 방식으로 모니터링 과정에서 ram과부하 가능성을 줄이고 안정성을 높인다.
]

---

## 🛠️ 기술 스택

### Backend
- **언어**: Go

---

## 📁 프로젝트 구조

```
BE/
go_cli/
├─ go.mod
├─ README.md
├─ cmd/
│  └─ arfni/
│     ├─ main.go                      # CLI 엔트리: validate/plan/apply/destroy/logs/doctor
│			└─ cmd/                         # CLI 명령 분리
│        ├─ apply.go
│        ├─ plan.go
│        ├─ validate.go
│        └─ doctor.go
├─ internal/
│  ├─ domain/                         # 순수 도메인 모델 (외부 의존 X)
│  │  └─ types.go
│  ├─ runner/                         # 수명주기 오케스트레이션 (단계 제어)
│  │  └─ run.go
│  ├─ driver/                         # 배포 드라이버 (플러그인처럼 확장)
│  │  ├─ driver.go                    # 공통 인터페이스
│  │  ├─ dockerlocal/
│  │  │  └─ driver.go
│  │  └─ ec2ssh/
│  │     └─ driver.go
│  ├─ generator/                      # compose/.env 생성 (결정적 렌더)
│  │  ├─ render.go
│  │  └─ templates/
│  │     ├─ base-compose.yaml.tmpl
│  │     └─ snippets/                 # 라벨/ingress/health 스니펫
│  ├─ plan/                           # 변경점 계산 (create/update/none/destroy)
│  │  └─ plan.go
│  ├─ state/                          # 이전 배포 상태 저장/로드
│  │  └─ state.go
│  ├─ hooks/                          # postDeploy 훅 (http/command/file)
│  │  └─ post_deploy.go
│  └─ utils/                          # 공용 유틸
│     ├─ events/                      # NDJSON 이벤트 스트림 (GUI가 읽음)
│     │  └─ events.go
│     ├─ secrets/                     # SecretResolver 체인 (OS 키체인/ENV/…)
│     │  └─ resolver.go
│     ├─ health.go
│     ├─ fs.go
│     └─ logs.go
├─ schema/
│  └─ stack.schema.json               # stack.yaml 검증용 스키마
├─ examples/
│  └─ quickstart/
│     └─ web-api-db/
│        └─ stack.yaml                # 최소 예제 입력
├─ testdata/                          # 골든파일 등 테스트 자원(선택)
│  └─ generator/
│     └─ expected-compose.yaml
└─ scripts/
   └─ build_release.sh                # 임시 빌드/릴리스 스크립트
```

**폴더 구조 설명**:
[각 주요 디렉토리의 역할을 설명해주세요]

---

## 📝 개발 컨벤션

### 코드 컨벤션
- Go 컨벤션은 `Go 컨벤션.md` 참조
- [추가 컨벤션이 있다면 작성]

# 작업 전 PULL 받기 !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!

### MR 템플릿

- 기본은 스토리 단위로 MR 날리기

### 📝 변경 사항 요약
<!-- 주요 커밋 메세지 작성 -->
<!-- ex) - Spring Boot 초기화 및 멀티모듈 설정 -->

### ✅ 체크리스트
- [ ]  로컬에서 정상 작동 확인

### 🎸 기타 (선택)
<!-- 그 외 하고싶은 말 작성하세요. -->
<!-- ex) 아이콘은 임시로 넣어놨고 추후 디자인 완료되면 변경될 예정입니다. -->
<!-- ex) 코드 리뷰 시 테이블 업데이트 로직 적절히 처리되고 있는지 검토 부탁드립니다. -->
```

# **Branch 구조**

```
feature/{업무 분야}/{기능명}{_추가 작업자}
// feature/back/login_km

업무 분야: front, back, bigdata, ai, hotfix, infra
기능명: 기능에 따라 취사선택, 이미 동일 기능의 다른 분야 브랜치가 있을 경우 따라가는 것이 좋음
추가 작업자: 해당 브랜치의 추가 작업 시 언더바 이후 개인 초성 기입
```

# **Commit Message 구조**

```
{Type}: {커밋 내용}
// Docs: 0728 회의록 등록

Type: 아래의 type들 중 가장 잘 맞는 것을 선택해서 작성, 첫글자 대문자
커밋 내용: 커밋 시의 작업 내용에 대해 기록, 다양한 기능 구현 시 구현한 기능 내용 모두 기록

만일 어떠한 type과도 일치하지 않는다고 판단 시, 상급자에게 통보 후 type 추가

**커밋 한 줄로만 작성하기**
```

![image.png](attachment:67a3a22d-f641-42eb-8073-2c72e50f9b20:image.png)

# type*

- **Feat**: 새로운 기능을 추가하는 경우
- **Fix**: 버그를 고친 경우
- **Docs**: 문서를 수정한 경우
- **Style**: 코드 포맷 변경, 세미콜론 누락, 코드 수정이 없는 경우
- **Refactor**: 코드 동작 수정, 코드 리펙토링
- **Test**: 테스트 코드. 리펙토링 테스트 코드를 추가했을 때
- **Chore**: 빌드 업무 수정, 패키지 매니저 수정
- **Design**: CSS 등 UI 디자인을 변경했을 때
- **Rename**: 파일명(or 폴더명) 을 수정한 경우
- **Remove**: 코드(파일) 의 삭제가 있을 때.
- **Tailwind**: Tailwindcss 설정을 추가했을 때
- **Storybook**: 스토리를 수정하거나 추가했을 경우
- **Hotfix:** 긴급하게 파일을 수정할 경우
- **Model:** AI 모델 관련 작업 (학습, 체크포인트 업로드, 모델 구조 수정 등)
- **Data:** 데이터용 파일을 올리거나, 수정했을 경우
### API 설계 원칙
- [예: RESTful API 설계 원칙]
- [예: 응답 형식 표준화]

---


---

## 👥 팀 정보

**팀원**:
- [이름] - [역할]
- [이름] - [역할]

**커뮤니케이션 채널**:
- [Slack, Discord 등]

---

## 🔐 환경 변수 및 설정

**필수 환경 변수**:
```
DB_HOST=
DB_PORT=
DB_USER=
DB_PASSWORD=
DB_NAME=

API_KEY=
JWT_SECRET=

[추가 환경 변수들]
```

**설정 파일 위치**: [예: config/config.yaml]

---

## 🚀 로컬 개발 환경 설정

### 사전 요구사항
- Go [버전]
- Docker / Docker Compose
- [기타 필요한 도구들]

### 설정 방법
```bash
# 1. 저장소 클론
git clone [repository-url]

# 2. 의존성 설치
go mod download

# 3. 환경 변수 설정
cp .env.example .env
# .env 파일 편집

# 4. 데이터베이스 실행
docker-compose up -d

# 5. 마이그레이션 실행
[마이그레이션 명령어]

# 6. 애플리케이션 실행
go run cmd/main.go
```

---

## ⚠️ 알아두어야 할 사항

**중요한 제약사항**:
- [예: 특정 API 레이트 리밋]
- [예: 데이터베이스 제약사항]

**주의사항**:
- [예: 절대 커밋하면 안 되는 파일들]
- [예: 특정 기능의 알려진 버그]

**참고 사항**:
- [프로젝트 관련 기타 중요한 정보]

---

**마지막 업데이트**: [날짜]
