package pricing

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"net/http"
	"strings"
	"time"
)

// OptimizationAnalyzer analyzes actual usage and provides optimization recommendations
type OptimizationAnalyzer struct {
	prometheus *PrometheusClient
	pricing    *AWSPricing
	openai     *OpenAIClient
}

// NewOptimizationAnalyzer creates a new optimization analyzer
func NewOptimizationAnalyzer(prometheusURL string) (*OptimizationAnalyzer, error) {
	pricing, err := GetPricingDB()
	if err != nil {
		return nil, fmt.Errorf("failed to load pricing database: %w", err)
	}

	return &OptimizationAnalyzer{
		prometheus: NewPrometheusClient(prometheusURL),
		pricing:    pricing,
		openai:     NewOpenAIClient(),
	}, nil
}

// ActualUsageMetrics represents real usage data from Prometheus
type ActualUsageMetrics struct {
	CPUUsagePercent    float64 `json:"cpu_usage_percent"`
	MemoryUsedMB       float64 `json:"memory_used_mb"`
	MemoryUsagePercent float64 `json:"memory_usage_percent"`
	DiskUsedGB         float64 `json:"disk_used_gb"`
	DiskUsagePercent   float64 `json:"disk_usage_percent"`
	NetworkInboundMB   float64 `json:"network_inbound_mb_24h"`
	NetworkOutboundMB  float64 `json:"network_outbound_mb_24h"`
	InstanceType       string  `json:"instance_type"`

	// Time series analysis (24h)
	CPUStats    *TimeSeriesStats `json:"cpu_stats,omitempty"`
	MemoryStats *TimeSeriesStats `json:"memory_stats,omitempty"`
}

// OptimizationReport contains analysis results and recommendations
type OptimizationReport struct {
	ActualUsage        ActualUsageMetrics      `json:"actual_usage"`
	CostAnalysis       CostAnalysis            `json:"cost_analysis"`
	PerformanceAnalysis PerformanceAnalysis     `json:"performance_analysis"`
	Recommendations    []Recommendation        `json:"recommendations"`
}

// CostAnalysis compares estimated vs actual costs
type CostAnalysis struct {
	CurrentInstanceType  string  `json:"current_instance_type"`
	CurrentMonthlyCost   float64 `json:"current_monthly_cost"`
	EstimatedDataTransfer float64 `json:"estimated_data_transfer_cost"`
	ActualDataTransfer   float64 `json:"actual_data_transfer_cost"`
	PotentialSavings     float64 `json:"potential_savings"`
	SavingsPercent       float64 `json:"savings_percent"`
}

// PerformanceAnalysis identifies bottlenecks
type PerformanceAnalysis struct {
	CPUBottleneck    bool     `json:"cpu_bottleneck"`
	MemoryBottleneck bool     `json:"memory_bottleneck"`
	DiskBottleneck   bool     `json:"disk_bottleneck"`
	Bottlenecks      []string `json:"bottlenecks"`
	HealthStatus     string   `json:"health_status"` // "healthy", "warning", "critical"
}

// Recommendation represents a single optimization recommendation
type Recommendation struct {
	Priority    string  `json:"priority"` // "high", "medium", "low"
	Category    string  `json:"category"` // "cost", "performance", "stability"
	Title       string  `json:"title"`
	Description string  `json:"description"`
	Impact      string  `json:"impact"`
	Savings     float64 `json:"savings,omitempty"` // Monthly savings in USD
}

// Analyze collects metrics and generates optimization report
func (a *OptimizationAnalyzer) Analyze() (*OptimizationReport, error) {
	// Collect actual metrics from Prometheus
	metrics, err := a.collectMetrics()
	if err != nil {
		return nil, fmt.Errorf("failed to collect metrics: %w", err)
	}

	// Analyze costs
	costAnalysis := a.analyzeCosts(metrics)

	// Analyze performance
	perfAnalysis := a.analyzePerformance(metrics)

	// Generate recommendations
	recommendations := a.generateRecommendations(metrics, costAnalysis, perfAnalysis)

	return &OptimizationReport{
		ActualUsage:         *metrics,
		CostAnalysis:        costAnalysis,
		PerformanceAnalysis: perfAnalysis,
		Recommendations:     recommendations,
	}, nil
}

// collectMetrics gathers all metrics from Prometheus
func (a *OptimizationAnalyzer) collectMetrics() (*ActualUsageMetrics, error) {
	metrics := &ActualUsageMetrics{}

	// CPU usage (current)
	cpuUsage, err := a.prometheus.GetCPUUsage()
	if err != nil {
		return nil, fmt.Errorf("failed to get CPU usage: %w", err)
	}
	metrics.CPUUsagePercent = cpuUsage

	// Memory usage (current)
	memUsedMB, memPercent, err := a.prometheus.GetMemoryUsage()
	if err != nil {
		return nil, fmt.Errorf("failed to get memory usage: %w", err)
	}
	metrics.MemoryUsedMB = memUsedMB
	metrics.MemoryUsagePercent = memPercent

	// Disk usage
	diskUsedGB, diskPercent, err := a.prometheus.GetDiskUsage()
	if err != nil {
		return nil, fmt.Errorf("failed to get disk usage: %w", err)
	}
	metrics.DiskUsedGB = diskUsedGB
	metrics.DiskUsagePercent = diskPercent

	// Network traffic
	inboundMB, outboundMB, err := a.prometheus.GetNetworkTraffic()
	if err != nil {
		return nil, fmt.Errorf("failed to get network traffic: %w", err)
	}
	metrics.NetworkInboundMB = inboundMB
	metrics.NetworkOutboundMB = outboundMB

	// Instance type (optional)
	instanceType, _ := a.prometheus.GetInstanceInfo()
	metrics.InstanceType = instanceType

	// Time series analysis (24 hours)
	// CPU time series
	if cpuTS, err := a.prometheus.GetCPUUsageTimeSeries(); err == nil && len(cpuTS.Values) > 0 {
		cpuStats := cpuTS.CalculateStats()
		metrics.CPUStats = &cpuStats
	}

	// Memory time series
	if memTS, err := a.prometheus.GetMemoryUsageTimeSeries(); err == nil && len(memTS.Values) > 0 {
		memStats := memTS.CalculateStats()
		metrics.MemoryStats = &memStats
	}

	return metrics, nil
}

// analyzeCosts compares current costs with potential optimizations
func (a *OptimizationAnalyzer) analyzeCosts(metrics *ActualUsageMetrics) CostAnalysis {
	analysis := CostAnalysis{
		CurrentInstanceType: metrics.InstanceType,
	}

	// Get current instance cost
	if instance, ok := a.pricing.EC2[metrics.InstanceType]; ok {
		analysis.CurrentMonthlyCost = instance.PricePerMonth
	}

	// Calculate actual data transfer cost (monthly projection from 24h data)
	monthlyOutboundGB := (metrics.NetworkOutboundMB / 1024) * 30
	analysis.ActualDataTransfer = monthlyOutboundGB * a.pricing.DataTransfer.OutboundFirst10TB

	// Find more cost-effective instance based on actual usage
	recommendedInstance := a.findOptimalInstance(metrics)
	if recommendedInstance != "" && recommendedInstance != metrics.InstanceType {
		if newInstance, ok := a.pricing.EC2[recommendedInstance]; ok {
			savings := analysis.CurrentMonthlyCost - newInstance.PricePerMonth
			if savings > 0 {
				analysis.PotentialSavings = savings
				analysis.SavingsPercent = (savings / analysis.CurrentMonthlyCost) * 100
			}
		}
	}

	return analysis
}

// findOptimalInstance finds the most cost-effective instance for current usage
func (a *OptimizationAnalyzer) findOptimalInstance(metrics *ActualUsageMetrics) string {
	// Required memory with 30% headroom
	requiredMemoryGB := (metrics.MemoryUsedMB / 1024) * 1.3

	// Find cheapest instance that meets requirements
	var bestInstance string
	var bestPrice float64 = math.MaxFloat64

	for instanceType, instance := range a.pricing.EC2 {
		// Skip if not enough memory
		if instance.MemoryGB < requiredMemoryGB {
			continue
		}

		// Skip if CPU usage is high and instance has fewer vCPUs
		if metrics.CPUUsagePercent > 70 && instance.VCPU < 2 {
			continue
		}

		if instance.PricePerMonth < bestPrice {
			bestPrice = instance.PricePerMonth
			bestInstance = instanceType
		}
	}

	return bestInstance
}

// analyzePerformance identifies performance bottlenecks
func (a *OptimizationAnalyzer) analyzePerformance(metrics *ActualUsageMetrics) PerformanceAnalysis {
	analysis := PerformanceAnalysis{
		Bottlenecks: []string{},
	}

	// Check CPU bottleneck (>80% usage)
	if metrics.CPUUsagePercent > 80 {
		analysis.CPUBottleneck = true
		analysis.Bottlenecks = append(analysis.Bottlenecks,
			fmt.Sprintf("CPU usage is high (%.1f%%). Consider upgrading to instance with more vCPUs.", metrics.CPUUsagePercent))
	}

	// Check memory bottleneck (>85% usage)
	if metrics.MemoryUsagePercent > 85 {
		analysis.MemoryBottleneck = true
		analysis.Bottlenecks = append(analysis.Bottlenecks,
			fmt.Sprintf("Memory usage is high (%.1f%%). Risk of OOM errors. Upgrade to larger instance.", metrics.MemoryUsagePercent))
	}

	// Check disk bottleneck (>90% usage)
	if metrics.DiskUsagePercent > 90 {
		analysis.DiskBottleneck = true
		analysis.Bottlenecks = append(analysis.Bottlenecks,
			fmt.Sprintf("Disk usage is critical (%.1f%%). Increase EBS volume size immediately.", metrics.DiskUsagePercent))
	}

	// Determine health status
	if analysis.CPUBottleneck || analysis.MemoryBottleneck || analysis.DiskBottleneck {
		if metrics.MemoryUsagePercent > 90 || metrics.DiskUsagePercent > 95 {
			analysis.HealthStatus = "critical"
		} else {
			analysis.HealthStatus = "warning"
		}
	} else {
		analysis.HealthStatus = "healthy"
	}

	return analysis
}

// generateRecommendations creates actionable recommendations
func (a *OptimizationAnalyzer) generateRecommendations(
	metrics *ActualUsageMetrics,
	costAnalysis CostAnalysis,
	perfAnalysis PerformanceAnalysis,
) []Recommendation {
	var recommendations []Recommendation

	// Critical performance issues first
	if perfAnalysis.HealthStatus == "critical" {
		if metrics.MemoryUsagePercent > 90 {
			recommendations = append(recommendations, Recommendation{
				Priority:    "high",
				Category:    "stability",
				Title:       "Critical Memory Shortage",
				Description: fmt.Sprintf("Memory usage at %.1f%%. Immediate upgrade required to prevent service outages.", metrics.MemoryUsagePercent),
				Impact:      "High risk of OOM errors and service crashes",
			})
		}
		if metrics.DiskUsagePercent > 95 {
			recommendations = append(recommendations, Recommendation{
				Priority:    "high",
				Category:    "stability",
				Title:       "Critical Disk Space",
				Description: fmt.Sprintf("Disk usage at %.1f%%. Increase EBS volume size immediately.", metrics.DiskUsagePercent),
				Impact:      "System may fail when disk is full",
			})
		}
	}

	// Performance bottlenecks
	if perfAnalysis.CPUBottleneck {
		recommendations = append(recommendations, Recommendation{
			Priority:    "medium",
			Category:    "performance",
			Title:       "CPU Bottleneck Detected",
			Description: fmt.Sprintf("CPU usage at %.1f%%. Consider upgrading to instance with more vCPUs for better performance.", metrics.CPUUsagePercent),
			Impact:      "Slow response times, degraded user experience",
		})
	}

	// Cost optimization - only if instance type is known
	if metrics.InstanceType != "" && metrics.InstanceType != "unknown" {
		if costAnalysis.PotentialSavings > 5 {
			optimalInstance := a.findOptimalInstance(metrics)
			recommendations = append(recommendations, Recommendation{
				Priority:    "low",
				Category:    "cost",
				Title:       "Downsize Instance to Save Costs",
				Description: fmt.Sprintf("Current usage (%.1f%% CPU, %.1f%% memory) suggests %s is sufficient. Switch from %s to %s.",
					metrics.CPUUsagePercent, metrics.MemoryUsagePercent, optimalInstance, metrics.InstanceType, optimalInstance),
				Impact:   fmt.Sprintf("Save $%.2f/month (%.1f%% reduction)", costAnalysis.PotentialSavings, costAnalysis.SavingsPercent),
				Savings:  costAnalysis.PotentialSavings,
			})
		} else if metrics.CPUUsagePercent < 20 && metrics.MemoryUsagePercent < 50 {
			recommendations = append(recommendations, Recommendation{
				Priority:    "low",
				Category:    "cost",
				Title:       "Low Resource Utilization",
				Description: fmt.Sprintf("CPU (%.1f%%) and memory (%.1f%%) usage are low. Instance appears over-provisioned but no cheaper alternative available.",
					metrics.CPUUsagePercent, metrics.MemoryUsagePercent),
				Impact:      "Resources are underutilized but switching may not save costs",
			})
		}
	} else {
		// Instance type unknown - cannot provide cost recommendations
		if metrics.CPUUsagePercent < 20 && metrics.MemoryUsagePercent < 50 {
			recommendations = append(recommendations, Recommendation{
				Priority:    "medium",
				Category:    "cost",
				Title:       "Low Resource Utilization Detected",
				Description: fmt.Sprintf("CPU (%.1f%%) and memory (%.1f%%) usage are very low. Resources appear underutilized.",
					metrics.CPUUsagePercent, metrics.MemoryUsagePercent),
				Impact:      "Cannot provide specific cost optimization recommendations without knowing current instance type. Check your EC2 console to identify the instance and consider downsizing.",
			})
		}
	}

	// Disk space warning
	if metrics.DiskUsagePercent > 70 && metrics.DiskUsagePercent <= 90 {
		recommendations = append(recommendations, Recommendation{
			Priority:    "medium",
			Category:    "stability",
			Title:       "Disk Space Running Low",
			Description: fmt.Sprintf("Disk usage at %.1f%%. Plan to increase EBS volume size soon.", metrics.DiskUsagePercent),
			Impact:      "Prevent future service disruptions",
		})
	}

	// Healthy system
	if len(recommendations) == 0 {
		recommendations = append(recommendations, Recommendation{
			Priority:    "low",
			Category:    "stability",
			Title:       "System Running Optimally",
			Description: "All metrics are within healthy ranges. No immediate action required.",
			Impact:      "Continue monitoring for changes in usage patterns",
		})
	}

	// Add OpenAI-powered recommendations
	aiRecommendations := a.getAIRecommendations(metrics, costAnalysis, perfAnalysis)
	recommendations = append(recommendations, aiRecommendations...)

	return recommendations
}

// getAIRecommendations gets AI-powered optimization recommendations
func (a *OptimizationAnalyzer) getAIRecommendations(
	metrics *ActualUsageMetrics,
	costAnalysis CostAnalysis,
	perfAnalysis PerformanceAnalysis,
) []Recommendation {
	if a.openai.APIKey == "" {
		// No API key, skip AI recommendations
		return nil
	}

	// Build detailed usage pattern description
	usagePattern := "시계열 데이터 없음"
	if metrics.CPUStats != nil && metrics.MemoryStats != nil {
		peakHoursStr := ""
		if len(metrics.CPUStats.PeakHours) > 0 {
			peakHoursStr = fmt.Sprintf("%d시", metrics.CPUStats.PeakHours[0])
			for i := 1; i < len(metrics.CPUStats.PeakHours); i++ {
				peakHoursStr += fmt.Sprintf(", %d시", metrics.CPUStats.PeakHours[i])
			}
		}

		usagePattern = fmt.Sprintf(`
CPU 24시간 분석 (48개 데이터 포인트):
  - 최소: %.1f%%, 평균: %.1f%%, 최대: %.1f%%
  - 중앙값(P50): %.1f%%, P95: %.1f%%, P99: %.1f%%
  - 변동성(표준편차): %.1f
  - 피크 시간대: %s

메모리 24시간 분석:
  - 최소: %.1f%%, 평균: %.1f%%, 최대: %.1f%%
  - 중앙값(P50): %.1f%%, P95: %.1f%%, P99: %.1f%%
  - 변동성(표준편차): %.1f`,
			metrics.CPUStats.Min, metrics.CPUStats.Average, metrics.CPUStats.Max,
			metrics.CPUStats.P50, metrics.CPUStats.P95, metrics.CPUStats.P99,
			metrics.CPUStats.StdDev,
			peakHoursStr,
			metrics.MemoryStats.Min, metrics.MemoryStats.Average, metrics.MemoryStats.Max,
			metrics.MemoryStats.P50, metrics.MemoryStats.P95, metrics.MemoryStats.P99,
			metrics.MemoryStats.StdDev,
		)

		// Debug log
		fmt.Printf("\n========== TIME SERIES DATA COLLECTED ==========\n")
		fmt.Printf("CPU Stats - Min: %.1f%%, Avg: %.1f%%, Max: %.1f%%, P95: %.1f%%, P99: %.1f%%\n",
			metrics.CPUStats.Min, metrics.CPUStats.Average, metrics.CPUStats.Max,
			metrics.CPUStats.P95, metrics.CPUStats.P99)
		fmt.Printf("Memory Stats - Min: %.1f%%, Avg: %.1f%%, Max: %.1f%%, P95: %.1f%%, P99: %.1f%%\n",
			metrics.MemoryStats.Min, metrics.MemoryStats.Average, metrics.MemoryStats.Max,
			metrics.MemoryStats.P95, metrics.MemoryStats.P99)
		fmt.Printf("Peak Hours: %v\n", metrics.CPUStats.PeakHours)
		fmt.Printf("===============================================\n\n")
	} else {
		fmt.Printf("\n[WARNING] No time series data - CPUStats: %v, MemoryStats: %v\n\n",
			metrics.CPUStats != nil, metrics.MemoryStats != nil)
	}

	prompt := fmt.Sprintf(`AWS EC2 인스턴스의 실제 사용 패턴을 분석하여 최적화 방안을 제시해주세요.

📊 현재 사용량 (실시간):
- CPU 사용률: %.1f%%
- 메모리 사용량: %.0f MB (%.1f%%)
- 디스크 사용량: %.1f GB (%.1f%%)
- 네트워크 트래픽 (24h): %.1f MB 수신 / %.1f MB 송신
- 인스턴스 타입: %s
- 시스템 상태: %s

📈 사용 패턴 분석 (지난 24시간):
%s

💰 비용 정보:
- 현재 월간 비용: $%.2f
- 데이터 전송 비용: $%.2f/월
- 성능 병목: %v

🎯 분석 요구사항 (MUST 포함):
1. **반드시 구체적인 수치를 인용하며 분석하세요:**
   - "CPU P95가 X%%로..." 형식으로 실제 수치 명시
   - "최소 X%%, 평균 Y%%, 최대 Z%%" 패턴 설명
   - "변동성(표준편차)이 X로..." 구체적 언급
   - "피크 시간대가 X시, Y시이므로..." 시간대 활용

2. **24시간 패턴을 근거로 추천:**
   - P95 < 20%이고 변동성 낮음 → 안전한 다운사이징
   - P95 > 70%이거나 피크가 높음 → 유지 또는 업그레이드
   - 변동성 큼 → 버스트 인스턴스 또는 오토스케일링

3. **구체적인 인스턴스 타입과 비용 제시:**
   - 현재: X 타입 → 추천: Y 타입
   - 예상 절감액 또는 추가 비용
   - 성능 리스크 정량적 평가

**필수**: 위 시계열 데이터의 모든 수치(min, avg, max, P50, P95, P99, 표준편차, 피크시간)를 description에 활용해야 합니다!

JSON 형식으로 응답:
[
  {
    "priority": "high|medium|low",
    "category": "cost|performance|stability",
    "title": "제목 (한국어)",
    "description": "상세 분석 및 근거 (한국어, 데이터 기반 설명)",
    "impact": "예상 효과 (한국어)",
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
		usagePattern,
		costAnalysis.CurrentMonthlyCost,
		costAnalysis.ActualDataTransfer,
		perfAnalysis.Bottlenecks,
	)

	systemPrompt := `You are an AWS cost optimization expert who MUST use detailed time series data in recommendations.

CRITICAL REQUIREMENTS:
1. ALWAYS cite specific numbers from the time series data:
   - Quote min, avg, max, P50, P95, P99 values explicitly
   - When first mentioning percentile terms, ALWAYS explain them in parentheses:
     * P50 (중앙값, 50%의 시간 동안 이 값 이하)
     * P95 (95%의 시간 동안 이 값 이하로 유지)
     * P99 (99%의 시간 동안 이 값 이하, 극단적 피크 제외)
   - Reference standard deviation to explain variability
   - Mention specific peak hours

2. Base analysis on 24-hour patterns, NOT just current usage:
   - Example: "CPU 사용률이 24시간 동안 최소 0.5%, 평균 1.3%, 최대 4.2%로 매우 낮게 유지되었으며, P95(95%의 시간 동안 이 값 이하)도 1.9%에 불과합니다."
   - Example: "메모리는 평균 36.1%, P95(95%의 시간)는 42.3%로 여유가 충분합니다."
   - Example: "변동성(표준편차 0.8)이 낮아 일정한 부하 패턴을 보입니다."

3. Connect data to recommendations:
   - If P95 < 20% AND low variability → SAFE to downsize
   - If P95 > 70% OR high variability → Keep or upgrade
   - Always explain WHY using the actual numbers in user-friendly language

4. Format requirements:
   - Korean language only, use user-friendly explanations
   - Include ALL relevant statistics in description WITH explanations
   - Explain technical terms when first mentioned
   - Provide specific instance type recommendations
   - Return ONLY JSON array (no markdown, no code blocks)

EXAMPLE GOOD DESCRIPTION:
"지난 24시간 동안 CPU 사용률은 최소 0.5%, 평균 1.3%, 최대 4.2%, P95(95%의 시간 동안 이 값 이하) 1.9%, P99(99%의 시간 동안 이 값 이하) 3.5%로 매우 낮은 수준을 유지했습니다. 즉, 대부분의 시간 동안 CPU가 거의 유휴 상태였다는 의미입니다. 변동성(표준편차 0.8)도 낮아 안정적인 패턴을 보이며, 피크 시간대(14시, 15시)에도 5% 미만입니다. 메모리는 평균 36.1%, P95는 42.3%로 여유가 충분합니다. 이러한 데이터를 종합하면..."

EXAMPLE BAD DESCRIPTION (DO NOT DO THIS):
"CPU 사용률이 낮습니다. 다운사이징을 고려하세요."`

	req := OpenAIRequest{
		Model: a.openai.Model,
		Messages: []OpenAIMessage{
			{Role: "system", Content: systemPrompt},
			{Role: "user", Content: prompt},
		},
		Temperature: 0.3,
	}

	jsonData, err := json.Marshal(req)
	if err != nil {
		return nil
	}

	httpReq, err := http.NewRequest("POST", a.openai.BaseURL, bytes.NewBuffer(jsonData))
	if err != nil {
		return nil
	}

	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+a.openai.APIKey)

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(httpReq)
	if err != nil {
		return nil
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil
	}

	if resp.StatusCode != http.StatusOK {
		return nil
	}

	var openAIResp OpenAIResponse
	if err := json.Unmarshal(body, &openAIResp); err != nil {
		return nil
	}

	if len(openAIResp.Choices) == 0 {
		return nil
	}

	content := openAIResp.Choices[0].Message.Content

	// Debug: Print raw OpenAI response
	fmt.Printf("\n[DEBUG] OpenAI Raw Response:\n%s\n\n", content)
	content = strings.TrimPrefix(content, "```json\n")
	content = strings.TrimPrefix(content, "```\n")
	content = strings.TrimSuffix(content, "\n```")
	content = strings.TrimSpace(content)

	var aiRecommendations []Recommendation
	if err := json.Unmarshal([]byte(content), &aiRecommendations); err != nil {
		return nil
	}

	return aiRecommendations
}
