# 데이터 업데이트 가이드

## 개요

이 문서는 Arfni 비용 예측 시스템에서 사용하는 데이터를 업데이트하는 방법을 설명합니다.

## 업데이트가 필요한 데이터

### 1. AWS 가격 데이터
**파일**: `BE/arfni/internal/pricing/data/aws-pricing.json`
**업데이트 주기**: 분기별 또는 AWS 가격 변경 시
**마지막 업데이트**: 2024-10-31

### 2. 벤치마크 데이터
**파일**: `BE/arfni/internal/pricing/data/benchmarks.json`
**업데이트 주기**: 반기별 또는 새로운 프레임워크/데이터베이스 추가 시
**마지막 업데이트**: 2025-01-15

---

## 1. AWS 가격 데이터 업데이트

### 1.1 현재 데이터 수집 방법

**수동 수집 (현재 방식)**:
1. AWS Pricing Calculator 또는 AWS 공식 가격 페이지 방문
2. ap-northeast-2 (서울) 리전 선택
3. 각 서비스별 가격 확인 및 기록

**출처 링크**:
- EC2 가격: https://aws.amazon.com/ec2/pricing/on-demand/
- RDS 가격: https://aws.amazon.com/rds/mysql/pricing/
- ElastiCache 가격: https://aws.amazon.com/elasticache/pricing/
- EBS 가격: https://aws.amazon.com/ebs/pricing/
- 데이터 전송: https://aws.amazon.com/ec2/pricing/on-demand/#Data_Transfer

### 1.2 JSON 파일 구조

```json
{
  "region": "ap-northeast-2",
  "region_name": "Seoul",
  "currency": "USD",
  "last_updated": "2024-10-31",
  "ec2": {
    "t3.micro": {
      "vcpu": 2,
      "memory_gb": 1,
      "storage_gb": "EBS Only",
      "price_per_hour": 0.0116,
      "price_per_month": 8.47,
      "description": "Burstable, ideal for low-traffic applications"
    }
  },
  "rds": {
    "db.t3.micro": {
      "vcpu": 2,
      "memory_gb": 1,
      "storage_gb": "EBS Only",
      "price_per_hour": 0.018,
      "price_per_month": 13.14,
      "description": "Burstable MySQL/PostgreSQL instance"
    }
  },
  "elasticache": {
    "cache.t3.micro": {
      "vcpu": 2,
      "memory_gb": 0.5,
      "price_per_hour": 0.017,
      "price_per_month": 12.41,
      "description": "Redis cache instance"
    }
  },
  "storage": {
    "ebs_gp3": {
      "price_per_gb_month": 0.088,
      "description": "General purpose SSD"
    }
  },
  "data_transfer": {
    "outbound_first_10tb": 0.126,
    "description": "Per GB for first 10 TB"
  },
  "load_balancer": {
    "alb": {
      "price_per_month_base": 22.27,
      "description": "Application Load Balancer base cost"
    }
  }
}
```

### 1.3 업데이트 절차

**Step 1**: AWS 가격 페이지에서 최신 가격 확인
```bash
# 주요 인스턴스 타입 확인
# EC2: t3.micro, t3.small, t3.medium, t3.large, t3.xlarge, m5.large, m5.xlarge
# RDS: db.t3.micro, db.t3.small, db.t3.medium, db.t3.large, db.m5.large, db.r5.large
# ElastiCache: cache.t3.micro, cache.t3.small, cache.t3.medium, cache.m5.large, cache.r5.large
```

**Step 2**: JSON 파일 수정
```bash
cd BE/arfni/internal/pricing/data
# 텍스트 에디터로 aws-pricing.json 수정
```

**Step 3**: last_updated 필드 갱신
```json
"last_updated": "2025-01-XX"
```

**Step 4**: 테스트
```bash
cd BE/arfni
go test ./internal/pricing/... -v
```

**Step 5**: estimate 명령 테스트
```bash
go run cmd/arfni-go/main.go estimate -f test-stack.yaml -users 100 -traffic medium -deployment simple
```

### 1.4 자동 수집 스크립트 (선택사항)

현재는 수동으로 수집하지만, 추후 자동화를 위한 Python 스크립트 예시:

```python
# scripts/fetch_aws_pricing.py (미구현)
import boto3
import json

def fetch_ec2_pricing(region='ap-northeast-2'):
    pricing = boto3.client('pricing', region_name='us-east-1')
    # AWS Pricing API 호출
    # ...
    return pricing_data

# 실행: python scripts/fetch_aws_pricing.py
```

**주의**: AWS Pricing API 사용 시 us-east-1 리전에서만 호출 가능합니다.

---

## 2. 벤치마크 데이터 업데이트

### 2.1 현재 데이터 수집 방법

**수동 연구 (현재 방식)**:
1. 공식 문서, Stack Overflow, TechEmpower, AWS 사례 연구 조사
2. 검증 가능한 출처에서 메모리 요구사항 및 성능 데이터 수집
3. BENCHMARK_RESEARCH.md 또는 BENCHMARK_RESEARCH_ko.md에 출처 기록
4. benchmarks.json에 데이터 입력

**참고 문서**:
- `BE/arfni/internal/pricing/BENCHMARK_RESEARCH.md` (영문)
- `BE/arfni/internal/pricing/BENCHMARK_RESEARCH_ko.md` (한글)

### 2.2 JSON 파일 구조

```json
{
  "last_updated": "2025-01-15",
  "data_source": "See BENCHMARK_RESEARCH.md for detailed sources and methodology",
  "backends": {
    "spring-boot": {
      "service_type": "backend",
      "min_memory_mb": 2048,
      "instances": {
        "t3.medium": {
          "min_concurrent_users": 150,
          "max_concurrent_users": 400,
          "avg_response_ms": 180,
          "notes": "Standard heap (2GB) + overhead - typical production baseline"
        }
      },
      "metadata": {
        "source": "Spring Boot documentation + Stack Overflow case studies",
        "confidence": "high",
        "last_verified": "2025-01-10"
      }
    }
  },
  "databases": {
    "mysql": {
      "service_type": "database",
      "min_memory_mb": 1024,
      "instances": {
        "t3.medium": {
          "min_concurrent_users": 200,
          "max_concurrent_users": 800,
          "notes": "MySQL 70-80% buffer pool rule (official docs)"
        }
      },
      "metadata": {
        "source": "MySQL 8.0 official documentation",
        "confidence": "high",
        "last_verified": "2025-01-10"
      }
    }
  }
}
```

### 2.3 업데이트 절차

**Step 1**: 새로운 프레임워크/데이터베이스 연구
1. 공식 문서에서 메모리 요구사항 확인
2. TechEmpower 벤치마크, Stack Overflow, AWS 사례 연구 조사
3. 검증 가능한 출처만 사용

**Step 2**: BENCHMARK_RESEARCH_ko.md 업데이트
```markdown
### X.X 새로운 프레임워크명

#### 출처 1: 공식 문서
**URL**: https://...
**구체적 데이터 포인트**:
- 최소 메모리: XXMB
...

#### 출처 2: TechEmpower Benchmarks
...
```

**Step 3**: benchmarks.json 수정
```bash
cd BE/arfni/internal/pricing/data
# 텍스트 에디터로 benchmarks.json 수정
```

**Step 4**: 신뢰도 레벨 설정
```json
"metadata": {
  "source": "출처 요약",
  "confidence": "high",  // high / medium / low
  "last_verified": "2025-01-15"
}
```

**Step 5**: last_updated 필드 갱신
```json
"last_updated": "2025-01-XX"
```

**Step 6**: 테스트
```bash
cd BE/arfni
go test ./internal/pricing/... -v
go run cmd/arfni-go/main.go estimate -f test-stack.yaml -users 100 -traffic medium -deployment simple
```

### 2.4 신뢰도 레벨 기준

| 레벨 | 기준 | 예시 |
|------|------|------|
| **high** | 공식 문서 또는 검증된 프로덕션 데이터 | Spring Boot 공식 문서의 메모리 요구사항 |
| **medium** | 신뢰할 수 있는 벤치마크 또는 사례 연구 | TechEmpower 벤치마크 결과 |
| **low** | 추정치 또는 간접적 데이터 | 유사 프레임워크 기반 추정 |

### 2.5 새로운 서비스 추가 예시

**Node.js + Express 추가**:

1. BENCHMARK_RESEARCH_ko.md에 연구 내용 추가
2. benchmarks.json에 데이터 추가:

```json
"nodejs": {
  "service_type": "backend",
  "min_memory_mb": 512,
  "instances": {
    "t3.micro": {
      "min_concurrent_users": 100,
      "max_concurrent_users": 300,
      "avg_response_ms": 50,
      "notes": "Node.js lightweight - good for I/O bound"
    }
  },
  "metadata": {
    "source": "TechEmpower + Node.js production reports",
    "confidence": "medium",
    "last_verified": "2025-01-15"
  }
}
```

3. benchmarks.go에 감지 로직 추가 (이미 구현됨):
```go
// 이미 구현되어 있음 (Line 27-31)
if strings.Contains(nameLower, "node") || strings.Contains(imageLower, "node") ||
    strings.Contains(nameLower, "express") {
    if benchmark, exists := db.Backends["nodejs"]; exists {
        return &benchmark, nil
    }
}
```

---

## 3. 데이터 검증

### 3.1 자동 테스트

```bash
cd BE/arfni
go test ./internal/pricing/... -v
```

### 3.2 수동 테스트

```bash
# estimate 명령 테스트
cd BE/arfni
export GMS_KEY=your-key  # 또는 set GMS_KEY=your-key (Windows)
go run cmd/arfni-go/main.go estimate -f test-stack.yaml -users 100 -traffic medium -deployment simple

# 출력 확인
# - Memory calculation 확인
# - OpenAI 추천 인스턴스 확인
# - 비용 계산 확인
```

### 3.3 검증 체크리스트

- [ ] AWS 가격이 실제 AWS 사이트와 일치하는가?
- [ ] 벤치마크 데이터에 출처가 명시되어 있는가?
- [ ] JSON 파일이 유효한 형식인가?
- [ ] last_updated 필드가 갱신되었는가?
- [ ] 테스트가 통과하는가?
- [ ] estimate 명령이 정상 작동하는가?

---

## 4. 버전 관리

### 4.1 Git 커밋 메시지 예시

```bash
# AWS 가격 업데이트
git add internal/pricing/data/aws-pricing.json
git commit -m "chore: Update AWS pricing data for ap-northeast-2 (2025-01-15)"

# 벤치마크 데이터 업데이트
git add internal/pricing/data/benchmarks.json
git add internal/pricing/BENCHMARK_RESEARCH_ko.md
git commit -m "feat: Add Django/Flask benchmark data with TechEmpower sources"
```

### 4.2 변경 내역 기록

중요한 변경사항은 CHANGELOG.md에 기록:

```markdown
## [1.1.0] - 2025-01-15
### Updated
- AWS pricing data updated for ap-northeast-2 region
- EC2 t3.xlarge price changed from $135.00 to $135.49
- Added Django/Flask benchmarks with TechEmpower sources
```

---

## 5. 추후 자동화 계획

### 5.1 AWS 가격 자동 수집 (미구현)

```python
# scripts/fetch_aws_pricing.py
# AWS Pricing API를 사용하여 자동으로 가격 정보 수집
# 실행: python scripts/fetch_aws_pricing.py --region ap-northeast-2
```

**구현 계획**:
- AWS Pricing API 사용
- boto3 라이브러리 활용
- 월 1회 자동 실행 (GitHub Actions)

### 5.2 벤치마크 데이터 검증 (미구현)

```python
# scripts/validate_benchmarks.py
# 벤치마크 데이터의 일관성 검증
# - 메모리 요구사항이 합리적인가?
# - 용량 추정치가 인스턴스 스펙과 맞는가?
```

---

## 6. 문의 및 기여

데이터 업데이트에 대한 질문이나 새로운 벤치마크 출처를 발견한 경우:
1. GitHub Issue 생성
2. 출처 링크와 함께 제안
3. Pull Request 제출

---

## 부록: 주요 출처 링크

### AWS 공식 문서
- EC2 가격: https://aws.amazon.com/ec2/pricing/
- RDS 가격: https://aws.amazon.com/rds/pricing/
- ElastiCache 가격: https://aws.amazon.com/elasticache/pricing/

### 벤치마크 출처
- TechEmpower: https://www.techempower.com/benchmarks/
- Spring Boot 문서: https://docs.spring.io/spring-boot/
- MySQL 공식 문서: https://dev.mysql.com/doc/
- Redis 공식 문서: https://redis.io/docs/

### Stack Overflow 참고
- Spring Boot 메모리: https://stackoverflow.com/questions/68430695/
- Node.js 성능: https://stackoverflow.com/questions/tagged/node.js+performance
