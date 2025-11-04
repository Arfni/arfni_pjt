package pricing

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
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
		Model:    "gpt-4o-mini",
		BaseURL:  baseURL,
		Provider: selectedProvider,
	}
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

	prompt := c.buildPrompt(req, minRequiredMemoryMB)
	systemPrompt := c.buildSystemPrompt(req.DeploymentType)

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
func (c *OpenAIClient) buildSystemPrompt(deploymentType string) string {
	if deploymentType == "simple" {
		return `You are an AWS infrastructure expert. The user wants to run ALL services as Docker containers on a SINGLE EC2 instance.

IMPORTANT:
- Respond ONLY with valid JSON. No additional text before or after.
- Respond in Korean language (한국어로 답변). All text fields (reason, description, warnings, optimization_tips) must be in Korean.

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

Deployment Architecture: ALL services (backend, database, cache) will run as Docker containers on ONE EC2 instance.

Provide THREE pricing tiers using this EXACT format:
{
  "budget": {
    "ec2_instances": [{"type": "instance-type", "count": 1, "reason": "한국어 설명"}],
    "rds_instances": [],
    "elasticache": [],
    "storage": {"type": "gp3", "size_gb": 100, "reason": "한국어 설명"},
    "load_balancer": false,
    "data_transfer": {"estimated_gb": 100, "reason": "한국어 설명 (경고 포함)"},
    "description": "최소 구성 - 리소스 여유 부족",
    "warnings": ["메모리 부족 가능성", "트래픽 급증 시 대응 어려움"]
  },
  "recommended": {
    "ec2_instances": [{"type": "instance-type", "count": 1, "reason": "한국어 설명"}],
    "rds_instances": [],
    "elasticache": [],
    "storage": {"type": "gp3", "size_gb": 100, "reason": "한국어 설명"},
    "load_balancer": false,
    "data_transfer": {"estimated_gb": 100, "reason": "한국어 설명 (경고 포함)"},
    "description": "균형 잡힌 구성 - 적절한 여유 확보",
    "warnings": []
  },
  "performance": {
    "ec2_instances": [{"type": "instance-type", "count": 1, "reason": "한국어 설명"}],
    "rds_instances": [],
    "elasticache": [],
    "storage": {"type": "gp3", "size_gb": 150, "reason": "한국어 설명"},
    "load_balancer": false,
    "data_transfer": {"estimated_gb": 100, "reason": "한국어 설명 (경고 포함)"},
    "description": "고성능 구성 - 충분한 리소스 확보",
    "warnings": []
  },
  "optimization_tips": ["최적화 팁1", "최적화 팁2"]
}

TIER GUIDELINES:
- Budget: Minimum instance that technically meets memory requirements (may be risky)
- Recommended: Instance with 30-50% headroom for stability
- Performance: Instance with 100%+ headroom for traffic spikes and future growth

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

Available EC2 instance types:
- t3.micro: 2 vCPU, 1GB RAM ($8.47/month)
- t3.small: 2 vCPU, 2GB RAM ($16.94/month)
- t3.medium: 2 vCPU, 4GB RAM ($33.87/month)
- t3.large: 2 vCPU, 8GB RAM ($67.74/month)
- t3.xlarge: 4 vCPU, 16GB RAM ($135.49/month)
- m5.large: 2 vCPU, 8GB RAM ($78.11/month)
- m5.xlarge: 4 vCPU, 16GB RAM ($156.22/month)`
	}

	// Production mode (default)
	return `You are an AWS infrastructure expert. Based on user requirements, recommend appropriate AWS resources using AWS managed services.

IMPORTANT:
- Respond ONLY with valid JSON. No additional text before or after.
- Respond in Korean language (한국어로 답변). All text fields (reason, description, warnings, optimization_tips) must be in Korean.

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

{
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
  "recommended": {
    "ec2_instances": [{"type": "instance-type", "count": 1, "reason": "한국어 설명"}],
    "rds_instances": [{"type": "instance-type", "count": 1, "reason": "한국어 설명"}],
    "elasticache": [{"type": "instance-type", "count": 1, "reason": "한국어 설명"}],
    "storage": {"type": "gp3", "size_gb": 100, "reason": "한국어 설명"},
    "load_balancer": true,
    "data_transfer": {"estimated_gb": 150, "reason": "한국어 설명 (경고 포함)"},
    "description": "균형 잡힌 프로덕션 구성 - 안전 마진 확보",
    "warnings": []
  },
  "performance": {
    "ec2_instances": [{"type": "instance-type", "count": 2, "reason": "한국어 설명"}],
    "rds_instances": [{"type": "instance-type", "count": 1, "reason": "한국어 설명"}],
    "elasticache": [{"type": "instance-type", "count": 1, "reason": "한국어 설명"}],
    "storage": {"type": "gp3", "size_gb": 200, "reason": "한국어 설명"},
    "load_balancer": true,
    "data_transfer": {"estimated_gb": 200, "reason": "한국어 설명 (경고 포함)"},
    "description": "고가용성 프로덕션 - 중복성 확보",
    "warnings": []
  },
  "optimization_tips": ["최적화 팁1", "최적화 팁2"]
}

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

Available instance types:
EC2: t3.micro, t3.small, t3.medium, t3.large, t3.xlarge, m5.large, m5.xlarge, c5.large, r5.large
RDS: db.t3.micro, db.t3.small, db.t3.medium, db.t3.large, db.m5.large, db.r5.large
ElastiCache: cache.t3.micro, cache.t3.small, cache.t3.medium, cache.m5.large, cache.r5.large

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
func (c *OpenAIClient) buildPrompt(req CostEstimationRequest, minRequiredMemoryMB int) string {
	var servicesList []string
	for _, svc := range req.Services {
		servicesList = append(servicesList, fmt.Sprintf("- %s (%s)", svc.Name, svc.Type))
	}

	deploymentMode := "production (AWS managed services)"
	if req.DeploymentType == "simple" {
		deploymentMode = "simple (all services as Docker containers on single EC2)"
	}

	// Build benchmark context from verified data
	benchmarkContext := BuildBenchmarkContext(req.Services)

	// Add minimum memory requirement for simple mode
	memoryRequirement := ""
	if req.DeploymentType == "simple" && minRequiredMemoryMB > 0 {
		memoryRequirement = fmt.Sprintf(`
CRITICAL REQUIREMENT:
Based on verified memory requirements for all services (including 30%% OS/Docker overhead),
this configuration needs MINIMUM %d MB (%.1f GB) of RAM.

Budget tier MUST use an instance with AT LEAST %.1f GB RAM. Do NOT recommend instances below this threshold.
- t3.small (2GB) is INSUFFICIENT if requirement is >2GB
- t3.medium (4GB) is INSUFFICIENT if requirement is >4GB
- t3.large (8GB) is the minimum if requirement is >4GB but <=8GB

`,
			minRequiredMemoryMB,
			float64(minRequiredMemoryMB)/1024,
			float64(minRequiredMemoryMB)/1024)
	}

	return fmt.Sprintf(`I need to deploy the following services on AWS in the %s region:
%s

Expected users: %d
Expected traffic: %s
Deployment mode: %s
%s%s
Please recommend appropriate AWS resources with specific instance types and counts.
Base your recommendations primarily on the benchmark data provided above (if available).
Also provide storage recommendations and optimization tips to reduce costs.

Respond ONLY with valid JSON, no additional text.`,
		req.Region,
		strings.Join(servicesList, "\n"),
		req.ExpectedUsers,
		req.ExpectedTraffic,
		deploymentMode,
		memoryRequirement,
		benchmarkContext,
	)
}
