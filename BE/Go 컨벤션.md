Go 컨벤션
코드 포맷팅
Go fmt 사용: go fmt(또는 gofmt)와 goimports를 통한 자동 정렬이 필수다.
패키지 이름은 소문자 단일 단어: import 시 명시적 이름 충돌을 피하고 가독성을 높이기 위함이다.
import는 표준 라이브러리 → 외부 패키지 → 내부 패키지 순으로 그룹화한다
네이밍 규칙
공개 여부: 대문자 시작은 공개(exported), 소문자는 비공개(unexported).
함수 및 메서드 설계
짧고 명확한 함수 설계를 선호하며, 다중 반환값 중 마지막 값은 반드시 error.

오류 처리
if err != nil 패턴을 표준으로 사용.

주석 규칙
godoc에 의해 문서로 생성되므로, 내보낸 심볼에는 반드시 문장형 주석을 작성한다.
주석은 문서화 대상 이름으로 시작 (// Sqrt는...).
전체 패키지 설명은 파일 상단의 package 선언 위에 작성한다.​

권장 사항
Zero Value 유효성: 구조체는 초기값으로도 동작하도록 설계.
time.Duration 사용: 숫자 대신 5 * time.Second로 명시.
문자열 루프: for _, r := range s로 한글 등 멀티바이트 문자를 정확히 처리.

폴더 구조
arfni/
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
는 이것을 베이스로 추가 업데이트가 가능하도록 모듈화 구조 유지