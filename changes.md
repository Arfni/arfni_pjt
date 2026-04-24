# Changes — feature/nginx

## feat: add gateway category and nginx reverse proxy canvas plugin (`e6fc928`)

nginx 노드를 캔버스에서 드래그&드롭으로 추가할 수 있는 플러그인을 구현했다.

- `gateway` 카테고리 신규 추가 (DB / Runtime / Infra / Monitor / **Gateway**)
- nginx 플러그인 manifest, icon, Dockerfile 작성
- `NginxNode` 컴포넌트: 연결된 서비스의 라우팅 경로(`/api/`, `/`) 설정 UI
- `NginxPropertyPanel`: upstream별 route, port 편집
- `pluginStackGenerator`: nginx 노드 → stack.yaml `proxy.nginx` 서비스로 변환
- `PropertyPanel`: nginx 엣지 양방향 감지 처리

---

## feat: nginx auto SSL via Let's Encrypt certbot (`1e8fcba`)

배포 시 certbot으로 SSL 인증서를 자동 발급하고, 실패하면 HTTP 모드로 graceful 전환하는 2단계 전략을 구현했다.

**Go 백엔드 (`BE/arfni/internal/`)**
- `generator/nginx/generator.go`: `GenerateNginxConfig` / `BuildConfigWithSSL` 구현
  - upstream, rate limit, CORS, gzip, cache, SSL, keepalive, load balancing 지원
  - `proxy_pass http://upstream` (trailing slash 제거 — path prefix 보존)
- `core/workflow/runner.go`: certbot 실행 후 SSL 설정 적용, 실패 시 HTTP conf 유지
- `generator/nginx/generator_test.go`: 12개 단위 테스트

**프론트엔드**
- `useAutoSave`: `CanvasEdge.data` 필드 직렬화 추가 (라우팅 경로 저장 유지)
- `commands.ts` / `project.rs`: `CanvasEdge` 타입에 `data` 필드 추가
- `projectSlice.ts`: 프로젝트 로드 시 `nginx` 노드 타입 복원

---

## fix: proxy_pass trailing slash, upload condition, edge route persistence (`ce4e36e`)

코드 리뷰에서 발견된 버그 3건 수정.

| 버그 | 원인 | 수정 |
|------|------|------|
| `/api/health` → `/health` 404 | `proxy_pass http://upstream/` trailing slash | slash 제거 |
| nginx.conf EC2 업로드 안 됨 | 서비스명 비교 로직 오류 | `getNginxServiceName()` 반환값으로 비교 |
| 캔버스 재진입 시 라우팅 경로 초기화 | `CanvasEdge.data` 미저장 (TS·Rust·저장 3곳) | 3곳 모두 `data` 필드 추가 |

---

## feat: fix UI issues — tab scroll, nginx preview icon, Korean name validation (`b71d581`)

- **NodePalette 탭 overflow**: `overflow-x-auto` + `flex-shrink-0`으로 한국어 탭 레이블 잘림 방지
- **CanvasPreview nginx 아이콘**: 미리보기에서 nginx 노드 아이콘 누락 → `gateway/nginx` 플러그인에서 로드
- **프로젝트 이름 한글 검증**: 한글 입력 시 "프로젝트 이름에 한글을 사용하실 수 없습니다" 별도 안내
