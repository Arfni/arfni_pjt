# 2025.10.22

### 한 일
- 오픈소스 미팅 발표
- 발표자료 제작 ( 미완 )
- 발표 스크립트 작성 ( 미완 )
- stack.yaml 파일 생성 및 동기화 로직 설계
    **문제:** 
    기존에 Rust에서 JSON 형식으로 GO CLI를 실행해 YAML 생성 시도했으나, 
    외부에서 stack.yaml 직접 수정 시 Tauri 프론트와 동기화 불가능

    **해결:**
    Rust가 파일 직접 관리 + notify 크레이트로 파일 감시
    → Canvas ↔ stack.yaml 양방향 동기화 구현
    → GO CLI는 `./ic run -f stack.yaml`로 배포만 담당
