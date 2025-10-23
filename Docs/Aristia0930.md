📅 개발일지 — 2025.10.22
🎯 목표

Tauri 애플리케이션에서 실행 파일(.exe)과 동일한 경로를 기준으로

/plugins 폴더의 플러그인 목록을 스캔하고

data/plugins.json으로 저장한 뒤

React 프론트엔드에서 목록을 읽어오는 기능을 구현한다.

🛠️ 구현 개요
1. 플러그인 스캔 (list_targets)

plugins/ 폴더에서 -x86_64-pc-windows-msvc.exe 확장자를 가진 파일 탐색

파일 이름에서 타겟명 추출

크기(size) 및 경로(path) 메타데이터 수집

결과를 Vec<TargetEntry> 형태로 리턴

동시에 data/plugins.json 파일로 저장

2. 🧱 Tauri & Vite 빌드 관련

NSIS 설치 스크립트 관련 오류 수정 진행

tauri.conf.json 내 bundle > windows > nsis 설정 오류

customNsisScript, installerHooks 옵션 구조가 스키마와 맞지 않아 빌드 실패

NSIS 스크립트(installer.nsi) 커스터마이징 작업 중

🧾 개발일지 — 2025.10.23
🛠️ 주요 개발 내용
1. EC2 SSH 정보 관리 기능 구현

Rust 측에서 SshParams 구조체 및 JSON CRUD 함수(add_or_update_entry, read_all_entries, delete_entry, update_entry) 완성

EC2 호스트, 사용자, PEM 파일 경로를 JSON으로 저장하는 로직 구현

Tauri Command 등록:

ssh_exec_system — SSH 명령 실행 (system ssh)

ec2_add_entry — SSH 항목 추가/수정

➡️ React에서 invoke()를 통해 Rust 함수 호출 가능

2. 파일 저장 경로 문제 해결

기존에는 Program Files 내부(C:\Program Files (x86)\Arfni\data\...)에 저장되어 쓰기 권한 문제 발생

해결:

JSON 저장 경로를 사용자 폴더(AppData/Roaming/Arfni/ssh_targets.json)로 이동

dirs 크레이트를 사용하여 OS별 안전한 config 디렉토리 자동 탐색

일반 사용자 권한으로 파일 생성 및 수정 가능하게 개선

3. Tauri v2 플러그인 기반 파일 다이얼로그 연동

@tauri-apps/plugin-dialog 및 tauri-plugin-dialog 등록

React의 “파일 선택” 버튼에서 PEM 파일 선택 기능 연결

취소/에러 핸들링 및 로깅 처리

open() 호출 시 결과 로그 추가로 디버깅 강화