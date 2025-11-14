# 배포 리드미 작성

# 버전 릴리스

1.0.0 V

# **1. Installation**

### **1️⃣ Run the Installer**

Double-click the **Arfni 1.0.0 Setup** icon to begin installation.

![화면 캡처 2025-11-11 172645.png](/images/%ED%99%94%EB%A9%B4_%EC%BA%A1%EC%B2%98_2025-11-11_172645.png)

---

### **2️⃣ Welcome Screen**

When the setup wizard opens, click **Next** to continue.

It is recommended to close all other applications before starting installation.

![image.png](/images/image.png)

---

### **3️⃣ License Agreement**

Read through the license agreement carefully.

If you agree to the terms, select **I Agree** to proceed.

![image.png](/images/image%201.png)

---

### **4️⃣ Choose Installation Location**

Select the folder where you want to install Arfni.

You can use the default path or click **Browse** to choose another location.

Click **Install** to start the installation.

![image.png](/images/image%202.png)

---

### **5️⃣ Completing Installation**

Once the installation is complete, you’ll see the confirmation screen:

**“Arfni 1.0.0 has been installed on your computer.”**

Click **Finish** to close the setup wizard.

![image.png](/images/image%203.png)

# 2. Features

## (1) Local Deployment

## Prerequisites

Before starting deployment, ensure Docker Desktop is installed on your local machine. Arfni will automatically launch Docker Desktop if it's installed. If automatic launch fails, please start Docker Desktop manually.

### 1️⃣ Create New Project

In the local environment, click **Create New Project** to start the deployment process.

![image.png](/images/image%204.png)

---

### 2️⃣ Set Project Name and Folder

Configure the project name and the path where the project will be created.

![image.png](/images/image%205.png)

![local_3.png](/images/local_3.png)

---

### 3️⃣ Verify Generated Folder

Check the folder at the specified path. The `.arfni` folder and `stack.yaml` file will be automatically generated for deployment and canvas recording.

---

![image.png](/images/image%206.png)

---

### 4️⃣ Create Apps for Deploy

Create an `apps` folder and place your deployment files inside it. Each folder name should match the blocks used in the canvas.

![image.png](/images/image%207.png)

![local_3.png](/images/local_3%201.png)

---

### 5️⃣ Drag & Drop

Return to the canvas screen and drag & drop blocks according to the elements you want to deploy, placing them on the canvas.

![image.png](/images/image%208.png)

---

### 6️⃣ Change Properties

Click on each block to configure its properties. Set ports, environment configurations, and environment variables according to your architecture.

![image.png](/images/image%209.png)

![local_6.png](/images/local_6.png)

---

### 7️⃣ Check Stack.yaml

You can view the automatically updated `stack.yaml` file in the slide panel at the bottom. The file automatically saves when there are no changes for 2 seconds. After placing blocks and completing environment configuration, verify the `stack.yaml` file to prepare for deployment.

![image.png](/images/image%2010.png)

---

### 8️⃣ Deploy

Click the **Deploy** button in the upper right corner to start deployment.

![local_8_1.png](/images/local_8_1.png)

![image.png](/images/image%2011.png)

---

### 9️⃣ Deployment Process

### Deployment Stages

When you click the Deploy button, automatic deployment begins through 5 stages:

1. **Preflight** - Pre-deployment checks
2. **Generate** - Generate configuration files
3. **Build** - Build container images
4. **Deploy** - Deploy containers
5. **Health** - Health check verification

> Tip: You can stop the deployment at any time by clicking the Stop Deployment button.
> 

![image.png](/images/image%2012.png)

### Automatic File Generation

If required like `Dockerfile` or `docker-compose.yml` files are missing, they will be automatically generated. However, for deployment stability, it's recommended to configure these files in advance when possible.

### Deployment Optimization

The system will utilize existing images and deployments when available. If there are changes or new requirements, it will rebuild and install accordingly.

![local_9_2.png](/images/local_9_2.png)

### Deployment Completion

Once deployment is complete, a popup window will display:

- Which services were deployed
- What endpoints are available

![local_9_3.png](/images/local_9_3.png)

## Notes

- Arfni uses Docker for deployment, so Docker Desktop must be installed in your local environment
- If Docker Desktop is already installed, the system will automatically launch it
- If automatic launch fails, please start Docker Desktop manually - deployment will proceed automatically once it's running

![image.png](/images/image%2013.png)

## (2) Remote Deployment

## Prerequisites

Before starting remote deployment, ensure:

- SSH access to your remote server
- PEM key file for server authentication
- For Hybrid monitoring mode: Docker Desktop installed on your local machine

---

### 1️⃣ Server Configuration

In **Remote Projects**, click Select Server to choose your target server for remote deployment.

![image.png](/images/image%2014.png)

### 1) Adding a New Server

If you don't have a server registered, you'll need to add one. Click **Add New Server** to add a target server to your server list

. 

![image.png](/images/image%2015.png)

Configure the following settings:

- **Server Name** - A friendly name for your server
- **Server Address** - IP address or domain name
- **Username** - SSH username
- **PEM Key Path** - Path to your SSH key file

![스크린샷 2025-11-12 133252.png](/images/%EC%8A%A4%ED%81%AC%EB%A6%B0%EC%83%B7_2025-11-12_133252.png)

After completing the configuration:

1. Click **Test SSH Connection** to verify the connection
2. Click **Add Server** to save the server information

![스크린샷 2025-11-12 133636.png](/images/%EC%8A%A4%ED%81%AC%EB%A6%B0%EC%83%B7_2025-11-12_133636.png)

**Managing Servers:**

Click on a saved server to manage projects on that server, then proceed with **Create New Project**.

![스크린샷 2025-11-12 130505.png](/images/%EC%8A%A4%ED%81%AC%EB%A6%B0%EC%83%B7_2025-11-12_130505.png)

---

### 2️⃣ Create New Project

Click **Create New Project** and configure the project name and the path where the project will be created on the remote server.

![remote_2_2_create.png](/images/remote_2_2_create.png)

![image.png](/images/image%2016.png)

---

### 3️⃣ Verify Generated Folder

Check the folder at the specified path. The `.arfni` folder and `stack.yaml` file will be automatically generated for deployment and canvas recording.

![remote_3.png](/images/remote_3.png)

---

### 4️⃣ Create Apps for Deploy

Create an `apps` folder and place your deployment files inside it. Each folder name should match the blocks used in the canvas.

![local_4.png](/images/local_4.png)

![remote_4_2.png](/images/remote_4_2.png)

---

For example, in the case of **FastAPI**, if a `requirements.txt` file is required, the following values are essential.

This file should be placed under the **fastapi** folder.

```java
fastapi==0.104.1
uvicorn[standard]==0.24.0
gunicorn
```

### 5️⃣ Drag & Drop

Return to the canvas screen and drag & drop blocks according to the elements you want to deploy, placing them on the canvas.

![remote_5_1.png](/images/remote_5_1.png)

---

### 6️⃣ Configure Properties

### 1) Change Properties

Click on each block to configure its properties. Set ports, environment configurations, and environment variables according to your architecture.

![remote_6_1.png](/images/remote_6_1.png)

![remote_6_2.png](/images/remote_6_2.png)

### 2) Select Monitoring Option

For remote servers, you can choose a monitoring option. Click the **?** button for detailed information about each option.

![remote_6_2_1.png](/images/remote_6_2_1.png)

**Monitoring Options:**

- **All-in-One** - All monitoring tools (Prometheus, Grafana, etc.) run on a single server. Simple and cost-effective.
- **Hybrid** - Monitoring tools are distributed across multiple servers. Balances performance and cost.
    - Node Exporter and Prometheus run on the remote server
    - Grafana runs locally to reduce memory load on the remote server
- **No Monitoring** - No monitoring tools deployed. Suitable for development or when monitoring isn't needed.

![remote_6_2_2.png](/images/remote_6_2_2.png)

---

### 7️⃣ Check Stack.yaml

You can view the automatically updated `stack.yaml` file in the slide panel at the bottom. The file automatically saves when there are no changes for 2 seconds. After placing blocks and completing environment configuration, verify the `stack.yaml` file to prepare for deployment.

![remote_7.png](/images/remote_7.png)

---

### 8️⃣ Deploy

Click the **Deploy** button in the upper right corner to start deployment.

![local_8_2.png](/images/local_8_2.png)

---

### 9️⃣ Deployment Process

### Deployment Stages

When you click the Deploy button, automatic deployment begins through 5 stages:

1. **Preflight** - Pre-deployment checks
2. **Generate** - Generate configuration files
3. **Build** - Build container images
4. **Deploy** - Deploy containers
5. **Health** - Health check verification

> Tip: You can stop the deployment at any time by clicking the Stop Deployment button.
> 

![remote_9_1.png](/images/remote_9_1.png)

### Automatic File Generation

If required `Dockerfile` or `docker-compose.yml` files are missing, they will be automatically generated. However, for deployment stability, it's recommended to configure these files in advance when possible.

### Deployment Optimization

The system will utilize existing images and deployments when available. If there are changes or new requirements, it will rebuild and install accordingly.

### Deployment Completion

Once deployment is complete, a popup window will display:

- Which services were deployed
- What endpoints are available

> Note: Arfni uses Docker for deployment.
> 

![remote_9_2_1.png](/images/remote_9_2_1.png)

---

### 🔟 Project Status

After deployment, click **Check Server Status** or return to the main screen and click **Project Status** on the deployed canvas to view the server status dashboard

![remote_10.png](/images/remote_10.png)

![remote_10.png](/images/remote_10%201.png)

### Terminal

Click the **Connect** button to establish an SSH connection. You can conveniently execute commands and perform tasks through the GUI interface.

![스크린샷 2025-11-12 131812.png](/images/%EC%8A%A4%ED%81%AC%EB%A6%B0%EC%83%B7_2025-11-12_131812.png)

![화면 캡처 2025-11-12 132022.png](/images/%ED%99%94%EB%A9%B4_%EC%BA%A1%EC%B2%98_2025-11-12_132022.png)

### Container

View all containers currently running on the remote server. Use the control buttons to start, stop, or delete containers conveniently.

![image.png](/images/image%2017.png)

### Monitor

Click **Open Dashboard** to access monitoring (available for All-in-One and Hybrid deployment modes).

**Hybrid Mode Requirements:**

- Docker Desktop must be installed on your local machine to run Grafana
- If Docker Desktop is already installed, the system will automatically launch it
- If automatic launch fails, please start Docker Desktop manually - the process will continue automatically

![image.png](/images/image%2018.png)

![remote_10_6.png](/images/remote_10_6.png)

**Dashboard Features:**

- Pre-configured default settings are provided
- Opens automatically in web view
- No complex configuration needed - start monitoring immediately

![remote_10_7.png](/images/remote_10_7.png)

![remote_10_8.png](/images/remote_10_8.png)

## (3) **Arfni AI Features Guide**

### Prerequisites

Before using AI features, you must configure an API key in Settings.

## API Key Configuration

### 1️⃣ Access Settings

Navigate to **Settings** → **API Keys** to manage your API keys.

![image.png](/images/image%2019.png)

---

![image.png](/images/image%2020.png)

### 2️⃣ Add API Key

Click **Add API Key** to open the input dialog.

**Required Information:**

- **Provider** - Select your API provider
- **Key Name** - A friendly name for identification
- **API Key** - Your actual API key

![image.png](/images/image%2021.png)

**Supported Providers:**

- OpenAI API
- GMS Key (under "etc" category)

> Note: Currently, only OpenAI API and GMS Key are functional.
> 

![image.png](/images/image%2022.png)

### 3️⃣ Select Active Key

![image.png](/images/image%2023.png)

If you have multiple API keys saved:

1. Select the desired key from the list
2. Click the **Apply** button to activate it
3. The active key will be marked with **Active** status

![image.png](/images/image%2024.png)

---

## Estimate

### Overview

The **Estimate** feature provides server resource recommendations based on the blocks placed on your canvas, including monitoring systems and Docker requirements.

### 1️⃣ Prepare Your Canvas

Arrange blocks on the canvas with your desired architecture, including monitoring systems and Docker configurations. To use, Click Ai button.

![image.png](/images/image%2025.png)

![image.png](/images/image%2026.png)

### 2️⃣ Understand Recommendation Tiers

Based on your deployed blocks and `stack.yaml` configuration, the system uses pre-stored benchmark data to provide 3-tier options:

- **Budget** - Cost-optimized minimal configuration
- **Recommended** - Balanced performance and cost
- **Performance** - High-performance optimized configuration

> Pricing Reference: Calculations are based on AWS EC2 pricing in the Seoul region as of January 15, 2025.
> 

![image.png](/images/image%2027.png)

### 3️⃣ Analyze Project

Click **Analyze Project & Recommend Server** to send a request to the AI.

![image.png](/images/image%2028.png)

### 4️⃣ Review Recommendations

The system analyzes your deployed services and recommends AWS infrastructure costs across 3 tiers.

**Recommendation Process:**

1. **Step 1** - Calculate service memory requirements
2. **Step 2** - AI-based instance recommendations
3. **Step 3** - Actual cost calculatio

![image.png](/images/image%2029.png)

![image.png](/images/image%2030.png)

**Additional Features:**

- View deployment **Tips** for each architecture
- Get optimization suggestions for your specific setup

> ⚠️ Important Disclaimer: These are estimates only. Actual deployment costs may vary due to numerous variables. These recommendations are advisory, not guaranteed. Arfni does not assume responsibility for excessive cost occurrences.
> 

---

## Optimize

### Overview

The **Optimize** feature provides AI-driven recommendations based on actual data from your deployed remote server.

### 1️⃣ Access Project Status

Click **Project Status** or **Check Server Status** after deployment to navigate to the Project Status dashboard.

![image.png](/images/image%2031.png)

### 2️⃣ Start Optimization Analysis

1. Click the **Optimize** button to open the AI analysis interface

![image.png](/images/image%2032.png)

![image.png](/images/image%2033.png)

2. Click **Start Analysis** to invoke the AI

**Requirement:** This feature is only available for servers deployed with **All-in-One** or **Hybrid** monitoring modes, as server metrics data must be transmitted to the AI.

![image.png](/images/image%2034.png)

### 3️⃣ Review Analysis Results

### 1) Collected Metrics

After loading, you'll receive a response based on real metric information:

![image.png](/images/image%2035.png)

**Collected Metrics:**

- **CPU Usage** - Current CPU utilization (%)
- **Memory** - Used memory (MB) and utilization (%)
- **Disk** - Used disk space (GB) and utilization (%)
- **Instance Type** - Current EC2 instance type

![image.png](/images/image%2036.png)

These metrics allow you to:

- Easily review your server's performance data
- Transmit data to AI for cost analysis
- Receive optimization recommendations

### 2) Generated Report

Based on the transmitted information, a comprehensive report will be generated for your review.

> ⚠️ Important Disclaimer: These are estimates only. Actual deployment conditions involve many variables that may cause inaccuracies. These recommendations are advisory, not definitive answers. Arfni does not assume responsibility for excessive cost occurrences.
> 

![image.png](/images/image%2037.png)

---

# **4. How to Report Issues**

If you find a bug or want to suggest an improvement, please contact us by email at **arfni201@googlegroups.com**.