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

	// CPU usage
	cpuUsage, err := a.prometheus.GetCPUUsage()
	if err != nil {
		return nil, fmt.Errorf("failed to get CPU usage: %w", err)
	}
	metrics.CPUUsagePercent = cpuUsage

	// Memory usage
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

	prompt := fmt.Sprintf(`Analyze this AWS EC2 instance usage and provide optimization recommendations.

ACTUAL USAGE (from Prometheus):
- CPU Usage: %.1f%%
- Memory Usage: %.0f MB (%.1f%% of total)
- Disk Usage: %.1f GB (%.1f%%)
- Network Traffic (24h): %.1f MB in / %.1f MB out
- Instance Type: %s
- Health Status: %s

CONTEXT:
- Performance Bottlenecks: %v
- Current Monthly Cost: $%.2f
- Data Transfer Cost: $%.2f/month

Please provide 1-2 specific, actionable recommendations focusing on:
1. Cost optimization opportunities
2. Performance improvements
3. Resource rightsizing

IMPORTANT: Respond in Korean language (한국어로 답변해주세요).

Respond in JSON format:
[
  {
    "priority": "high|medium|low",
    "category": "cost|performance|stability",
    "title": "Short title in Korean",
    "description": "Detailed explanation in Korean",
    "impact": "Expected benefit in Korean",
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
		perfAnalysis.Bottlenecks,
		costAnalysis.CurrentMonthlyCost,
		costAnalysis.ActualDataTransfer,
	)

	systemPrompt := `You are an AWS cost optimization expert. Analyze actual usage data and provide specific, actionable recommendations.

IMPORTANT:
- Be conservative and realistic
- Only recommend changes if there's clear benefit
- Consider both cost AND performance
- If instance type is "unknown", acknowledge this limitation
- Provide specific numbers when possible
- Respond in Korean language (한국어로 답변)
- Respond ONLY with valid JSON array`

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
