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