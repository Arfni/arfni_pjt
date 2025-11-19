## 1. **Overview**
📘 Arfni Overview & Features(Arfni 소개 및 기능)
<details> <summary><strong>한국어 </strong></summary> <br>

## **Arfni란?**

Arfni는 기존의 어렵고 복잡한 인프라 구축을 GUI 기반으로 쉽고 간편하게 만들어주는 오픈소스 배포 자동화 서비스입니다. 블록처럼 끌어다 놓고 폼만 채우면, 선언 파일을 자동 생성해 설계→생성→연결→실행→모니터링까지 한 번에 처리합니다.

## **주요 기능**

### **1. 직관적인 드래그&드롭 인프라 설계**

React Flow 기반의 GUI에서 웹, 백엔드, 프록시, 캐시, 메시지 브로커 등의 서비스를 블록 형태로 끌어다 놓으며 직관적으로 인프라를 설계할 수 있습니다.

- 노드 추가 및 연결을 통한 서비스 간 종속성 시각화
- 우측 속성 패널에서 포트, 볼륨, 환경변수, 시크릿 등 세부 설정 입력
- 실시간 동기화로 즉시 배포 가능한 구성 생성

### **2. stack.yaml 선언 파일 자동 생성**

캔버스에서 구성한 인프라를 표준화된 선언형 파일(`stack.yaml`)로 자동 변환합니다.

- 각 노드의 설정을 YAML 구조로 자동 변환
- CLI에서 바로 실행 가능한 표준 포맷

### **3. Go 기반 CLI 엔진으로 자동 배포**

Arfni의 핵심 엔진이 `stack.yaml`을 해석해 Docker 및 EC2 환경에 자동으로 배포합니다.

- **로컬 환경**: Docker Compose 기반 즉시 실행
- **원격 환경**: SSH를 통한 EC2 자동 배포
- 대상 환경에 맞는 Compose 파일 자동 생성 및 `build`, `up` 명령 실행
- EC2의 경우 SCP를 통한 산출물 업로드 후 원격 실행

### **4. AI 기반 EC2 인스턴스 추천 및 비용 산정**

OpenAI API를 활용하여 프로젝트에 최적화된 EC2 인스턴스를 추천하고 예상 비용을 산정합니다.

- 워크로드 분석 기반 인스턴스 타입 추천
- 예상 월간 운영 비용 자동 계산
- 비용 효율적인 인프라 구성 가이드 제공

## **왜 Arfni인가?**

### **기존 문제점**

- 도커, 데이터베이스, 메시지 브로커 등 구성 요소마다 설정 방식이 달라 복잡하고 재현성이 낮음
- 환경 파일과 네트워크 설정을 수동으로 맞추다 보니 사람마다 결과가 달라 품질 편차 발생
- 로컬·서버·클라우드 전환 시 반복 설정으로 개발 생산성 저하

### **Arfni의 해결책**

- GUI 기반 직관적 설계로 학습 곡선 최소화
- 선언형 파일로 재현 가능하고 일관된 인프라 구성
- 로컬부터 클라우드까지 동일한 방식으로 배포 자동화
</details>
<details> <summary><strong>English </strong></summary> <br>

## **What is Arfni?**

**Arfni** is an open-source deployment automation platform that simplifies complex infrastructure management with an intuitive GUI. Simply drag and drop components, fill in the configuration forms, and Arfni automatically generates the necessary files — handling everything from design and deployment to monitoring in one unified workflow.

## Key Features

### 1. Intuitive Drag-and-Drop Infrastructure Design

Design your infrastructure visually with a React Flow-based GUI. Simply drag and drop service blocks including web servers, backends, proxies, caches, and message brokers.

- Visualize service dependencies through node connections
 Configure ports, volumes, environment variables, and secrets in the right-side properties panel
- Real-time synchronization generates deployment-ready configurations instantly

### 2. Automatic stack.yaml Generation

Your canvas design is automatically converted into a standardized declarative file (stack.yaml).

- Automatic conversion of node configurations to YAML structure
- Standard format ready for CLI execution

### 3. Automated Deployment with Go-based CLI Engine

Arfni's core engine interprets stack.yaml and automatically deploys to Docker and EC2 environments.

- **Local:**Instant execution with Docker Compose
- **Remote:** Automated EC2 deployment via SSH
- Automatic generation of environment-specific Compose files and execution of build/up commands
- For EC2: artifact upload via SCP followed by remote execution

### 4. AI-Powered EC2 Instance Recommendations and Cost Estimation

Leveraging OpenAI API, Arfni recommends optimized EC2 instances and estimates costs for your project.

- Instance type recommendations based on workload analysis
- Automatic calculation of estimated monthly operating costs
- Cost-efficient infrastructure configuration guidance

---

## Why Arfni?

**The Problem**

- Each component (Docker, databases, message brokers, etc.) requires different configuration methods, making setup complex and hard to reproduce
- Manual configuration of environment files and network settings leads to inconsistent results and quality variation across teams
- Switching between local, server, and cloud environments requires repetitive setup, reducing development productivity

**Arfni's Solution**

- Intuitive GUI-based design minimizes the learning curve
- Declarative files ensure reproducible and consistent infrastructure configuration
- Unified deployment automation from local to cloud environments
</details>


## 2. **Installation**

- [📘 한국어 문서 보기](/Docs/DEPLOYMENT_REFERENCE_GUIDE_KO.md)
- [📘 English Docs](/Docs/DEPLOYMENT_REFERENCE_GUIDE.md)

## 3. 개발 문서(Development Documentation)

- [📘 English Docs](/Docs/Development%20Guide.md)
- [📘 한국어 문서 보기](/Docs/Development%20Guide_KO.md)

## 4. 플러그인 개발 문서

- [플로그인 개발 문서로 이동](https://github.com/Arfni/arfni-plugins)

## 5. **Contribution Guide**

- 작성중

## 6.QnA

## 7.팀소개