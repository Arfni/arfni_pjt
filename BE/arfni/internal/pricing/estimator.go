package pricing

import (
	"fmt"
	"math"
)

// CostEstimator calculates AWS costs based on recommendations
type CostEstimator struct {
	pricing *AWSPricing
	openai  *OpenAIClient
}

// NewCostEstimator creates a new cost estimator
func NewCostEstimator() (*CostEstimator, error) {
	pricing, err := GetPricingDB()
	if err != nil {
		return nil, fmt.Errorf("failed to load pricing database: %w", err)
	}

	return &CostEstimator{
		pricing: pricing,
		openai:  NewOpenAIClient(),
	}, nil
}

// EstimateCost estimates AWS costs based on user requirements
func (e *CostEstimator) EstimateCost(req CostEstimationRequest) (*CostBreakdown, error) {
	// For simple deployment, calculate minimum required memory upfront
	var minRequiredMemoryMB int
	if req.DeploymentType == "simple" {
		minRequiredMemoryMB = e.calculateMinimumMemory(req.Services)
	}

	// Get resource recommendation from OpenAI (3 tiers)
	// Pass calculated memory requirement so OpenAI knows the minimum
	recommendation, err := e.openai.GetResourceRecommendation(req, minRequiredMemoryMB)
	if err != nil {
		return nil, fmt.Errorf("failed to get resource recommendation: %w", err)
	}

	// Calculate costs for all three tiers
	budgetBreakdown := e.calculateTierCost("Budget", recommendation.Budget, req.DeploymentType, minRequiredMemoryMB)
	recommendedBreakdown := e.calculateTierCost("Recommended", recommendation.Recommended, req.DeploymentType, minRequiredMemoryMB)
	performanceBreakdown := e.calculateTierCost("Performance", recommendation.Performance, req.DeploymentType, minRequiredMemoryMB)

	breakdown := &CostBreakdown{
		BudgetTier:       budgetBreakdown,
		RecommendedTier:  recommendedBreakdown,
		PerformanceTier:  performanceBreakdown,
		Recommendation:   *recommendation,
		OptimizationTips: recommendation.OptimizationTips,
	}

	return breakdown, nil
}

// calculateTierCost calculates cost for a single tier
func (e *CostEstimator) calculateTierCost(tierName string, tier TierRecommendation, deploymentType string, minRequiredMemoryMB int) TierCostBreakdown {
	breakdown := TierCostBreakdown{
		TierName:    tierName,
		Description: tier.Description,
		Warnings:    tier.Warnings,
		Details: CostDetails{
			EC2Items:     make([]CostItem, 0),
			RDSItems:     make([]CostItem, 0),
			CacheItems:   make([]CostItem, 0),
			StorageItems: make([]CostItem, 0),
		},
	}

	// Extract instance type and specs for display
	if len(tier.EC2Instances) > 0 {
		instanceType := tier.EC2Instances[0].Type
		if ec2Instance, ok := e.pricing.EC2[instanceType]; ok {
			breakdown.InstanceType = fmt.Sprintf("%s (%d vCPU, %.0fGB RAM)",
				instanceType, ec2Instance.VCPU, ec2Instance.MemoryGB)
		} else {
			breakdown.InstanceType = instanceType
		}
	}

	// Validate memory for simple deployment (validation only, no auto-fix)
	if deploymentType == "simple" && minRequiredMemoryMB > 0 {
		if len(tier.EC2Instances) > 0 {
			instanceType := tier.EC2Instances[0].Type
			if ec2Instance, ok := e.pricing.EC2[instanceType]; ok {
				instanceMemoryMB := int(ec2Instance.MemoryGB * 1024)
				if instanceMemoryMB < minRequiredMemoryMB {
					breakdown.Warnings = append(breakdown.Warnings,
						fmt.Sprintf("CRITICAL ERROR: %s (%dMB) is below minimum requirement (%dMB). WILL CAUSE OOM ERRORS. AI recommendation is incorrect.",
							instanceType, instanceMemoryMB, minRequiredMemoryMB))
				}
			}
		}
	}

	// Calculate EC2 costs
	for _, inst := range tier.EC2Instances {
		if ec2Price, ok := e.pricing.EC2[inst.Type]; ok {
			cost := ec2Price.PricePerMonth * float64(inst.Count)
			breakdown.EC2Cost += cost
			breakdown.Details.EC2Items = append(breakdown.Details.EC2Items, CostItem{
				Name:         "EC2 Instance",
				InstanceType: inst.Type,
				Count:        inst.Count,
				UnitPrice:    ec2Price.PricePerMonth,
				TotalPrice:   cost,
				Description:  inst.Reason,
			})
		}
	}

	// Calculate RDS costs
	for _, inst := range tier.RDSInstances {
		if rdsPrice, ok := e.pricing.RDS[inst.Type]; ok {
			cost := rdsPrice.PricePerMonth * float64(inst.Count)
			breakdown.RDSCost += cost
			breakdown.Details.RDSItems = append(breakdown.Details.RDSItems, CostItem{
				Name:         "RDS Instance",
				InstanceType: inst.Type,
				Count:        inst.Count,
				UnitPrice:    rdsPrice.PricePerMonth,
				TotalPrice:   cost,
				Description:  inst.Reason,
			})
		}
	}

	// Calculate ElastiCache costs
	for _, inst := range tier.ElastiCache {
		if cachePrice, ok := e.pricing.ElastiCache[inst.Type]; ok {
			cost := cachePrice.PricePerMonth * float64(inst.Count)
			breakdown.CacheCost += cost
			breakdown.Details.CacheItems = append(breakdown.Details.CacheItems, CostItem{
				Name:         "ElastiCache Instance",
				InstanceType: inst.Type,
				Count:        inst.Count,
				UnitPrice:    cachePrice.PricePerMonth,
				TotalPrice:   cost,
				Description:  inst.Reason,
			})
		}
	}

	// Calculate Storage costs
	if tier.Storage.Type == "gp3" || tier.Storage.Type == "" {
		cost := e.pricing.Storage.EBSGP3.PricePerGBMonth * float64(tier.Storage.SizeGB)
		breakdown.StorageCost = cost
		breakdown.Details.StorageItems = append(breakdown.Details.StorageItems, CostItem{
			Name:         "EBS Storage (gp3)",
			InstanceType: "gp3",
			Count:        tier.Storage.SizeGB,
			UnitPrice:    e.pricing.Storage.EBSGP3.PricePerGBMonth,
			TotalPrice:   cost,
			Description:  tier.Storage.Reason,
		})
	} else if tier.Storage.Type == "io2" {
		cost := e.pricing.Storage.EBSIO2.PricePerGBMonth * float64(tier.Storage.SizeGB)
		breakdown.StorageCost = cost
		breakdown.Details.StorageItems = append(breakdown.Details.StorageItems, CostItem{
			Name:         "EBS Storage (io2)",
			InstanceType: "io2",
			Count:        tier.Storage.SizeGB,
			UnitPrice:    e.pricing.Storage.EBSIO2.PricePerGBMonth,
			TotalPrice:   cost,
			Description:  tier.Storage.Reason,
		})
	}

	// Calculate Load Balancer costs
	if tier.LoadBalancer {
		breakdown.LoadBalancerCost = e.pricing.LoadBalancer.ALB.PricePerMonthBase
		breakdown.Details.StorageItems = append(breakdown.Details.StorageItems, CostItem{
			Name:         "Application Load Balancer",
			InstanceType: "ALB",
			Count:        1,
			UnitPrice:    e.pricing.LoadBalancer.ALB.PricePerMonthBase,
			TotalPrice:   e.pricing.LoadBalancer.ALB.PricePerMonthBase,
			Description:  "Base ALB cost (excludes LCU charges)",
		})
	}

	// Calculate Data Transfer costs
	if tier.DataTransfer.EstimatedGB > 0 {
		cost := float64(tier.DataTransfer.EstimatedGB) * e.pricing.DataTransfer.OutboundFirst10TB
		breakdown.DataTransferCost = cost
		breakdown.Details.StorageItems = append(breakdown.Details.StorageItems, CostItem{
			Name:         "Data Transfer (Outbound)",
			InstanceType: "outbound",
			Count:        tier.DataTransfer.EstimatedGB,
			UnitPrice:    e.pricing.DataTransfer.OutboundFirst10TB,
			TotalPrice:   cost,
			Description:  tier.DataTransfer.Reason,
		})
	}

	// Calculate total
	breakdown.TotalMonthlyUSD = breakdown.EC2Cost +
		breakdown.RDSCost +
		breakdown.CacheCost +
		breakdown.StorageCost +
		breakdown.LoadBalancerCost +
		breakdown.DataTransferCost

	// Round to 2 decimal places
	breakdown.TotalMonthlyUSD = math.Round(breakdown.TotalMonthlyUSD*100) / 100
	breakdown.EC2Cost = math.Round(breakdown.EC2Cost*100) / 100
	breakdown.RDSCost = math.Round(breakdown.RDSCost*100) / 100
	breakdown.CacheCost = math.Round(breakdown.CacheCost*100) / 100
	breakdown.StorageCost = math.Round(breakdown.StorageCost*100) / 100
	breakdown.LoadBalancerCost = math.Round(breakdown.LoadBalancerCost*100) / 100
	breakdown.DataTransferCost = math.Round(breakdown.DataTransferCost*100) / 100

	return breakdown
}

// findSmallestViableInstance finds the smallest EC2 instance that meets memory requirement
func (e *CostEstimator) findSmallestViableInstance(minMemoryMB int) string {
	// Sort instances by memory size
	type instanceInfo struct {
		name     string
		memoryMB int
		price    float64
	}

	var instances []instanceInfo
	for name, ec2 := range e.pricing.EC2 {
		memoryMB := int(ec2.MemoryGB * 1024)
		if memoryMB >= minMemoryMB {
			instances = append(instances, instanceInfo{
				name:     name,
				memoryMB: memoryMB,
				price:    ec2.PricePerMonth,
			})
		}
	}

	if len(instances) == 0 {
		return ""
	}

	// Find cheapest viable instance
	cheapest := instances[0]
	for _, inst := range instances[1:] {
		if inst.price < cheapest.price {
			cheapest = inst
		}
	}

	return cheapest.name
}

// calculateMinimumMemory calculates total memory needed for all services in simple mode
func (e *CostEstimator) calculateMinimumMemory(services []ServiceInfo) int {
	totalMemoryMB := 0
	var serviceMemory []string

	for _, svc := range services {
		benchmark, err := DetectServiceBenchmark(svc.Name, svc.Type, svc.Image)
		if err != nil {
			// No benchmark data - use conservative defaults
			switch svc.Type {
			case "backend":
				totalMemoryMB += 1024 // 1GB default for unknown backend
				serviceMemory = append(serviceMemory, fmt.Sprintf("%s: 1024MB (default)", svc.Name))
			case "database":
				totalMemoryMB += 1024 // 1GB default for unknown database
				serviceMemory = append(serviceMemory, fmt.Sprintf("%s: 1024MB (default)", svc.Name))
			case "cache":
				totalMemoryMB += 256 // 256MB default for cache
				serviceMemory = append(serviceMemory, fmt.Sprintf("%s: 256MB (default)", svc.Name))
			}
			continue
		}
		totalMemoryMB += benchmark.MinMemoryMB
		serviceMemory = append(serviceMemory, fmt.Sprintf("%s: %dMB", svc.Name, benchmark.MinMemoryMB))
	}

	// Add 30% overhead for OS + Docker
	baseMemory := totalMemoryMB
	totalMemoryMB = int(float64(totalMemoryMB) * 1.3)

	fmt.Printf("[INFO] Memory calculation for simple deployment:\n")
	for _, sm := range serviceMemory {
		fmt.Printf("  - %s\n", sm)
	}
	fmt.Printf("  Subtotal: %dMB\n", baseMemory)
	fmt.Printf("  + 30%% overhead (OS + Docker): %dMB\n", totalMemoryMB-baseMemory)
	fmt.Printf("  Total required: %dMB (%.1fGB)\n\n", totalMemoryMB, float64(totalMemoryMB)/1024)

	return totalMemoryMB
}

// GetPricingSummary returns a formatted pricing summary
func (e *CostEstimator) GetPricingSummary() string {
	return fmt.Sprintf(`AWS Pricing Database - %s (%s)
Currency: %s
Last Updated: %s

Available EC2 Instances: %d types
Available RDS Instances: %d types
Available ElastiCache: %d types`,
		e.pricing.RegionName,
		e.pricing.Region,
		e.pricing.Currency,
		e.pricing.LastUpdated,
		len(e.pricing.EC2),
		len(e.pricing.RDS),
		len(e.pricing.ElastiCache),
	)
}
