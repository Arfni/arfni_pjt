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
    