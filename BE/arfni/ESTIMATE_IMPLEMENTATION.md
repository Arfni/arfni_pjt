# Cost Estimation 구현 히스토리

## 초기 설계 (문제점 발견 전)

### 사용자 입력 방식
- 예상 사용자 수 입력 (100명, 500명, 1000명 등)
- 트래픽 레벨 선택 (Low/Medium/High)
- AI가 이를 기반으로 인스턴스 추천

### 발견된 문제
1. 사용자는 정확한 사용자 수를 모름
2. AI가 "500명 처리 가능"이라고 단정하면 신뢰도 하락
3. 실제로는 검증 불가능한 추정치

---

## 1차 수정: 사용자 입력 제거

### 변경 사항
- AIDialog.tsx: expectedUsers, expectedTraffic state 제거
- pricing.rs: estimate_cost 파라미터에서 제거
- types.go: CostEstimationRequest 구조체에서 필드 제거
- main.go: CLI 플래그 제거

### 목표
stack.yaml만 분석하여 자동으로 추천

---

## 2차 수정: 벤치마크 데이터 정리

### 문제
- 초기 프롬프트에 "50-150명", "150-500명" 같은 범위 하드코딩
- 이는 결국 하드코딩된 규칙

### 해결
BENCHMARK_RESEARCH.md 작성:
- 8개 verified production cases 수집
- 각 케이스마다 출처 URL 명시
- verified vs estimate 명확히 구분

benchmarks.json에 verified_production_cases 섹션 추가:
- mysql_30_to_300_users (Stack Overflow)
- mysql_3000_users_failed (DBA Stack Exchange)
- postgresql_300_connections (Medium)
- postgresql_docker (Medium)
- spring_boot_1000_users (AWS case study)
- spring_boot_100_users (AWS case study)
- spring_boot_docker (Medium)
- mysql_docker (Stack Overflow)

### 접근 방식
프롬프트에 하드코딩하지 않고, 8개 케이스를 OpenAI에게 전달하여 GPT가 추론하도록 변경

---

## 3차 수정: 인원 추정 제거

### 문제
AI가 여전히 "200-800명 동시 사용자 처리 예상" 같은 검증 불가능한 추정 제공

### 해결
인원 추정 완전 제거, 운영 안정성 관점으로 변경:
- Budget: 메모리 헤드룸 10-20%, 트래픽 급증 시 위험
- Recommended: 메모리 헤드룸 40-60%, 일상적 트래픽 변동 대응 가능
- Performance: 메모리 헤드룸 80-100%, 트래픽 급증 및 향후 확장 대비

### 프롬프트 수정
openai.go에 "사용자 수 추정 금지" 명시적 지시 추가

---

## 4차 수정: reason 필드 상세화 강제

### 문제
Budget tier만 4-6문장으로 상세하고, Recommended/Performance는 1-2문장으로 짧음

### 해결
프롬프트에 "ALL THREE TIERS MUST BE 4-6 SENTENCES LONG" 명시

reason 필드 필수 구성 요소:
1. 구체적 메모리 계산 (MySQL 1024MB + Spring 2048MB + ...)
2. 인스턴스 선택 근거 (왜 이 인스턴스인지 비교)
3. 운영 안정성 평가 (메모리 헤드룸 % 기반)
4. 벤치마크 출처 인용 (있는 경우)

각 tier별 example 제공하여 GPT가 따라하도록 유도

---

## 5차 수정: EC2 인스턴스 데이터베이스 확장 (352개 인스턴스)

### 문제
- aws-pricing.json에 9개 인스턴스만 포함 (t3.micro~xlarge, m5.large~xlarge)
- AI가 t3.2xlarge를 추천했지만 pricing 데이터에 없어서 비용 계산 $0 오류
- 하드코딩된 인스턴스 목록이 프롬프트에 고정

### 해결 방법
1. **데이터 수집**: aws_crawling.json (354개 인스턴스 크롤링 데이터)
2. **변환 스크립트**: scripts/convert_pricing.py 작성
   - 한글 텍스트 파싱 (GiB, EBS 전용 등)
   - 6줄 per instance 구조 파싱
   - 월 비용 계산 (시간당 * 730)
   - 인스턴스 family별 description 자동 생성
3. **실행**: 352개 인스턴스를 aws-pricing.json에 추가
   - t4g (7개), c4~c8 (97개), m4~m8 (102개), g3~g6 (42개), p2~p5 (6개) 등

### 코드 변경
**openai.go 추가 함수:**
```go
func formatEC2InstanceList(pricing *AWSPricing, deploymentType string) string
func formatRDSInstanceList(pricing *AWSPricing) string
func formatCacheInstanceList(pricing *AWSPricing) string
```

**동적 인스턴스 목록 생성:**
- buildSystemPrompt()가 pricing database를 파라미터로 받음
- 하드코딩된 인스턴스 리스트 제거
- 실제 데이터베이스에서 동적으로 생성하여 프롬프트에 포함
- Simple 모드: 상세 정보 (vCPU, RAM, 가격)
- Production 모드: 인스턴스 이름만 나열

**AI 지시사항 추가:**
```
⚠️ CRITICAL - AVAILABLE EC2 INSTANCES:
You MUST choose from the instances listed below.
If you need an instance not in this list, explicitly state this in the warnings.
DO NOT make up instance types or prices.
```

### 효과
- ✅ 352개 인스턴스에서 선택 가능
- ✅ t3.2xlarge, c5.4xlarge, m5.8xlarge 등 다양한 크기 지원
- ✅ GPU 인스턴스 (g4dn, g5, p3 등) 추천 가능
- ✅ 최신 세대 인스턴스 (c8g, m8g 등) 지원
- ✅ Pricing 데이터 자동 동기화

---

## 6차 수정: Optimization Tips 스택별 맞춤 생성

### 문제
- optimization_tips가 항상 고정된 2개 팁만 제공
- "컨테이너 메모리 제한 설정", "로그 레벨 낮추기" 반복
- 사용자 스택과 무관한 일반적 조언

### 해결
프롬프트에 스택별 최적화 팁 지시사항 추가:

**Simple 모드 (Docker All-in-One):**
- MySQL/PostgreSQL: InnoDB 버퍼 풀 설정, Slow query 로그, Connection pool
- Redis: maxmemory-policy, TTL 설정, RDB 스냅샷
- Spring Boot/Java: JVM 힙 메모리, 자동 설정 비활성화, 비동기 로깅
- Node.js: PM2 클러스터, 메모리 누수 모니터링, 정적 파일 캐싱
- Python: Gunicorn worker 수, uvloop, Pydantic 캐싱
- React/Next.js: gzip 압축, 이미지 최적화, bundle size 감소

**Production 모드 (AWS Managed Services):**
- RDS: Multi-AZ, Read Replica, 파라미터 그룹 최적화
- ElastiCache: 클러스터 모드, 버전 업그레이드, 예약 인스턴스
- EC2: CloudWatch 알람, Auto Scaling, Savings Plans
- Load Balancer: Connection draining, Health check, Sticky session
- General AWS: VPC 엔드포인트, S3 Lifecycle, CloudWatch 메트릭

**지시사항:**
```
⚠️ CRITICAL - OPTIMIZATION TIPS (STACK-SPECIFIC):
Generate 3-5 SPECIFIC optimization tips based on the user's actual stack composition.
DO NOT use generic tips. Analyze the services list and provide actionable advice.
```

### 효과
- ✅ 실제 스택에 맞는 3-5개 팁 생성
- ✅ 구체적인 설정 이름/값 포함 (예: maxmemory-policy, -Xmx)
- ✅ 성능, 비용, 운영 팁 혼합
- ✅ 매번 다른 유용한 팁 제공

---

## 현재 로직

### 1. 최소 메모리 계산 (estimator.go:254-293)
```
입력: stack.yaml의 서비스 목록
↓
각 서비스를 benchmarks.json에서 매칭
  - Spring Boot: 2048MB (verified)
  - MySQL: 1024MB (verified)
  - PostgreSQL: 512MB (verified)
  - Redis: 256MB (verified)
↓
합산 + 30% overhead (OS/Docker - 추정치)
↓
출력: 최소 필요 메모리 (예: 4,326MB)
```

### 2. OpenAI 추천 요청 (openai.go:91-169)
```
입력:
  - 서비스 목록
  - 최소 메모리 요구사항
  - 8개 verified production cases
  - 시스템 프롬프트 (추천 방법론)
↓
OpenAI 분석
↓
출력:
  {
    "budget": {"ec2_instances": [{"type": "t3.large", ...}], ...},
    "recommended": {"ec2_instances": [{"type": "t3.xlarge", ...}], ...},
    "performance": {"ec2_instances": [{"type": "m5.xlarge", ...}], ...}
  }
```

### 3. 가격 계산 (estimator.go:59-216)
```
입력: OpenAI가 추천한 인스턴스 이름
↓
pricing.json에서 서울 리전 가격 조회
  - EC2 instance 월 비용
  - Storage (gp3) GB당 비용
  - Data transfer GB당 비용
↓
합산 계산
↓
출력: 3개 tier별 상세 비용 breakdown
```

### 4. 검증 및 경고
최소 메모리 미달 시 warning 추가:
```go
if instanceMemoryMB < minRequiredMemoryMB {
    breakdown.Warnings = append(breakdown.Warnings,
        "CRITICAL ERROR: ... WILL CAUSE OOM ERRORS. AI recommendation is incorrect.")
}
```

---

## 차별점

### 실제로 제공하는 가치
1. 자동 stack.yaml 파싱 (사용자가 서비스 나열할 필요 없음)
2. 8개 verified production cases 제공 (사용자가 검색할 필요 없음)
3. 최소 메모리 guardrail (OOM 방지 경고)
4. 서울 리전 정확한 가격 계산 (OpenAI는 2023-2024 낡은 정보)
5. 3 tier 구조화된 비교

### ChatGPT 직접 사용 대비
사용자가 ChatGPT에 직접 물어보면:
- stack.yaml 내용 복사 필요
- 8개 케이스 찾아서 입력 필요
- 서울 리전 가격 직접 조회 필요
- 최소 메모리 계산 직접 수행 필요

우리 서비스:
- 버튼 한 번 클릭
- 자동으로 모든 정보 수집 및 제공

---

## 한계 및 추정치

### 추정치 (verified 아님)
1. 30% OS/Docker overhead
   - 일반적 관측치 기반 추정
   - 공식 출처 없음
   - 실제 15-40% 범위에서 변동

2. 운영 안정성 평가
   - "메모리 헤드룸 40-60%면 안정적" 등
   - 실제 워크로드에 따라 다름
   - GPT의 일반적 추론

3. Data transfer 예상
   - "월 100GB 예상" 등
   - 실제 사용량은 크게 다를 수 있음
   - 프롬프트에 "HIGH UNCERTAINTY" 명시

### Verified 부분
1. 각 서비스 최소 메모리
   - Spring Boot 2GB (Stack Overflow verified)
   - MySQL 1GB (MySQL 8.0 official docs)
   - PostgreSQL 512MB (PostgreSQL Wiki)

2. 서울 리전 가격
   - pricing.json 정기 업데이트
   - AWS 공식 가격 기반

---

## 파일 구조

```
BE/arfni/internal/pricing/
├── types.go              # 데이터 구조 정의
├── estimator.go          # 최소 메모리 계산 + 가격 계산
├── openai.go             # OpenAI 호출 + 프롬프트 구성
├── benchmarks.go         # 벤치마크 데이터 로딩 및 매칭
├── pricing.go            # AWS 가격 데이터 로딩
├── BENCHMARK_RESEARCH.md # 벤치마크 출처 문서
└── data/
    ├── benchmarks.json   # 8개 verified cases + 서비스별 메모리
    └── pricing.json      # 서울 리전 AWS 가격

arfni-gui/src/widgets/toolbar/ui/dialogs/
└── AIDialog.tsx          # 프론트엔드 UI

arfni-gui/src-tauri/src/commands/
└── pricing.rs            # Rust-Go 브릿지
```

---

## 사용 흐름

1. 사용자가 "Analyze Project & Recommend Server" 버튼 클릭
2. AIDialog.tsx → invoke('estimate_cost', {stackPath})
3. pricing.rs → arfni-go.exe estimate-cost 실행
4. main.go → stack.yaml 파싱 → estimator.EstimateCost 호출
5. estimator.go → calculateMinimumMemory 계산
6. openai.go → GetResourceRecommendation 호출 (OpenAI API)
7. estimator.go → calculateTierCost (3개 tier 가격 계산)
8. 결과 JSON 반환 → AIDialog.tsx 표시

---

## 검증 방법

테스트 실행:
```bash
cd BE/arfni
go build -o bin/arfni-go.exe ./cmd/arfni-go
bin/arfni-go.exe estimate-cost -f path/to/stack.yaml
```

확인 사항:
- Budget/Recommended/Performance reason 필드 모두 4-6문장
- 사용자 수 추정 없음
- 메모리 헤드룸 % 기반 설명
- 최소 메모리 미달 시 CRITICAL ERROR 경고
- 가격 계산 정확성 (pricing.json 기준)
