package pricing

// AWSPricing represents the complete pricing database
type AWSPricing struct {
	Region       string                    `json:"region"`
	RegionName   string                    `json:"region_name"`
	Currency     string                    `json:"currency"`
	LastUpdated  string                    `json:"last_updated"`
	EC2          map[string]EC2Instance    `json:"ec2"`
	RDS          map[string]RDSInstance    `json:"rds"`
	ElastiCache  map[string]CacheInstance  `json:"elasticache"`
	Storage      StoragePricing            `json:"storage"`
	DataTransfer DataTransferPricing       `json:"data_transfer"`
	LoadBalancer LoadBalancerPricing       `json:"load_balancer"`
}

// EC2Instance pricing
type EC2Instance struct {
	VCPU          int     `json:"vcpu"`
	MemoryGB      float64 `json:"memory_gb"`
	StorageGB     string  `json:"storage_gb"`
	PricePerHour  float64 `json:"price_per_hour"`
	PricePerMonth float64 `json:"price_per_month"`
	Description   string  `json:"description"`
}

// RDSInstance pricing
type RDSInstance struct {
	VCPU          int      `json:"vcpu"`
	MemoryGB      float64  `json:"memory_gb"`
	Engines       []string `json:"engines"`
	PricePerHour  float64  `json:"price_per_hour"`
	PricePerMonth float64  `json:"price_per_month"`
	Description   string   `json:"description"`
}

// CacheInstance pricing
type CacheInstance struct {
	VCPU          int      `json:"vcpu"`
	MemoryGB      float64  `json:"memory_gb"`
	Engines       []string `json:"engines"`
	PricePerHour  float64  `json:"price_per_hour"`
	PricePerMonth float64  `json:"price_per_month"`
	Description   string   `json:"description"`
}

// StoragePricing for EBS volumes
type StoragePricing struct {
	EBSGP3 EBSPricing `json:"ebs_gp3"`
	EBSIO2 EBSPricing `json:"ebs_io2"`
}

type EBSPricing struct {
	Type                    string  `json:"type"`
	PricePerGBMonth         float64 `json:"price_per_gb_month"`
	IOPSIncluded            int     `json:"iops_included,omitempty"`
	ThroughputMBPSIncluded  int     `json:"throughput_mbps_included,omitempty"`
	PricePerIOPSMonth       float64 `json:"price_per_iops_month,omitempty"`
	Description             string  `json:"description"`
}

// DataTransferPricing
type DataTransferPricing struct {
	OutboundFirst10TB  float64 `json:"outbound_first_10tb"`
	OutboundNext40TB   float64 `json:"outbound_next_40tb"`
	OutboundNext100TB  float64 `json:"outbound_next_100tb"`
	Inbound            float64 `json:"inbound"`
	Description        string  `json:"description"`
}

// LoadBalancerPricing
type LoadBalancerPricing struct {
	ALB ALBPricing `json:"alb"`
}

type ALBPricing struct {
	PricePerHour      float64 `json:"price_per_hour"`
	PricePerLCUHour   float64 `json:"price_per_lcu_hour"`
	PricePerMonthBase float64 `json:"price_per_month_base"`
	Description       string  `json:"description"`
}

// CostEstimationRequest from user
type CostEstimationRequest struct {
	Services       []ServiceInfo `json:"services"`
	Region         string        `json:"region"`
	DeploymentType string        `json:"deployment_type"` // "simple" (Docker on EC2) or "production" (AWS managed services)
	Language       string        `json:"language,omitempty"` // "en" or "ko", defaults to "en"
}

// ServiceInfo from canvas
type ServiceInfo struct {
	Name  string `json:"name"`  // "spring", "mysql", "redis"
	Type  string `json:"type"`  // "backend", "database", "cache"
	Image string `json:"image,omitempty"`
	Build string `json:"build,omitempty"`
}

// ResourceRecommendation from OpenAI with multiple tiers
type ResourceRecommendation struct {
	Budget            TierRecommendation `json:"budget"`
	Recommended       TierRecommendation `json:"recommended"`
	Performance       TierRecommendation `json:"performance"`
	OptimizationTips  []string           `json:"optimization_tips"`
}

// TierRecommendation represents a single pricing tier option
type TierRecommendation struct {
	EC2Instances      []InstanceRecommendation   `json:"ec2_instances"`
	RDSInstances      []InstanceRecommendation   `json:"rds_instances"`
	ElastiCache       []InstanceRecommendation   `json:"elasticache"`
	Storage           StorageRecommendation      `json:"storage"`
	LoadBalancer      bool                       `json:"load_balancer"`
	DataTransfer      DataTransferRecommendation `json:"data_transfer"`
	Description       string                     `json:"description"`
	Warnings          []string                   `json:"warnings,omitempty"`
}

type DataTransferRecommendation struct {
	EstimatedGB int    `json:"estimated_gb"`
	Reason      string `json:"reason"`
}

type InstanceRecommendation struct {
	Type   string `json:"type"`
	Count  int    `json:"count"`
	Reason string `json:"reason"`
}

type StorageRecommendation struct {
	Type      string  `json:"type"` // "gp3", "io2"
	SizeGB    int     `json:"size_gb"`
	Reason    string  `json:"reason"`
}

// TierCostBreakdown represents cost breakdown for a single tier
type TierCostBreakdown struct {
	TierName          string      `json:"tier_name"`
	Description       string      `json:"description"`
	InstanceType      string      `json:"instance_type"`
	Warnings          []string    `json:"warnings,omitempty"`
	TotalMonthlyUSD   float64     `json:"total_monthly_usd"`
	EC2Cost           float64     `json:"ec2_cost"`
	RDSCost           float64     `json:"rds_cost"`
	CacheCost         float64     `json:"cache_cost"`
	StorageCost       float64     `json:"storage_cost"`
	LoadBalancerCost  float64     `json:"load_balancer_cost"`
	DataTransferCost  float64     `json:"data_transfer_cost"`
	Details           CostDetails `json:"details"`
}

// CostBreakdown final result with 3 tiers
type CostBreakdown struct {
	BudgetTier       TierCostBreakdown      `json:"budget_tier"`
	RecommendedTier  TierCostBreakdown      `json:"recommended_tier"`
	PerformanceTier  TierCostBreakdown      `json:"performance_tier"`
	Recommendation   ResourceRecommendation `json:"recommendation"`
	OptimizationTips []string               `json:"optimization_tips"`
}

type CostDetails struct {
	EC2Items      []CostItem `json:"ec2_items"`
	RDSItems      []CostItem `json:"rds_items"`
	CacheItems    []CostItem `json:"cache_items"`
	StorageItems  []CostItem `json:"storage_items"`
}

type CostItem struct {
	Name          string  `json:"name"`
	InstanceType  string  `json:"instance_type"`
	Count         int     `json:"count"`
	UnitPrice     float64 `json:"unit_price"`
	TotalPrice    float64 `json:"total_price"`
	Description   string  `json:"description"`
}
