package pricing

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"sort"
	"strings"
)

// OpenAIClient handles OpenAI API calls
type OpenAIClient struct {
	APIKey   string
	Model    string
	BaseURL  string
	Provider string // "gms" or "openai"
}

// NewOpenAIClient creates a new OpenAI client
// Supports both GMS (SSAFY proxy) and direct OpenAI API
// Priority: GMS_KEY -> OPENAI_API_KEY
// Override with OPENAI_PROVIDER env var (gms/openai/auto)
func NewOpenAIClient() *OpenAIClient {
	provider := os.Getenv("OPENAI_PROVIDER")
	if provider == "" {
		provider = "auto"
	}

	var apiKey, baseURL, selectedProvider string

	// Auto-detect or use specified provider
	switch provider {
	case "gms":
		apiKey = os.Getenv("GMS_KEY")
		baseURL = "https://gms.ssafy.io/gmsapi/api.openai.com/v1/chat/completions"
		selectedProvider = "gms"
	case "openai":
		apiKey = os.Getenv("OPENAI_API_KEY")
		baseURL = "https://api.openai.com/v1/chat/completions"
		selectedProvider = "openai"
	case "auto":
		fallthrough
	default:
		// Try GMS first, fallback to OpenAI
		apiKey = os.Getenv("GMS_KEY")
		if apiKey != "" {
			baseURL = "https://gms.ssafy.io/gmsapi/api.openai.com/v1/chat/completions"
			selectedProvider = "gms"
		} else {
			apiKey = os.Getenv("OPENAI_API_KEY")
			baseURL = "https://api.openai.com/v1/chat/completions"
			selectedProvider = "openai"
		}
	}

	return &OpenAIClient{
		APIKey:   apiKey,
		Model:    "gpt-4o",
		BaseURL:  baseURL,
		Provider: selectedProvider,
	}
}

// formatEC2InstanceList formats EC2 instances for the prompt
// Returns a formatted string with instance specs and prices
func formatEC2InstanceList(pricing *AWSPricing, deploymentType string) string {
	if pricing == nil || pricing.EC2 == nil {
		return "No instances available"
	}

	// Get instance names and sort them
	instanceNames := make([]string, 0, len(pricing.EC2))
	for name := range pricing.EC2 {
		instanceNames = append(instanceNames, name)
	}
	sort.Strings(instanceNames)

	if deploymentType == "simple" {
		// Docker deployment - detailed format with prices
		var sb strings.Builder
		for _, name := range instanceNames {
			inst := pricing.EC2[name]
			sb.WriteString(fmt.Sprintf("- %s: %d vCPU, %.0fGB RAM ($%.2f/month)\n",
				name, inst.VCPU, inst.MemoryGB, inst.PricePerMonth))
		}
		return strings.TrimSuffix(sb.String(), "\n")
	} else {
		// Production mode - compact format with just names
		return strings.Join(instanceNames, ", ")
	}
}

// formatRDSInstanceList formats RDS instances for the prompt
func formatRDSInstanceList(pricing *AWSPricing) string {
	if pricing == nil || pricing.RDS == nil {
		return "No instances available"
	}

	instanceNames := make([]string, 0, len(pricing.RDS))
	for name := range pricing.RDS {
		instanceNames = append(instanceNames, name)
	}
	sort.Strings(instanceNames)
	return strings.Join(instanceNames, ", ")
}

// formatCacheInstanceList formats ElastiCache instances for the prompt
func formatCacheInstanceList(pricing *AWSPricing) string {
	if pricing == nil || pricing.ElastiCache == nil {
		return "No instances available"
	}

	instanceNames := make([]string, 0, len(pricing.ElastiCache))
	for name := range pricing.ElastiCache {
		instanceNames = append(instanceNames, name)
	}
	sort.Strings(instanceNames)
	return strings.Join(instanceNames, ", ")
}

// OpenAIRequest structure for API calls
type OpenAIRequest struct {
	Model       string          `json:"model"`
	Messages    []OpenAIMessage `json:"messages"`
	Temperature float64         `json:"temperature"`
}

type OpenAIMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type OpenAIResponse struct {
	Choices []struct {
		Message struct {
			Content string `json:"content"`
		} `json:"message"`
	} `json:"choices"`
}

// GetResourceRecommendation calls OpenAI to get AWS resource recommendations
func (c *OpenAIClient) GetResourceRecommendation(req CostEstimationRequest, minRequiredMemoryMB int) (*ResourceRecommendation, error) {
	if c.APIKey == "" {
		if c.Provider == "gms" {
			return nil, fmt.Errorf("GMS_KEY environment variable not set")
		}
		return nil, fmt.Errorf("OPENAI_API_KEY environment variable not set")
	}

	// Load pricing database for instance availability
	pricing, err := GetPricingDB()
	if err != nil {
		return nil, fmt.Errorf("failed to load pricing database: %w", err)
	}

	prompt := c.buildPrompt(req, minRequiredMemoryMB, req.Language)
	systemPrompt := c.buildSystemPrompt(req.DeploymentType, pricing, req.Language)

	openAIReq := OpenAIRequest{
		Model: c.Model,
		Messages: []OpenAIMessage{
			{
				Role:    "system",
				Content: systemPrompt,
			},
			{
				Role:    "user",
				Content: prompt,
			},
		},
		Temperature: 0.3,
	}

	jsonData, err := json.Marshal(openAIReq)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	httpReq, err := http.NewRequest("POST", c.BaseURL, bytes.NewBuffer(jsonData))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+c.APIKey)

	client := &http.Client{}
	resp, err := client.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("failed to call OpenAI API: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("OpenAI API error (status %d): %s", resp.StatusCode, string(body))
	}

	var openAIResp OpenAIResponse
	if err := json.Unmarshal(body, &openAIResp); err != nil {
		return nil, fmt.Errorf("failed to parse OpenAI response: %w", err)
	}

	if len(openAIResp.Choices) == 0 {
		return nil, fmt.Errorf("no response from OpenAI")
	}

	content := openAIResp.Choices[0].Message.Content

	// Extract JSON from markdown code blocks if present
	content = strings.TrimPrefix(content, "```json\n")
	content = strings.TrimPrefix(content, "```\n")
	content = strings.TrimSuffix(content, "\n```")
	content = strings.TrimSpace(content)

	var recommendation ResourceRecommendation
	if err := json.Unmarshal([]byte(content), &recommendation); err != nil {
		return nil, fmt.Errorf("failed to parse recommendation JSON: %w\nContent: %s", err, content)
	}

	return &recommendation, nil
}

// buildSystemPrompt creates system prompt based on deployment type
func (c *OpenAIClient) buildSystemPrompt(deploymentType string, pricing *AWSPricing, language string) string {
	// Determine language directive - make it very strong and clear
	languageDirective := `CRITICAL LANGUAGE REQUIREMENT:
- You MUST respond in English language ONLY.
- ALL text fields (reason, description, warnings, optimization_tips) MUST be in English.
- Even if you see Korean examples below, YOU MUST respond in English.
- This is a strict requirement. Do NOT mix languages.`
	if language == "ko" {
		languageDirective = `CRITICAL LANGUAGE REQUIREMENT (중요 언어 요구사항):
- 반드시 한국어로만 답변해야 합니다.
- 모든 텍스트 필드 (reason, description, warnings, optimization_tips)는 한국어로 작성해야 합니다.
- 아래 영어 예제가 있더라도 반드시 한국어로 답변하세요.
- 이것은 엄격한 요구사항입니다. 언어를 섞지 마세요.`
	}

	// Generate dynamic instance list from pricing database
	ec2InstanceList := formatEC2InstanceList(pricing, deploymentType)
	if deploymentType == "simple" {
		return languageDirective + `

You are an AWS infrastructure expert. The user wants to run ALL services as Docker containers on a SINGLE EC2 instance.

IMPORTANT:
- Respond ONLY with valid JSON. No additional text before or after.
- If a tier has no warnings, use empty array: "warnings": []
- Never use null for array fields. Always use [] for empty arrays.

CRITICAL: The user prompt will include BENCHMARK DATA from verified public sources (TechEmpower, Stack Overflow, AWS case studies, official documentation).
This includes VERIFIED memory requirements and ESTIMATED capacity ranges derived from verified data.

HOW TO USE BENCHMARK DATA:
- Confidence HIGH: Trust this data as primary reference, but validate basic reasonability
- Confidence MEDIUM: Use as reference, apply your judgment for edge cases
- Confidence LOW: Use as rough guideline only

SANITY CHECK REQUIRED:
If benchmark data contradicts fundamental principles (e.g., t3.micro with 1GB RAM supporting 5000 Spring Boot users),
prioritize reasonability over benchmark data and explain the discrepancy in your reason.
Example: "Benchmark suggests X, but this seems unreasonable because [reason]. Recommending Y instead."

CRITICAL LIMITATION - Single Instance Deployment:
- ALL services run as Docker containers on ONE EC2 instance
- Maximum realistic capacity: 3,000-5,000 concurrent users
- Largest reasonable instance: t3.2xlarge (32GB RAM) or m5.2xlarge
- If user count exceeds 5,000: ADD CRITICAL WARNING that single instance is insufficient

IF USER COUNT > 5,000:
Add critical warning about single server limitations to all tiers.

Never pretend a single server can handle 10,000+ users. Be honest about architectural limitations.

Provide THREE pricing tiers using this EXACT JSON format:
{
  "budget": {
    "ec2_instances": [{"type": "t3.large", "count": 1, "reason": "Detailed 4-6 sentence explanation in English"}],
    "rds_instances": [],
    "elasticache": [],
    "storage": {"type": "gp3", "size_gb": 50, "reason": "Storage reasoning"},
    "load_balancer": false,
    "data_transfer": {"estimated_gb": 100, "reason": "Data transfer estimate with WARNING"},
    "description": "Budget tier description in English",
    "warnings": ["Warning text in English"]
  },
  "recommended": {
    "ec2_instances": [{"type": "t3.xlarge", "count": 1, "reason": "Detailed 4-6 sentence explanation in English"}],
    "rds_instances": [],
    "elasticache": [],
    "storage": {"type": "gp3", "size_gb": 100, "reason": "Storage reasoning"},
    "load_balancer": false,
    "data_transfer": {"estimated_gb": 150, "reason": "Data transfer estimate"},
    "description": "Recommended tier description in English",
    "warnings": []
  },
  "performance": {
    "ec2_instances": [{"type": "m5.large", "count": 1, "reason": "Detailed 4-6 sentence explanation in English"}],
    "rds_instances": [],
    "elasticache": [],
    "storage": {"type": "gp3", "size_gb": 200, "reason": "Storage reasoning"},
    "load_balancer": false,
    "data_transfer": {"estimated_gb": 200, "reason": "Data transfer estimate"},
    "description": "Performance tier description in English",
    "warnings": []
  },
  "optimization_tips": ["Tip 1 in English", "Tip 2 in English", "Tip 3 in English", "Tip 4 in English", "Tip 5 in English"]
}

⚠️ CRITICAL - OPTIMIZATION TIPS (STACK-SPECIFIC):
Generate 3-5 SPECIFIC optimization tips based on the user's actual stack composition.
DO NOT use generic tips. Analyze the services list and provide actionable advice.

Examples by service type:
- MySQL/PostgreSQL: "InnoDB 버퍼 풀 크기를 RAM의 70-80%로 설정", "Slow query 로그 모니터링 및 인덱스 최적화", "Connection pool 크기 조정 (max_connections)"
- Redis: "maxmemory-policy 설정 (allkeys-lru 권장)", "불필요한 키에 TTL 설정으로 메모리 절약", "RDB 스냅샷 주기 조정"
- Spring Boot/Java: "JVM 힙 메모리 명시적 설정 (-Xmx, -Xms)", "불필요한 Spring Boot 자동 설정 비활성화", "로깅 프레임워크 비동기 설정"
- Node.js/Express: "PM2 클러스터 모드로 CPU 코어 활용", "메모리 누수 모니터링 (heapdump)", "정적 파일 캐싱 활성화"
- React/Next.js: "빌드 결과물 gzip 압축", "이미지 최적화 및 lazy loading", "불필요한 라이브러리 제거 (bundle size 감소)"
- Python/FastAPI: "Gunicorn worker 수 조정 (2*CPU+1)", "uvloop 활성화로 성능 향상", "Pydantic 모델 캐싱"
- MongoDB: "인덱스 생성 및 쿼리 최적화", "Connection pool 크기 설정", "Oplog 크기 조정"
- RabbitMQ: "메시지 TTL 설정", "Dead letter queue 구성", "Prefetch count 조정"

IMPORTANT:
- Provide 3-5 tips (not just 2)
- Each tip must be SPECIFIC to the services in the user's stack
- Include actual configuration names/values when possible
- Mix performance, cost, and operational tips

CRITICAL INSTRUCTIONS FOR EXPLANATIONS:
- "reason" field: 구체적인 수치와 벤치마크 데이터를 인용하여 왜 이 인스턴스를 선택했는지 설명
- "description" field: 사용자 관점에서 이 구성이 어떤 장점/단점이 있는지 명확히 설명
- Use ACTUAL user count and memory requirements from the analysis, not placeholder "XXX"
- Cite benchmark sources when available (e.g., "Stack Overflow 프로덕션 데이터에 따르면...")
- Make descriptions SPECIFIC to the user's workload, not generic statements

⚠️ CRITICAL - MINIMUM MEMORY REQUIREMENT (NEVER VIOLATE):
The user prompt includes "최소 메모리 요구사항 (계산됨): X MB (X.X GB)".
ALL THREE TIERS **MUST** meet or exceed this minimum memory requirement.
If you recommend an instance below this requirement, the application WILL CRASH with OOM errors.

BEFORE recommending ANY instance, verify:
- Instance RAM in MB >= Minimum required MB
- Example: If minimum is 4,326MB, t3.medium (4,096MB) is REJECTED, t3.large (8,192MB) is minimum

TIER GUIDELINES:
- Budget: Minimum viable instance that meets minimum memory requirement. If this is the smallest reasonable option, add warnings about monitoring needs and limited headroom. Can use smaller storage.
- Recommended: Balanced instance with safety margin. 30-50% larger than Budget if possible, OR same instance with more storage/better config and NO warnings.
- Performance: High-end instance. 50-100% larger capacity than Recommended for traffic spikes and growth.

DIFFERENTIATION STRATEGY:
PREFERRED: Use different instance sizes when reasonable
- Budget: Smallest instance that meets minimum memory requirements
- Recommended: One size larger for 30-50% safety margin
- Performance: Two sizes larger for traffic spikes

IF same instance is appropriate for multiple tiers (e.g., minimum memory requirement already needs t3.large):
1. **Be honest**: Explain in "reason" why all tiers need this instance
2. **Differentiate through**:
   - Storage size: Budget 50GB, Recommended 100GB, Performance 200GB
   - Warnings: Budget has warnings about tight fit, others don't
   - Description: Clearly explain the difference in operational safety
3. **Price difference explanation**: Must clearly state what causes price difference (storage, data transfer)

CRITICAL - If using same instance type:
- Budget "reason": "MySQL (1024MB) + Spring (2048MB) + PostgreSQL (512MB) + React (200MB) + OS/Docker (30% overhead) = 총 5.8GB 필요. t3.large (8GB RAM) 필수. 스토리지 50GB, 데이터 전송 100GB로 최소 구성."
- Recommended "reason": "Budget과 동일한 t3.large (8GB RAM)이지만 차별화: 스토리지 2배 (100GB vs 50GB)로 로그 장기 보관 가능, 데이터 전송 50% 증가 (150GB vs 100GB)로 트래픽 변동 대응. 월 $10.70 추가 비용으로 운영 안정성 대폭 향상."
- Performance "reason": "t3.xlarge (16GB RAM)로 업그레이드하여 메모리 2배 확보. 트래픽 급증 시에도 안정적. 스토리지 200GB, 데이터 전송 200GB로 장기 운영 대비."

Never lie about instance sizes. If t3.large is minimum, say so honestly.

ALWAYS explain differences clearly:
- If same instance: Explain storage/transfer differences and operational benefits
- If different instance: Explain why larger instance is needed (memory, CPU, capacity)

⚠️ CRITICAL FOR REASON FIELD - ALL THREE TIERS MUST BE 4-6 SENTENCES LONG:
The "reason" field is THE MOST IMPORTANT field. Users need detailed justification.
**Budget, Recommended, Performance 모두 동일한 길이와 상세도로 작성해야 합니다.**

MANDATORY COMPONENTS FOR ALL TIERS (ALL MUST BE INCLUDED):
1. SPECIFIC memory calculation with EXACT numbers from services:
   "MySQL (1024MB) + Spring Boot (2048MB) + PostgreSQL (512MB) + Python (256MB) + OS/Docker (30% overhead) = 총 4,326MB 필요"

2. Instance selection justification with comparison:
   "t3.medium (4GB = 4,096MB)는 메모리가 230MB 부족하므로 불가능. t3.large (8GB = 8,192MB) 선택."

3. OPERATIONAL STABILITY ASSESSMENT (MANDATORY - NO USER COUNT ESTIMATION):
   Instead of estimating user count, explain operational characteristics:
   - Budget: "메모리 헤드룸 약 10-20%. 트래픽 급증 시 위험. 지속적 모니터링 필수."
   - Recommended: "메모리 헤드룸 약 40-60%. 일상적 트래픽 변동 안정적 대응 가능. 운영 여유 확보."
   - Performance: "메모리 헤드룸 약 80-100%. 트래픽 급증, 향후 서비스 추가, 데이터 증가에 대비 가능."

4. Benchmark source citation (if used):
   "Stack Overflow 프로덕션 사례와 TechEmpower 벤치마크 데이터 참고"

EXAMPLE FULL REASONS (FOLLOW THESE FORMATS):

Budget tier example:
"MySQL (1024MB) + Spring Boot (2048MB) + PostgreSQL (512MB) + Python (256MB) + OS/Docker 오버헤드 (30%) = 총 4,326MB 메모리 필요. t3.medium (4GB = 4,096MB)는 메모리 부족으로 불가능하므로 t3.large (8GB = 8,192MB) 선택. 메모리 헤드룸 약 15% (1.3GB 여유)로 최소 구성. 평상시 운영은 가능하나 트래픽 급증 시 메모리 부족 위험 존재. 지속적 모니터링과 알람 설정 필수. 스토리지 50GB, 데이터 전송 100GB로 최소 비용 구성."

Recommended tier example:
"Budget tier와 동일한 메모리 계산 (4,326MB 필요)이나 t3.xlarge (16GB = 16,384MB)로 업그레이드. 메모리 헤드룸 약 60% (약 10GB 여유)로 일상적 트래픽 변동과 일시적 부하 증가에 안정적 대응 가능. Docker 컨테이너 재시작, 로그 누적, 캐시 증가 등 실제 운영 상황에서 발생하는 메모리 변동 흡수 가능. 스토리지 100GB, 데이터 전송 150GB로 장기 운영 고려. Spring Boot 벤치마크 데이터에서 충분한 처리 능력 확인."

Performance tier example:
"t3.xlarge 대비 m5.xlarge (16GB)로 변경하여 버스트 크레딧 제한 없는 안정적 CPU 성능 확보. 동일한 RAM이나 m5는 지속적 고부하에 적합. 메모리 헤드룸은 Recommended와 동일하나 CPU 여유로 데이터베이스 쿼리 처리, API 응답 속도 개선. 스토리지 200GB, 데이터 전송 200GB로 향후 서비스 확장 대비. 트래픽 급증 시에도 성능 저하 없이 안정적 운영 가능."

LENGTH REQUIREMENT FOR ALL TIERS:
- Minimum 4 sentences, ideally 5-6 sentences
- Budget, Recommended, Performance 모두 동일한 상세도
- Short reasons (1-2 sentences) will be rejected

IMPORTANT: Budget tier warnings should be about OPERATIONAL concerns (monitoring needs, limited headroom), NOT false claims about memory/traffic capacity if the instance is actually sufficient.

RULES:
- Recommend ONLY ONE EC2 instance (count must be 1)
- Consider TOTAL resources needed for ALL containers (CPU, RAM for all services combined)
- USE THE BENCHMARK DATA provided in the user prompt as PRIMARY reference
- If benchmark shows "t3.medium: 150-400 users" and user needs 300 users, recommend t3.medium (not larger)
- Add 30% memory headroom for OS + Docker overhead (mentioned in benchmark research)
- rds_instances MUST be empty array []
- elasticache MUST be empty array []
- load_balancer MUST be false (not needed for single instance)
- CITE the benchmark source in your reason (e.g., "Based on Stack Overflow production reports...")

DATA TRANSFER ESTIMATION (HIGH UNCERTAINTY):
- Estimate monthly outbound data transfer in GB based on user count and traffic level
- Assume typical REST API usage (5-10KB per response) unless services suggest otherwise
- Your estimate is HIGHLY UNCERTAIN - always include a warning in the reason
- Example reason: "~100GB/month assuming typical API usage. WARNING: Actual usage varies greatly based on response sizes, caching, and user behavior. Monitor actual usage."

⚠️ CRITICAL - AVAILABLE EC2 INSTANCES:
You MUST choose from the instances listed below. If you need an instance not in this list, explicitly state this in the warnings.
DO NOT make up instance types or prices.

Available EC2 instance types:
` + ec2InstanceList
	}

	// Production mode (default)
	// Create example JSON based on language
	var exampleJSON string
	if language == "ko" {
		exampleJSON = `{
  "budget": {
    "ec2_instances": [{"type": "instance-type", "count": 1, "reason": "한국어 설명"}],
    "rds_instances": [{"type": "instance-type", "count": 1, "reason": "한국어 설명"}],
    "elasticache": [{"type": "instance-type", "count": 1, "reason": "한국어 설명"}],
    "storage": {"type": "gp3", "size_gb": 100, "reason": "한국어 설명"},
    "load_balancer": true,
    "data_transfer": {"estimated_gb": 100, "reason": "한국어 설명 (경고 포함)"},
    "description": "비용 최적화 구성 - 최소 리소스",
    "warnings": ["버스트 용량 제한", "리소스 사용량 주의 깊게 모니터링 필요"]
  },
  "recommended": {...},
  "performance": {...},
  "optimization_tips": ["최적화 팁1", "최적화 팁2"]
}`
	} else {
		exampleJSON = `{
  "budget": {
    "ec2_instances": [{"type": "instance-type", "count": 1, "reason": "English explanation"}],
    "rds_instances": [{"type": "instance-type", "count": 1, "reason": "English explanation"}],
    "elasticache": [{"type": "instance-type", "count": 1, "reason": "English explanation"}],
    "storage": {"type": "gp3", "size_gb": 100, "reason": "English explanation"},
    "load_balancer": true,
    "data_transfer": {"estimated_gb": 100, "reason": "English explanation (with warning)"},
    "description": "Cost-optimized configuration - minimal resources",
    "warnings": ["Burst capacity limitation", "Resource usage requires careful monitoring"]
  },
  "recommended": {...},
  "performance": {...},
  "optimization_tips": ["Optimization tip 1", "Optimization tip 2"]
}`
	}

	return languageDirective + `

You are an AWS infrastructure expert. Based on user requirements, recommend appropriate AWS resources using AWS managed services.

IMPORTANT:
- Respond ONLY with valid JSON. No additional text before or after.
- If a tier has no warnings, use empty array: "warnings": []
- Never use null for array fields. Always use [] for empty arrays.

CRITICAL: The user prompt will include BENCHMARK DATA from verified public sources (TechEmpower, Stack Overflow, AWS case studies, official documentation).
This includes VERIFIED memory requirements and ESTIMATED capacity ranges derived from verified data.

HOW TO USE BENCHMARK DATA:
- Confidence HIGH: Trust this data as primary reference, but validate basic reasonability
- Confidence MEDIUM: Use as reference, apply your judgment for edge cases
- Confidence LOW: Use as rough guideline only

SANITY CHECK REQUIRED:
If benchmark data contradicts fundamental principles (e.g., t3.micro with 1GB RAM supporting 5000 Spring Boot users),
prioritize reasonability over benchmark data and explain the discrepancy in your reason.
Example: "Benchmark suggests X, but this seems unreasonable because [reason]. Recommending Y instead."

Provide THREE pricing tiers using this EXACT format:

` + exampleJSON + `

⚠️ CRITICAL - OPTIMIZATION TIPS (STACK-SPECIFIC):
Generate 3-5 SPECIFIC optimization tips based on the user's actual stack composition.
DO NOT use generic tips. Analyze the services list and provide actionable advice.

Examples by service type:
- RDS (MySQL/PostgreSQL): "Multi-AZ 구성으로 가용성 향상", "Read Replica 추가로 읽기 부하 분산", "파라미터 그룹 최적화 (innodb_buffer_pool_size)", "자동 백업 보관 기간 조정"
- ElastiCache (Redis): "클러스터 모드 활성화로 샤딩", "Redis 버전 업그레이드로 성능 개선", "예약 인스턴스로 비용 절감", "Snapshot 주기 조정"
- EC2: "CloudWatch 알람 설정으로 리소스 모니터링", "Auto Scaling 그룹 구성", "예약 인스턴스 또는 Savings Plans로 비용 절감", "EBS 볼륨 타입 최적화 (gp3 vs io2)"
- Load Balancer: "Connection draining 설정", "Health check 주기 최적화", "Access 로그 활성화", "Sticky session 설정"
- General AWS: "CloudWatch 메트릭 활용한 우선순위 모니터링", "VPC 엔드포인트로 데이터 전송 비용 절감", "S3 Lifecycle 정책으로 오래된 로그 아카이빙"

IMPORTANT:
- Provide 3-5 tips (not just 2)
- Each tip must be SPECIFIC to the services in the user's stack
- Include AWS-specific features and best practices
- Mix performance, cost, and operational tips
- For production mode, focus on managed service features (RDS, ElastiCache, Auto Scaling, etc.)

TIER GUIDELINES:
- Budget: Minimum viable resources, t3 burstable instances
- Recommended: Comfortable headroom, balanced performance and cost
- Performance: High availability, potential multi-instance, m5/c5/r5 instances

RULES:
- USE THE BENCHMARK DATA provided in the user prompt as PRIMARY reference
- If benchmark shows capacity ranges, match user count to appropriate instance size
- CITE the benchmark source in your reason (e.g., "Based on MySQL official docs 70% buffer pool rule...")
- If no benchmark data for a service, use general knowledge but note lower confidence

DATA TRANSFER ESTIMATION (HIGH UNCERTAINTY):
- Estimate monthly outbound data transfer in GB based on user count and traffic level
- Assume typical REST API usage (5-10KB per response) unless services suggest otherwise
- Your estimate is HIGHLY UNCERTAIN - always include a warning in the reason
- Example reason: "~200GB/month assuming typical API usage. WARNING: Actual usage varies greatly based on response sizes, caching, and user behavior. Monitor actual usage."

⚠️ CRITICAL - AVAILABLE INSTANCES:
You MUST choose from the instances listed below. If you need an instance not in this list, explicitly state this in the warnings.
DO NOT make up instance types or prices.

Available EC2 instance types:
` + ec2InstanceList + `

RDS: ` + formatRDSInstanceList(pricing) + `
ElastiCache: ` + formatCacheInstanceList(pricing) + `

Consider:
- t3 instances for burstable workloads (development, low-medium traffic)
- m5 instances for balanced production workloads
- c5 instances for CPU-intensive applications
- r5 instances for memory-intensive applications
- Storage: gp3 for most workloads, io2 for high IOPS requirements
- Use managed RDS for databases (better reliability, backups, scaling)
- Use ElastiCache for Redis/Memcached (managed, high availability)`
}

// buildPrompt creates a prompt for OpenAI based on user requirements
// Includes benchmark data when available to improve recommendation accuracy
func (c *OpenAIClient) buildPrompt(req CostEstimationRequest, minRequiredMemoryMB int, language string) string {
	var servicesList []string
	var servicesDetail []string
	for _, svc := range req.Services {
		servicesList = append(servicesList, fmt.Sprintf("- %s (%s)", svc.Name, svc.Type))

		// Add service details
		detail := fmt.Sprintf("  • %s (%s)", svc.Name, svc.Type)
		if svc.Image != "" {
			detail += fmt.Sprintf(" - Image: %s", svc.Image)
		}
		if svc.Build != "" {
			detail += fmt.Sprintf(" - Build: %s", svc.Build)
		}
		servicesDetail = append(servicesDetail, detail)
	}

	var deploymentMode string
	if req.DeploymentType == "simple" {
		if language == "ko" {
			deploymentMode = "Docker All-in-One (모든 서비스가 하나의 EC2에서 Docker 컨테이너로 실행)"
		} else {
			deploymentMode = "Docker All-in-One (All services run as Docker containers on a single EC2 instance)"
		}
	} else {
		if language == "ko" {
			deploymentMode = "production (AWS managed services)"
		} else {
			deploymentMode = "production (AWS managed services)"
		}
	}

	// Build benchmark context from verified data
	benchmarkContext := BuildBenchmarkContext(req.Services)

	// Calculate per-service memory and build detailed breakdown
	memoryBreakdown := ""
	if req.DeploymentType == "simple" && minRequiredMemoryMB > 0 {
		if language == "ko" {
			memoryBreakdown = fmt.Sprintf(`
═══════════════════════════════════════════════════
최소 메모리 요구사항 (계산됨)
═══════════════════════════════════════════════════

총 필요 메모리: %d MB (%.1f GB)

이는 OS/Docker 오버헤드 30%%를 포함한 계산입니다.

CRITICAL: Budget tier는 최소 %.1f GB RAM 이상 인스턴스를 사용해야 합니다.
- t3.small (2GB): %.1f GB < 2GB이면 가능, 아니면 부족
- t3.medium (4GB): %.1f GB < 4GB이면 가능, 아니면 부족
- t3.large (8GB): %.1f GB < 8GB이면 가능, 아니면 부족
- t3.xlarge (16GB): %.1f GB < 16GB이면 항상 가능

인스턴스 선택 시 이 메모리 요구사항을 **반드시** 충족해야 합니다.

`,
				minRequiredMemoryMB,
				float64(minRequiredMemoryMB)/1024,
				float64(minRequiredMemoryMB)/1024,
				float64(minRequiredMemoryMB)/1024,
				float64(minRequiredMemoryMB)/1024,
				float64(minRequiredMemoryMB)/1024)
		} else {
			memoryBreakdown = fmt.Sprintf(`
═══════════════════════════════════════════════════
Minimum Memory Requirements (Calculated)
═══════════════════════════════════════════════════

Total Required Memory: %d MB (%.1f GB)

This includes 30%% overhead for OS/Docker.

CRITICAL: Budget tier must use instances with at least %.1f GB RAM.
- t3.small (2GB): Sufficient if %.1f GB < 2GB, otherwise insufficient
- t3.medium (4GB): Sufficient if %.1f GB < 4GB, otherwise insufficient
- t3.large (8GB): Sufficient if %.1f GB < 8GB, otherwise insufficient
- t3.xlarge (16GB): Always sufficient if %.1f GB < 16GB

Instance selection MUST meet this memory requirement.

`,
				minRequiredMemoryMB,
				float64(minRequiredMemoryMB)/1024,
				float64(minRequiredMemoryMB)/1024,
				float64(minRequiredMemoryMB)/1024,
				float64(minRequiredMemoryMB)/1024,
				float64(minRequiredMemoryMB)/1024)
		}
	}

	var prompt string
	if language == "ko" {
		prompt = fmt.Sprintf(`
다음 서비스 구성을 AWS %s 리전에 배포해야 합니다:

%s

배포 방식: %s
%s
═══════════════════════════════════════════════════
검증된 벤치마크 데이터 (Verified Production Cases)
═══════════════════════════════════════════════════

%s

═══════════════════════════════════════════════════
요청사항
═══════════════════════════════════════════════════

위 서비스 구성과 벤치마크 데이터를 기반으로 3가지 티어로 AWS 인스턴스를 추천해주세요:

1. **Budget Tier**: 최소 메모리 요구사항을 충족하는 가장 작은 인스턴스
   - 운영 안정성: 최소 유지 (메모리 헤드룸 10-20%%)
   - 특징: 평상시 운영 가능하나 트래픽 급증 시 위험
   - 경고사항 포함 (모니터링 필수, 여유 공간 제한적)

2. **Recommended Tier**: Budget보다 1단계 큰 인스턴스 (가능하면)
   - 운영 안정성: 적정 유지 (메모리 헤드룸 40-60%%)
   - 특징: 일상적 트래픽 변동 안정적 대응, 운영 여유 확보
   - 안정적 장기 운영 가능

3. **Performance Tier**: Recommended보다 1-2단계 큰 인스턴스
   - 운영 안정성: 여유 운영 (메모리 헤드룸 80-100%%)
   - 특징: 트래픽 급증, 향후 서비스 추가, 데이터 증가 대비
   - 고성능 안정적 운영

중요 지침:
- **사용자 수 추정 금지**: 검증 불가능하므로 인원 수는 절대 언급하지 말 것
- **운영 관점 설명**: 메모리 헤드룸, 트래픽 대응력, 안정성으로 설명
- 검증된 벤치마크 데이터가 있으면 **출처와 함께 인용**
- **reason 필드 모두 4-6문장**: Budget, Recommended, Performance 모두 동일한 상세도

JSON만 응답하세요 (추가 텍스트 없이).
`,
			req.Region,
			strings.Join(servicesDetail, "\n"),
			deploymentMode,
			memoryBreakdown,
			benchmarkContext,
		)
	} else {
		prompt = fmt.Sprintf(`
Deploy the following service configuration to AWS %s region:

%s

Deployment method: %s
%s
═══════════════════════════════════════════════════
Verified Benchmark Data (Verified Production Cases)
═══════════════════════════════════════════════════

%s

═══════════════════════════════════════════════════
Requirements
═══════════════════════════════════════════════════

Based on the service configuration and benchmark data above, recommend AWS instances in 3 tiers:

1. **Budget Tier**: Smallest instance that meets minimum memory requirements
   - Operational stability: Minimum (memory headroom 10-20%%)
   - Characteristics: Suitable for normal operations but risky during traffic spikes
   - Include warnings (monitoring required, limited headroom)

2. **Recommended Tier**: One tier larger than Budget (if possible)
   - Operational stability: Adequate (memory headroom 40-60%%)
   - Characteristics: Handles daily traffic variations stably, operational buffer secured
   - Stable long-term operation

3. **Performance Tier**: 1-2 tiers larger than Recommended
   - Operational stability: Comfortable (memory headroom 80-100%%)
   - Characteristics: Prepared for traffic spikes, future service additions, data growth
   - High-performance stable operation

Important guidelines:
- **NO user count estimation**: Do not mention user counts as they cannot be verified
- **Operational perspective**: Explain in terms of memory headroom, traffic handling capability, stability
- If verified benchmark data exists, **cite the source**
- **All reason fields must be 4-6 sentences**: Budget, Recommended, Performance all with equal detail

Respond with JSON only (no additional text).
`,
			req.Region,
			strings.Join(servicesDetail, "\n"),
			deploymentMode,
			memoryBreakdown,
			benchmarkContext,
		)
	}

	return prompt
}
