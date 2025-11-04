# Arfni 비용 추정 시스템

## 개요

Arfni는 **검증된 벤치마크 데이터와 AI 분석**을 기반으로 AWS 비용을 추정합니다. 이 시스템은 다음을 결합합니다:

1. **검증된 성능 벤치마크**: TechEmpower, Stack Overflow, AWS 사례 연구, 공식 문서의 실제 데이터
2. **OpenAI 분석**: 사용자 요구사항 기반 지능적 리소스 추천
3. **투명한 불확실성**: 추정이 불확실한 부분(예: 데이터 전송)에 대한 명확한 경고

## 시스템 아키텍처

```
┌─────────────────────┐
│  사용자 입력        │
│  - Stack YAML       │
│  - 사용자 수        │
│  - 트래픽 레벨      │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────────────────────────────────────┐
│  서비스 감지                                         │
│  - Docker Compose / stack.yaml 파싱                 │
│  - 식별: backend, database, cache                   │
│  - 프레임워크 감지: Spring Boot, Node.js, MySQL     │
└──────────┬──────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────┐
│  벤치마크 조회 (internal/pricing/benchmarks.go)     │
│  - benchmarks.json 로드 (임베디드 데이터)           │
│  - 서비스 → 프레임워크 매칭                         │
│  - Spring Boot → spring-boot 벤치마크               │
│  - MySQL → mysql 벤치마크                           │
└──────────┬──────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────┐
│  OpenAI 프롬프트 생성                               │
│  시스템 프롬프트:                                   │
│    - 배포 타입 (simple/production)                  │
│    - 사용 가능한 인스턴스 타입 + 가격               │
│    - JSON 형식 요구사항                             │
│                                                     │
│  사용자 프롬프트:                                   │
│    - 서비스 목록                                    │
│    - 예상 사용자: 300                               │
│    - 예상 트래픽: medium                            │
│    - 벤치마크 데이터 (검증된 출처):                 │
│      "Spring Boot 성능 데이터:                      │
│       - t3.medium: 150-400 동시 접속자              │
│       출처: TechEmpower + Stack Overflow"           │
└──────────┬──────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────┐
│  OpenAI API 호출 (internal/pricing/openai.go)       │
│  - 벤치마크 컨텍스트와 함께 프롬프트 전송           │
│  - 구조화된 JSON 응답 요청                          │
│  - 추천 파싱                                        │
└──────────┬──────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────┐
│  OpenAI 응답 (JSON)                                 │
│  {                                                  │
│    "ec2_instances": [{                              │
│      "type": "t3.medium",                           │
│      "count": 1,                                    │
│      "reason": "벤치마크 기반, t3.medium은          │
│                150-400 동시 접속자 지원"            │
│    }],                                              │
│    "storage": {"type": "gp3", "size_gb": 100},      │
│    "data_transfer": {                               │
│      "estimated_gb": 100,                           │
│      "reason": "~100GB/월. 경고: 실제 사용량은      │
│                 크게 달라질 수 있음..."             │
│    }                                                │
│  }                                                  │
└──────────┬──────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────┐
│  비용 계산 (internal/pricing/estimator.go)          │
│  - 가격 데이터베이스 로드 (ap-northeast-2)          │
│  - EC2: t3.medium × 1 = $33.87/월                   │
│  - Storage: 100GB gp3 × $0.088 = $8.80/월           │
│  - Data Transfer: 100GB × $0.126 = $12.60/월        │
│  - 총계: $55.27/월                                  │
└──────────┬──────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────┐
│  사용자에게 출력        │
│  - 콘솔 (포맷팅)        │
│  - JSON (__COST__)      │
└─────────────────────────┘
```

## 로직 흐름

### 1. 입력 처리

**사용자 제공:**
- `stack.yaml` 또는 Docker Compose 파일
- 예상 사용자 수 (예: 300)
- 예상 트래픽 레벨 (low/medium/high)
- 배포 타입 (simple/production)

**시스템 감지:**
```yaml
services:
  spring:
    image: spring-boot-app:latest
  mysql:
    image: mysql:8.0
  redis:
    image: redis:7-alpine
```

결과: `backend (Spring Boot)`, `database (MySQL)`, `cache (Redis)`

### 2. 벤치마크 매칭

**파일**: `internal/pricing/benchmarks.go`

```go
DetectServiceBenchmark("spring", "backend", "spring-boot-app:latest")
→ 반환: spring-boot 벤치마크 데이터

DetectServiceBenchmark("mysql", "database", "mysql:8.0")
→ 반환: mysql 벤치마크 데이터
```

**벤치마크 데이터 구조** (`data/benchmarks.json`):
```json
{
  "backends": {
    "spring-boot": {
      "min_memory_mb": 2048,
      "instances": {
        "t3.medium": {
          "min_concurrent_users": 150,
          "max_concurrent_users": 400,
          "notes": "표준 힙 (2GB) + 오버헤드"
        }
      },
      "metadata": {
        "source": "TechEmpower Round 22-23 + Stack Overflow",
        "confidence": "high"
      }
    }
  }
}
```

### 3. OpenAI 프롬프트 구성

**파일**: `internal/pricing/openai.go`

**시스템 프롬프트** (simple 배포용):
```
당신은 AWS 인프라 전문가입니다.

중요: 검증된 벤치마크 데이터를 주요 참고 자료로 사용하세요.

벤치마크 데이터는 사용자 프롬프트에 제공됩니다.
사용자 수 vs 벤치마크 범위를 기반으로 인스턴스 추천하세요.

예시: 벤치마크가 "t3.medium: 150-400 사용자"를 보여주고
사용자가 300명 필요 → t3.medium 추천
```

**사용자 프롬프트** (자동 생성):
```
ap-northeast-2 리전에 다음 서비스를 배포해야 합니다:
- spring (backend)
- mysql (database)
- redis (cache)

예상 사용자: 300
예상 트래픽: medium
배포 모드: simple (단일 EC2에 모든 서비스를 Docker 컨테이너로)

--- 검증된 벤치마크 데이터 ---
Spring Boot 성능 데이터 (검증된 벤치마크):
최소 메모리: 2048MB
데이터 출처: TechEmpower Round 22-23 + Stack Overflow
신뢰도: 높음

인스턴스 용량:
  - t3.small: 50-100 동시 접속자. 최소 힙 - 개발용만
  - t3.medium: 150-400 동시 접속자. 표준 힙 - 프로덕션 기본
  - t3.large: 500-1200 동시 접속자. 고트래픽 프로덕션

MySQL 성능 데이터:
최소 메모리: 1024MB
출처: MySQL 8.0 공식 문서 (70-80% buffer pool 규칙)
  - t3.small: 50-200 동시 접속자. 1GB buffer pool
  - t3.medium: 200-800 동시 접속자. 2GB buffer pool

Redis 성능 데이터:
  - t3.micro: 100-500 동시 접속자. 캐시만
  - t3.small: 500-2000 동시 접속자. 경량 영속성 포함

--- 벤치마크 데이터 끝 ---
중요: 위의 벤치마크 데이터를 주요 근거로 추천하세요.

유효한 JSON만 응답하세요.
```

### 4. OpenAI 응답 처리

**OpenAI 응답**:
```json
{
  "ec2_instances": [{
    "type": "t3.medium",
    "count": 1,
    "reason": "MySQL, Redis, Spring 벤치마크 기반,
               t3.medium은 MySQL 200-800 동시 접속자,
               Spring 150-400 동시 접속자 지원으로
               300명 요구사항 충족.
               출처: MySQL 8.0 문서, Redis 문서, TechEmpower, Stack Overflow."
  }],
  "storage": {
    "type": "gp3",
    "size_gb": 100,
    "reason": "gp3는 비용 효율적인 스토리지 제공"
  },
  "data_transfer": {
    "estimated_gb": 100,
    "reason": "일반적인 API 사용 기준 ~100GB/월.
               경고: 실제 사용량은 응답 크기, 캐싱, 사용자 행동에 따라
               크게 달라질 수 있습니다. 실제 사용량을 모니터링하세요."
  }
}
```

### 5. 비용 계산

**파일**: `internal/pricing/estimator.go`

```go
// 가격 데이터베이스 로드 (ap-northeast-2 가격)
pricing := GetPricingDB()

// EC2
ec2Price := pricing.EC2["t3.medium"]  // $33.87/월
totalEC2 := ec2Price * count

// Storage
storagePrice := pricing.Storage.EBSGP3.PricePerGBMonth  // $0.088/GB
totalStorage := 100 * 0.088 = $8.80

// Data Transfer
transferPrice := pricing.DataTransfer.OutboundFirst10TB  // $0.126/GB
totalTransfer := 100 * 0.126 = $12.60

// Total
total := $33.87 + $8.80 + $12.60 = $55.27/월
```

## 벤치마크 데이터 출처

모든 벤치마크 데이터는 다음에 문서화되어 있습니다:
- `BENCHMARK_RESEARCH.md` (영문)
- `BENCHMARK_RESEARCH_ko.md` (한글)

**예시 출처:**
- **Spring Boot**: TechEmpower Framework Benchmarks Round 22-23, Stack Overflow 프로덕션 보고서, AWS 사례 연구
- **MySQL**: MySQL 8.0 공식 문서 (70-80% buffer pool 규칙), Docker 성능 가이드
- **Redis**: Redis 공식 문서 (80% 사용 가능 메모리 규칙), AWS ElastiCache 사이징 가이드
- **Node.js**: TechEmpower 벤치마크, Node.js 공식 문서

**신뢰도 레벨:**
- **높음(High)**: 여러 검증된 출처 + 공식 문서 기반 추정 (신뢰하되 합리성 검증)
- **중간(Medium)**: 커뮤니티 경험 + 유사 데이터로부터 추정 (참고용, 판단 필요)
- **낮음(Low)**: 제한된 데이터로 일반적 추정 (대략적 가이드로만 사용)

**안전 장치:**
시스템은 OpenAI에게 합리성 검증 지시를 포함합니다:
- 만약 벤치마크 데이터가 기본 원칙과 모순되면 (예: 1GB RAM의 t3.micro가 5000명의 Spring Boot 사용자 지원)
- OpenAI는 벤치마크보다 합리성을 우선시해야 함
- OpenAI는 불일치를 설명해야 함: "벤치마크는 X를 제안하지만, [이유]로 인해 비합리적입니다. 대신 Y를 추천합니다."
- 이것은 우리의 벤치마크 데이터 오류로부터 보호합니다

## 데이터 전송 추정

**EC2/RDS와 달리, 데이터 전송은 신뢰할 수 있는 벤치마크가 없습니다.**

**접근 방식:**
1. OpenAI가 사용자 수 + 트래픽 레벨 기반 추정
2. **항상 불확실성에 대한 경고 포함**
3. 보수적 추정 (일반적인 REST API 사용)

**전형적인 결과:**
- 100명, low 트래픽: 10GB/월
- 300명, medium 트래픽: 100GB/월
- 1000명, high 트래픽: 300GB/월

**현실성 검증:**
```
100GB / 30일 / 300명 = 사용자당 하루 ~11MB
8KB API 응답 기준 → 사용자당 하루 ~1400 API 호출
중간 트래픽 웹앱으로는 합리적
```

**한계점:**
- REST API 가정 (JSON 응답, 5-10KB)
- 다음은 고려하지 않음: 이미지, 파일, 비디오, WebSocket, GraphQL
- 사용자는 실제 사용량을 모니터링하고 조정해야 함

## 사용법

### 기본 사용법

```bash
# Simple 배포 (단일 EC2에 모든 서비스)
./arfni-go estimate-cost \
  -f stack.yaml \
  -users 300 \
  -traffic medium \
  -deployment simple

# Production 배포 (AWS 관리형 서비스)
./arfni-go estimate-cost \
  -f stack.yaml \
  -users 1000 \
  -traffic high \
  -deployment production
```

### 환경 변수

```bash
# GMS 프록시 사용 (SSAFY)
export GMS_KEY="your-gms-key"

# OpenAI 직접 사용
export OPENAI_API_KEY="sk-..."

# 특정 프로바이더 강제 지정
export OPENAI_PROVIDER="gms"  # 또는 "openai" 또는 "auto"
```

## 한계점 및 경고

### 중요한 가정들

1. **"예상 사용자" = 동시 접속자**
   - 시스템은 입력을 동시 활성 사용자로 가정
   - 일일 활성 사용자(DAU)나 월간 활성 사용자(MAU)가 아님
   - 예: DAU 3000명이지만 동시 접속은 10%만 → 300 입력

2. **벤치마크 데이터는 보수적**
   - "t3.medium: 150-400 사용자"는 최대 400까지 처리 가능 의미
   - 하지만 안전을 위해 중간 범위(250-300) 유지 권장
   - 프로덕션 전 항상 부하 테스트 수행

3. **데이터 전송은 매우 불확실**
   - 추정은 일반적인 REST API 사용을 가정
   - 실제 사용량은 다음에 따라 달라짐:
     - 응답 페이로드 크기
     - 캐싱 전략 (CDN, Redis)
     - 압축 (gzip)
     - 정적 자산 (이미지, CSS, JS)
     - 사용자 행동 패턴
   - **배포 후 항상 실제 사용량 모니터링** 필요

4. **Simple 모드 메모리 계산**
   - OpenAI에게 모든 서비스 메모리 요구사항 합산 지시
   - OS + Docker용 30% 오버헤드 포함
   - 하지만 OpenAI가 항상 완벽하게 계산하지는 않을 수 있음
   - 워크로드에 맞는 추천인지 검증 필요

### 검증 체크리스트

추정을 신뢰하기 전:

1. EC2 추천 이유 확인 - 벤치마크를 인용하는가?
   - 좋음: "TechEmpower와 MySQL 문서 기반..."
   - 나쁨: "이 워크로드에 대한 일반적 추천"

2. Simple 배포에서 메모리가 합리적인가
   - Spring Boot (2GB) + MySQL (1GB) + Redis (256MB) ≈ 3.5GB
   - 최소 t3.medium (4GB RAM) 추천해야 함

3. 데이터 전송이 합리적인가?
   - 100명, low 트래픽 → 10GB는 그럴듯함
   - 100명, low 트래픽 → 500GB는 의심스러움

4. AWS Calculator와 비교
   - AWS Pricing Calculator로 두 번째 의견 확인
   - 우리 추정은 20-30% 범위 내여야 함

## 향후 개선 사항

### Prometheus 통합 (계획)

**개념**: 실제 런타임 메트릭을 사용하여 추정 검증 및 개선

```
[1단계: 초기 추정]
arfni-go estimate-cost → AWS에 배포

[2단계: 모니터링]
Prometheus + Node Exporter 배포
7-30일간 메트릭 수집:
  - 실제 CPU 사용률
  - 실제 메모리 사용량
  - 실제 네트워크 전송량 (GB)

[3단계: 최적화]
arfni-go optimize --prometheus-url http://localhost:9090
  - 벤치마크 추정 vs 실제 사용량 비교
  - 과도하게 프로비저닝된 리소스 식별
  - 적정 크기 조정 추천

출력:
  "초기 추정: t3.large ($67.74/월)
   실제 사용: CPU 40%, RAM 평균 3GB
   추천: t3.medium으로 다운그레이드 ($33.87/월)
   절감 가능: $33.87/월 (50%)"
```

**구현 방식:**
1. 새 커맨드: `arfni-go analyze-metrics`
2. Prometheus에서 node_cpu_seconds_total, node_memory_bytes, node_network_transmit_bytes_total 쿼리
3. 백분위수 계산 (p50, p95, p99)
4. 인스턴스 타입 용량과 비교
5. 최적화 추천

**이점:**
- 과도 프로비저닝 포착 (벤치마크 기반 추정에서 흔함)
- 정확한 데이터 전송 비용 (더 이상 불확실성 없음!)
- 지속적인 비용 최적화 피드백 루프

## 파일 구조

```
internal/pricing/
├── benchmarks.go              # 벤치마크 감지 및 포맷팅
├── benchmark_loader.go        # 임베디드 benchmarks.json 로드
├── openai.go                  # OpenAI API 통합
├── estimator.go               # 비용 계산 로직
├── types.go                   # 데이터 구조
├── data/
│   ├── benchmarks.json        # 검증된 성능 데이터
│   └── aws_pricing_kr.json    # AWS ap-northeast-2 가격
├── BENCHMARK_RESEARCH.md      # 벤치마크 출처 상세 (영문)
└── BENCHMARK_RESEARCH_ko.md   # 벤치마크 출처 상세 (한글)
```

## 기여하기

새 프레임워크 벤치마크 추가:

1. 검증된 출처 조사 (공식 문서, 벤치마크, 사례 연구)
2. `BENCHMARK_RESEARCH.md`에 문서화
3. `data/benchmarks.json`에 추가:
   ```json
   {
     "backends": {
       "new-framework": {
         "min_memory_mb": 512,
         "instances": {
           "t3.small": {
             "min_concurrent_users": 50,
             "max_concurrent_users": 150,
             "notes": "설명"
           }
         },
         "metadata": {
           "source": "데이터 출처",
           "confidence": "high/medium/low"
         }
       }
     }
   }
   ```
4. `benchmarks.go`의 감지 로직 업데이트

**품질 기준:**
- 블로그 게시물보다 공식 문서 우선
- "high" 신뢰도는 최소 2개 출처 필요
- 보수적으로 접근 (과대 약속보다 과소 약속이 나음)
- 모든 출처를 명확히 문서화

## 라이선스

메인 프로젝트 LICENSE 파일 참조.

## 지원

이슈나 질문:
- GitHub Issues: [프로젝트 저장소]
- 문서: 방법론은 `BENCHMARK_RESEARCH_ko.md` 참조
