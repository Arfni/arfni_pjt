# Arfni Cost Optimization System - Technical Documentation

## Overview

This document describes the cost estimation and optimization system implemented for AWS EC2 deployments. The system provides benchmark-based cost estimation before deployment and real-time optimization recommendations after deployment using Prometheus metrics.

## System Architecture

```
Canvas/Stack.yaml → Cost Estimation (estimate) → Deployment (deploy)
                                                        ↓
                                                  Monitoring (monitor)
                                                        ↓
                                                  Optimization Analysis (optimize)
```

## 전체 파이프라인 설명

1. **사전 비용 예측 (estimate)**: stack.yaml의 서비스 구성과 벤치마크 데이터를 분석하여 배포 전 예상 비용을 계산합니다.
2. **EC2 배포 (deploy)**: 분석된 구성을 기반으로 서비스를 EC2 인스턴스에 배포합니다.
3. **모니터링 시작 (monitor)**: SSH 터널을 통해 Prometheus/Grafana 연결을 구성하고 실시간 리소스 사용량을 수집합니다.
4. **사후 최적화 분석 (optimize)**: Prometheus에 수집된 실제 사용량 데이터를 분석하여 비용 절감 방안을 제시합니다.

각 단계는 독립적으로 실행 가능하며, estimate는 배포 전 언제든지 실행할 수 있고, optimize는 모니터링이 실행 중일 때만 사용 가능합니다.

## 1. Cost Estimation System (Pre-Deployment)

### 1.1 Purpose
Provides resource recommendations and cost estimates based on service composition before actual deployment.

### 1.2 Input
- Service configuration from stack.yaml
- Expected user count
- Expected traffic level (low/medium/high)
- Verified benchmark data

### 1.3 Implementation Files

**Core Logic:**
- `BE/arfni/internal/pricing/estimator.go` (Lines 1-400+)
  - `EstimateCost()`: Main estimation function
  - `calculateTierCost()`: Calculates cost for each tier
  - Memory validation for simple deployment mode

**Data Sources:**
- `BE/arfni/internal/pricing/data/benchmarks.json`
  - Verified memory requirements
  - Estimated concurrent user capacity ranges
  - Performance characteristics per framework/database

- `BE/arfni/internal/pricing/data/aws_pricing_ap-northeast-2.json`
  - AWS EC2 instance pricing
  - RDS instance pricing
  - Storage and data transfer costs

**AI Integration:**
- `BE/arfni/internal/pricing/openai.go`
  - `GetResourceRecommendation()`: Sends benchmarks to OpenAI
  - Supports GMS (SSAFY proxy) and direct OpenAI API
  - Environment variables: `GMS_KEY` or `OPENAI_API_KEY`

### 1.4 Output
Three pricing tiers with detailed breakdown:
- Budget Tier: Minimum viable configuration
- Recommended Tier: Balanced performance/cost
- Performance Tier: High performance configuration

Each tier includes:
- EC2 instance specifications and cost
- RDS instance specifications and cost (if applicable)
- ElastiCache specifications and cost (if applicable)
- Storage cost (EBS volumes)
- Load balancer cost
- Data transfer cost estimate

### 1.5 Command
```bash
cd BE/arfni
export GMS_KEY="your-key"
go run cmd/arfni-go/main.go estimate
```

### 1.6 Key Features
- Benchmark data validation: Rejects unreasonable values (e.g., 100 concurrent users on 512MB)
- Memory sufficiency check: Ensures total service memory fits in instance RAM
- OpenAI prompt includes verified benchmarks to reduce hallucination
- Clear distinction between VERIFIED data and ESTIMATED data

## 2. Monitoring System

### 2.1 Purpose
Establishes SSH tunnels to EC2 Prometheus/Node Exporter and provides Grafana visualization.

### 2.2 Implementation Files

**Main Launcher:**
- `BE/arfni/cmd/arfni-monitoring/main.go` (Lines 1-700+)
  - Stack.yaml parsing with metadata support
  - Three monitoring modes: local, hybrid, all-in-one
  - Automatic SSH tunnel creation
  - Docker Compose orchestration

**Docker Configuration:**
- `monitoring/docker-compose.yml`
  - Grafana container configuration
  - Prometheus container configuration (for local/hybrid modes)

### 2.3 Monitoring Modes

**Local Mode:**
- EC2: Node Exporter only
- Local: Prometheus + Grafana
- SSH Tunnel: Port 9100 (Node Exporter)

**Hybrid Mode:**
- EC2: Node Exporter + Prometheus
- Local: Grafana
- SSH Tunnel: Ports 9100, 9090

**All-in-One Mode:**
- EC2: Node Exporter + Prometheus + Grafana
- Local: None
- SSH Tunnel: Ports 9090, 3000

### 2.4 Mode Detection

The system reads `metadata.monitoring.mode` from stack.yaml first (Lines 290-358 in arfni-monitoring/main.go). If not specified, it infers mode from service placement.

Fixed bug: Added `Metadata` field to `StackYAML` struct to properly read `metadata.monitoring.mode`.

### 2.5 Command
```bash
cd BE/arfni
./arfni-go.exe monitor -f "/path/to/stack.yaml"
```

### 2.6 Access URLs
- Grafana: http://localhost:3000
- Prometheus: http://localhost:9090 (if tunneled)

## 3. Optimization Analysis System (Post-Deployment)

### 3.1 Purpose
Analyzes actual resource usage from Prometheus and provides cost optimization recommendations.

### 3.2 Implementation Files

**Core Logic:**
- `BE/arfni/internal/pricing/optimizer.go` (Lines 1-486)
  - `Analyze()`: Main analysis function
  - `collectMetrics()`: Queries Prometheus
  - `analyzeCosts()`: Cost analysis
  - `analyzePerformance()`: Bottleneck detection
  - `generateRecommendations()`: Rule-based recommendations
  - `getAIRecommendations()`: AI-powered recommendations

**Prometheus Integration:**
- `BE/arfni/internal/pricing/prometheus.go` (Lines 1-228)
  - `Query()`: Executes PromQL queries
  - `GetCPUUsage()`: CPU utilization
  - `GetMemoryUsage()`: Memory usage
  - `GetNetworkTraffic()`: Network I/O
  - `GetDiskUsage()`: Disk utilization
  - `GetInstanceInfo()`: EC2 instance metadata

### 3.3 Data Collection

**Metrics Collected:**
- CPU usage percentage
- Memory used (MB) and percentage
- Disk used (GB) and percentage
- Network traffic (24h inbound/outbound in MB)
- Instance type (if available from node_exporter labels)

**PromQL Queries:**
```promql
# CPU Usage
100 - (avg by (instance) (rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)

# Memory Usage
node_memory_MemTotal_bytes / 1024 / 1024
node_memory_MemAvailable_bytes / 1024 / 1024

# Disk Usage
node_filesystem_size_bytes{mountpoint=~"/host|/"} / 1024 / 1024 / 1024
node_filesystem_avail_bytes{mountpoint=~"/host|/"} / 1024 / 1024 / 1024

# Network Traffic (24h)
sum(increase(node_network_transmit_bytes_total[24h])) / 1024 / 1024
sum(increase(node_network_receive_bytes_total[24h])) / 1024 / 1024
```

Note: Disk query uses regex `mountpoint=~"/host|/"` to handle containerized node_exporter.

### 3.4 Analysis Logic

**Rule-Based Analysis:**
- CPU bottleneck: >80% usage
- Memory bottleneck: >85% usage
- Disk bottleneck: >90% usage
- Health status: healthy/warning/critical

**Cost Analysis:**
- Calculates current monthly cost (if instance type known)
- Data transfer cost from actual network usage
- Potential savings from downsizing

**AI-Powered Analysis:**
- Sends actual metrics to OpenAI
- Receives specific, actionable recommendations
- Responds in JSON format with priority/category/impact/savings

### 3.5 Command
```bash
cd BE/arfni
export GMS_KEY="your-key"
go run cmd/arfni-go/main.go optimize
```

### 3.6 Output Format

Console output includes:
- Actual resource usage metrics
- Performance analysis (bottlenecks, health status)
- Recommendations sorted by priority (high/medium/low)
- Each recommendation includes category, description, impact, potential savings

JSON report includes:
- `actual_usage`: All collected metrics
- `cost_analysis`: Current cost and potential savings
- `performance_analysis`: Bottleneck detection results
- `recommendations`: Array of recommendation objects

### 3.7 Limitations

**When instance type is unknown:**
- Cannot calculate specific cost savings
- Cannot recommend specific instance alternatives
- Provides general guidance to check EC2 console

The system acknowledges this limitation honestly rather than providing unreliable recommendations.

## 4. Data Files

### 4.1 Benchmarks Database

**File:** `BE/arfni/internal/pricing/data/benchmarks.json`

**Structure:**
```json
{
  "frameworks": {
    "spring-boot": {
      "memory_requirements": {
        "min_memory_mb": 2048,
        "recommended_memory_mb": 4096,
        "data_source": "Spring Boot official documentation"
      },
      "performance_estimates": {
        "t3.medium": {
          "min_concurrent_users": 150,
          "max_concurrent_users": 400,
          "data_source": "Conservative estimate based on TechEmpower benchmarks"
        }
      }
    }
  },
  "databases": { /* similar structure */ },
  "caches": { /* similar structure */ }
}
```

**Data Quality:**
- VERIFIED: Memory requirements from official documentation
- ESTIMATED: Concurrent user capacity with conservative ranges
- All entries include data_source field

### 4.2 AWS Pricing Database

**File:** `BE/arfni/internal/pricing/data/aws_pricing_ap-northeast-2.json`

**Content:**
- EC2 instance types with vCPU, memory, pricing
- RDS instance types with specifications
- ElastiCache instance types
- Storage pricing (EBS gp3, io2)
- Data transfer pricing tiers
- Load balancer pricing

**Region:** ap-northeast-2 (Seoul)
**Currency:** USD
**Update frequency:** Manual (should be updated periodically)

## 5. OpenAI Integration

### 5.1 Configuration

**Environment Variables:**
- `GMS_KEY`: SSAFY GMS proxy API key (priority)
- `OPENAI_API_KEY`: Direct OpenAI API key (fallback)
- `OPENAI_PROVIDER`: Force provider (gms/openai/auto)

**Endpoints:**
- GMS: https://gms.ssafy.io/gmsapi/api.openai.com/v1/chat/completions
- OpenAI: https://api.openai.com/v1/chat/completions

### 5.2 Model Configuration

**Default Model:** gpt-4 (configurable in openai.go)
**Temperature:** 0.3 (for consistent, conservative recommendations)
**Timeout:** 30 seconds

### 5.3 Prompt Strategy

**For Cost Estimation:**
- Includes full benchmark data in prompt
- Specifies deployment type (simple/production)
- Requests 3 tiers with specific instance recommendations
- Emphasizes conservative, realistic estimates

**For Optimization:**
- Includes actual Prometheus metrics
- Current cost analysis
- Performance bottleneck information
- Requests 1-2 specific, actionable recommendations
- JSON response format enforced
- **Korean Language Response:** AI responses are configured to be in Korean language by default for better user experience in Korean environments

### 5.4 Language Configuration

**Default Language:** Korean (한국어)

The optimization analysis system is configured to return AI-powered recommendations in Korean language by default. This provides a better user experience for Korean-speaking users.

**Implementation Details:**
- **File:** `BE/arfni/internal/pricing/optimizer.go`
- **Function:** `getAIRecommendations()` (Lines 359-486)
- **Configuration:**
  - System prompt includes: "Respond in Korean language (한국어로 답변)"
  - User prompt includes: "IMPORTANT: Respond in Korean language (한국어로 답변해주세요)"
  - All recommendation fields (title, description, impact) are returned in Korean

**Example Output:**
```json
[
  {
    "priority": "high",
    "category": "cost",
    "title": "더 작은 인스턴스 타입으로 전환 고려",
    "description": "낮은 CPU 사용률 (1.2%)과 적당한 메모리 사용률 (36.2%)을 고려할 때...",
    "impact": "더 작은 인스턴스 타입을 사용하면 월별 비용을 절감할 수 있습니다.",
    "savings": 10.0
  }
]
```

**Note:** Cost estimation recommendations remain in English as they follow AWS terminology and are intended for technical audiences.

## 6. CLI Commands

### 6.1 Entry Point

**File:** `BE/arfni/cmd/arfni-go/main.go`

**Available Commands:**
```bash
# Cost estimation
go run cmd/arfni-go/main.go estimate

# Deployment
go run cmd/arfni-go/main.go deploy -f stack.yaml

# Monitoring
./arfni-go.exe monitor -f stack.yaml

# Optimization analysis
go run cmd/arfni-go/main.go optimize
```

### 6.2 Build

```bash
cd BE/arfni
go build -o arfni-go.exe cmd/arfni-go/main.go
```

## 7. Type Definitions

### 7.1 Core Types

**File:** `BE/arfni/internal/pricing/types.go`

Key structures:
- `AWSPricing`: Complete pricing database
- `CostEstimationRequest`: User input for estimation
- `ResourceRecommendation`: Three-tier recommendations
- `TierRecommendation`: Single tier specification
- `CostBreakdown`: Final cost calculation result
- `ActualUsageMetrics`: Prometheus metrics
- `OptimizationReport`: Analysis results

## 8. Known Issues and Fixes

### 8.1 Monitoring Mode Detection Bug

**Issue:** Stack.yaml had `metadata.monitoring.mode: hybrid` but system detected "local"

**Root Cause:** `StackYAML` struct missing `Metadata` field

**Fix Location:** `BE/arfni/cmd/arfni-monitoring/main.go` (Lines 43-48)
```go
type StackYAML struct {
    Targets  map[string]StackTarget
    Services map[string]StackService
    Metadata StackMetadata  // Added this field
}
```

### 8.2 Disk Usage Query Failure

**Issue:** Prometheus query failed because containerized node_exporter mounts root as /host

**Fix Location:** `BE/arfni/internal/pricing/prometheus.go` (Lines 182, 193)
```go
// Changed from mountpoint="/" to:
totalQuery := `node_filesystem_size_bytes{mountpoint=~"/host|/"} / 1024 / 1024 / 1024`
```

### 8.3 SSH Tunnel Disconnection

**Issue:** Grafana running but SSH tunnel disconnected, causing "An error occurred within the plugin"

**Root Cause:** Previous monitoring session terminated but Docker containers remained

**Solution:** Always run `docker compose down` in monitoring directory before starting new session

### 8.4 OpenAI Recommending Insufficient Memory

**Issue:** OpenAI recommended t3.small (2GB) for 4.2GB memory requirement

**Root Cause:** Memory requirement not explicitly passed to OpenAI in the prompt

**Fix Location:** `BE/arfni/internal/pricing/openai.go` (Lines 359-375)
```go
// Added critical memory requirement to prompt
memoryRequirement := fmt.Sprintf(`
CRITICAL REQUIREMENT:
Based on verified memory requirements for all services (including 30% OS/Docker overhead),
this configuration needs MINIMUM %d MB (%.1f GB) of RAM.

Budget tier MUST use an instance with AT LEAST %.1f GB RAM.
`, minRequiredMemoryMB, float64(minRequiredMemoryMB)/1024, float64(minRequiredMemoryMB)/1024)
```

**Validation Logic:** `BE/arfni/internal/pricing/estimator.go` (Lines 67-80)
- Code validates recommendations against calculated memory requirements
- Adds warning if OpenAI recommends insufficient instance
- Does not auto-correct to preserve OpenAI's actual recommendations for GUI display

## 9. Dependencies

### 9.1 External Services
- Prometheus (for metrics collection)
- Node Exporter (for system metrics)
- Grafana (for visualization)
- OpenAI/GMS API (for AI recommendations)

### 9.2 Go Dependencies
- Standard library (net/http, encoding/json, etc.)
- No external Go modules required for core functionality

## 10. Testing

### 10.1 Manual Test Scripts

**Files:**
- `BE/arfni/test-cost.bat`: Cost estimation test
- `BE/arfni/test-cost-low.bat`: Low traffic scenario
- `BE/arfni/test-simple.bat`: Simple deployment test
- `BE/arfni/test-estimate-test13.bat`: Cost estimation test for test13 stack
- `BE/arfni/test-optimize-test13.bat`: Optimization analysis test for test13 stack
- `BE/arfni/test-all-test13.bat`: Complete test suite (both estimate and optimize)

**Test13 Batch Files:**
- Target stack: `C:\Users\SSAFY\OneDrive\Desktop\test13\stack.yaml`
- Services: spring (backend), mysql (database), python (backend)
- Configuration: 100 users, medium traffic, simple deployment mode
- GMS_KEY required: Set in batch file or environment

### 10.2 Test Stack

**File:** `BE/arfni/test-stack.yaml`
- Contains test service configuration
- Used for validation during development

## 11. Limitations and Future Work

### 11.1 Current Limitations

1. **Instance Type Detection:**
   - Requires node_exporter to expose instance_type label
   - Falls back to "unknown" if not available
   - Cannot provide specific cost savings without instance type

2. **Regional Support:**
   - Currently only supports ap-northeast-2 (Seoul)
   - Pricing data hardcoded for this region

3. **OpenAI Dependency:**
   - Requires API key for full functionality
   - Falls back to rule-based recommendations only if key missing

4. **Data Transfer Estimation:**
   - Based on 24-hour window only
   - May not reflect long-term patterns

   **Explanation:** The system queries Prometheus for network traffic over the last 24 hours using `increase(node_network_transmit_bytes_total[24h])`. This provides a snapshot of recent activity but may not capture:
   - Weekly patterns (weekday vs weekend traffic)
   - Monthly patterns (beginning vs end of month)
   - Seasonal variations
   - Special events or peak periods

   **Example:** If you run `optimize` on a Sunday when traffic is low, it will only see Sunday's data and may underestimate typical weekday costs.

   **Recommendation:** For production environments, collect data over at least 7 days to capture weekly patterns, or 30 days for monthly patterns.

### 11.2 Security Considerations

1. **Not Implemented:**
   - Security vulnerability scanning
   - Container security analysis
   - Network security recommendations

2. **Reason:**
   - Liability concerns
   - Cannot guarantee accuracy of security assessments
   - Focus limited to cost and performance analysis

### 11.3 Maintenance Requirements

1. **AWS Pricing Updates:**
   - Manually update `aws_pricing_ap-northeast-2.json` periodically
   - Check AWS pricing page for changes

2. **Benchmark Updates:**
   - Review and update `benchmarks.json` as frameworks evolve
   - Validate estimates against real-world deployments

## 12. File Structure Summary

```
BE/arfni/
├── cmd/
│   ├── arfni-go/
│   │   └── main.go                    # CLI entry point
│   └── arfni-monitoring/
│       └── main.go                    # Monitoring launcher
├── internal/
│   └── pricing/
│       ├── estimator.go               # Cost estimation logic
│       ├── optimizer.go               # Optimization analysis
│       ├── prometheus.go              # Prometheus client
│       ├── openai.go                  # OpenAI integration
│       ├── types.go                   # Type definitions
│       └── data/
│           ├── benchmarks.json        # Verified benchmarks
│           └── aws_pricing_ap-northeast-2.json
├── monitoring/
│   └── docker-compose.yml             # Grafana/Prometheus setup
└── test-*.bat                         # Test scripts
```
