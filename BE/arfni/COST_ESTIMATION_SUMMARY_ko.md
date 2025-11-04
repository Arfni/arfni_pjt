# Arfni 비용 최적화 시스템 - 요약

## 빠른 개요

**검증된 벤치마크 데이터**와 **AI 분석**을 결합한 AWS 비용 추정 및 최적화 시스템.

## 전체 파이프라인

```
Canvas/Stack.yaml → 사전 비용 예측 (estimate) → EC2 배포 (deploy)
                                                        ↓
                                                  모니터링 시작 (monitor)
                                                        ↓
                                                  사후 최적화 분석 (optimize)
```

### 각 단계 설명

1. **사전 비용 예측 (estimate)**: stack.yaml의 서비스 구성과 벤치마크 데이터를 분석하여 배포 전 예상 비용을 계산합니다.
2. **EC2 배포 (deploy)**: 분석된 구성을 기반으로 서비스를 EC2 인스턴스에 배포합니다.
3. **모니터링 시작 (monitor)**: SSH 터널을 통해 Prometheus/Grafana 연결을 구성하고 실시간 리소스 사용량을 수집합니다.
4. **사후 최적화 분석 (optimize)**: Prometheus에 수집된 실제 사용량 데이터를 분석하여 비용 절감 방안을 제시합니다.

각 단계는 독립적으로 실행 가능하며, estimate는 배포 전 언제든지 실행할 수 있고, optimize는 모니터링이 실행 중일 때만 사용 가능합니다.

## 시스템별 상세 흐름

### 1. 비용 예측 시스템 (estimate) - 배포 전

```
사용자 입력 (stack.yaml + 사용자 수 + 트래픽)
  ↓
서비스 감지 (spring → spring-boot, mysql → mysql)
  ↓
벤치마크 데이터 매칭
  - 있음: benchmarks.json에서 해당 아키텍처 전체 로드
  - 없음: 기본값 사용 (backend 1GB, database 1GB, cache 256MB)
  ↓
메모리 요구사항 계산
  - 각 서비스 최소 메모리 합산
  - +30% 오버헤드 (OS + Docker)
  - 예: spring(2048MB) + mysql(1024MB) + python(256MB) = 3328MB → 4326MB
  ↓
OpenAI 프롬프트 생성
  - 벤치마크 전체 데이터 (메모리, 용량 추정, 출처, 신뢰도)
  - 계산된 메모리 제약 ("최소 4.2GB 필요")
  - AWS 가격 데이터는 포함 안 함 (OpenAI는 인스턴스 타입만 추천)
  ↓
OpenAI API 호출 (gpt-4o-mini)
  - 3단계 티어 추천 받음 (Budget/Recommended/Performance)
  - 각 티어별 인스턴스 타입, 스토리지, 로드밸런서 추천
  ↓
비용 계산 (우리 코드에서 수행)
  - OpenAI가 추천한 인스턴스 타입 → aws_pricing_ap-northeast-2.json 조회
  - EC2, RDS, ElastiCache, Storage, Data Transfer 비용 계산
  - 3개 티어별 월간 총 비용 산출
  ↓
출력
  - 3단계 티어 + 세부 내역 + 경고 + 최적화 팁
  - JSON 형태로도 출력 (GUI 연동용)
```

### 2. 최적화 분석 시스템 (optimize) - 배포 후

```
사전 조건: 모니터링 시스템 실행 중 (Prometheus 데이터 수집 중)
  ↓
Prometheus 메트릭 수집 (prometheus.go)
  - CPU 사용률: avg(rate(node_cpu_seconds_total[5m]))
  - 메모리 사용량: node_memory 관련 메트릭
  - 디스크 사용량: node_filesystem 관련 메트릭
  - 네트워크 트래픽: increase(node_network_*_bytes_total[24h])
  - 인스턴스 타입: node_exporter 라벨에서 추출 (가능한 경우)
  ↓
실제 사용량 분석 (optimizer.go)
  - 병목 현상 감지 (CPU >80%, Memory >85%, Disk >90%)
  - 상태 판단 (healthy/warning/critical)
  - 현재 비용 계산 (인스턴스 타입 알 경우)
  ↓
규칙 기반 권장사항 생성
  - 과도한 리소스: 다운사이징 권장
  - 부족한 리소스: 업그레이드 권장
  - 데이터 전송 비용: 실제 사용량 기반 재계산
  ↓
AI 권장사항 생성 (선택적)
  - 실제 메트릭 → OpenAI 프롬프트
  - 구체적 최적화 방안 요청
  - 우선순위/카테고리/영향도/절감액 포함
  ↓
출력
  - 실제 리소스 사용량
  - 성능 분석 (병목, 상태)
  - 권장사항 (우선순위별 정렬)
  - 예상 비용 절감액
  - JSON 리포트
```

### 두 시스템의 차이점

| 구분 | estimate (사전 예측) | optimize (사후 분석) |
|------|---------------------|---------------------|
| 실행 시점 | 배포 전 언제든지 | 배포 후 (모니터링 실행 중) |
| 데이터 소스 | benchmarks.json | Prometheus 실제 메트릭 |
| 목적 | 예상 비용 산출 | 실제 사용량 기반 최적화 |
| OpenAI 역할 | 인스턴스 추천 (3단계) | 최적화 권장사항 |
| 출력 | 3개 티어 + 비용 | 실제 사용량 + 권장사항 |

## 검증된 것 vs 추정치

| 항목 | 상태 | 출처 |
|------|------|------|
| Spring Boot 최소 2GB heap | 검증됨 | Stack Overflow + 공식 문서 |
| MySQL 70-80% buffer pool | 검증됨 | MySQL 8.0 공식 문서 |
| Redis 80% 사용 가능 메모리 | 검증됨 | Redis 공식 문서 |
| "t3.medium: 150-400명 지원" | 추정치 | 검증된 데이터 + TechEmpower로부터 유도 |
| 데이터 전송량 | 추정치 | OpenAI 추정 + 경고 포함 |

## 주요 기능

### 1. 벤치마크 기반 추천
- 메모리 요구사항: 공식 문서에서 검증됨
- 용량 추정: 검증된 데이터 + 성능 벤치마크로부터 계산
- 신뢰도 레벨: High/Medium/Low 명확히 표시

### 2. AI 안전 장치
- LLM에게 벤치마크 데이터의 합리성 검증 지시
- 데이터가 기본 원칙과 모순되면 (예: 1GB RAM에서 5GB 워크로드 지원) LLM이 거부해야 함
- 예시: "벤치마크는 X를 제안하지만 [이유]로 비합리적. 대신 Y 추천."

### 3. 투명한 불확실성
- 데이터 전송 비용에 명시적 경고 포함
- 추정치는 사실이 아닌 추정치로 명확히 표시
- 사용자에게 실제 사용량 모니터링 권장

## 예시 출력

```
입력: 100명, medium 트래픽, simple 배포
서비스: spring (2048MB) + mysql (1024MB) + python (256MB)

메모리 계산:
- spring: 2048MB
- mysql: 1024MB
- python: 256MB
- 30% 오버헤드: 998MB
- 총 필요: 4326MB (4.2GB)

벤치마크 데이터:
- Spring Boot: 최소 2GB (검증됨)
- MySQL: 최소 1GB (검증됨)
- Python: 최소 256MB (검증됨)

OpenAI 분석 (3단계 티어):

Budget 티어: t3.large (8GB) - $89.14/월
- EC2: $67.74/월
- Storage: $8.80/월
- Data Transfer: $12.60/월
- 설명: 최소 필요 구성, 리소스 여유 부족
- 경고: 메모리 압박 가능, 트래픽 급증 시 제한적

Recommended 티어: t3.large (8GB) - $89.14/월
- EC2: $67.74/월
- Storage: $8.80/월
- Data Transfer: $12.60/월
- 설명: 균형잡힌 구성, 여유 공간 확보

Performance 티어: t3.xlarge (16GB) - $161.29/월
- EC2: $135.49/월
- Storage: $13.20/월
- Data Transfer: $12.60/월
- 설명: 고성능 구성, 충분한 리소스
```

## 안전 장치 테스트 결과

### 테스트 1: 의도적으로 잘못된 벤치마크
**테스트**: 의도적으로 잘못된 벤치마크 (t3.micro: 1000-5000명 지원)
**입력**: 300명
**예상**: LLM이 t3.micro 거부해야 함 (1GB RAM만 있음)
**결과**: 통과 - LLM이 t3.micro 무시, 메모리 계산으로 t3.medium 추천
**결론**: 안전 장치 작동함

### 테스트 2: OpenAI 메모리 부족 추천 (2024년 말 수정)
**문제**: OpenAI가 4.2GB 메모리 요구사항에 t3.small (2GB) 추천
**원인**: 프롬프트에 명시적인 메모리 제약 조건 누락
**해결**:
- `openai.go`: 프롬프트에 "CRITICAL REQUIREMENT: 최소 X GB RAM 필요" 추가
- `estimator.go`: 추천 결과 검증 로직 추가 (경고만, 자동 수정 없음)

**테스트 결과** (test13 stack):
- 입력: spring (2048MB) + mysql (1024MB) + python (256MB) + 30% 오버헤드 = 4.2GB
- Budget 티어: t3.large (8GB) ✓ 정상
- Recommended 티어: t3.large (8GB) ✓ 정상
- Performance 티어: t3.xlarge (16GB) ✓ 정상
**결론**: OpenAI가 메모리 제약을 준수하여 적절한 인스턴스 추천

## 파일 구조

```
BE/arfni/
├── cmd/
│   ├── arfni-go/
│   │   └── main.go                    # CLI 진입점 (estimate, deploy, monitor, optimize)
│   └── arfni-monitoring/
│       └── main.go                    # 모니터링 시스템 런처
├── internal/pricing/
│   ├── data/
│   │   ├── benchmarks.json            # 검증된 메모리 + 추정된 용량
│   │   └── aws_pricing_ap-northeast-2.json  # AWS 서울 리전 가격
│   ├── benchmarks.go                  # 서비스 감지, 프롬프트 포맷팅
│   ├── benchmark_loader.go            # 임베디드 벤치마크 JSON 로드
│   ├── openai.go                      # 프롬프트 생성, OpenAI API 호출
│   ├── estimator.go                   # 비용 예측 로직 (메모리 검증 포함)
│   ├── optimizer.go                   # 최적화 분석 로직
│   ├── prometheus.go                  # Prometheus 클라이언트
│   └── types.go                       # 데이터 구조
├── monitoring/
│   └── docker-compose.yml             # Grafana/Prometheus 설정
└── test-*.bat                         # 테스트 배치 파일

문서:
├── COST_OPTIMIZATION_SYSTEM.md        # 전체 시스템 기술 문서 (영문)
├── README_COST_ESTIMATION.md          # 비용 예측 상세 문서 (영문)
├── README_COST_ESTIMATION_ko.md       # 비용 예측 상세 문서 (한글)
├── COST_ESTIMATION_SUMMARY.md         # 빠른 참조 (영문)
├── COST_ESTIMATION_SUMMARY_ko.md      # 빠른 참조 (한글)
├── BENCHMARK_RESEARCH.md              # 상세 출처 (영문)
└── BENCHMARK_RESEARCH_ko.md           # 상세 출처 (한글)
```

## 현재 한계점

1. **사용자 수 모호성**: 시스템은 동시 접속자로 가정, DAU/MAU 아님
2. **데이터 전송 불확실성**: 변동성 높음, 24시간 데이터 기반으로 월간 비용 추정
3. **용량 추정치**: 직접 측정 안 됨, 여러 출처로부터 유도
4. **리전 제한**: 현재 ap-northeast-2 (서울 리전)만 지원

## 완료된 기능

1. ✓ **Prometheus 통합**: 실제 메트릭 수집 및 최적화 분석 (optimize 명령)
2. ✓ **메모리 검증**: Simple 모드 메모리 계산 및 검증 로직 추가
3. ✓ **모니터링 시스템**: SSH 터널 기반 Grafana/Prometheus 통합
4. ✓ **사후 최적화**: 실제 사용량 기반 비용 절감 권장사항 제공

## 빠른 시작

### 1. 사전 비용 예측
```bash
# Simple 배포 (모두 하나의 EC2에)
set GMS_KEY=your-key
./arfni-go.exe estimate \
  -f stack.yaml \
  -users 300 \
  -traffic medium \
  -deployment simple

# Production 배포 (AWS 관리형 서비스)
./arfni-go.exe estimate \
  -f stack.yaml \
  -users 1000 \
  -traffic high \
  -deployment production
```

### 2. EC2 배포
```bash
./arfni-go.exe deploy -f stack.yaml
```

### 3. 모니터링 시작
```bash
./arfni-go.exe monitor -f stack.yaml
# Grafana: http://localhost:3000
# Prometheus: http://localhost:9090 (hybrid 모드)
```

### 4. 사후 최적화 분석
```bash
# 모니터링이 실행 중이어야 함
set GMS_KEY=your-key
./arfni-go.exe optimize -prometheus http://localhost:9090
```

### 테스트 배치 파일
```bash
# test13 스택 비용 예측 테스트
cd BE/arfni
test-estimate-test13.bat

# test13 스택 최적화 분석 테스트 (모니터링 필요)
test-optimize-test13.bat

# 전체 테스트 (estimate + optimize)
test-all-test13.bat
```

## GUI 환경에서의 실행

GUI에서는 배치 파일 없이 `arfni-go.exe`를 직접 호출합니다. 모든 명령은 `GMS_KEY` 환경변수가 필요합니다.

### 1. Estimate (비용 예측)

```bash
arfni-go.exe estimate -f <경로> -users <수> -traffic <레벨> -deployment <타입>
```

**필수 파라미터:**
- `-f`: stack.yaml 파일 경로
- `-users`: 예상 사용자 수
- `-traffic`: `low` / `medium` / `high`
- `-deployment`: `simple` / `production`
- `GMS_KEY`: 환경변수

### 2. Optimize (실시간 최적화)

```bash
arfni-go.exe optimize -prometheus <URL>
```

**필수 파라미터:**
- `-prometheus`: Prometheus 서버 URL (예: `http://localhost:9090`)
- `GMS_KEY`: 환경변수

**사전 조건:** 모니터링 시스템이 실행 중이어야 함

### 3. Monitor (모니터링 시작)

```bash
arfni-go.exe monitor -f <경로>
```

**필수 파라미터:**
- `-f`: stack.yaml 파일 경로
- `GMS_KEY`: 환경변수

### 환경변수 설정 예시

**JavaScript (Node.js):**
```javascript
const { spawn } = require('child_process');

const process = spawn('arfni-go.exe', [
  'estimate', '-f', 'stack.yaml',
  '-users', '100', '-traffic', 'medium', '-deployment', 'simple'
], {
  env: { ...process.env, GMS_KEY: 'your-key' }
});
```

**Python:**
```python
import subprocess
import os

env = os.environ.copy()
env['GMS_KEY'] = 'your-key'

subprocess.run([
    'arfni-go.exe', 'estimate',
    '-f', 'stack.yaml',
    '-users', '100',
    '-traffic', 'medium',
    '-deployment', 'simple'
], env=env)
```

## 핵심 요약

1. **100% 정확하지 않음**, 하지만 검증된 것과 추정치를 투명하게 구분
2. **AI에 안전 장치 있음** - 비합리적인 벤치마크 데이터 포착 가능, 메모리 제약 준수
3. **데이터 전송은 불확실** - 항상 실제 사용량 모니터링 필요
4. **사전 예측 + 사후 최적화** - estimate로 배포 전 예측, optimize로 배포 후 실제 사용량 분석
5. **Prometheus 통합 완료** - 실제 메트릭 수집 및 비용 최적화 권장사항 제공
