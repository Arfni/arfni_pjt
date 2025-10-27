# 2025.10.22

### 한 일
- 오픈소스 미팅 발표
- 발표자료 제작
- 발표 스크립트 작성
- stack.yaml 파일 생성 및 동기화 로직 설계
    **문제:** 
    기존에 Rust에서 JSON 형식으로 GO CLI를 실행해 YAML 생성 시도했으나, 
    외부에서 stack.yaml 직접 수정 시 Tauri 프론트와 동기화 불가능

    **해결:**
    Rust가 파일 직접 관리 + notify 크레이트로 파일 감시
    → Canvas ↔ stack.yaml 양방향 동기화 구현
    → GO CLI는 `./ic run -f stack.yaml`로 배포만 담당

# 2025.10.23
- stack.yaml 명세 문서 제작
- 발표 ppt 제작
- 발표 스크립트 제작

# 2025.10.24
- 발표자료 제작 및 기획 발표 준비

# 2025.10.27
- stack.yaml파일 생성, 캔버스 상태 저장, 배포 시 go 실행하여 dockerfile, docker-compose.yaml 생성 구현
- 개발 환경에서 테스트하여 정상작동 하였지만 prod환경에서 문제가 있어 아직 테스트 중에 있음
- 경로관련 문제 해결해야 함
