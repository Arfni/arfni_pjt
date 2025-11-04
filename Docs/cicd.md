🧩 YMLGEN 템플릿 작성 가이드

본 문서는 Arfni YMLGEN 플러그인에서 사용할
CI/CD 템플릿을 작성하고 추가하는 방법을 안내합니다.
이 문서를 따르면 새로운 프레임워크(Spring, FastAPI, React 등)에 맞는
GitHub Actions 자동 배포 YAML 템플릿을 직접 개발할 수 있습니다.

📂 폴더 구조

Arfni의 기본 실행 구조는 다음과 같습니다:

_up_/
 └── _up_BE/
     └── arfni/
         ├── bin/
         │   ├── ymlgen.exe
         │   └── templates/
         │       ├── spring.yaml.tmpl
         │       ├── spring.meta.json
         │       └── fastapi.yaml.tmpl
         │       └── fastapi.meta.json
         └── ...


✅ 핵심 규칙

모든 템플릿은 ymlgen.exe가 위치한 bin/templates/ 폴더 안에 위치해야 합니다.

Go 플러그인은 실행 시 자동으로 이 경로의 .yaml.tmpl 및 .meta.json 파일을 탐색합니다.

🧱 1. 템플릿 파일 구조

각 템플릿은 아래 두 파일로 구성됩니다:

파일명	설명
[name].yaml.tmpl	GitHub Actions YAML 템플릿 본문
[name].meta.json	UI에서 사용할 변수 정의 및 템플릿 정보

예를 들어, Spring Boot용 템플릿이라면
아래 두 파일이 반드시 존재해야 합니다:

bin/templates/
 ├── spring.yaml.tmpl
 └── spring.meta.json

🧩 2. [name].yaml.tmpl 작성 규칙
📌 파일명

확장자는 반드시 .yaml.tmpl

[name]은 템플릿의 고유 키 값 (예: spring, fastapi, react)

📄 예시 — spring.yaml.tmpl
name: Build JAR & Deploy to EC2 (image rebuild on server)

on:
  push:
    branches: ["{{ .BRANCH }}"]
  workflow_dispatch:
    inputs:
      branch:
        description: "{{ .BRANCH }}"
        required: true
        default: "{{ .BRANCH }}"

env:
  JAVA_VERSION: "{{ .JAVA_VERSION }}"
  JAVA_DIST: "{{ .JAVA_DIST }}"
  DEPLOY_ROOT: "{{ .DEPLOY_ROOT }}"

jobs:
  build_and_deploy:
    runs-on: ubuntu-latest
    permissions:
      contents: read

    steps:
      - name: Checkout source
        uses: actions/checkout@v4
        with:
          ref: ${{ "{{" }} github.event_name == 'workflow_dispatch' && inputs.branch || github.ref_name {{ "}}" }}

      - name: Set up JDK
        uses: actions/setup-java@v4
        with:
          java-version: ${{ "{{" }} env.JAVA_VERSION {{ "}}" }}
          distribution: ${{ "{{" }} env.JAVA_DIST {{ "}}" }}

🧠 변수 규칙

템플릿에서 사용할 모든 변수는 {{ .변수명 }} 형태로 작성합니다.
이 변수들은 반드시 같은 이름으로 .meta.json에 정의해야 합니다.

예:

branches: ["{{ .BRANCH }}"]
DEPLOY_ROOT: "{{ .DEPLOY_ROOT }}"

🧾 3. [name].meta.json 작성 규칙
📌 파일명

.yaml.tmpl과 동일한 이름으로 .meta.json 확장자를 사용합니다.

예:

spring.yaml.tmpl → spring.meta.json

fastapi.yaml.tmpl → fastapi.meta.json

📄 예시 — spring.meta.json
{
  "name": "Spring Boot CI/CD",
  "description": "Build and deploy Spring Boot JAR to EC2 using GitHub Actions.",
  "vars": [
    {
      "key": "BRANCH",
      "label": "Branch",
      "default": "main",
      "type": "string"
    },
    {
      "key": "JAVA_VERSION",
      "label": "Java Version",
      "default": "17",
      "type": "string"
    },
    {
      "key": "JAVA_DIST",
      "label": "Java Distribution",
      "default": "temurin",
      "type": "string"
    },
    {
      "key": "DEPLOY_ROOT",
      "label": "Deploy Root Path",
      "default": "/home/ubuntu/arfni-deploy",
      "type": "string"
    },
    {
      "key": "DOCKER_SERVICE",
      "label": "Docker Service Name",
      "default": "spring",
      "type": "string"
    }
  ]
}

💡 필드 설명
필드	설명
name	템플릿의 이름 (UI에 표시됨)
description	템플릿 설명 (React UI 툴팁 및 목록에서 표시됨)
vars	템플릿에서 사용할 변수 정의 목록
vars 항목 세부 구조
필드	설명
key	.yaml.tmpl에서 사용한 변수 이름 ({{ .KEY }})
label	React UI에 표시될 필드명
default	기본값
type	데이터 타입 (string, number, boolean, select 등)
🧪 4. 테스트 방법
✅ PowerShell / 터미널 테스트
# 템플릿 목록 확인
echo '{ "mode": "list" }' | .\bin\ymlgen.exe

# 특정 템플릿으로 YAML 렌더링
echo '{ "template": "spring", "vars": { "BRANCH": "main" } }' | .\bin\ymlgen.exe


올바르게 설정되었다면 bin/templates의 모든 .meta.json이 목록에 출력됩니다.