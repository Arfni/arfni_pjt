package deployment

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
)

// AITroubleshootClient handles deployment troubleshooting via AI
type AITroubleshootClient struct {
	APIKey   string
	Model    string
	BaseURL  string
	Provider string // "gms" or "openai"
}

// NewAITroubleshootClient creates a new AI troubleshoot client
func NewAITroubleshootClient() *AITroubleshootClient {
	provider := os.Getenv("OPENAI_PROVIDER")
	if provider == "" {
		provider = "auto"
	}

	var apiKey, baseURL, selectedProvider string

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

	return &AITroubleshootClient{
		APIKey:   apiKey,
		Model:    "gpt-4o",
		BaseURL:  baseURL,
		Provider: selectedProvider,
	}
}

// DeploymentFailureRequest represents a deployment failure analysis request
type DeploymentFailureRequest struct {
	DeploymentLogs string `json:"deployment_logs"`
	StackYAML      string `json:"stack_yaml"`
	Environment    string `json:"environment"` // "local" or "ec2"
	ErrorMessages  string `json:"error_messages"`
	Language       string `json:"language"` // "ko" or "en"
}

// Solution represents a single troubleshooting solution
type Solution struct {
	Priority     string   `json:"priority"`      // "high", "medium", "low"
	Title        string   `json:"title"`
	Description  string   `json:"description"`
	Steps        []string `json:"steps"`
	CodeExamples string   `json:"code_examples,omitempty"`
}

// TroubleshootResult represents AI analysis result
type TroubleshootResult struct {
	ErrorSummary  string     `json:"error_summary"`
	RootCause     string     `json:"root_cause"`
	Solutions     []Solution `json:"solutions"`
	RelatedDocs   []string   `json:"related_docs,omitempty"`
	PreventionTips []string  `json:"prevention_tips,omitempty"`
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

// AnalyzeDeploymentFailure analyzes deployment failure and provides solutions
func (c *AITroubleshootClient) AnalyzeDeploymentFailure(req DeploymentFailureRequest) (*TroubleshootResult, error) {
	if c.APIKey == "" {
		if c.Provider == "gms" {
			return nil, fmt.Errorf("GMS_KEY environment variable not set")
		}
		return nil, fmt.Errorf("OPENAI_API_KEY environment variable not set")
	}

	systemPrompt := c.buildSystemPrompt(req.Language)
	userPrompt := c.buildUserPrompt(req)

	openAIReq := OpenAIRequest{
		Model: c.Model,
		Messages: []OpenAIMessage{
			{
				Role:    "system",
				Content: systemPrompt,
			},
			{
				Role:    "user",
				Content: userPrompt,
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

	var result TroubleshootResult
	if err := json.Unmarshal([]byte(content), &result); err != nil {
		return nil, fmt.Errorf("failed to parse troubleshoot result JSON: %w\nContent: %s", err, content)
	}

	return &result, nil
}

// buildSystemPrompt creates system prompt based on language
func (c *AITroubleshootClient) buildSystemPrompt(language string) string {
	if language == "ko" {
		return `당신은 Docker, Kubernetes, AWS 배포 전문가입니다.
배포 실패 로그를 분석하여 근본 원인을 찾고 실용적인 해결 방법을 제시합니다.

응답 형식 (JSON only, 추가 텍스트 없이):
{
  "error_summary": "에러를 한 문장으로 요약",
  "root_cause": "근본 원인 상세 설명 (2-3 문장)",
  "solutions": [
    {
      "priority": "high|medium|low",
      "title": "해결방안 제목",
      "description": "해결방안 설명",
      "steps": ["단계1", "단계2", "단계3"],
      "code_examples": "필요시 코드 예시 (선택적)"
    }
  ],
  "related_docs": ["관련 문서 URL (선택적)"],
  "prevention_tips": ["재발 방지를 위한 팁 (선택적)"]
}

중요 지침:
- 반드시 한국어로 응답
- 실용적이고 즉시 적용 가능한 해결책 제시
- 우선순위가 높은 순서대로 solutions 정렬
- 코드 예시는 실제 동작하는 코드로 제공
- 일반적인 조언보다는 구체적인 해결책 제시
- JSON 형식만 반환 (마크다운 코드 블록 사용 가능)`
	}

	return `You are a Docker, Kubernetes, and AWS deployment expert.
Analyze deployment failure logs to identify root causes and provide practical solutions.

Response format (JSON only, no additional text):
{
  "error_summary": "One-sentence error summary",
  "root_cause": "Detailed root cause explanation (2-3 sentences)",
  "solutions": [
    {
      "priority": "high|medium|low",
      "title": "Solution title",
      "description": "Solution description",
      "steps": ["Step 1", "Step 2", "Step 3"],
      "code_examples": "Code examples if needed (optional)"
    }
  ],
  "related_docs": ["Related documentation URLs (optional)"],
  "prevention_tips": ["Tips to prevent recurrence (optional)"]
}

Important guidelines:
- Respond in English
- Provide practical, immediately actionable solutions
- Sort solutions by priority (high first)
- Provide working code examples
- Focus on specific solutions rather than general advice
- Return only JSON format (markdown code blocks allowed)`
}

// buildUserPrompt creates user prompt from request
func (c *AITroubleshootClient) buildUserPrompt(req DeploymentFailureRequest) string {
	var envDescription string
	if req.Language == "ko" {
		if req.Environment == "ec2" {
			envDescription = "AWS EC2 서버 (원격 배포)"
		} else {
			envDescription = "로컬 환경 (Docker Compose)"
		}
	} else {
		if req.Environment == "ec2" {
			envDescription = "AWS EC2 Server (Remote Deployment)"
		} else {
			envDescription = "Local Environment (Docker Compose)"
		}
	}

	// Truncate logs if too long (keep last 5000 characters)
	logs := req.DeploymentLogs
	if len(logs) > 5000 {
		logs = "...(truncated)...\n" + logs[len(logs)-5000:]
	}

	if req.Language == "ko" {
		return fmt.Sprintf(`
배포 환경: %s

═══════════════════════════════════════════════════
stack.yaml 내용
═══════════════════════════════════════════════════
%s

═══════════════════════════════════════════════════
배포 실패 로그
═══════════════════════════════════════════════════
%s

═══════════════════════════════════════════════════
주요 에러 메시지
═══════════════════════════════════════════════════
%s

위 배포 실패를 분석하여 원인과 해결 방법을 JSON 형식으로 제공해주세요.
우선순위가 높은 해결책부터 제시하고, 각 해결책은 구체적인 단계와 코드 예시를 포함해주세요.`,
			envDescription,
			req.StackYAML,
			logs,
			req.ErrorMessages,
		)
	}

	return fmt.Sprintf(`
Deployment Environment: %s

═══════════════════════════════════════════════════
stack.yaml Content
═══════════════════════════════════════════════════
%s

═══════════════════════════════════════════════════
Deployment Failure Logs
═══════════════════════════════════════════════════
%s

═══════════════════════════════════════════════════
Key Error Messages
═══════════════════════════════════════════════════
%s

Analyze the deployment failure above and provide the cause and solutions in JSON format.
Present solutions by priority (high first), and include specific steps and code examples for each solution.`,
		envDescription,
		req.StackYAML,
		logs,
		req.ErrorMessages,
	)
}
