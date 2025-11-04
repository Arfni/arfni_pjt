# Arfni Cost Estimation System

## Overview

Arfni provides **AI-powered AWS cost estimation** based on benchmark data from verified sources and intelligent analysis. The system combines:

1. **Benchmark Data from Verified Sources**: Memory requirements and performance data from TechEmpower, Stack Overflow, AWS case studies, and official documentation
2. **Estimated Capacity Ranges**: Concurrent user capacity estimates derived from verified data (not directly measured)
3. **OpenAI Analysis**: Intelligent resource recommendations based on benchmark data and your specific requirements
4. **Transparent Uncertainty**: Clear distinction between verified facts and estimates

## System Architecture

```
┌─────────────────────┐
│  User Input         │
│  - Stack YAML       │
│  - Users count      │
│  - Traffic level    │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────────────────────────────────────┐
│  Service Detection                                  │
│  - Parse Docker Compose / stack.yaml                │
│  - Identify: backend, database, cache               │
│  - Detect frameworks: Spring Boot, Node.js, MySQL   │
└──────────┬──────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────┐
│  Benchmark Lookup (internal/pricing/benchmarks.go)  │
│  - Load benchmarks.json (embedded data)             │
│  - Match service → framework                        │
│  - Spring Boot → spring-boot benchmark              │
│  - MySQL → mysql benchmark                          │
└──────────┬──────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────┐
│  Build OpenAI Prompt                                │
│  System Prompt:                                     │
│    - Deployment type (simple/production)            │
│    - Available instance types + prices              │
│    - JSON format requirements                       │
│                                                     │
│  User Prompt:                                       │
│    - Services list                                  │
│    - Expected users: 300                            │
│    - Expected traffic: medium                       │
│    - BENCHMARK DATA (verified sources):             │
│      "Spring Boot Performance Data:                 │
│       - t3.medium: 150-400 concurrent users         │
│       Source: TechEmpower + Stack Overflow"         │
└──────────┬──────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────┐
│  OpenAI API Call (internal/pricing/openai.go)       │
│  - Send prompt with benchmark context               │
│  - Request structured JSON response                 │
│  - Parse recommendation                             │
└──────────┬──────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────┐
│  OpenAI Response (JSON)                             │
│  {                                                  │
│    "ec2_instances": [{                              │
│      "type": "t3.medium",                           │
│      "count": 1,                                    │
│      "reason": "Based on benchmarks, t3.medium      │
│                supports 150-400 concurrent users"   │
│    }],                                              │
│    "storage": {"type": "gp3", "size_gb": 100},      │
│    "data_transfer": {                               │
│      "estimated_gb": 100,                           │
│      "reason": "~100GB/month. WARNING: Actual       │
│                 usage varies greatly..."            │
│    }                                                │
│  }                                                  │
└──────────┬──────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────┐
│  Cost Calculation (internal/pricing/estimator.go)   │
│  - Load pricing database (ap-northeast-2)           │
│  - EC2: t3.medium × 1 = $33.87/month                │
│  - Storage: 100GB gp3 × $0.088 = $8.80/month        │
│  - Data Transfer: 100GB × $0.126 = $12.60/month     │
│  - Total: $55.27/month                              │
└──────────┬──────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────┐
│  Output to User         │
│  - Console (formatted)  │
│  - JSON (__COST__)      │
└─────────────────────────┘
```

## Logic Flow

### 1. Input Processing

**User provides:**
- `stack.yaml` or Docker Compose file
- Expected users (e.g., 300)
- Expected traffic level (low/medium/high)
- Deployment type (simple/production)

**System detects:**
```yaml
services:
  spring:
    image: spring-boot-app:latest
  mysql:
    image: mysql:8.0
  redis:
    image: redis:7-alpine
```

Result: `backend (Spring Boot)`, `database (MySQL)`, `cache (Redis)`

### 2. Benchmark Matching

**File**: `internal/pricing/benchmarks.go`

```go
DetectServiceBenchmark("spring", "backend", "spring-boot-app:latest")
→ Returns: spring-boot benchmark data

DetectServiceBenchmark("mysql", "database", "mysql:8.0")
→ Returns: mysql benchmark data
```

**Benchmark Data Structure** (`data/benchmarks.json`):
```json
{
  "backends": {
    "spring-boot": {
      "min_memory_mb": 2048,  // ← VERIFIED from Stack Overflow + docs
      "instances": {
        "t3.medium": {
          "min_concurrent_users": 150,  // ← ESTIMATED from verified data
          "max_concurrent_users": 400,  // ← ESTIMATED from verified data
          "notes": "Standard heap (2GB) + overhead"
        }
      },
      "metadata": {
        "source": "TechEmpower Round 22-23 + Stack Overflow",
        "confidence": "high"  // = high confidence estimate
      }
    }
  }
}
```

### 3. OpenAI Prompt Construction

**File**: `internal/pricing/openai.go`

**System Prompt** (for simple deployment):
```
You are an AWS infrastructure expert.

CRITICAL: Use BENCHMARK DATA (from verified sources) as PRIMARY reference.

Benchmark data includes:
- VERIFIED: Minimum memory requirements (from official docs)
- ESTIMATED: Concurrent user capacity ranges (derived from verified data)

Recommend instances based on user count vs estimated capacity ranges.

Example: If benchmark shows "t3.medium: 150-400 users (estimated)"
and user needs 300 users → recommend t3.medium
```

**User Prompt** (auto-generated):
```
I need to deploy the following services on AWS in the ap-northeast-2 region:
- spring (backend)
- mysql (database)
- redis (cache)

Expected users: 300
Expected traffic: medium
Deployment mode: simple (all services as Docker containers on single EC2)

--- Benchmark Data (from Verified Sources) ---
Spring Boot Performance Data:
Minimum Memory: 2048MB (VERIFIED from Stack Overflow + official docs)
Data Source: TechEmpower Round 22-23 + Stack Overflow
Confidence Level: HIGH (for estimates derived from verified data)

Estimated Instance Capacity:
  - t3.small: 50-100 concurrent users (ESTIMATED). Minimal heap - development only
  - t3.medium: 150-400 concurrent users (ESTIMATED). Standard heap - production baseline
  - t3.large: 500-1200 concurrent users (ESTIMATED). High traffic production

MySQL Performance Data:
Minimum Memory: 1024MB
Source: MySQL 8.0 official docs (70-80% buffer pool rule)
  - t3.small: 50-200 concurrent users. 1GB buffer pool
  - t3.medium: 200-800 concurrent users. 2GB buffer pool

Redis Performance Data:
  - t3.micro: 100-500 concurrent users. Cache only
  - t3.small: 500-2000 concurrent users. Cache with light persistence

--- End of Benchmark Data ---
IMPORTANT: Base your recommendations primarily on the benchmark data above.

Respond ONLY with valid JSON.
```

### 4. OpenAI Response Processing

**OpenAI returns**:
```json
{
  "ec2_instances": [{
    "type": "t3.medium",
    "count": 1,
    "reason": "Based on MySQL, Redis, Spring, and Python benchmarks,
               t3.medium supports 200-800 concurrent users for MySQL and
               150-400 for Spring, which meets the requirement for 300 users.
               Source: MySQL 8.0 docs, Redis docs, TechEmpower, Stack Overflow."
  }],
  "storage": {
    "type": "gp3",
    "size_gb": 100,
    "reason": "gp3 provides cost-effective storage"
  },
  "data_transfer": {
    "estimated_gb": 100,
    "reason": "~100GB/month assuming typical API usage.
               WARNING: Actual usage varies greatly based on response sizes,
               caching, and user behavior. Monitor actual usage."
  }
}
```

### 5. Cost Calculation

**File**: `internal/pricing/estimator.go`

```go
// Load pricing database (ap-northeast-2 prices)
pricing := GetPricingDB()

// EC2
ec2Price := pricing.EC2["t3.medium"]  // $33.87/month
totalEC2 := ec2Price * count

// Storage
storagePrice := pricing.Storage.EBSGP3.PricePerGBMonth  // $0.088/GB
totalStorage := 100 * 0.088 = $8.80

// Data Transfer
transferPrice := pricing.DataTransfer.OutboundFirst10TB  // $0.126/GB
totalTransfer := 100 * 0.126 = $12.60

// Total
total := $33.87 + $8.80 + $12.60 = $55.27/month
```

## Benchmark Data Sources

All benchmark data is documented in:
- `BENCHMARK_RESEARCH.md` (English)
- `BENCHMARK_RESEARCH_ko.md` (Korean)

### What is VERIFIED vs ESTIMATED

**VERIFIED (from official documentation):**
- **Spring Boot**: Minimum 2GB heap required (Stack Overflow + Spring docs)
- **MySQL**: 70-80% buffer pool rule (MySQL 8.0 Official Documentation)
- **Redis**: 80% usable memory rule (Redis Official Documentation)
- **Node.js**: Memory per process (Node.js official documentation)

**ESTIMATED (derived from verified data):**
- **Concurrent user capacity ranges** (e.g., "t3.medium: 150-400 users")
  - Calculated from: verified memory requirements + TechEmpower relative performance + AWS case studies
  - These are conservative estimates, NOT directly measured values
  - Used as reference points, not absolute guarantees

**Example sources:**
- **Spring Boot**: TechEmpower Framework Benchmarks Round 22-23 (relative performance), Stack Overflow production reports, AWS case studies
- **MySQL**: MySQL 8.0 Official Documentation, Docker performance guides
- **Redis**: Redis Official Documentation, AWS ElastiCache sizing guide
- **Node.js**: TechEmpower benchmarks, Node.js official documentation

**Confidence levels:**
- **High**: Estimates based on multiple verified sources + official documentation (trust but validate reasonability)
- **Medium**: Estimates based on community experiences + extrapolation (use as reference with judgment)
- **Low**: General estimates with limited data (use as rough guideline only)

**Safety mechanism:**
The system includes a sanity check instruction to OpenAI:
- If benchmark data contradicts fundamental principles (e.g., t3.micro with 1GB RAM supposedly supporting 5000 Spring Boot users)
- OpenAI should prioritize reasonability over benchmark data
- OpenAI should explain the discrepancy: "Benchmark suggests X, but this seems unreasonable because [reason]. Recommending Y instead."
- This protects against errors in our benchmark data

## Data Transfer Estimation

**Unlike EC2/RDS, data transfer has NO reliable benchmarks.**

**Approach:**
1. OpenAI estimates based on user count + traffic level
2. **Always includes WARNING** about uncertainty
3. Conservative estimates (typical REST API usage)

**Typical results:**
- 100 users, low traffic: 10GB/month
- 300 users, medium traffic: 100GB/month
- 1000 users, high traffic: 300GB/month

**Reality check:**
```
100GB / 30 days / 300 users = ~11MB per user per day
At 8KB per API response → ~1400 API calls per user per day
This is reasonable for medium-traffic web app
```

**Limitations:**
- Assumes REST API (JSON responses, 5-10KB)
- Does NOT account for: images, files, video, WebSocket, GraphQL
- Users should monitor actual usage and adjust

## Usage

### Basic Usage

```bash
# Simple deployment (all services on single EC2)
./arfni-go estimate-cost \
  -f stack.yaml \
  -users 300 \
  -traffic medium \
  -deployment simple

# Production deployment (AWS managed services)
./arfni-go estimate-cost \
  -f stack.yaml \
  -users 1000 \
  -traffic high \
  -deployment production
```

### Environment Variables

```bash
# Use GMS proxy (SSAFY)
export GMS_KEY="your-gms-key"

# Use OpenAI directly
export OPENAI_API_KEY="sk-..."

# Force specific provider
export OPENAI_PROVIDER="gms"  # or "openai" or "auto"
```

## Limitations and Warnings

### Important Assumptions

1. **"Expected Users" = Concurrent Users**
   - System assumes your input is concurrent active users
   - NOT Daily Active Users (DAU) or Monthly Active Users (MAU)
   - Example: If you have 3000 DAU but only 10% online simultaneously → input 300

2. **Benchmark Data is Conservative**
   - "t3.medium: 150-400 users" means it CAN handle up to 400
   - But for safety, recommend staying in the middle range (250-300)
   - Always test with load testing before production

3. **Data Transfer is Highly Uncertain**
   - Estimates assume typical REST API usage
   - Actual usage depends on:
     - Response payload sizes
     - Caching strategies (CDN, Redis)
     - Compression (gzip)
     - Static assets (images, CSS, JS)
     - User behavior patterns
   - **ALWAYS monitor actual usage** after deployment

4. **Simple Mode Memory Calculation**
   - OpenAI is instructed to sum all service memory requirements
   - Includes 30% overhead for OS + Docker
   - But OpenAI may not always calculate perfectly
   - Verify recommendations make sense for your workload

### Validation Checklist

Before trusting the estimate:

1. Check EC2 recommendation reason - does it cite benchmark sources?
   - Good: "Based on benchmark estimates from TechEmpower and MySQL docs, t3.medium supports 150-400 users..."
   - Okay: "Based on benchmarks..." (cites sources but doesn't acknowledge estimates)
   - Bad: "General recommendation for this workload" (no source citation)

2. Verify memory makes sense for simple deployment
   - Spring Boot (2GB) + MySQL (1GB) + Redis (256MB) ≈ 3.5GB
   - Should recommend at least t3.medium (4GB RAM)

3. Data transfer seems reasonable?
   - 100 users, low traffic → 10GB is plausible
   - 100 users, low traffic → 500GB is suspicious

4. Compare with AWS Calculator
   - Use AWS Pricing Calculator for second opinion
   - Our estimates should be within 20-30% range

## Future Improvements

### Prometheus Integration (Planned)

**Concept**: Use actual runtime metrics to validate and improve estimates

```
[Phase 1: Initial Estimate]
arfni-go estimate-cost → Deploy to AWS

[Phase 2: Monitor]
Deploy Prometheus + Node Exporter
Collect metrics for 7-30 days:
  - Actual CPU usage
  - Actual memory usage
  - Actual network transfer (GB)

[Phase 3: Optimize]
arfni-go optimize --prometheus-url http://localhost:9090
  - Compare benchmark estimate vs actual usage
  - Identify over-provisioned resources
  - Recommend right-sizing

Output:
  "Initial estimate: t3.large ($67.74/month)
   Actual usage: 40% CPU, 3GB RAM average
   Recommendation: Downgrade to t3.medium ($33.87/month)
   Potential savings: $33.87/month (50%)"
```

**Implementation approach:**
1. New command: `arfni-go analyze-metrics`
2. Query Prometheus for node_cpu_seconds_total, node_memory_bytes, node_network_transmit_bytes_total
3. Calculate percentiles (p50, p95, p99)
4. Compare against instance type capacity
5. Recommend optimizations

**Benefits:**
- Catch over-provisioning (common with benchmark-based estimates)
- Accurate data transfer costs (no more uncertainty!)
- Continuous cost optimization feedback loop

## File Structure

```
internal/pricing/
├── benchmarks.go              # Benchmark detection and formatting
├── benchmark_loader.go        # Load embedded benchmarks.json
├── openai.go                  # OpenAI API integration
├── estimator.go               # Cost calculation logic
├── types.go                   # Data structures
├── data/
│   ├── benchmarks.json        # Verified performance data
│   └── aws_pricing_kr.json    # AWS ap-northeast-2 pricing
├── BENCHMARK_RESEARCH.md      # Detailed benchmark sources
└── BENCHMARK_RESEARCH_ko.md   # 벤치마크 출처 (한글)
```

## Contributing

To add new framework benchmarks:

1. Research verified sources (official docs, benchmarks, case studies)
2. Document in `BENCHMARK_RESEARCH.md`
3. Add to `data/benchmarks.json`:
   ```json
   {
     "backends": {
       "new-framework": {
         "min_memory_mb": 512,
         "instances": {
           "t3.small": {
             "min_concurrent_users": 50,
             "max_concurrent_users": 150,
             "notes": "Description"
           }
         },
         "metadata": {
           "source": "Where you found this data",
           "confidence": "high/medium/low"
         }
       }
     }
   }
   ```
4. Update detection logic in `benchmarks.go`

**Quality standards:**
- Prefer official documentation over blog posts
- Require at least 2 sources for "high" confidence
- Be conservative (better to under-promise than over-promise)
- Document all sources clearly

## License

See main project LICENSE file.

## Support

For issues or questions:
- GitHub Issues: [project repository]
- Documentation: See `BENCHMARK_RESEARCH.md` for methodology
