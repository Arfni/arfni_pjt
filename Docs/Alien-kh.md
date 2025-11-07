# 2025.10.22
  1. 모니터링 시스템 아키텍처 설계 및 구현

  목표: 로컬에서 Prometheus/Grafana를 실행하고, EC2에는 Node Exporter만 배포하여 EC2 리소스 절약

  구현 내용:

  1.1 로컬 모니터링 스택 구성

  - docker-compose.yml 생성
    - Prometheus 컨테이너 (포트 9090)
    - Grafana 컨테이너 (포트 3000)
    - 네트워크: monitoring
  - prometheus.yml 생성
    - 메트릭 수집 주기: 15초
    - 타겟: host.docker.internal:9100 (SSH 터널을 통해 EC2 접근)

  1.2 Grafana 자동 설정 (Provisioning)

  - grafana-datasource.yml 생성
    - Prometheus 데이터소스 자동 등록
  - grafana-dashboard.yml 생성
    - 대시보드 자동 로드 설정
  - dashboards/node-exporter-full.json
    - Grafana.com에서 Dashboard ID 1860 다운로드
    - DS_PROMETHEUS → Prometheus 치환
  - Grafana 익명 접근 설정
    - 환경변수 추가: GF_AUTH_ANONYMOUS_ENABLED=true
    - 로그인 없이 바로 대시보드 접근 가능

  1.3 EC2 배포 설정

  - my-app/ec2_stack.yaml 수정
    - node-exporter 서비스 추가
    - 이미지: prom/node-exporter:latest
    - 포트: 9100
    - 볼륨: 호스트 루트를 /host로 마운트 (읽기 전용)

  2. 트러블슈팅

  문제: Grafana 대시보드에서 모든 메트릭 N/A 표시

  조사 과정:
  1. SSH 터널 정상 확인: curl localhost:9100/metrics 성공
  2. Prometheus Targets 상태: UP 확인
  3. Prometheus 쿼리: node_cpu_seconds_total 데이터 존재 확인
  4. Prometheus 레이블 조사:
  curl http://localhost:9090/api/v1/label/instance/values
  # 결과: ["ec2-server", "localhost:9090"]

  원인:
  - prometheus.yml에서 labels: { instance: 'ec2-server' }로 커스텀 레이블 지정
  - Node Exporter Full 대시보드는 instance 레이블이 호스트:포트 형식일 것으로 가정
  - 레이블 불일치로 대시보드 쿼리가 실패

  해결:
  - prometheus.yml에서 커스텀 labels 제거
  - Prometheus가 자동으로 instance: 'host.docker.internal:9100' 설정
  - Grafana 대시보드에서 해당 instance 선택 시 메트릭 정상 표시

  3. 테스트 및 검증

  검증 항목:
  - ✅ EC2에 Node Exporter 배포 완료 (docker ps 확인)
  - ✅ SSH 터널 연결 정상 (ssh -L 9100:localhost:9100)
  - ✅ Prometheus 메트릭 수집 정상 (Targets UP 상태)
  - ✅ Grafana 데이터소스 자동 연결
  - ✅ Grafana 대시보드 자동 로드
  - ✅ 익명 접근으로 로그인 없이 대시보드 사용
  - ✅ CPU, 메모리, 디스크, 네트워크 메트릭 실시간 표시

  테스트 환경:
  - 로컬: Windows 11, Docker Desktop
  - EC2: Amazon Linux 2
  - SSH 키: mytest.pem

  4. 문서화

  생성한 문서:
  - MONITORING_IMPLEMENTATION.md
    - 아키텍처 설명
    - 구현 세부사항 (각 파일의 목적과 설정 이유)
    - 트러블슈팅 과정 (원인 분석, 해결 방법, 교훈)
    - 테스트 결과 및 검증 단계
    - 제약 사항 및 알려진 이슈
    - 실행 명령어 정리

  5. 생성/수정된 파일 목록

  C:\arfni_pjt\BE\Arfni_test\
  ├── docker-compose.yml              (생성)
  ├── prometheus.yml                  (생성, 이후 수정)
  ├── grafana-datasource.yml          (생성)
  ├── grafana-dashboard.yml           (생성)
  ├── dashboards\
  │   └── node-exporter-full.json     (다운로드 후 수정)
  ├── my-app\
  │   └── ec2_stack.yaml              (node-exporter 서비스 추가)
  └── MONITORING_IMPLEMENTATION.md    (문서 생성)

  ---
  주요 기술적 결정

  1. Docker Compose 사용: 로컬 환경 간편 관리
  2. Grafana Provisioning: 데이터소스/대시보드 자동 설정으로 사용자 편의성 향상
  3. 익명 접근 허용: 로컬 환경이므로 로그인 과정 제거
  4. host.docker.internal 사용: Docker 컨테이너에서 호스트 localhost 접근
  5. 커스텀 레이블 제거: 표준 대시보드와의 호환성 유지

  ---
  향후 작업 (TODO)

  - arfni.exe tunnel start 명령어 구현 테스트
  - GUI에서 SSH 터널 자동 시작/종료 통합
  - 여러 EC2 인스턴스 동시 모니터링 지원
  - 알림 설정 (CPU/메모리 임계값)

  ---

  # 2025.10.23
   1. 모니터링 시스템 아키텍처 설계
    - 모니터링 시스템 테스트 구현한 것을 개선하여 절대경로로 파일 위치를 읽어오던 로직을 상대경로 읽기로 개선
    - EC2 테스트를 위한 모니터링 기능 기능 구현 및 정리 기능 구현
   2. 모니터링 시스템 개선
    - 그라파나와 프로메테우스를 개선하여 연결이 제대로 되지 않던 것을 수정
    - 그라파나의 기본 세팅 (로그인, 커스터마이징 대시보드)을 미리 세팅하여 로그인 하지 않고 바로 사용자들이 이용할 수 있도록 문서 추가
    - cmd 창을 닫을시 사용자의 램 사용량을 낭비하지 않도록 자동 종료 기능 추가
    
  # 2025.10.24
   1. 기능 명세서 설계
    - 백엔드 파트의 기능명세서 일정 설계 및 중요도 선정
   2. 플로우 차트 제작
    - Go 플로우 설계
   3. 발표 준비 보조

# 2025.10.27
  1. Tauri, Rust 환경에서 Go와 연동이 가능한지 테스트
   - Go 환경에서 Tauri, Rust 환경에서 json, cli 명령어를 전달했을 때 반응 확인
   - Tauri, Rust 환경에서 Go 와 연동이 가능하도록 test_dummy 기능 구현 
  2. 설정 검증 관련 기술 부채 해결 
   - validateConfig 함수를 추가하여 프로그램 시작 전 모든 설정을 검증합니다.
     - SSH 설정: PEM 파일 존재 여부, 호스트 주소 비어있는지, 사용자명 확인
     - 포트 검증: 1-65535 범위 체크, 포트 중복 방지, 1-1024 특권 포트 경고
     - Docker 환경: docker-compose.yml 파일 존재 확인
     - 에러 메시지: 모든 문제를 한 번에 표시하여 사용자가 한 번에 수정 가능
# 2025.10.28~29
  1. EC2를 활용한 stack.yaml 배포 성공 
  2. GUI 원격 서버 배포 deploy 기능 연결 및 발생하는 버그 테스트 및 수정

# 2025.10.30
  1. GUI 단계별 진행도 표시 기능 구현
  문제: GUI가 배포 단계를 인식하지 못해 진행도가 표시되지 않음
  수정: EC2 배포 5단계마다 "Phase X/5" 메시지 출력 추가 (준비, 소스 업로드, 빌드, 설정 업로드, 컨테이너 시작)

  2. 빌드 진행률 및 서비스 정보 출력
  문제: 빌드 단계가 실제 빌드 전에 종료되어 단계 표시가 부정확하고, 배포 완료 시 서비스 개수가 GUI에 표시되지 않음
  수정: 빌드할 서비스 목록을 사전 수집하여 실제 빌드 시작 시에만 Phase 3 출력, 각 서비스 빌드 완료 시 진행률 표시, 배포 완료 시 OUTPUTS 형식으로 서비스 개수 및 컨테이너 개수 출력

  3. 로그 레벨 분류 개선
  문제: Docker buildx의 정상 메시지(stderr 출력)가 모두 빨간색 ERROR로 표시됨
  수정: stderr 메시지 내용을 분석하여 error/failed/fatal/panic은 error로, warning/warn은 warning으로, 나머지는 info로 분류

  4. Windows 콘솔 창 숨김 처리
  문제: Go 바이너리 실행 시 별도의 CMD 창이 표시됨
  수정: Windows에서 CREATE_NO_WINDOW 플래그를 사용하여 배포 실행 및 프로세스 중지 시 콘솔 창 숨김 처리

  5. 기존에 테스트로 따로 작업하던 Go 로직들을 현재 GUI go-arfni.exe로 생성될 수 있도록 병합

# 2025.11.03
  1. GUI 모니터링 기능 연동 및 자동 시작 구현

  1.1 백엔드 수정 (Go)
  - pkg/stack/monitoring.go (line 176): Grafana 환경변수 추가
    - GF_SECURITY_ALLOW_EMBEDDING=true 설정으로 iframe 임베딩 허용
  - cmd/arfni-monitoring/main.go (lines 676, 699): Grafana 컨테이너 시작 시 환경변수 추가
    - Local/Hybrid/All-in-one 모드별 적용

  1.2 프론트엔드 신규 구현 (Tauri/React)
  - src-tauri/src/commands/monitoring.rs (신규 312줄): Tauri 백엔드 명령어 10개 구현
    - prometheus_query: Prometheus API 쿼리 실행
    - get_cpu_usage/get_memory_usage/get_network_traffic/get_disk_usage: 메트릭 조회
    - get_all_metrics: 전체 메트릭 일괄 조회
    - get_monitoring_config: stack.yaml 설정 파싱
    - test_prometheus_connection: Prometheus 연결 테스트
    - start_monitoring_stack: 모니터링 스택 자동 시작
    - check_monitoring_running: Grafana 실행 상태 확인

  - src-tauri/src/main.rs (lines 95-104): 모니터링 명령어 등록
  - src-tauri/src/commands/mod.rs: monitoring 모듈 선언
  - src-tauri/tauri.conf.json (line 22): CSP 정책 수정
    - frame-src에 localhost 허용 추가

  - src/pages/monitoring/ui/MonitoringPage.tsx (신규 249줄): 모니터링 페이지 컴포넌트
    - stack.yaml 설정 자동 로드
    - Grafana 실행 상태 자동 확인
    - 미실행 시 자동 시작 후 30초간 준비 상태 polling
    - Grafana 대시보드 목록 페이지 iframe 표시
    - 새 탭 열기 버튼 및 에러 처리 UI

  - src/pages/logs/ui/LogPage.tsx (lines 809-816): Monitoring Logs 버튼 활성화
    - disabled 속성 제거 및 onClick 핸들러 추가

  - src/App.tsx: /monitoring 라우트 추가

  1.3 트러블슈팅
  - 문제: iframe에서 "localhost 연결을 거부했습니다" 오류
  - 원인: Grafana의 X-Frame-Options: deny 헤더
  - 해결: GF_SECURITY_ALLOW_EMBEDDING=true 환경변수 설정
  - 추가 수정: 대시보드 UID 의존성 제거를 위해 /dashboards 경로로 변경

  1.4 생성/수정 파일 요약
  - 수정 파일: 7개 (Go 2, Rust 3, TypeScript 2)
  - 신규 파일: 2개 (monitoring.rs, MonitoringPage.tsx)
  - 총 추가 코드: 561줄

  1.5 문서화
  - MONITORING_INTEGRATION.md 생성
    - 수정 파일별 변경 내역
    - 신규 구현 기능 설명
    - 트러블슈팅 과정
    - 빌드 설정 및 아키텍처

# 2025.11.04
  1. 모니터링 시스템 개선 및 안정화

  1.1 CMD 창 숨김 처리
  - 문제: EC2 연결 및 모니터링 실행 시 CMD 창 표시
  - 해결: Windows CREATE_NO_WINDOW 플래그 적용
    - monitoring.rs: ensure_docker_running, start_monitoring_stack에 적용
    - ssh_exec.rs: SSH 명령 실행 시 적용
    - port_check.rs: netstat 명령 실행 시 적용

  1.2 모니터링 리소스 자동 정리
  - 문제: GUI 종료 시 Docker 컨테이너 및 프로세스 잔존
  - 해결:
    - main.rs: WindowEvent::CloseRequested 핸들러 추가
      - docker rm -f로 grafana, prometheus 컨테이너 완전 삭제
      - taskkill로 ssh.exe, arfni-monitoring.exe 프로세스 종료
    - MonitoringPage.tsx: useEffect cleanup 함수 추가
      - 컴포넌트 언마운트 시 stop_monitoring_stack 호출
    - monitoring.rs: stop_monitoring_stack 명령어 구현

  1.3 Docker Desktop 자동 실행
  - 문제: Docker Desktop 미실행 시 모니터링 실패
  - 해결: ensure_docker_running 함수 구현
    - docker info로 실행 상태 확인
    - 미실행 시 Docker Desktop.exe 자동 실행
    - Program Files, Program Files (x86) 경로 탐색
    - 최대 60초 대기 (1초 간격 polling)

  1.4 브라우저 자동 열기 비활성화
  - arfni-monitoring/main.go (line 299): AutoOpenBrowser = false 설정
  - 이유: GUI iframe으로 표시하므로 별도 브라우저 창 불필요

  1.5 문서화
  - MONITORING_INTEGRATION.md 업데이트
    - CMD 창 숨김 구현 내역
    - 리소스 정리 로직 설명
    - Docker Desktop 자동 실행 구현

  2. 크로스 플랫폼 경로 해결 문제 해결

  2.1 문제 상황
  - 증상: 배포된 앱에서 "Monitoring executable not found" 오류
  - 원인: 개발자 컴퓨터의 절대 경로 하드코딩
  - 영향: 다른 컴퓨터에서 모니터링 기능 미작동

  2.2 원인 분석
  - Tauri 번들 구조:
    - arfni-gui.exe 위치: C:\Users\[User]\Desktop\arfni-gui\
    - arfni-monitoring.exe 위치: C:\Users\[User]\Desktop\arfni-gui\_up_\_up_\BE\arfni\bin\
    - monitoring 폴더 위치: C:\Users\[User]\Desktop\arfni-gui\_up_\_up_\monitoring\
  - 문제: findMonitoringDirectory 함수가 잘못된 상대 경로 사용

  2.3 해결
  - arfni-monitoring/main.go (lines 1063-1074):
    - 기존: filepath.Join(baseDir, "..", "..", "..", "..", "_up_", "_up_", "monitoring")
    - 수정: filepath.Join(baseDir, "..", "..", "..", "monitoring")
    - 설명: baseDir = _up_/_up_/BE/arfni/bin이므로 3단계 상위로 이동

  - monitoring.rs (lines 388-418):
    - stdout/stderr를 null 대신 monitoring.log 파일로 리다이렉션
    - 디버깅을 위해 실행 로그 저장
    - 반환 메시지에 stack.yaml 경로 포함
  2.5 문서화
  - MONITORING_INTEGRATION.md에 "Cross-Platform Path Resolution Fix" 섹션 추가
    - 문제 상황 및 원인 분석
    - Tauri 번들 디렉토리 구조 설명
    - 경로 계산 로직 설명
    - 수정 파일 및 변경 내역

# 2025.11.05
  1. AI 최적화 시스템 고도화 - 시계열 데이터 분석 통합

  1.1 Prometheus 시계열 데이터 분석 기능 구현
  - internal/pricing/prometheus.go (신규 구현):
    - TimeSeriesData 구조체: 시계열 메트릭 데이터 저장
    - TimeSeriesStats 구조체: 통계 정보 (Min, Max, Average, P50, P95, P99, StdDev, PeakHours)
    - QueryRange 함수: Prometheus range query API 호출
    - CalculateStats 함수: 시계열 데이터 통계 계산 (백분위수, 표준편차, 피크 시간대 분석)

  1.2 AI 최적화 프롬프트 개선
  - internal/pricing/optimizer.go (lines 150-300):
    - 시스템 프롬프트 개선:
      - 시계열 데이터 인용 의무화 (CRITICAL REQUIREMENTS)
      - min, avg, max, P50, P95, P99 값 명시 요구
      - 표준편차 기반 변동성 분석 요구
      - 피크 시간대 기반 스케일링 전략 제안
    - GetTimeSeriesData 함수 추가:
      - CPU, 메모리, 디스크 사용률 24시간 분석
      - 각 메트릭별 통계 계산 및 반환
    - GenerateOptimizationPrompt 함수 수정:
      - 시계열 통계를 프롬프트에 포함
      - 실시간 스냅샷 + 24시간 트렌드 분석 결합

  1.3 트러블슈팅
  - 문제: "ts.Values undefined (type time.Time has no field or method Values)"
  - 원인: Prometheus API 응답 파싱 시 변수명 충돌
  - 해결: 변수명 ts → timestamp로 변경 (prometheus.go line 89)


  2. 모니터링 정리 로직 디버깅

  2.1 문제 상황
  - 증상: GUI 종료 시 Docker 컨테이너가 정리되지 않음
  - 원인 후보:
    - Cleanup 함수가 호출되지 않음
    - Docker 명령어가 컨테이너를 찾지 못함
    - Background thread가 조기 종료됨

  2.2 디버깅 로깅 추가
  - src-tauri/src/main.rs (cleanup_monitoring_stack 함수):
    - 로그 파일 생성: %TEMP%\arfni_cleanup.log
    - 타임스탬프 기반 로그 기록
    - 각 정리 단계별 상세 로그:
      - arfni-monitoring.exe 프로세스 종료 결과
      - Docker 컨테이너 검색 결과 (패턴별)
      - 각 컨테이너 삭제 성공/실패 로그
      - SSH 프로세스 종료 로그

  2.3 Docker 컨테이너 검색 로직 개선
  - monitoring.rs (stop_monitoring_stack):
    - 기존: --filter ancestor=grafana/grafana (이미지 기반)
    - 수정: --filter name=grafana (이름 패턴 기반)
    - 이유: 타임스탬프가 포함된 컨테이너 이름 대응
      - 예: arfni-monitoring-20251106-015425-grafana-1

# 2025.11.06
  1. SSH 터널 시스템 구현 - 원격 Prometheus 최적화 지원

  1.1 SSH 터널 관리 기능 구현
  - src-tauri/src/features/ssh_rt.rs (lines 45-314):
    - TunnelHandle 구조체: 터널 세션 관리 (id, child, local_port, remote_port)
    - TUNNELS 글로벌 맵: 여러 터널 동시 관리
    - open_tunnel 함수:
      - SSH 포트 포워딩 생성 (ssh -L localPort:localhost:remotePort -N)
      - ExitOnForwardFailure 옵션으로 포트 충돌 감지
      - stderr 모니터링으로 에러 이벤트 전송
      - CREATE_NO_WINDOW 플래그로 Windows 콘솔 숨김
    - close_tunnel 함수: 터널 프로세스 종료 및 세션 제거
    - close_all_tunnels 함수: 앱 종료 시 전체 터널 정리

  1.2 Tauri 명령어 등록
  - src-tauri/src/commands/ssh_it.rs (lines 35-51):
    - tunnel_open 명령어: (params: SshParams, local_port: u16, remote_port: u16) → UUID
    - tunnel_close 명령어: (id: String) → Result
    - generate_handler에 명령어 추가 (line 56)
  - src-tauri/src/main.rs (lines 77-78):
    - tunnel_open, tunnel_close 핸들러 등록

  1.3 LogPage 터널 통합
  - src/pages/logs/ui/LogPage.tsx:
    - 터널 상태 추가 (lines 36-38): tunnelId, tunnelOpen
    - 터널 이벤트 리스너 (lines 89-104):
      - tunnel:opened: 터널 생성 성공 메시지 표시
      - tunnel:stderr: 터널 에러 로그 출력
      - tunnel:closed: 터널 종료 시 상태 초기화
    - openTunnel 함수 (lines 180-203):
      - EC2 서버 정보로 터널 생성
      - localhost:9091 → remote:9090 포워딩
      - 성공 시 터미널에 사용 방법 안내 표시
    - closeTunnel 함수 (lines 205-214): 터널 종료 및 상태 정리
    - UI 버튼 추가 (lines 477-494):
      - Open Tunnel: 녹색 버튼, EC2 서버 정보 필요
      - Close Tunnel: 주황색 버튼, 터널 열린 상태에서 활성화

# 2025.11.07
  1. 배포 시스템 개선 - Docker 캐시 최적화

  1.1 Docker Compose 강제 재업로드
  - BE/arfni/internal/core/workflow/runner.go (lines 377-388):
    - buildImagesEC2 함수 수정
    - docker-compose.yml 업로드 전 기존 파일 삭제 (rm -f)
    - 이유: EC2에 남아있던 예전 버전 파일로 인한 서비스 불일치 문제 해결

  1.2 Docker 빌드 캐시 플래그 제거
  - BE/arfni/internal/core/workflow/runner.go:
    - buildImagesLocal (line 300): --no-cache 플래그 제거
    - buildImagesEC2 (line 495): --no-cache 플래그 제거
    - 이유: 매 배포마다 전체 레이어 재빌드로 인한 배포 시간 증가 방지
    - 필요 시 수동으로 --no-cache 사용 가능

  2. React 플러그인 템플릿 수정 - devDependencies 설치 활성화

  2.1 Dockerfile 템플릿 수정
  - arfni-gui/src-tauri/resources/plugins/bundled/framework/react/templates/Dockerfile.tmpl (line 10):
    - 기존: RUN npm install --production
    - 수정: RUN npm install
    - 이유: Vite 빌드 시 devDependencies 필요 (vite, @vitejs/plugin-react 등)




