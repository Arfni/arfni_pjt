# Arfni Pricing 로직 상세 문서

## 개요

이 문서는 Arfni의 비용 예측 및 최적화 시스템의 전체 로직을 파일별로 상세히 설명합니다.

---

## 전체 파일 구조

```
BE/arfni/internal/pricing/
├── types.go                 # 데이터 구조 정의
├── loader.go                # AWS 가격 데이터 로드
├── benchmark_loader.go      # 벤치마크 데이터 로드
├── benchmarks.go            # 벤치마크 감지 및 포맷팅
├── openai.go                # OpenAI API 통신
├── estimator.go             # 비용 예측 로직 (estimate 명령)
├── optimizer.go             # 최적화 분석 로직 (optimize 명령)
├── prometheus.go            # Prometheus 메트릭 수집
└── data/
    ├── aws-pricing.json     # AWS 가격 데이터 (8KB, 20개 인스턴스)
    └── benchmarks.json      # 벤치마크 데이터 (8KB)
```

---

## 1. 데이터 구조 (types.go)

### 역할
모든 데이터 구조를 정의하는 파일입니다.

### 주요 구조체

#### 1.1 AWS 가격 관련
```go
// AWSPricing: 전체 AWS 가격 데이터베이스
type AWSPricing struct {
    Region       string                    // ap-northeast-2
    RegionName   string                    // Seoul
    Currency     string                    // USD
    LastUpdated  string                    // 2024-10-31
    EC2          map[string]EC2Instance    // t3.micro, t3.small 등
    RDS          map[string]RDSInstance    // db.t3.micro 등
    ElastiCache  map[string]CacheInstance  // cache.t3.micro 등
    Storage      StoragePricing            // EBS 가격
    DataTransfer DataTransferPricing       // 데이터 전송 가격
    LoadBalancer LoadBalancerPricing       // 로드밸런서 가격
}

// EC2Instance: EC2 인스턴스 정보
type EC2Instance struct {
    VCPU           int     // 2
    MemoryGB       float64 // 4.0
    PricePerHour   float64 // 0.0464
    PricePerMonth  float64 // 33.87
    Description    string  // "Burstable, suitable for medium web apps"
}
```

#### 1.2 비용 예측 관련
```go
// CostEstimationRequest: 사용자 입력
type CostEstimationRequest struct {
    Region         string        // ap-northeast-2
    Services       []ServiceInfo // stack.yaml의 서비스 목록
    ExpectedUsers  int           // 100
    ExpectedTraffic string       // medium
    DeploymentType string        // simple
}

// ServiceInfo: 서비스 정보
type ServiceInfo struct {
    Name  string // spring
    Type  string // backend
    Image string // spring-boot:latest
}

// CostBreakdown: 최종 비용 결과
type CostBreakdown struct {
    BudgetTier      TierCostBreakdown      // 예산 티어
    RecommendedTier TierCostBreakdown      // 권장 티어
    PerformanceTier TierCostBreakdown      // 성능 티어
    Recommendation  ResourceRecommendation // OpenAI 추천
    OptimizationTips []string              // 최적화 팁
}

// TierCostBreakdown: 티어별 비용 상세
type TierCostBreakdown struct {
    TierName           string      // Budget
    Description        string      // 설명
    Warnings           []string    // 경고
    TotalMonthlyUSD    float64     // 89.14
    EC2Cost            float64     // 67.74
    RDSCost            float64     // 0
    CacheCost          float64     // 0
    StorageCost        float64     // 8.80
    LoadBalancerCost   float64     // 0
    DataTransferCost   float64     // 12.60
    Details            CostDetails // 상세 항목
}
```

#### 1.3 최적화 분석 관련
```go
// ActualUsageMetrics: Prometheus에서 수집한 실제 사용량
type ActualUsageMetrics struct {
    CPUUsagePercent    float64 // 1.0
    MemoryUsedMB       float64 // 1271
    MemoryUsagePercent float64 // 33.2
    DiskUsedGB         float64 // 4.8
    DiskUsagePercent   float64 // 16.0
    NetworkInboundMB   float64 // 3.8 (24시간)
    NetworkOutboundMB  float64 // 72.2 (24시간)
    InstanceType       string  // unknown
}

// OptimizationReport: 최적화 분석 결과
type OptimizationReport struct {
    ActualUsage         ActualUsageMetrics  // 실제 사용량
    CostAnalysis        CostAnalysis        // 비용 분석
    PerformanceAnalysis PerformanceAnalysis // 성능 분석
    Recommendations     []Recommendation    // 권장사항
}

// Recommendation: 개별 권장사항
type Recommendation struct {
    Priority    string  // high/medium/low
    Category    string  // cost/performance/stability
    Title       string  // 제목
    Description string  // 상세 설명
    Impact      string  // 예상 영향
    Savings     float64 // 절감액 (월간)
}
```

---

## 2. 데이터 로드

### 2.1 AWS 가격 데이터 로드 (loader.go)

#### 파일 위치
`BE/arfni/internal/pricing/loader.go` (39줄)

#### 로직
```go
// Line 10-11: 컴파일 시 JSON을 바이너리에 임베드
//go:embed data/aws-pricing.json
var awsPricingData []byte

// Line 13-17: 싱글톤 패턴
var (
    pricingDB   *AWSPricing  // 전역 변수
    loadOnce    sync.Once    // 한 번만 실행 보장
    loadErr     error
)

// Line 19-30: 데이터 로드 함수
func LoadPricingDB() (*AWSPricing, error) {
    loadOnce.Do(func() {
        pricingDB = &AWSPricing{}
        loadErr = json.Unmarshal(awsPricingData, pricingDB)
    })
    return pricingDB, loadErr
}

// Line 32-38: 데이터 조회 함수
func GetPricingDB() (*AWSPricing, error) {
    if pricingDB == nil {
        return LoadPricingDB()
    }
    return pricingDB, loadErr
}
```

#### 동작 순서
1. 프로그램 시작 시 awsPricingData에 JSON 바이트 포함 (컴파일 시 임베드)
2. GetPricingDB() 첫 호출 시 JSON 파싱 (한 번만)
3. 이후 호출은 캐시된 pricingDB 반환 (파싱 없음)

#### 데이터 예시
```json
{
  "region": "ap-northeast-2",
  "ec2": {
    "t3.medium": {
      "vcpu": 2,
      "memory_gb": 4,
      "price_per_month": 33.87
    }
  }
}
```

### 2.2 벤치마크 데이터 로드 (benchmark_loader.go)

#### 파일 위치
`BE/arfni/internal/pricing/benchmark_loader.go` (102줄)

#### 로직
```go
// Line 10-11: 컴파일 시 JSON 임베드
//go:embed data/benchmarks.json
var benchmarkData []byte

// Line 43-46: 싱글톤 패턴
var (
    benchmarkDB   *BenchmarkDatabase
    benchmarkOnce sync.Once
)

// Line 48-62: 데이터 로드 함수
func GetBenchmarkDB() (*BenchmarkDatabase, error) {
    var err error
    benchmarkOnce.Do(func() {
        benchmarkDB = &BenchmarkDatabase{}
        err = json.Unmarshal(benchmarkData, benchmarkDB)
    })
    return benchmarkDB, err
}
```

#### 데이터 구조
```go
type BenchmarkDatabase struct {
    LastUpdated string                        // 2025-01-15
    DataSource  string                        // See BENCHMARK_RESEARCH.md
    Backends    map[string]ServiceBenchmark   // spring-boot, nodejs 등
    Databases   map[string]ServiceBenchmark   // mysql, postgresql 등
}

type ServiceBenchmark struct {
    ServiceType      string                         // backend
    MinMemoryMB      int                            // 2048
    Instances        map[string]PerformanceCapacity // t3.medium: 150-400 users
    Metadata         BenchmarkMetadata              // 출처, 신뢰도
}
```

#### 데이터 예시
```json
{
  "backends": {
    "spring-boot": {
      "min_memory_mb": 2048,
      "instances": {
        "t3.medium": {
          "min_concurrent_users": 150,
          "max_concurrent_users": 400
        }
      },
      "metadata": {
        "source": "Spring Boot documentation",
        "confidence": "high"
      }
    }
  }
}
```

---

## 3. 비용 예측 시스템 (estimate 명령)

### 3.1 전체 흐름

```
사용자 입력 (stack.yaml + 사용자 수 + 트래픽)
  ↓
estimator.go: EstimateCost()
  ↓
benchmarks.go: DetectServiceBenchmark() - 서비스별 벤치마크 감지
  ↓
estimator.go: calculateMinimumMemory() - 총 메모리 계산
  ↓
benchmarks.go: BuildBenchmarkContext() - 벤치마크 프롬프트 생성
  ↓
openai.go: GetResourceRecommendation() - OpenAI API 호출
  ↓
estimator.go: calculateTierCost() - 3개 티어별 비용 계산
  ↓
출력: CostBreakdown (3개 티어 + 비용 상세)
```

### 3.2 서비스 감지 (benchmarks.go)

#### 파일 위치
`BE/arfni/internal/pricing/benchmarks.go` (Line 8-68)

#### 함수: DetectServiceBenchmark()
```go
func DetectServiceBenchmark(serviceName, serviceType, image string) (*ServiceBenchmark, error)
```

#### 동작 로직
1. 서비스 이름과 이미지를 소문자로 변환
2. 타입별로 문자열 매칭
   - backend: spring, node, express, python, django, flask
   - database: mysql, mariadb, postgres
   - cache: redis
3. 매칭되면 benchmarkDB에서 데이터 반환
4. 매칭 안 되면 에러 반환

#### 예시
```go
// 입력: serviceName="spring", serviceType="backend", image="spring-boot:latest"
// 출력: spring-boot 벤치마크 (min_memory_mb: 2048, instances: {...})

// 입력: serviceName="mysql", serviceType="database", image="mysql:8.0"
// 출력: mysql 벤치마크 (min_memory_mb: 1024, instances: {...})
```

### 3.3 메모리 계산 (estimator.go)

#### 파일 위치
`BE/arfni/internal/pricing/estimator.go` (Line 238-277)

#### 함수: calculateMinimumMemory()
```go
func (e *CostEstimator) calculateMinimumMemory(services []ServiceInfo) int
```

#### 동작 로직
1. 각 서비스마다 DetectServiceBenchmark() 호출
2. 벤치마크 있으면: MinMemoryMB 사용
3. 벤치마크 없으면: 기본값
   - backend: 1024MB
   - database: 1024MB
   - cache: 256MB
4. 전체 메모리 합산
5. 30% 오버헤드 추가 (OS + Docker)
6. 총 메모리 반환

#### 예시
```
입력: spring (backend), mysql (database), python (backend)

계산:
  spring:  2048MB (벤치마크)
  mysql:   1024MB (벤치마크)
  python:   256MB (벤치마크)
  합계:    3328MB
  + 30%:    998MB
  총계:    4326MB (4.2GB)
```

### 3.4 벤치마크 프롬프트 생성 (benchmarks.go)

#### 파일 위치
`BE/arfni/internal/pricing/benchmarks.go` (Line 102-135)

#### 함수: BuildBenchmarkContext()
```go
func BuildBenchmarkContext(services []ServiceInfo) string
```

#### 동작 로직
1. 각 서비스마다 벤치마크 감지
2. 벤치마크 있으면 FormatBenchmarkForPrompt() 호출
3. 전체 벤치마크 데이터를 문자열로 포맷
4. 벤치마크 없으면 "No benchmark data available" 반환

#### 출력 예시
```
--- Benchmark Data (from Verified Sources) ---

spring Performance Data:
Minimum Memory: 2048MB (VERIFIED from official docs)
Data Source: Spring Boot documentation + Stack Overflow case studies
Confidence Level: HIGH

Estimated Instance Capacity:
  - t3.micro: Not viable - OOM crashes
  - t3.small: 50-150 concurrent users
  - t3.medium: 150-400 concurrent users
  - t3.large: 400-1000 concurrent users

mysql Performance Data:
Minimum Memory: 1024MB (VERIFIED from official docs)
Data Source: MySQL 8.0 official documentation
Confidence Level: HIGH
...

--- End of Benchmark Data ---
```

### 3.5 OpenAI API 호출 (openai.go)

#### 파일 위치
`BE/arfni/internal/pricing/openai.go` (Line 86-165)

#### 함수: GetResourceRecommendation()
```go
func (c *OpenAIClient) GetResourceRecommendation(
    req CostEstimationRequest,
    minRequiredMemoryMB int
) (*ResourceRecommendation, error)
```

#### 동작 로직

##### 1. 시스템 프롬프트 생성 (Line 167-340)
```go
func buildSystemPrompt(deploymentType string) string
```

배포 타입에 따라 다른 프롬프트:
- simple: 단일 EC2에 모든 서비스 (RDS/ElastiCache 사용 안 함)
- production: AWS 관리형 서비스 사용 (RDS, ElastiCache 포함)

주요 내용:
- 3개 티어 (Budget/Recommended/Performance) 요청
- JSON 형식 응답 요청
- 벤치마크 데이터 신뢰도별 사용 방법
- 메모리 제약 준수 지시

##### 2. 사용자 프롬프트 생성 (Line 342-397)
```go
func buildPrompt(req CostEstimationRequest, minRequiredMemoryMB int) string
```

포함 내용:
- 서비스 목록
- 예상 사용자 수
- 예상 트래픽
- 배포 모드
- 메모리 요구사항 (simple 모드)
- 벤치마크 컨텍스트 (전체 데이터)

메모리 요구사항 예시:
```
CRITICAL REQUIREMENT:
Based on verified memory requirements for all services (including 30% OS/Docker overhead),
this configuration needs MINIMUM 4326 MB (4.2 GB) of RAM.

Budget tier MUST use an instance with AT LEAST 4.2 GB RAM.
Do NOT recommend instances below this threshold.
```

##### 3. API 호출 및 응답 처리 (Line 98-165)
```go
// HTTP POST 요청
req := OpenAIRequest{
    Model: "gpt-4o-mini",
    Messages: []OpenAIMessage{
        {Role: "system", Content: systemPrompt},
        {Role: "user", Content: userPrompt},
    },
    Temperature: 0.3,
}

// API 호출
resp := client.Do(httpReq)

// JSON 응답 파싱
var recommendation ResourceRecommendation
json.Unmarshal(content, &recommendation)
```

#### OpenAI 응답 구조
```json
{
  "budget": {
    "ec2_instances": [{"type": "t3.large", "count": 1, "reason": "..."}],
    "rds_instances": [],
    "elasticache": [],
    "storage": {"type": "gp3", "size_gb": 100, "reason": "..."},
    "load_balancer": false,
    "data_transfer": {"estimated_gb": 100, "reason": "..."},
    "description": "...",
    "warnings": ["..."]
  },
  "recommended": {...},
  "performance": {...},
  "optimization_tips": ["tip1", "tip2"]
}
```

### 3.6 비용 계산 (estimator.go)

#### 파일 위치
`BE/arfni/internal/pricing/estimator.go` (Line 58-200)

#### 함수: calculateTierCost()
```go
func (e *CostEstimator) calculateTierCost(
    tierName string,
    tier TierRecommendation,
    deploymentType string,
    minRequiredMemoryMB int
) TierCostBreakdown
```

#### 동작 로직

##### 1. 메모리 검증 (Line 67-80)
simple 모드에서만 실행:
- OpenAI가 추천한 인스턴스의 메모리 확인
- 최소 메모리보다 작으면 경고 추가
- 자동 수정하지 않음 (OpenAI 추천 유지)

##### 2. EC2 비용 계산 (Line 82-96)
```go
for _, inst := range tier.EC2Instances {
    if ec2Price, ok := e.pricing.EC2[inst.Type]; ok {
        cost := ec2Price.PricePerMonth * float64(inst.Count)
        breakdown.EC2Cost += cost
    }
}
```

예시:
- t3.large 1개: $67.74/월

##### 3. RDS 비용 계산 (Line 98-112)
```go
for _, inst := range tier.RDSInstances {
    if rdsPrice, ok := e.pricing.RDS[inst.Type]; ok {
        cost := rdsPrice.PricePerMonth * float64(inst.Count)
        breakdown.RDSCost += cost
    }
}
```

##### 4. ElastiCache 비용 계산 (Line 114-128)
```go
for _, inst := range tier.ElastiCache {
    if cachePrice, ok := e.pricing.ElastiCache[inst.Type]; ok {
        cost := cachePrice.PricePerMonth * float64(inst.Count)
        breakdown.CacheCost += cost
    }
}
```

##### 5. Storage 비용 계산 (Line 130-153)
```go
if tier.Storage.Type == "gp3" {
    cost := e.pricing.Storage.EBSGP3.PricePerGBMonth * float64(tier.Storage.SizeGB)
    breakdown.StorageCost = cost
}
```

예시:
- gp3 100GB: $0.088 * 100 = $8.80/월

##### 6. Load Balancer 비용 (Line 155-166)
```go
if tier.LoadBalancer {
    breakdown.LoadBalancerCost = e.pricing.LoadBalancer.ALB.PricePerMonthBase
}
```

예시:
- ALB: $22.27/월 (기본 비용만, LCU 제외)

##### 7. Data Transfer 비용 (Line 168-180)
```go
if tier.DataTransfer.EstimatedGB > 0 {
    cost := float64(tier.DataTransfer.EstimatedGB) * e.pricing.DataTransfer.OutboundFirst10TB
    breakdown.DataTransferCost = cost
}
```

예시:
- 100GB 아웃바운드: $0.126 * 100 = $12.60/월

##### 8. 총 비용 계산 및 반올림 (Line 182-197)
```go
breakdown.TotalMonthlyUSD = breakdown.EC2Cost +
    breakdown.RDSCost +
    breakdown.CacheCost +
    breakdown.StorageCost +
    breakdown.LoadBalancerCost +
    breakdown.DataTransferCost

// 소수점 둘째 자리로 반올림
breakdown.TotalMonthlyUSD = math.Round(breakdown.TotalMonthlyUSD*100) / 100
```

#### 출력 예시
```
Budget Tier:
  EC2:            $67.74
  Storage:        $8.80
  Data Transfer:  $12.60
  Total:          $89.14/월
```

---

## 4. 최적화 분석 시스템 (optimize 명령)

### 4.1 전체 흐름

```
사전 조건: 모니터링 실행 중 (Prometheus 데이터 수집)
  ↓
prometheus.go: Query() - Prometheus에서 메트릭 수집
  ↓
optimizer.go: collectMetrics() - CPU, 메모리, 디스크, 네트워크 수집
  ↓
optimizer.go: analyzeCosts() - 비용 분석
  ↓
optimizer.go: analyzePerformance() - 성능 분석 (병목 감지)
  ↓
optimizer.go: generateRecommendations() - 규칙 기반 권장사항 생성
  ↓
optimizer.go: getAIRecommendations() - AI 권장사항 추가 (선택적)
  ↓
출력: OptimizationReport (실제 사용량 + 권장사항)
```

### 4.2 Prometheus 메트릭 수집 (prometheus.go)

#### 파일 위치
`BE/arfni/internal/pricing/prometheus.go` (228줄)

#### 주요 함수

##### Query() - 기본 쿼리 실행 (Line 27-72)
```go
func (c *PrometheusClient) Query(query string) (float64, error) {
    url := fmt.Sprintf("%s/api/v1/query?query=%s", c.BaseURL, url.QueryEscape(query))
    resp, err := http.Get(url)
    // JSON 파싱 후 result[0].value[1] 반환
}
```

##### GetCPUUsage() - CPU 사용률 (Line 74-85)
```go
func (c *PrometheusClient) GetCPUUsage() (float64, error) {
    query := `100 - (avg by (instance) (rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)`
    return c.Query(query)
}
```

계산 방식:
- 5분간 idle CPU 비율 계산
- 100에서 빼서 사용률 산출
- 예: idle 99% → 사용률 1%

##### GetMemoryUsage() - 메모리 사용량 (Line 87-109)
```go
func (c *PrometheusClient) GetMemoryUsage() (usedMB, totalMB, percent float64, err error) {
    totalQuery := `node_memory_MemTotal_bytes / 1024 / 1024`
    availQuery := `node_memory_MemAvailable_bytes / 1024 / 1024`

    totalMB = Query(totalQuery)
    availMB := Query(availQuery)
    usedMB = totalMB - availMB
    percent = (usedMB / totalMB) * 100
}
```

##### GetDiskUsage() - 디스크 사용량 (Line 173-210)
```go
func (c *PrometheusClient) GetDiskUsage() (usedGB, totalGB, percent float64, err error) {
    // mountpoint=~"/host|/" 로 Docker 환경 대응
    totalQuery := `node_filesystem_size_bytes{mountpoint=~"/host|/"} / 1024 / 1024 / 1024`
    availQuery := `node_filesystem_avail_bytes{mountpoint=~"/host|/"} / 1024 / 1024 / 1024`

    totalGB = Query(totalQuery)
    availGB := Query(availQuery)
    usedGB = totalGB - availGB
    percent = (usedGB / totalGB) * 100
}
```

##### GetNetworkTraffic() - 네트워크 트래픽 (Line 111-143)
```go
func (c *PrometheusClient) GetNetworkTraffic() (inboundMB, outboundMB float64, err error) {
    // 24시간 누적 트래픽
    inQuery := `sum(increase(node_network_receive_bytes_total[24h])) / 1024 / 1024`
    outQuery := `sum(increase(node_network_transmit_bytes_total[24h])) / 1024 / 1024`

    inboundMB = Query(inQuery)
    outboundMB = Query(outQuery)
}
```

##### GetInstanceInfo() - 인스턴스 정보 (Line 145-171)
```go
func (c *PrometheusClient) GetInstanceInfo() (string, error) {
    // node_exporter 라벨에서 instance_type 추출 시도
    query := `node_uname_info`
    // 라벨이 없으면 "unknown" 반환
}
```

### 4.3 메트릭 수집 (optimizer.go)

#### 파일 위치
`BE/arfni/internal/pricing/optimizer.go` (Line 112-173)

#### 함수: collectMetrics()
```go
func (a *OptimizationAnalyzer) collectMetrics() (*ActualUsageMetrics, error)
```

#### 동작 로직
1. Prometheus 클라이언트 사용하여 각 메트릭 수집
2. 에러 발생 시 해당 메트릭만 0으로 설정하고 계속 진행
3. ActualUsageMetrics 구조체에 모든 메트릭 저장

```go
metrics := &ActualUsageMetrics{}

// CPU
cpuUsage, err := a.prometheus.GetCPUUsage()
if err == nil {
    metrics.CPUUsagePercent = cpuUsage
}

// Memory
usedMB, totalMB, percent, err := a.prometheus.GetMemoryUsage()
if err == nil {
    metrics.MemoryUsedMB = usedMB
    metrics.MemoryUsagePercent = percent
}

// Disk
usedGB, totalGB, percent, err := a.prometheus.GetDiskUsage()
if err == nil {
    metrics.DiskUsedGB = usedGB
    metrics.DiskUsagePercent = percent
}

// Network
inMB, outMB, err := a.prometheus.GetNetworkTraffic()
if err == nil {
    metrics.NetworkInboundMB = inMB
    metrics.NetworkOutboundMB = outMB
}

// Instance Type
instanceType, err := a.prometheus.GetInstanceInfo()
if err == nil {
    metrics.InstanceType = instanceType
} else {
    metrics.InstanceType = "unknown"
}

return metrics, nil
```

### 4.4 비용 분석 (optimizer.go)

#### 파일 위치
`BE/arfni/internal/pricing/optimizer.go` (Line 175-209)

#### 함수: analyzeCosts()
```go
func (a *OptimizationAnalyzer) analyzeCosts(metrics *ActualUsageMetrics) CostAnalysis
```

#### 동작 로직
1. 인스턴스 타입이 알려진 경우:
   - pricing.EC2에서 월간 비용 조회
   - 다운사이징 가능 여부 확인
   - 절감액 계산
2. 인스턴스 타입이 unknown인 경우:
   - 비용 계산 불가
   - 모든 비용 0으로 설정

```go
analysis := CostAnalysis{
    CurrentInstanceType: metrics.InstanceType,
}

if metrics.InstanceType != "unknown" {
    if ec2, ok := a.pricing.EC2[metrics.InstanceType]; ok {
        analysis.CurrentMonthlyCost = ec2.PricePerMonth

        // 다운사이징 가능 시 절감액 계산
        optimalInstance := a.findOptimalInstance(metrics)
        if optimal, ok := a.pricing.EC2[optimalInstance]; ok {
            analysis.PotentialSavings = analysis.CurrentMonthlyCost - optimal.PricePerMonth
        }
    }
}

// 데이터 전송 비용 (24시간 기준 월간 환산)
monthlyOutbound := metrics.NetworkOutboundMB * 30 / 1024  // GB로 변환
analysis.ActualDataTransfer = monthlyOutbound * a.pricing.DataTransfer.OutboundFirst10TB

return analysis
```

### 4.5 성능 분석 (optimizer.go)

#### 파일 위치
`BE/arfni/internal/pricing/optimizer.go` (Line 211-249)

#### 함수: analyzePerformance()
```go
func (a *OptimizationAnalyzer) analyzePerformance(metrics *ActualUsageMetrics) PerformanceAnalysis
```

#### 동작 로직
```go
analysis := PerformanceAnalysis{}

// 병목 현상 감지
if metrics.CPUUsagePercent > 80 {
    analysis.CPUBottleneck = true
    analysis.Bottlenecks = append(analysis.Bottlenecks, "CPU")
}

if metrics.MemoryUsagePercent > 85 {
    analysis.MemoryBottleneck = true
    analysis.Bottlenecks = append(analysis.Bottlenecks, "Memory")
}

if metrics.DiskUsagePercent > 90 {
    analysis.DiskBottleneck = true
    analysis.Bottlenecks = append(analysis.Bottlenecks, "Disk")
}

// 상태 판단
if len(analysis.Bottlenecks) > 0 {
    if metrics.MemoryUsagePercent > 90 || metrics.DiskUsagePercent > 95 {
        analysis.HealthStatus = "critical"
    } else {
        analysis.HealthStatus = "warning"
    }
} else {
    analysis.HealthStatus = "healthy"
}

return analysis
```

임계값:
- CPU: 80% 이상 → 병목
- Memory: 85% 이상 → 병목
- Disk: 90% 이상 → 병목
- Memory 90% 또는 Disk 95% 이상 → critical
- 병목 있지만 critical 아님 → warning
- 병목 없음 → healthy

### 4.6 권장사항 생성 (optimizer.go)

#### 파일 위치
`BE/arfni/internal/pricing/optimizer.go` (Line 251-356)

#### 함수: generateRecommendations()
```go
func (a *OptimizationAnalyzer) generateRecommendations(
    metrics *ActualUsageMetrics,
    costAnalysis CostAnalysis,
    perfAnalysis PerformanceAnalysis,
) []Recommendation
```

#### 동작 로직 (규칙 기반)

##### 1. Critical 문제 우선 처리 (Line 259-279)
```go
if perfAnalysis.HealthStatus == "critical" {
    if metrics.MemoryUsagePercent > 90 {
        recommendations = append(recommendations, Recommendation{
            Priority:    "high",
            Category:    "stability",
            Title:       "Critical Memory Shortage",
            Description: "Memory usage at 91%. Immediate upgrade required",
            Impact:      "High risk of OOM errors",
        })
    }
}
```

##### 2. 성능 병목 (Line 281-290)
```go
if perfAnalysis.CPUBottleneck {
    recommendations = append(recommendations, Recommendation{
        Priority:    "medium",
        Category:    "performance",
        Title:       "CPU Bottleneck Detected",
        Description: "CPU usage at 82%. Consider upgrading",
        Impact:      "Slow response times",
    })
}
```

##### 3. 비용 최적화 (Line 292-327)
```go
// 인스턴스 타입 알려진 경우
if metrics.InstanceType != "unknown" {
    if costAnalysis.PotentialSavings > 5 {
        optimalInstance := a.findOptimalInstance(metrics)
        recommendations = append(recommendations, Recommendation{
            Priority:    "low",
            Category:    "cost",
            Title:       "Downsize Instance to Save Costs",
            Description: "Switch from t3.large to t3.medium",
            Impact:      "Save $34/month",
            Savings:     costAnalysis.PotentialSavings,
        })
    }
}

// 인스턴스 타입 unknown인 경우
else {
    if metrics.CPUUsagePercent < 20 && metrics.MemoryUsagePercent < 50 {
        recommendations = append(recommendations, Recommendation{
            Priority:    "medium",
            Category:    "cost",
            Title:       "Low Resource Utilization Detected",
            Description: "CPU (1%) and memory (33%) usage are very low",
            Impact:      "Cannot provide specific recommendations without instance type. Check EC2 console.",
        })
    }
}
```

##### 4. 디스크 경고 (Line 329-338)
```go
if metrics.DiskUsagePercent > 70 && metrics.DiskUsagePercent <= 90 {
    recommendations = append(recommendations, Recommendation{
        Priority:    "medium",
        Category:    "stability",
        Title:       "Disk Space Running Low",
        Description: "Disk usage at 75%. Plan to increase EBS volume size",
        Impact:      "Prevent future service disruptions",
    })
}
```

##### 5. 정상 상태 (Line 340-349)
```go
if len(recommendations) == 0 {
    recommendations = append(recommendations, Recommendation{
        Priority:    "low",
        Category:    "stability",
        Title:       "System Running Optimally",
        Description: "All metrics are within healthy ranges",
        Impact:      "Continue monitoring",
    })
}
```

### 4.7 AI 권장사항 (optimizer.go)

#### 파일 위치
`BE/arfni/internal/pricing/optimizer.go` (Line 358-486)

#### 함수: getAIRecommendations()
```go
func (a *OptimizationAnalyzer) getAIRecommendations(
    metrics *ActualUsageMetrics,
    costAnalysis CostAnalysis,
    perfAnalysis PerformanceAnalysis,
) []Recommendation
```

#### 동작 로직

##### 1. API 키 확인 (Line 364-367)
```go
if a.openai.APIKey == "" {
    return nil  // API 키 없으면 AI 권장사항 생략
}
```

##### 2. 프롬프트 생성 (Line 369-412)
```go
prompt := fmt.Sprintf(`Analyze this AWS EC2 instance usage and provide optimization recommendations.

ACTUAL USAGE (from Prometheus):
- CPU Usage: %.1f%%
- Memory Usage: %.0f MB (%.1f%% of total)
- Disk Usage: %.1f GB (%.1f%%)
- Network Traffic (24h): %.1f MB in / %.1f MB out
- Instance Type: %s
- Health Status: %s

CONTEXT:
- Performance Bottlenecks: %v
- Current Monthly Cost: $%.2f
- Data Transfer Cost: $%.2f/month

Please provide 1-2 specific, actionable recommendations focusing on:
1. Cost optimization opportunities
2. Performance improvements
3. Resource rightsizing

Respond in JSON format:
[
  {
    "priority": "high|medium|low",
    "category": "cost|performance|stability",
    "title": "Short title",
    "description": "Detailed explanation",
    "impact": "Expected benefit",
    "savings": 0.0
  }
]`,
    metrics.CPUUsagePercent,
    metrics.MemoryUsedMB,
    metrics.MemoryUsagePercent,
    metrics.DiskUsedGB,
    metrics.DiskUsagePercent,
    metrics.NetworkInboundMB,
    metrics.NetworkOutboundMB,
    metrics.InstanceType,
    perfAnalysis.HealthStatus,
    perfAnalysis.Bottlenecks,
    costAnalysis.CurrentMonthlyCost,
    costAnalysis.ActualDataTransfer,
)
```

##### 3. 시스템 프롬프트 (Line 414-422)
```go
systemPrompt := `You are an AWS cost optimization expert. Analyze actual usage data and provide specific, actionable recommendations.

IMPORTANT:
- Be conservative and realistic
- Only recommend changes if there's clear benefit
- Consider both cost AND performance
- If instance type is "unknown", acknowledge this limitation
- Provide specific numbers when possible
- Respond ONLY with valid JSON array`
```

##### 4. OpenAI API 호출 (Line 424-470)
```go
req := OpenAIRequest{
    Model: a.openai.Model,  // gpt-4o-mini
    Messages: []OpenAIMessage{
        {Role: "system", Content: systemPrompt},
        {Role: "user", Content: prompt},
    },
    Temperature: 0.3,
}

// HTTP POST
client := &http.Client{Timeout: 30 * time.Second}
resp, err := client.Do(httpReq)

// 응답 파싱
var openAIResp OpenAIResponse
json.Unmarshal(body, &openAIResp)
content := openAIResp.Choices[0].Message.Content
```

##### 5. 응답 파싱 (Line 471-486)
```go
// Debug 출력
fmt.Printf("[DEBUG] OpenAI Raw Response:\n%s\n\n", content)

// JSON 마크다운 제거
content = strings.TrimPrefix(content, "```json\n")
content = strings.TrimSuffix(content, "\n```")

// JSON 파싱
var aiRecommendations []Recommendation
json.Unmarshal([]byte(content), &aiRecommendations)

return aiRecommendations
```

#### AI 응답 예시
```json
[
  {
    "priority": "high",
    "category": "cost",
    "title": "Consider Downgrading Instance Type",
    "description": "Given the low CPU usage (1.0%) and memory usage (33.2%), it is advisable to downgrade to a smaller instance type.",
    "impact": "Potential reduction in monthly costs",
    "savings": 10.0
  }
]
```

---

## 5. 데이터 흐름 요약

### 5.1 estimate 명령

```
1. 사용자 입력
   stack.yaml, 사용자 수, 트래픽 레벨
   ↓
2. 데이터 로드
   loader.go: GetPricingDB() - AWS 가격
   benchmark_loader.go: GetBenchmarkDB() - 벤치마크
   ↓
3. 서비스 감지
   benchmarks.go: DetectServiceBenchmark()
   spring → spring-boot (2048MB)
   mysql → mysql (1024MB)
   ↓
4. 메모리 계산
   estimator.go: calculateMinimumMemory()
   2048 + 1024 + 256 = 3328MB
   + 30% = 4326MB (4.2GB)
   ↓
5. 벤치마크 프롬프트
   benchmarks.go: BuildBenchmarkContext()
   전체 벤치마크 데이터 문자열 생성
   ↓
6. OpenAI 호출
   openai.go: GetResourceRecommendation()
   시스템 프롬프트 + 사용자 프롬프트 + 벤치마크 + 메모리 제약
   → JSON 응답 (3개 티어)
   ↓
7. 비용 계산
   estimator.go: calculateTierCost() × 3회
   t3.large: $67.74 (EC2)
   + $8.80 (Storage)
   + $12.60 (Data Transfer)
   = $89.14/월
   ↓
8. 출력
   CostBreakdown (3개 티어 + 상세)
```

### 5.2 optimize 명령

```
1. 사전 조건
   모니터링 실행 중 (Prometheus 데이터 수집)
   ↓
2. 메트릭 수집
   prometheus.go: Query()
   CPU: 1.0%
   Memory: 1271MB (33.2%)
   Disk: 4.8GB (16.0%)
   Network: 3.8MB in, 72.2MB out (24h)
   Instance: unknown
   ↓
3. 비용 분석
   optimizer.go: analyzeCosts()
   인스턴스 타입 unknown → 비용 계산 불가
   데이터 전송: $0.27/월
   ↓
4. 성능 분석
   optimizer.go: analyzePerformance()
   CPU 1% < 80% → 병목 없음
   Memory 33% < 85% → 병목 없음
   Disk 16% < 90% → 병목 없음
   상태: healthy
   ↓
5. 규칙 기반 권장사항
   optimizer.go: generateRecommendations()
   - 리소스 사용률 낮음 (medium)
   ↓
6. AI 권장사항 (선택적)
   optimizer.go: getAIRecommendations()
   프롬프트: 실제 메트릭 + 컨텍스트
   OpenAI 응답:
   - 인스턴스 다운그레이드 (high, $10 절감)
   - 데이터 전송 최적화 (medium, $0.10 절감)
   ↓
7. 출력
   OptimizationReport
   - 실제 사용량
   - 비용 분석
   - 성능 분석
   - 권장사항 3개 (규칙 1 + AI 2)
```

---

## 6. 주요 특징 및 제한사항

### 6.1 특징

1. 데이터 임베딩
   - JSON 파일이 바이너리에 포함됨
   - 외부 파일 의존성 없음
   - 단일 실행 파일로 배포 가능

2. 싱글톤 패턴
   - 데이터는 한 번만 로드
   - 이후 호출은 캐시된 데이터 사용
   - 메모리 효율적

3. OpenAI 통합
   - 벤치마크 데이터를 프롬프트에 포함
   - 메모리 제약 명시적 전달
   - JSON 응답 강제
   - Temperature 0.3 (일관성)

4. 에러 처리
   - 벤치마크 없으면 기본값 사용
   - Prometheus 메트릭 수집 실패 시 계속 진행
   - API 키 없으면 AI 권장사항 생략

### 6.2 제한사항

1. 데이터 업데이트
   - JSON 수정 시 재컴파일 필요
   - 자동 업데이트 없음

2. 인스턴스 타입
   - 20개 타입만 지원
   - 추가 시 수동으로 JSON 편집

3. 리전
   - ap-northeast-2 (서울) 전용
   - 다른 리전 사용 시 가격 데이터 교체 필요

4. optimize 인스턴스 감지
   - node_exporter 라벨 의존
   - 라벨 없으면 "unknown"
   - unknown 시 구체적 비용 권장 불가

5. 데이터 전송 추정
   - 24시간 데이터만 사용
   - 월간 패턴 미반영
   - 실제 사용량과 차이 가능

---

## 7. 파일별 역할 요약

| 파일 | 역할 | 주요 함수 | 사용 시점 |
|------|------|----------|----------|
| types.go | 데이터 구조 정의 | 구조체만 | 전역 |
| loader.go | AWS 가격 로드 | GetPricingDB() | estimate, optimize |
| benchmark_loader.go | 벤치마크 로드 | GetBenchmarkDB() | estimate |
| benchmarks.go | 벤치마크 감지 | DetectServiceBenchmark() | estimate |
| openai.go | OpenAI API | GetResourceRecommendation() | estimate, optimize |
| estimator.go | 비용 예측 | EstimateCost() | estimate |
| optimizer.go | 최적화 분석 | Analyze() | optimize |
| prometheus.go | 메트릭 수집 | Query(), GetCPUUsage() | optimize |

---

## 8. 핵심 로직 흐름

### estimate
1. 서비스 감지 → 벤치마크 매칭
2. 메모리 계산 → 총 필요 메모리
3. 벤치마크 프롬프트 생성 → 전체 데이터
4. OpenAI 호출 → 3개 티어 추천
5. 비용 계산 → AWS 가격 적용
6. 출력 → 3개 티어 + 상세

### optimize
1. Prometheus 쿼리 → 실제 메트릭
2. 비용 분석 → 현재 비용, 절감 가능성
3. 성능 분석 → 병목, 상태
4. 규칙 기반 권장사항 → 임계값 기반
5. AI 권장사항 → OpenAI 호출 (선택적)
6. 출력 → 사용량 + 권장사항

---

## 결론

이 시스템은 AWS 가격 데이터와 벤치마크 데이터를 바이너리에 임베드하여 단일 실행 파일로 배포 가능합니다. estimate는 배포 전 예상 비용을 계산하고, optimize는 배포 후 실제 사용량을 분석하여 최적화 방안을 제시합니다. OpenAI는 두 시스템 모두에서 사용되며, 벤치마크 데이터와 실제 메트릭을 기반으로 구체적인 권장사항을 생성합니다.
