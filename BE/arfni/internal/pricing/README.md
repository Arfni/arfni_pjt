# AWS Cost Estimation System

## Overview

OpenAI API를 활용하여 사용자의 stack.yaml 기반으로 AWS 배포 비용을 예측하는 시스템입니다. 실시간 AWS API 호출 대신 정적 가격 데이터베이스를 사용하여 비용을 절감합니다.

## Deployment Modes

### Simple Mode (default)

모든 서비스를 Docker 컨테이너로 단일 EC2 인스턴스에 배포하는 방식.

**추천 대상:** Arfni 기본 배포 방식, Docker Compose 기반 배포

**계산 방식:**
- EC2 인스턴스 1대만 추천
- 모든 컨테이너(backend, database, cache)의 리소스 합산
- RDS, ElastiCache, Load Balancer는 제외
- 예: Spring(2GB) + Python(2GB) + MySQL(2GB) + Redis(1GB) + OS(1GB) = 8GB → t3.xlarge 추천

**예시 결과:**
```
50명, low traffic:
- EC2: t3.medium × 1 ($33.87/month)
- Storage: 100GB ($8.80/month)
- Data Transfer: ($12.60/month)
Total: $55.27/month
```

### Production Mode

AWS 관리형 서비스(RDS, ElastiCache)를 사용하는 방식.

**추천 대상:** AWS Best Practice 기준 프로덕션 배포

**계산 방식:**
- Backend용 EC2 (여러 대 가능)
- Database는 RDS 추천
- Cache는 ElastiCache 추천
- 트래픽에 따라 Load Balancer 추가

**예시 결과:**
```
1000명, high traffic:
- EC2: m5.large × 2 ($156.22/month)
- RDS: db.m5.large × 1 ($121.18/month)
- ElastiCache: cache.m5.large × 1 ($97.09/month)
- Load Balancer: ($18.40/month)
- Storage: 200GB ($17.60/month)
- Data Transfer: ($252.00/month)
Total: $662.49/month
```

### 비교

| 항목 | Simple | Production |
|------|--------|------------|
| 아키텍처 | Docker on EC2 | AWS Managed |
| 비용 (50명/low) | ~$55 | ~$200 |
| 비용 (1000명/high) | ~$140 | ~$660 |
| Database | Container | RDS |
| Cache | Container | ElastiCache |
| LB | 미사용 | ALB |

---

## Architecture

### Components

1. **Static Pricing Database** (`data/aws-pricing.json`)
   - AWS Seoul(ap-northeast-2) 리전의 가격 정보
   - EC2, RDS, ElastiCache, Storage, Data Transfer, Load Balancer 가격 포함
   - 애플리케이션 빌드 시 바이너리에 임베드됨

2. **Pricing Loader** (`loader.go`)
   - `//go:embed` 디렉티브를 사용하여 JSON 파일을 바이너리에 포함
   - 싱글톤 패턴으로 한 번만 로드

3. **OpenAI Integration** (`openai.go`)
   - 사용자 요구사항을 분석하여 적절한 AWS 리소스 추천
   - GPT-4o-mini 모델 사용 (비용 효율적)
   - JSON 형식으로 구조화된 응답 반환

4. **Cost Estimator** (`estimator.go`)
   - OpenAI 추천을 기반으로 실제 비용 계산
   - 각 서비스별 비용 분해 (EC2, RDS, Cache, Storage 등)
   - 최적화 팁 제공

5. **Type Definitions** (`types.go`)
   - 모든 데이터 구조 정의
   - Request/Response 타입 포함

## Data Flow

```
1. User Input
   └─> stack.yaml + 예상 사용자 수 + 트래픽 레벨

2. Service Detection
   └─> stack.yaml 파싱 → 서비스 타입 감지 (backend, database, cache)

3. OpenAI Analysis
   └─> 요구사항 전송 → AI가 적절한 인스턴스 타입 및 수량 추천

4. Cost Calculation
   └─> 추천된 리소스 × 정적 가격 DB = 월별 예상 비용

5. Output
   └─> 비용 분해, 상세 추천, 최적화 팁
```

## Implementation Details

### 1. Pricing Database Structure

```json
{
  "region": "ap-northeast-2",
  "ec2": {
    "t3.micro": {
      "vcpu": 2,
      "memory_gb": 1,
      "price_per_month": 8.47
    }
  },
  "rds": { ... },
  "elasticache": { ... },
  "storage": { ... },
  "data_transfer": { ... },
  "load_balancer": { ... }
}
```

### 2. OpenAI Request Process

**Input:**
- 서비스 목록 (Spring, MySQL, Redis 등)
- 예상 사용자 수
- 트래픽 레벨 (low, medium, high)
- AWS 리전

**OpenAI Prompt:**
- System prompt: AWS 인프라 전문가 역할 부여
- Available instance types 제공
- JSON 형식 응답 요청

**Output:**
```json
{
  "ec2_instances": [{"type": "t3.small", "count": 2, "reason": "..."}],
  "rds_instances": [{"type": "db.t3.small", "count": 1, "reason": "..."}],
  "elasticache": [{"type": "cache.t3.micro", "count": 1, "reason": "..."}],
  "storage": {"type": "gp3", "size_gb": 100, "reason": "..."},
  "load_balancer": true,
  "optimization_tips": ["tip1", "tip2"]
}
```

### 3. Cost Calculation Logic

각 리소스 타입별로 계산:

```
EC2 Cost = Σ(instance_price_per_month × count)
RDS Cost = Σ(db_price_per_month × count)
Cache Cost = Σ(cache_price_per_month × count)
Storage Cost = storage_price_per_gb × size_gb
Load Balancer Cost = base_price_per_month
Data Transfer Cost = estimated_gb × price_per_gb

Total = EC2 + RDS + Cache + Storage + LB + Transfer
```

Data Transfer 예측:
- low: 100GB/month
- medium: 500GB/month
- high: 2000GB/month

### 4. Service Type Detection

stack.yaml의 서비스 이름 및 이미지로 타입 감지:

```go
// Database: mysql, postgres, mariadb, db
// Cache: redis, memcached, cache
// Backend: 기본값
```

## Usage

### CLI Command

```bash
arfni-go.exe estimate-cost -f stack.yaml -users 1000 -traffic high
```

**Parameters:**
- `-f`: stack.yaml 파일 경로 (default: stack.yaml)
- `-users`: 예상 사용자 수 (default: 100)
- `-traffic`: 트래픽 레벨 - low, medium, high (default: medium)

**Prerequisites:**
- API Key 환경 변수 설정 필요 (아래 중 하나)
  - `GMS_KEY`: SSAFY GMS 프록시 사용 (학생용, 무료)
  - `OPENAI_API_KEY`: OpenAI 직접 사용
  - 둘 다 설정되어 있으면 GMS 우선 사용
- 선택적: `OPENAI_PROVIDER` 환경 변수로 명시적 선택
  - `gms`: GMS 강제 사용
  - `openai`: OpenAI 직접 사용
  - `auto` (기본값): GMS_KEY 있으면 GMS, 없으면 OpenAI

### Example Output

```
================================================
  Arfni - AWS Cost Estimation
================================================

Stack File:        C:\path\to\stack.yaml
Expected Users:    1000
Expected Traffic:  high

Detected Services:
  - spring (backend)
  - mysql (database)
  - redis (cache)

[INFO] Analyzing your requirements with AI...
[INFO] Getting AWS resource recommendations...

================================================
  Cost Breakdown
================================================

EC2 Instances:       $135.49/month
RDS Databases:       $105.12/month
ElastiCache:         $29.20/month
Storage (EBS):       $8.80/month
Load Balancer:       $18.40/month
Data Transfer:       $252.00/month
------------------------------------------------
TOTAL:               $549.01/month

================================================
  Recommended Resources
================================================

EC2 Instances:
  - 2x t3.xlarge
    Reason: High traffic requires sufficient CPU and memory

RDS Databases:
  - 1x db.t3.large
    Reason: MySQL database with 1000 users needs reliable performance

ElastiCache:
  - 1x cache.t3.small
    Reason: Redis cache for session management

Storage:
  - 100 GB (gp3)
    Reason: General purpose SSD for application data

================================================
  Cost Optimization Tips
================================================

1. Use Reserved Instances for 1-year commitment to save 30-40%
2. Enable auto-scaling to handle traffic spikes efficiently
3. Use CloudFront CDN to reduce data transfer costs
4. Monitor and right-size instances after deployment
```

### JSON Output for GUI Integration

CLI는 파싱 가능한 JSON도 출력:

```
__COST_ESTIMATION__{"total_monthly_usd":549.01, ...}
```

## Error Handling

### Common Errors

1. **API Key not set**
   ```
   [ERROR] Failed to estimate costs: GMS_KEY environment variable not set
   [ERROR] Failed to estimate costs: OPENAI_API_KEY environment variable not set
   [HINT] Set either GMS_KEY (for SSAFY students) or OPENAI_API_KEY
   ```

2. **Invalid traffic level**
   ```
   [ERROR] Invalid traffic level: invalid (must be low, medium, or high)
   ```

3. **stack.yaml not found**
   ```
   [ERROR] stack.yaml not found at: /path/to/stack.yaml
   ```

4. **OpenAI API error**
   ```
   [ERROR] Failed to estimate costs: OpenAI API error (status 401): Invalid API key
   ```

## Code Structure

```
internal/pricing/
├── data/
│   └── aws-pricing.json      # 정적 가격 데이터베이스
├── types.go                   # 데이터 구조 정의
├── loader.go                  # 가격 DB 로더 (embed)
├── openai.go                  # OpenAI API 클라이언트
├── estimator.go               # 비용 계산 로직
└── README.md                  # 이 문서
```

## Integration Points

### From CLI (arfni-go)

```go
import "github.com/arfni/arfni/internal/pricing"

// 1. Create estimator
estimator, err := pricing.NewCostEstimator()

// 2. Build request
req := pricing.CostEstimationRequest{
    Services:        services,
    ExpectedUsers:   1000,
    ExpectedTraffic: "high",
    Region:          "ap-northeast-2",
}

// 3. Get estimate
breakdown, err := estimator.EstimateCost(req)

// 4. Use results
fmt.Printf("Total: $%.2f/month\n", breakdown.TotalMonthlyUSD)
```

### For GUI Integration

Tauri command에서 Go CLI를 호출:

```rust
// Rust command
#[tauri::command]
async fn estimate_cost(
    stack_path: String,
    users: i32,
    traffic: String
) -> Result<CostBreakdown, String> {
    // Execute: arfni-go.exe estimate-cost -f ... -users ... -traffic ...
    // Parse JSON output: __COST_ESTIMATION__{...}
}
```

## Limitations

1. **정적 가격 데이터**
   - 가격 업데이트 시 JSON 파일 수동 업데이트 필요
   - 현재 Seoul 리전만 지원

2. **OpenAI 의존성**
   - API 키 필수
   - API 호출 비용 발생 (매우 낮음, gpt-4o-mini 사용)
   - 네트워크 연결 필요

3. **추정 정확도**
   - Data Transfer 비용은 추정값 (실제 사용량과 다를 수 있음)
   - LCU(Load Balancer Capacity Units) 비용 미포함
   - Reserved Instances 할인 미반영

## Future Improvements

1. 다른 AWS 리전 지원
2. 가격 데이터 자동 업데이트 메커니즘
3. Reserved Instances 옵션 추가
4. 더 정교한 Data Transfer 예측 모델
5. 비용 비교 기능 (여러 구성 비교)

---

## Change Log

### 2025-01-XX - Deployment Mode 추가

**문제:**
기존 시스템은 AWS Best Practice 기준으로만 비용 계산(RDS, ElastiCache 등 관리형 서비스 사용). Arfni 실제 배포 방식은 모든 서비스를 Docker 컨테이너로 EC2 1대에 배포하므로 비용 차이가 10배 이상 발생.

**변경사항:**

1. **types.go**
   - `CostEstimationRequest`에 `DeploymentType` 필드 추가 (simple/production)

2. **openai.go**
   - `buildSystemPrompt()` 함수 추가
   - Simple mode: EC2 1대만 추천, RDS/ElastiCache/LB 제외, 모든 컨테이너 리소스 합산
   - Production mode: AWS 관리형 서비스 사용, 기존 로직 유지
   - `buildPrompt()` 수정: deployment mode 정보 추가
   - GMS(SSAFY) 프록시 지원 추가: GMS_KEY 환경변수 우선, OPENAI_API_KEY fallback

3. **cmd/arfni-go/main.go**
   - `-deployment` 플래그 추가 (기본값: simple)
   - deployment type validation 추가
   - 출력 메시지에 deployment mode 표시

**테스트 결과:**
- Simple mode (50명/low): $55.27/month (EC2 t3.medium × 1)
- Production mode (1000명/high): $662.49/month (EC2 × 2 + RDS + ElastiCache + LB)

**사유:**
Arfni 사용자 대부분이 Docker Compose로 배포하므로 실제 비용과 일치하는 추정값 제공 필요. Production mode는 AWS Best Practice 참고용으로 유지.

---

## Design Discussion: Estimation Accuracy

### 목표
인프라 초보자에게 EC2 배포 시 예상 비용과 인스턴스 타입을 추천.

### 현재 구현의 한계

**OpenAI 기반 추정:**
- 입력 정보: stack.yaml의 서비스 이름, 사용자 수, 트래픽 레벨만 사용
- 실제 CPU/메모리 사용 패턴 데이터 없음
- 추정 정확도: 낮음 (추측에 가까움)

**로컬 부하 테스트 방안 검토:**
- 사용자가 테스트 시나리오 작성 필요 (복잡)
- 헬스체크 엔드포인트는 실제 부하 대비 너무 가벼움
- 초보자 타겟에 부적합하여 보류

### 대안: 공개 벤치마크 기반 추정

**선택 이유:**
- 조사 시간: 1-2일로 주요 스택 커버 가능
- 유지보수: 외부 소스 활용, 연 1회 업데이트면 충분
- 비용: 별도 측정 인프라 불필요
- 정확도: 초보자 의사결정에는 충분

**데이터 수집 방법:**
1. 공개 벤치마크 조사
   - TechEmpower Benchmarks
   - AWS 블로그 사례 연구
   - 프레임워크 공식 문서
   - Stack Overflow, Reddit 등

2. 수동 정리 후 하드코딩
   - 각 출처에서 성능 수치 확인
   - 보수적 조정 후 코드에 작성
   - API 호출 없이 정적 데이터 사용

**구현 형태:**
```go
var Benchmarks = map[string]Rule{
    "spring-boot": {
        SmallUsers:  300,
        MediumUsers: 1000,
        LargeUsers:  3000,
        Source: "TechEmpower + AWS Blog",
    },
}
```

**출력 방식:**
- 3가지 인스턴스 옵션 제시
- 데이터 출처 명시
- 오차 범위 안내
- 배포 후 모니터링 권장

**향후 개선:**
- 배포 후 Prometheus로 실제 메트릭 수집
- 1주일 후 실측 데이터 기반 Right-Sizing 추천
