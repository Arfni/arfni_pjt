# 버전 릴리스 (Version Release)

![latest release](https://img.shields.io/github/v/release/Arfni/arfni_pjt)

# **1. 설치 (Installation)**

### **1️⃣ 설치 프로그램 실행 (Run the Installer)**

**Arfni 1.0.0 Setup** 아이콘을 더블 클릭하여 설치를 시작합니다.

![화면 캡처 2025-11-11 172645.png](/Docs/images/%ED%99%94%EB%A9%B4_%EC%BA%A1%EC%B2%98_2025-11-11_172645.png)

---

### **2️⃣ 환영 화면 (Welcome Screen)**

설치 마법사가 열리면 **Next** 버튼을 클릭하여 계속 진행합니다.

설치를 시작하기 전에 실행 중인 다른 애플리케이션을 모두 종료하는 것을 권장합니다.

![image.png](/Docs/images/image.png)

---

### **3️⃣ 라이선스 동의 (License Agreement)**

라이선스 내용을 꼼꼼히 읽어본 뒤, 동의한다면 **I Agree** 버튼을 선택하여 다음 단계로 진행합니다.

![image.png](/Docs/images/image%201.png)

---

### **4️⃣ 설치 경로 선택 (Choose Installation Location)**

Arfni를 설치할 폴더를 선택합니다.

기본 경로를 그대로 사용하거나 **Browse** 버튼을 클릭하여 다른 경로를 선택할 수 있습니다.

선택 후 **Install** 버튼을 눌러 설치를 시작합니다.

![image.png](/Docs/images/image%202.png)

---

### **5️⃣ 설치 완료 (Completing Installation)**

설치가 완료되면 다음과 같은 확인 메시지가 표시됩니다.

**“Arfni 1.0.0 has been installed on your computer.”**

**Finish** 버튼을 클릭하여 설치 마법사를 종료합니다.

![image.png](/Docs/images/image%203.png)

---

# 2. 기능 소개 (Features)

## (1) 로컬 배포 (Local Deployment)

## 사전 준비사항 (Prerequisites)

로컬 배포를 시작하기 전에, 로컬 PC에 **Docker Desktop**이 설치되어 있어야 합니다.  
Arfni는 Docker Desktop이 설치되어 있다면 자동으로 실행을 시도합니다.  
자동 실행에 실패할 경우, Docker Desktop을 수동으로 실행한 뒤 다시 시도해 주세요.

---

### 1️⃣ 새 프로젝트 생성 (Create New Project)

로컬 환경에서 **Create New Project** 버튼을 클릭하여 배포를 시작합니다.

![image.png](/Docs/images/image%204.png)

---

### 2️⃣ 프로젝트 이름 및 폴더 설정 (Set Project Name and Folder)

프로젝트 이름과 프로젝트가 생성될 경로를 설정합니다.

![image.png](/Docs/images/image%205.png)

![local_3.png](/Docs/images/local_3.png)

---

### 3️⃣ 생성된 폴더 확인 (Verify Generated Folder)

설정한 경로에 생성된 폴더를 확인합니다.  
해당 경로에 `.arfni` 폴더와 `stack.yaml` 파일이 자동으로 생성되며, 이는 배포 및 캔버스 기록에 사용됩니다.

![image.png](/Docs/images/image%206.png)

---

### 4️⃣ 배포용 Apps 폴더 생성 (Create Apps for Deploy)

`apps` 폴더를 생성하고, 배포할 애플리케이션 파일들을 그 안에 배치합니다.  
각 하위 폴더 이름은 캔버스에서 사용한 블록 이름과 동일해야 합니다.

![image.png](/Docs/images/image%207.png)

![local_3.png](/Docs/images/local_3%201.png)

---

### 5️⃣ 드래그 앤 드롭 (Drag & Drop)

캔버스 화면으로 돌아가 배포하려는 요소를 블록으로 드래그 앤 드롭하여 캔버스에 배치합니다.

![image.png](/Docs/images/image%208.png)

---

### 6️⃣ 속성 변경 (Change Properties)

각 블록을 클릭하여 속성을 설정합니다.  
아키텍처에 맞게 포트, 환경 설정, 환경 변수 등을 구성합니다.

![image.png](/Docs/images/image%209.png)

![local_6.png](/Docs/images/local_6.png)

---

### 7️⃣ Stack.yaml 확인 (Check Stack.yaml)

하단 슬라이드 패널에서 자동으로 업데이트되는 `stack.yaml` 파일을 확인할 수 있습니다.  
변경 사항이 2초 동안 없으면 파일이 자동으로 저장됩니다.

블록 배치 및 환경 설정을 완료한 뒤, 배포를 준비하기 위해 `stack.yaml` 내용을 다시 한번 확인해 주세요.

![image.png](/Docs/images/image%2010.png)

---

### 8️⃣ 배포 실행 (Deploy)

오른쪽 상단의 **Deploy** 버튼을 클릭하여 배포를 시작합니다.

![local_8_1.png](/Docs/images/local_8_1.png)

![image.png](/Docs/images/image%2011.png)

---

### 9️⃣ 배포 과정 (Deployment Process)

#### 배포 단계 (Deployment Stages)

**Deploy** 버튼을 클릭하면, 배포는 다음 5단계로 자동 진행됩니다.

1. **Preflight** – 배포 전 사전 점검  
2. **Generate** – 설정 파일 생성  
3. **Build** – 컨테이너 이미지 빌드  
4. **Deploy** – 컨테이너 배포  
5. **Health** – 헬스 체크 검증  

> 💡 Tip: 배포 중 언제든지 **Stop Deployment** 버튼을 클릭하여 배포를 중지할 수 있습니다.

![image.png](/Docs/images/image%2012.png)

#### 자동 파일 생성 (Automatic File Generation)

필요한 `Dockerfile` 또는 `docker-compose.yml` 파일이 없는 경우, Arfni가 자동으로 생성합니다.  
다만, 배포 안정성을 위해 가능한 경우 직접 파일을 미리 구성하는 것을 권장합니다.

#### 배포 최적화 (Deployment Optimization)

시스템은 기존 이미지와 배포 상태를 재활용하여, 변경 사항이나 새로운 요구 사항이 있을 때만 재빌드 및 재배포를 수행합니다.

![local_9_2.png](/Docs/images/local_9_2.png)

#### 배포 완료 (Deployment Completion)

배포가 완료되면 팝업 창에 다음 정보가 표시됩니다.

- 어떤 서비스가 배포되었는지  
- 어떤 엔드포인트들이 생성되었는지  

![local_9_3.png](/Docs/images/local_9_3.png)

---

## 참고 사항 (Notes)

- Arfni는 Docker 기반으로 배포를 수행하므로, 로컬 환경에 반드시 Docker Desktop이 설치되어 있어야 합니다.  
- Docker Desktop이 설치되어 있다면 시스템이 자동으로 실행을 시도합니다.  
- 자동 실행에 실패할 경우 Docker Desktop을 수동으로 실행하면, 실행 후 배포가 자동으로 진행됩니다.

![image.png](/Docs/images/image%2013.png)

---

## (2) 원격 배포 (Remote Deployment)

## 사전 준비사항 (Prerequisites)

원격 배포를 시작하기 전에 다음 사항을 준비해야 합니다.

- 원격 서버에 대한 SSH 접근 권한  
- 서버 인증용 PEM 키 파일  
- Hybrid 모니터링 모드 사용 시: 로컬 PC에 Docker Desktop 설치  

---

### 1️⃣ 서버 설정 (Server Configuration)

**Remote Projects** 화면에서 **Select Server**를 클릭해 원격 배포 대상 서버를 선택합니다.

![image.png](/Docs/images/image%2014.png)

---

### 1) 새 서버 추가 (Adding a New Server)

등록된 서버가 없다면 먼저 서버를 추가해야 합니다.  
**Add New Server** 버튼을 클릭하여 대상 서버를 서버 목록에 추가합니다.

![image.png](/Docs/images/image%2015.png)

다음 항목을 설정합니다.

- **Server Name** – 서버를 구분하기 위한 이름  
- **Server Address** – IP 주소 또는 도메인 이름  
- **Username** – SSH 접속 계정  
- **PEM Key Path** – SSH 키 파일 경로  

![스크린샷 2025-11-12 133252.png](/Docs/images/%EC%8A%A4%ED%81%AC%EB%A6%B0%EC%83%B7_2025-11-12_133252.png)

설정 완료 후:

1. **Test SSH Connection** 버튼을 눌러 연결을 테스트합니다.  
2. **Add Server** 버튼을 눌러 서버 정보를 저장합니다.

![스크린샷 2025-11-12 133636.png](/Docs/images/%EC%8A%A4%ED%81%AC%EB%A6%B0%EC%83%B7_2025-11-12_133636.png)

**서버 관리 (Managing Servers):**

저장된 서버를 클릭하면 해당 서버에 대한 프로젝트를 관리할 수 있으며,  
이후 **Create New Project**를 통해 새 프로젝트를 생성할 수 있습니다.

![스크린샷 2025-11-12 130505.png](/Docs/images/%EC%8A%A4%ED%81%AC%EB%A6%B0%EC%83%B7_2025-11-12_130505.png)

---

### 2️⃣ 원격 새 프로젝트 생성 (Create New Project)

**Create New Project** 버튼을 클릭한 뒤,  
원격 서버에서 프로젝트가 생성될 경로와 프로젝트 이름을 설정합니다.

![remote_2_2_create.png](/Docs/images/remote_2_2_create.png)

![image.png](/Docs/images/image%2016.png)

---

### 3️⃣ 생성된 폴더 확인 (Verify Generated Folder)

원격 서버의 지정 경로에 `.arfni` 폴더와 `stack.yaml` 파일이 자동 생성됩니다.  
이는 배포 및 캔버스 기록을 위해 사용됩니다.

![remote_3.png](/Docs/images/remote_3.png)

---

### 4️⃣ 배포용 Apps 폴더 생성 (Create Apps for Deploy)

원격 서버 경로에 `apps` 폴더를 생성하고, 배포할 애플리케이션 파일을 그 안에 배치합니다.  
각 폴더 이름은 캔버스에서 사용하는 블록 이름과 동일해야 합니다.

![local_4.png](/Docs/images/local_4.png)

![remote_4_2.png](/Docs/images/remote_4_2.png)

---

예를 들어 **FastAPI**의 경우, `requirements.txt` 파일이 필요하다면 다음 내용이 필수입니다.  
이 파일은 **fastapi** 폴더 하위에 위치해야 합니다.

```text
fastapi==0.104.1
uvicorn[standard]==0.24.0
gunicorn
```

### 5️⃣ 드래그 앤 드롭 (Drag & Drop)

캔버스로 돌아가, 배포하려는 요소를 블록으로 드래그 앤 드롭하여 캔버스에 배치합니다.

![remote_5_1.png](/Docs/images/remote_5_1.png)

---

### 6️⃣ 속성 및 모니터링 설정 (Configure Properties)

### 1) 속성 변경 (Change Properties)

각 블록을 클릭하여 포트, 환경 설정, 환경 변수 등을 아키텍처에 맞게 설정합니다.

![remote_6_1.png](/Docs/images/remote_6_1.png)

![remote_6_2.png](/Docs/images/remote_6_2.png)

### 2) 모니터링 옵션 선택 (Select Monitoring Option)

원격 서버의 경우, 모니터링 옵션을 선택할 수 있습니다.
각 옵션에 대한 설명은 버튼을 눌러 자세히 확인할 수 있습니다.

![remote_6_2_1.png](/Docs/images/remote_6_2_1.png)

**Monitoring Options:**

- **All-in-One** - Prometheus, Grafana 등 모든 모니터링 도구를 단일 서버에서 실행, 구조가 단순하고 비용이 효율적
- **Hybrid** - 모니터링 도구를 여러 환경에 분산해 실행합니다.
    - Node Exporter 및 Prometheus는 원격 서버에서, Grafana는 로컬 환경에서 실행
    - Grafana 를 로컬에서 실행하여 메모리 사용량을 줄이는 데 유리
- **No Monitoring** - 모니터링 도구를 설치하지 않음. 개발 환경 또는 모니터링이 필요 없는 경우에 적합.

![remote_6_2_2.png](/Docs/images/remote_6_2_2.png)

---

### 7️⃣ Stack.yaml 확인

하단 슬라이드 패널에서 자동으로 업데이트되는 stack.yaml 파일을 확인합니다.
변경 사항이 2초 동안 없으면 자동으로 저장됩니다.

블록 배치 및 환경 설정을 완료한 후, 배포 준비를 위해 stack.yaml을 다시 확인해 주세요.

![remote_7.png](/Docs/images/remote_7.png)

---

### 8️⃣ 배포 실행

오른쪽 상단의 **Deploy** 버튼을 클릭하여 배포를 시작합니다.

![local_8_2.png](/Docs/images/local_8_2.png)

---

### 9️⃣ 배포 과정 (Deployment Process)

### 배포 단계

Deploy 버튼을 클릭하면, 배포는 다음 5단계로 자동 진행됩니다.

1. **Preflight** - 배포 전 사전 점검
2. **Generate** - 설정 파일 생성
3. **Build** - 컨테이너 이미지 빌드
4. **Deploy** - 컨테이너 배포
5. **Health** - 헬스 체크 검증

> Tip: 배포 도중 언제든지 Stop Deployment 버튼을 클릭하여 배포를 중단할 수 있습니다.
> 

![remote_9_1.png](/Docs/images/remote_9_1.png)

### 자동 파일 생성

필요한 `Dockerfile` 또는 `docker-compose.yml` 파일이 없을 경우, 자동으로 생성됩니다.
단, 안정적인 배포를 위해 가능한 경우 직접 미리 구성해 두는 것을 추천합니다.



### 배포 최적화

시스템은 기존 이미지 및 배포 상태를 최대한 재활용합니다.
변경 사항이나 새로운 요구 사항이 있을 때만 재빌드 및 재배포를 수행합니다.

### 배포 완료

배포가 완료되면 팝업 창에 다음 정보가 표시됩니다:

- 어떤 서비스가 배포되었는지
- 어떤 엔드포인트들이 생성되었는지

> Note: Arfni는 Docker를 사용해 배포를 수행합니다.
> 

![remote_9_2_1.png](/Docs/images/remote_9_2_1.png)

---
### 🔟 프로젝트 상태 (Project Status)

배포가 완료된 후 **Check Server Status** 버튼을 클릭하거나,  
메인 화면으로 돌아가 배포된 캔버스에서 **Project Status** 버튼을 클릭하면  
서버 상태 대시보드를 확인할 수 있습니다.

![remote_10.png](/Docs/images/remote_10.png)

![remote_10.png](/Docs/images/remote_10%201.png)

### 터미널 (Terminal)

**Connect** 버튼을 클릭하면 SSH 연결이 생성됩니다.  
이 창에서 GUI 기반으로 명령을 실행하고 여러 작업을 편리하게 수행할 수 있습니다.

![스크린샷 2025-11-12 131812.png](/Docs/images/%EC%8A%A4%ED%81%AC%EB%A6%B0%EC%83%B7_2025-11-12_131812.png)

![화면 캡처 2025-11-12 132022.png](/Docs/images/%ED%99%94%EB%A9%B4_%EC%BA%A1%EC%B2%98_2025-11-12_132022.png)

### 컨테이너 (Container)

원격 서버에서 실행 중인 모든 컨테이너 목록을 한눈에 볼 수 있습니다.  
제어 버튼을 사용해 컨테이너를 **시작(Start)**, **중지(Stop)**, **삭제(Delete)** 할 수 있습니다.

![image.png](/Docs/images/image%2017.png)

### 모니터 (Monitor)

**Open Dashboard** 버튼을 클릭하여 모니터링 대시보드에 접근할 수 있습니다.  
(이 기능은 **All-in-One** 및 **Hybrid** 모드에서만 사용 가능합니다.)

**Hybrid 모드 요구사항 (Hybrid Mode Requirements):**

- 로컬 PC에 Grafana 실행용으로 **Docker Desktop**이 설치되어 있어야 합니다.  
- Docker Desktop이 이미 설치되어 있다면, 시스템이 자동으로 실행을 시도합니다.  
- 자동 실행이 실패할 경우, Docker Desktop을 직접 실행하면 이후 과정은 자동으로 이어집니다.

![image.png](/Docs/images/image%2018.png)

![remote_10_6.png](/Docs/images/remote_10_6.png)

**대시보드 특징 (Dashboard Features):**

- 기본적으로 설정이 완료된 상태의 대시보드가 제공됩니다.  
- 웹 뷰에서 자동으로 열립니다.  
- 별도의 복잡한 설정 없이 바로 모니터링을 시작할 수 있습니다.

![remote_10_7.png](/Docs/images/remote_10_7.png)

![remote_10_8.png](/Docs/images/remote_10_8.png)

---

## (3) Arfni AI 기능 가이드 (Arfni AI Features Guide)

### 사전 준비사항 (Prerequisites)

AI 기능을 사용하기 전에, **Settings**에서 API Key를 먼저 설정해야 합니다.

---

## API Key 설정 (API Key Configuration)

### 1️⃣ 설정 화면 진입 (Access Settings)

상단 메뉴에서 **Settings → API Keys** 로 이동하여 API 키를 관리합니다.

![image.png](/Docs/images/image%2019.png)

---

![image.png](/Docs/images/image%2020.png)

### 2️⃣ API Key 추가 (Add API Key)

**Add API Key** 버튼을 클릭하면 API 키 입력 창이 열립니다.

**필수 입력 정보:**

- **Provider** – 사용할 API 제공자 선택  
- **Key Name** – 식별용 이름  
- **API Key** – 실제 API 키 값  

![image.png](/Docs/images/image%2021.png)

**지원되는 Provider:**

- OpenAI API  
- GMS Key (카테고리: “etc” 내부)

> Note: 현재는 **OpenAI API**와 **GMS Key**만 실제 기능이 동작합니다.

![image.png](/Docs/images/image%2022.png)

### 3️⃣ 활성 키 선택 (Select Active Key)

![image.png](/Docs/images/image%2023.png)

여러 개의 API 키가 저장된 경우:

1. 목록에서 사용할 키를 선택합니다.  
2. **Apply** 버튼을 클릭하여 활성화합니다.  
3. 활성화된 키는 **Active** 상태로 표시됩니다.

![image.png](/Docs/images/image%2024.png)

---

## Estimate 기능 (Estimate)

### 개요 (Overview)

**Estimate** 기능은 캔버스에 배치된 블록 구성(모니터링 시스템 및 Docker 요구사항 포함)을 기반으로  
필요한 서버 자원을 분석하고, 추천 사양을 제안하는 기능입니다.

---

### 1️⃣ 캔버스 준비 (Prepare Your Canvas)

모니터링 시스템과 Docker 구성을 포함하여, 원하는 아키텍처대로 블록을 캔버스에 배치합니다.  
준비가 완료되면 **AI 버튼**을 클릭하여 Estimate 기능을 사용할 수 있습니다.

![image.png](/Docs/images/image%2025.png)

![image.png](/Docs/images/image%2026.png)

---

### 2️⃣ 추천 티어 이해하기 (Understand Recommendation Tiers)

배포된 블록과 `stack.yaml` 설정을 기반으로,  
사전에 저장된 벤치마크 데이터를 활용해 다음 3가지 티어 구성안을 제공합니다:

- **Budget** – 비용 최소화를 목표로 하는 최소 구성  
- **Recommended** – 성능과 비용의 균형이 잡힌 권장 구성  
- **Performance** – 고성능에 최적화된 구성  

> 가격 기준: 2025년 1월 15일 기준 **AWS 서울 리전** EC2 요금을 바탕으로 계산됩니다.

![image.png](/Docs/images/image%2027.png)

---

### 3️⃣ 프로젝트 분석 (Analyze Project)

**Analyze Project & Recommend Server** 버튼을 클릭하여  
AI에게 프로젝트 분석 및 서버 추천을 요청합니다.

![image.png](/Docs/images/image%2028.png)

---

### 4️⃣ 추천 결과 확인 (Review Recommendations)

시스템은 배포된 서비스 구성 정보를 분석하여,  
3가지 티어별 AWS 인프라 비용과 구성을 추천합니다.

**추천 프로세스 (Recommendation Process):**

1. **Step 1** – 서비스 메모리 요구량 계산  
2. **Step 2** – AI 기반 인스턴스 타입 추천  
3. **Step 3** – 실제 비용 계산  

![image.png](/Docs/images/image%2029.png)

![image.png](/Docs/images/image%2030.png)

**추가 기능 (Additional Features):**

- 아키텍처별 배포 **Tips** 제공  
- 현재 구성에 최적화된 개선 제안 제공  

> ⚠️ Important Disclaimer  
> 이 기능은 **예상치(Estimate)**를 제공할 뿐이며,  
> 실제 배포 비용은 다양한 변수에 따라 달라질 수 있습니다.  
> 따라서 이 추천은 참고용이며, Arfni는 과도한 비용 발생에 대해 책임을 지지 않습니다.

---

## Optimize 기능 (Optimize)

### 개요 (Overview)

**Optimize** 기능은 실제로 배포된 원격 서버에서 수집한 메트릭 데이터를 기반으로,  
AI가 서버 자원 및 비용 최적화를 위한 개선 방안을 제안하는 기능입니다.

---

### 1️⃣ 프로젝트 상태 진입 (Access Project Status)

배포가 완료된 후, **Project Status** 또는 **Check Server Status** 버튼을 클릭하여  
프로젝트 상태 대시보드로 이동합니다.

![image.png](/Docs/images/image%2031.png)

---

### 2️⃣ 최적화 분석 시작 (Start Optimization Analysis)

1. **Optimize** 버튼을 클릭하여 AI 분석 화면을 엽니다.

![image.png](/Docs/images/image%2032.png)

![image.png](/Docs/images/image%2033.png)

2. **Start Analysis** 버튼을 클릭하여 AI 분석을 시작합니다.

**Requirement:**  
이 기능은 **All-in-One** 또는 **Hybrid** 모니터링 모드로 배포된 서버에서만 사용할 수 있습니다.  
(서버 메트릭 데이터가 AI로 전송되어야 하기 때문입니다.)

![image.png](/Docs/images/image%2034.png)

---

### 3️⃣ 분석 결과 확인 (Review Analysis Results)

#### 1) 수집된 메트릭 (Collected Metrics)

분석이 완료되면, 실제 서버 메트릭 정보를 기반으로 한 결과가 표시됩니다.

![image.png](/Docs/images/image%2035.png)

**수집되는 메트릭:**

- **CPU Usage** – 현재 CPU 사용률(%)  
- **Memory** – 사용 중인 메모리(MB) 및 사용률(%)  
- **Disk** – 사용 중인 디스크 용량(GB) 및 사용률(%)  
- **Instance Type** – 현재 EC2 인스턴스 타입  

![image.png](/Docs/images/image%2036.png)

이를 통해:

- 서버 성능 상태를 직관적으로 확인할 수 있고  
- 해당 데이터를 AI에 전달해 비용/성능 분석을 수행하며  
- 자원 최적화 및 비용 절감을 위한 구체적인 제안을 받을 수 있습니다.

#### 2) 생성된 리포트 (Generated Report)

전달된 메트릭 정보를 기반으로, AI가 종합 리포트를 생성하여 제공합니다.

> ⚠️ Important Disclaimer  
> 이 결과는 다양한 변수로 인해 실제 환경과 차이가 발생할 수 있는 **참고용 분석 결과**입니다.  
> 따라서 이를 절대적인 정답으로 보기는 어렵고,  
> Arfni는 실제 비용 증가나 손해에 대해 책임을 지지 않습니다.

![image.png](/Docs/images/image%2037.png)

---

# **4. 오류 및 개선 사항 제보 (How to Report Issues)**

버그를 발견했거나 기능 개선 의견이 있다면, 아래 이메일로 연락해 주세요.

📩 **arfni201@googlegroups.com**
