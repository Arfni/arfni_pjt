package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"syscall"

	"github.com/arfni/arfni/internal/pricing"
	"gopkg.in/yaml.v3"
)

func main() {
	if len(os.Args) < 2 {
		printUsage()
		os.Exit(1)
	}

	command := os.Args[1]

	switch command {
	case "deploy", "run":
		runDeploy(os.Args[2:])
	case "monitor", "monitoring":
		runMonitoring(os.Args[2:])
	case "estimate-cost", "estimate":
		runCostEstimation(os.Args[2:])
	case "optimize":
		runOptimize(os.Args[2:])
	case "help", "-h", "--help":
		printUsage()
	default:
		fmt.Printf("[ERROR] Unknown command: %s\n\n", command)
		printUsage()
		os.Exit(1)
	}
}

func printUsage() {
	fmt.Println("================================================")
	fmt.Println("  Arfni CLI")
	fmt.Println("================================================")
	fmt.Println()
	fmt.Println("Usage:")
	fmt.Println("  arfni-go.exe <command> [options]")
	fmt.Println()
	fmt.Println("Commands:")
	fmt.Println("  deploy         Deploy services (alias: run)")
	fmt.Println("  monitor        Start monitoring (alias: monitoring)")
	fmt.Println("  estimate-cost  Estimate AWS costs (alias: estimate)")
	fmt.Println("  optimize       Analyze actual usage and optimize costs")
	fmt.Println("  help           Show this help message")
	fmt.Println()
	fmt.Println("Deploy Options:")
	fmt.Println("  -f string")
	fmt.Println("        Path to stack.yaml (default: stack.yaml)")
	fmt.Println("  -project-dir string")
	fmt.Println("        Project root directory (default: stack.yaml directory)")
	fmt.Println("  -plugins-dir string")
	fmt.Println("        Plugins directory path for user-installed plugins")
	fmt.Println("  -bundled-plugins-dir string")
	fmt.Println("        Bundled plugins directory path for built-in plugins")
	fmt.Println()
	fmt.Println("Monitor Options:")
	fmt.Println("  -f string")
	fmt.Println("        Path to stack.yaml (default: stack.yaml)")
	fmt.Println()
	fmt.Println("Cost Estimation Options:")
	fmt.Println("  -f string")
	fmt.Println("        Path to stack.yaml (default: stack.yaml)")
	fmt.Println("  -users int")
	fmt.Println("        Expected number of users (default: 100)")
	fmt.Println("  -traffic string")
	fmt.Println("        Expected traffic level: low, medium, high (default: medium)")
	fmt.Println("  -deployment string")
	fmt.Println("        Deployment type: simple, production (default: simple)")
	fmt.Println("          simple: Docker containers on single EC2 (cost-effective)")
	fmt.Println("          production: AWS managed services - RDS, ElastiCache (high availability)")
	fmt.Println()
	fmt.Println("Optimize Options:")
	fmt.Println("  -prometheus string")
	fmt.Println("        Prometheus URL (default: http://localhost:9090)")
	fmt.Println()
	fmt.Println("Examples:")
	fmt.Println("  arfni-go.exe deploy -f stack.yaml")
	fmt.Println("  arfni-go.exe monitor -f stack.yaml")
	fmt.Println("  arfni-go.exe estimate-cost -f stack.yaml -users 100 -traffic low")
	fmt.Println("  arfni-go.exe estimate-cost -f stack.yaml -users 100 -traffic low -deployment simple")
	fmt.Println("  arfni-go.exe estimate-cost -f stack.yaml -users 1000 -traffic high -deployment production")
	fmt.Println("  arfni-go.exe optimize")
	fmt.Println("  arfni-go.exe optimize -prometheus http://localhost:9090")
	fmt.Println()
}

// ========== Deploy Command ==========

func runDeploy(args []string) {
	fs := flag.NewFlagSet("deploy", flag.ExitOnError)
	stackFileFlag := fs.String("f", "stack.yaml", "path to stack.yaml")
	projectDirFlag := fs.String("project-dir", "", "project root directory")
	pluginsDirFlag := fs.String("plugins-dir", "", "plugins directory path")
	bundledPluginsDirFlag := fs.String("bundled-plugins-dir", "", "bundled plugins directory path")
	fs.Parse(args)

	stackFile := *stackFileFlag
	projectDir := *projectDirFlag
	pluginsDir := *pluginsDirFlag
	bundledPluginsDir := *bundledPluginsDirFlag

	// 현재 실행 파일의 위치 찾기
	exePath, err := os.Executable()
	if err != nil {
		fmt.Printf("[ERROR] Failed to get executable path: %v\n", err)
		os.Exit(1)
	}
	exeDir := filepath.Dir(exePath)

	// ic.exe 경로 찾기
	icExe := findICExecutable(exeDir)
	if icExe == "" {
		fmt.Println("[ERROR] ic.exe not found. Tried the following locations:")
		fmt.Printf("  1. %s\n", filepath.Join(exeDir, "ic.exe"))
		fmt.Printf("  2. %s\n", filepath.Join(exeDir, "..", "ic.exe"))
		cwd, _ := os.Getwd()
		fmt.Printf("  3. %s\n", filepath.Join(cwd, "ic.exe"))
		os.Exit(1)
	}

	// stack.yaml 절대 경로 계산
	if !filepath.IsAbs(stackFile) {
		cwd, err := os.Getwd()
		if err != nil {
			fmt.Printf("[ERROR] Failed to get current directory: %v\n", err)
			os.Exit(1)
		}
		stackFile = filepath.Join(cwd, stackFile)
	}

	if _, err := os.Stat(stackFile); os.IsNotExist(err) {
		fmt.Printf("[ERROR] stack.yaml not found at: %s\n", stackFile)
		os.Exit(1)
	}

	fmt.Println()
	fmt.Println("================================================")
	fmt.Println("  Arfni - Deploy")
	fmt.Println("================================================")
	fmt.Println()
	fmt.Printf("Stack File:    %s\n", stackFile)
	if projectDir != "" {
		fmt.Printf("Project Dir:   %s\n", projectDir)
	}
	if pluginsDir != "" {
		fmt.Printf("Plugins Dir:   %s\n", pluginsDir)
	}
	if bundledPluginsDir != "" {
		fmt.Printf("Bundled Plugins Dir: %s\n", bundledPluginsDir)
	}
	fmt.Printf("IC Engine:     %s\n", icExe)
	fmt.Println()

	// ic.exe run -f 직접 실행 (project-dir, plugins-dir, bundled-plugins-dir 포함)
	cmdArgs := []string{"run", "-f", stackFile}
	if projectDir != "" {
		cmdArgs = append(cmdArgs, "-project-dir", projectDir)
	}
	if pluginsDir != "" {
		cmdArgs = append(cmdArgs, "-plugins-dir", pluginsDir)
	}
	if bundledPluginsDir != "" {
		cmdArgs = append(cmdArgs, "-bundled-plugins-dir", bundledPluginsDir)
	}

	deployCmd := exec.Command(icExe, cmdArgs...)
	deployCmd.Stdout = os.Stdout
	deployCmd.Stderr = os.Stderr
	deployCmd.Stdin = os.Stdin

	// Windows에서 콘솔 창 숨김
	if runtime.GOOS == "windows" {
		deployCmd.SysProcAttr = &syscall.SysProcAttr{
			HideWindow:    true,
			CreationFlags: 0x08000000 | 0x00000200, // CREATE_NO_WINDOW | CREATE_NEW_PROCESS_GROUP
		}
	}

	if err := deployCmd.Run(); err != nil {
		fmt.Println()
		fmt.Println("================================================")
		fmt.Println("[FAILED] Deployment failed!")
		fmt.Println("================================================")
		os.Exit(1)
	}

	fmt.Println()
	fmt.Println("[SUCCESS] Deployment completed successfully!")
	fmt.Println()
}

// ========== Monitor Command ==========

type StackYAML struct {
	Targets map[string]Target `yaml:"targets"`
}

type Target struct {
	Type   string `yaml:"type"`
	Host   string `yaml:"host"`
	User   string `yaml:"user"`
	SSHKey string `yaml:"sshKey"`
}

func runMonitoring(args []string) {
	fs := flag.NewFlagSet("monitor", flag.ExitOnError)
	stackFileFlag := fs.String("f", "stack.yaml", "path to stack.yaml")
	fs.Parse(args)

	stackFile := *stackFileFlag

	// stack.yaml 절대 경로 계산
	if !filepath.IsAbs(stackFile) {
		cwd, err := os.Getwd()
		if err != nil {
			fmt.Printf("[ERROR] Failed to get current directory: %v\n", err)
			os.Exit(1)
		}
		stackFile = filepath.Join(cwd, stackFile)
	}

	if _, err := os.Stat(stackFile); os.IsNotExist(err) {
		fmt.Printf("[ERROR] stack.yaml not found at: %s\n", stackFile)
		os.Exit(1)
	}

	// stack.yaml에서 EC2 정보 추출
	data, err := os.ReadFile(stackFile)
	if err != nil {
		fmt.Printf("[ERROR] Failed to read stack.yaml: %v\n", err)
		os.Exit(1)
	}

	var stack StackYAML
	if err := yaml.Unmarshal(data, &stack); err != nil {
		fmt.Printf("[ERROR] Failed to parse YAML: %v\n", err)
		os.Exit(1)
	}

	// EC2 타겟 찾기
	var host, user, sshKey string
	for _, target := range stack.Targets {
		if strings.EqualFold(target.Type, "ec2.ssh") {
			host = target.Host
			user = target.User
			sshKey = target.SSHKey
			break
		}
	}

	if host == "" || user == "" || sshKey == "" {
		fmt.Println("[ERROR] EC2 target not found in stack.yaml")
		fmt.Println("[INFO] Monitoring is only available for EC2 deployments")
		os.Exit(1)
	}

	// 현재 실행 파일의 위치에서 arfni-monitoring.exe 찾기
	exePath, _ := os.Executable()
	exeDir := filepath.Dir(exePath)

	monitoringExe := filepath.Join(exeDir, "arfni-monitoring.exe")
	if _, err := os.Stat(monitoringExe); os.IsNotExist(err) {
		fmt.Printf("[ERROR] arfni-monitoring.exe not found at: %s\n", monitoringExe)
		os.Exit(1)
	}

	fmt.Println()
	fmt.Println("================================================")
	fmt.Println("  Arfni - Monitoring")
	fmt.Println("================================================")
	fmt.Println()
	fmt.Printf("EC2 Host:      %s\n", host)
	fmt.Printf("SSH User:      %s\n", user)
	fmt.Printf("Monitoring:    %s\n", monitoringExe)
	fmt.Println()

	// arfni-monitoring.exe 호출
	// 사용법: arfni-monitoring.exe <host> <key> <user> <stack-path>
	cmd := exec.Command(monitoringExe, host, sshKey, user, stackFile)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	cmd.Stdin = os.Stdin

	// Windows에서 콘솔 창 숨김
	if runtime.GOOS == "windows" {
		cmd.SysProcAttr = &syscall.SysProcAttr{
			HideWindow:    true,
			CreationFlags: 0x08000000, // CREATE_NO_WINDOW
		}
	}

	if err := cmd.Run(); err != nil {
		fmt.Printf("[ERROR] Monitoring failed: %v\n", err)
		os.Exit(1)
	}
}

// ========== Helper Functions ==========

func findICExecutable(exeDir string) string {
	cwd, _ := os.Getwd()

	candidates := []string{
		filepath.Join(exeDir, "ic.exe"),
		filepath.Join(exeDir, "..", "ic.exe"),
		filepath.Join(cwd, "ic.exe"),
	}

	for _, candidate := range candidates {
		absPath, err := filepath.Abs(candidate)
		if err != nil {
			continue
		}
		if _, err := os.Stat(absPath); err == nil {
			return absPath
		}
	}

	return ""
}

// ========== Cost Estimation Command ==========

type ServiceSpec struct {
	Build string   `yaml:"build"`
	Image string   `yaml:"image"`
	Ports []string `yaml:"ports"`
}

type Service struct {
	Kind   string      `yaml:"kind"`
	Target string      `yaml:"target"`
	Spec   ServiceSpec `yaml:"spec"`
}

type StackConfig struct {
	Name     string             `yaml:"name"`
	Services map[string]Service `yaml:"services"`
}

func runCostEstimation(args []string) {
	fs := flag.NewFlagSet("estimate-cost", flag.ExitOnError)
	stackFileFlag := fs.String("f", "stack.yaml", "path to stack.yaml")
	usersFlag := fs.Int("users", 100, "expected number of users")
	trafficFlag := fs.String("traffic", "medium", "expected traffic level (low, medium, high)")
	deploymentFlag := fs.String("deployment", "simple", "deployment type (simple, production)")
	fs.Parse(args)

	stackFile := *stackFileFlag
	expectedUsers := *usersFlag
	expectedTraffic := *trafficFlag
	deploymentType := *deploymentFlag

	// Validate traffic level
	if expectedTraffic != "low" && expectedTraffic != "medium" && expectedTraffic != "high" {
		fmt.Printf("[ERROR] Invalid traffic level: %s (must be low, medium, or high)\n", expectedTraffic)
		os.Exit(1)
	}

	// Validate deployment type
	if deploymentType != "simple" && deploymentType != "production" {
		fmt.Printf("[ERROR] Invalid deployment type: %s (must be simple or production)\n", deploymentType)
		os.Exit(1)
	}

	// stack.yaml 절대 경로 계산
	if !filepath.IsAbs(stackFile) {
		cwd, err := os.Getwd()
		if err != nil {
			fmt.Printf("[ERROR] Failed to get current directory: %v\n", err)
			os.Exit(1)
		}
		stackFile = filepath.Join(cwd, stackFile)
	}

	if _, err := os.Stat(stackFile); os.IsNotExist(err) {
		fmt.Printf("[ERROR] stack.yaml not found at: %s\n", stackFile)
		os.Exit(1)
	}

	fmt.Println()
	fmt.Println("================================================")
	fmt.Println("  Arfni - AWS Cost Estimation")
	fmt.Println("================================================")
	fmt.Println()
	fmt.Printf("Stack File:        %s\n", stackFile)
	fmt.Printf("Expected Users:    %d\n", expectedUsers)
	fmt.Printf("Expected Traffic:  %s\n", expectedTraffic)
	fmt.Printf("Deployment Type:   %s\n", deploymentType)
	if deploymentType == "simple" {
		fmt.Println("                   (Docker containers on single EC2)")
	} else {
		fmt.Println("                   (AWS managed services - RDS, ElastiCache)")
	}
	fmt.Println()

	// Parse stack.yaml
	data, err := os.ReadFile(stackFile)
	if err != nil {
		fmt.Printf("[ERROR] Failed to read stack.yaml: %v\n", err)
		os.Exit(1)
	}

	var stack StackConfig
	if err := yaml.Unmarshal(data, &stack); err != nil {
		fmt.Printf("[ERROR] Failed to parse stack.yaml: %v\n", err)
		os.Exit(1)
	}

	// Extract services from stack.yaml
	var services []pricing.ServiceInfo
	for name, svc := range stack.Services {
		serviceType := detectServiceType(name, svc)
		services = append(services, pricing.ServiceInfo{
			Name:  name,
			Type:  serviceType,
			Image: svc.Spec.Image,
			Build: svc.Spec.Build,
		})
	}

	if len(services) == 0 {
		fmt.Println("[ERROR] No services found in stack.yaml")
		os.Exit(1)
	}

	fmt.Println("Detected Services:")
	for _, svc := range services {
		fmt.Printf("  - %s (%s)\n", svc.Name, svc.Type)
	}
	fmt.Println()

	// Create cost estimation request
	req := pricing.CostEstimationRequest{
		Services:        services,
		ExpectedUsers:   expectedUsers,
		ExpectedTraffic: expectedTraffic,
		Region:          "ap-northeast-2",
		DeploymentType:  deploymentType,
	}

	// Initialize cost estimator
	estimator, err := pricing.NewCostEstimator()
	if err != nil {
		fmt.Printf("[ERROR] Failed to initialize cost estimator: %v\n", err)
		os.Exit(1)
	}

	fmt.Println("[INFO] Analyzing your requirements with AI...")
	fmt.Println("[INFO] Getting AWS resource recommendations...")
	fmt.Println()

	// Get cost estimation
	breakdown, err := estimator.EstimateCost(req)
	if err != nil {
		fmt.Printf("[ERROR] Failed to estimate costs: %v\n", err)
		fmt.Println()
		fmt.Println("[HINT] Make sure OPENAI_API_KEY environment variable is set")
		os.Exit(1)
	}

	// Print 3-tier results
	fmt.Println("================================================")
	fmt.Println("  Pricing Tiers")
	fmt.Println("================================================")
	fmt.Println()

	// Helper function to print a tier
	printTier := func(tier pricing.TierCostBreakdown, tierRec pricing.TierRecommendation) {
		fmt.Printf("--- %s ---\n", tier.TierName)
		fmt.Printf("Description: %s\n", tier.Description)
		fmt.Println()

		// Print warnings if any
		if len(tier.Warnings) > 0 {
			fmt.Println("WARNINGS:")
			for _, warning := range tier.Warnings {
				fmt.Printf("  ! %s\n", warning)
			}
			fmt.Println()
		}

		// Print cost breakdown
		if tier.EC2Cost > 0 {
			fmt.Printf("  EC2 Instances:       $%.2f/month\n", tier.EC2Cost)
		}
		if tier.RDSCost > 0 {
			fmt.Printf("  RDS Databases:       $%.2f/month\n", tier.RDSCost)
		}
		if tier.CacheCost > 0 {
			fmt.Printf("  ElastiCache:         $%.2f/month\n", tier.CacheCost)
		}
		if tier.StorageCost > 0 {
			fmt.Printf("  Storage (EBS):       $%.2f/month\n", tier.StorageCost)
		}
		if tier.LoadBalancerCost > 0 {
			fmt.Printf("  Load Balancer:       $%.2f/month\n", tier.LoadBalancerCost)
		}
		if tier.DataTransferCost > 0 {
			fmt.Printf("  Data Transfer:       $%.2f/month\n", tier.DataTransferCost)
		}
		fmt.Println("  ------------------------------------------------")
		fmt.Printf("  TOTAL:               $%.2f/month\n", tier.TotalMonthlyUSD)
		fmt.Println()

		// Print resource details
		if len(tierRec.EC2Instances) > 0 {
			fmt.Println("  EC2 Instances:")
			for _, inst := range tierRec.EC2Instances {
				fmt.Printf("    - %dx %s\n", inst.Count, inst.Type)
				fmt.Printf("      Reason: %s\n", inst.Reason)
			}
			fmt.Println()
		}

		if len(tierRec.RDSInstances) > 0 {
			fmt.Println("  RDS Databases:")
			for _, inst := range tierRec.RDSInstances {
				fmt.Printf("    - %dx %s\n", inst.Count, inst.Type)
				fmt.Printf("      Reason: %s\n", inst.Reason)
			}
			fmt.Println()
		}

		if len(tierRec.ElastiCache) > 0 {
			fmt.Println("  ElastiCache:")
			for _, inst := range tierRec.ElastiCache {
				fmt.Printf("    - %dx %s\n", inst.Count, inst.Type)
				fmt.Printf("      Reason: %s\n", inst.Reason)
			}
			fmt.Println()
		}

		if tierRec.Storage.SizeGB > 0 {
			fmt.Println("  Storage:")
			fmt.Printf("    - %d GB (%s)\n", tierRec.Storage.SizeGB, tierRec.Storage.Type)
			fmt.Printf("      Reason: %s\n", tierRec.Storage.Reason)
			fmt.Println()
		}

		if tierRec.DataTransfer.EstimatedGB > 0 {
			fmt.Println("  Data Transfer:")
			fmt.Printf("    - Estimated: %d GB/month\n", tierRec.DataTransfer.EstimatedGB)
			fmt.Printf("      Note: %s\n", tierRec.DataTransfer.Reason)
			fmt.Println()
		}

		fmt.Println()
	}

	// Print all three tiers
	printTier(breakdown.BudgetTier, breakdown.Recommendation.Budget)
	printTier(breakdown.RecommendedTier, breakdown.Recommendation.Recommended)
	printTier(breakdown.PerformanceTier, breakdown.Recommendation.Performance)

	if len(breakdown.OptimizationTips) > 0 {
		fmt.Println("================================================")
		fmt.Println("  Cost Optimization Tips")
		fmt.Println("================================================")
		fmt.Println()
		for i, tip := range breakdown.OptimizationTips {
			fmt.Printf("%d. %s\n", i+1, tip)
		}
		fmt.Println()
	}

	// Output JSON for GUI integration
	jsonOutput, _ := json.Marshal(breakdown)
	fmt.Printf("__COST_ESTIMATION__%s\n", string(jsonOutput))
}

func detectServiceType(name string, svc Service) string {
	nameLower := strings.ToLower(name)

	// Check for database services
	if strings.Contains(nameLower, "mysql") ||
		strings.Contains(nameLower, "postgres") ||
		strings.Contains(nameLower, "mariadb") ||
		strings.Contains(nameLower, "db") {
		return "database"
	}

	// Check for cache services
	if strings.Contains(nameLower, "redis") ||
		strings.Contains(nameLower, "memcached") ||
		strings.Contains(nameLower, "cache") {
		return "cache"
	}

	// Check by image name
	if svc.Spec.Image != "" {
		imageLower := strings.ToLower(svc.Spec.Image)
		if strings.Contains(imageLower, "mysql") ||
			strings.Contains(imageLower, "postgres") ||
			strings.Contains(imageLower, "mariadb") {
			return "database"
		}
		if strings.Contains(imageLower, "redis") ||
			strings.Contains(imageLower, "memcached") {
			return "cache"
		}
	}

	// Default to backend
	return "backend"
}

// ========== Optimize Command ==========

func runOptimize(args []string) {
	fs := flag.NewFlagSet("optimize", flag.ExitOnError)
	prometheusURL := fs.String("prometheus", "http://localhost:9090", "Prometheus server URL")
	fs.Parse(args)

	fmt.Println()
	fmt.Println("================================================")
	fmt.Println("  Arfni - Cost Optimization Analysis")
	fmt.Println("================================================")
	fmt.Println()
	fmt.Printf("Prometheus URL:    %s\n", *prometheusURL)
	fmt.Println()

	// Initialize optimization analyzer
	analyzer, err := pricing.NewOptimizationAnalyzer(*prometheusURL)
	if err != nil {
		fmt.Printf("[ERROR] Failed to initialize optimizer: %v\n", err)
		os.Exit(1)
	}

	fmt.Println("[INFO] Collecting metrics from Prometheus...")
	fmt.Println("[INFO] Analyzing actual usage patterns...")
	fmt.Println()

	// Run analysis
	report, err := analyzer.Analyze()
	if err != nil {
		fmt.Printf("[ERROR] Failed to analyze: %v\n", err)
		fmt.Println()
		fmt.Println("[HINT] Make sure Prometheus is running at the specified URL")
		fmt.Println("[HINT] Start monitoring with: arfni-go.exe monitor -f stack.yaml")
		os.Exit(1)
	}

	// Print actual usage
	fmt.Println("================================================")
	fmt.Println("  Actual Resource Usage (from Prometheus)")
	fmt.Println("================================================")
	fmt.Println()
	if report.ActualUsage.InstanceType != "" && report.ActualUsage.InstanceType != "unknown" {
		fmt.Printf("Instance Type:       %s\n", report.ActualUsage.InstanceType)
	}
	fmt.Printf("CPU Usage:           %.1f%%\n", report.ActualUsage.CPUUsagePercent)
	fmt.Printf("Memory Usage:        %.0f MB (%.1f%%)\n", report.ActualUsage.MemoryUsedMB, report.ActualUsage.MemoryUsagePercent)
	fmt.Printf("Disk Usage:          %.1f GB (%.1f%%)\n", report.ActualUsage.DiskUsedGB, report.ActualUsage.DiskUsagePercent)
	fmt.Printf("Network (24h):       %.1f MB in / %.1f MB out\n", report.ActualUsage.NetworkInboundMB, report.ActualUsage.NetworkOutboundMB)
	fmt.Println()

	// Print cost analysis
	if report.CostAnalysis.CurrentInstanceType != "" && report.CostAnalysis.CurrentInstanceType != "unknown" {
		fmt.Println("================================================")
		fmt.Println("  Cost Analysis")
		fmt.Println("================================================")
		fmt.Println()
		fmt.Printf("Current Instance:    %s ($%.2f/month)\n", report.CostAnalysis.CurrentInstanceType, report.CostAnalysis.CurrentMonthlyCost)
		fmt.Printf("Data Transfer Cost:  $%.2f/month\n", report.CostAnalysis.ActualDataTransfer)
		if report.CostAnalysis.PotentialSavings > 0 {
			fmt.Printf("Potential Savings:   $%.2f/month (%.1f%%)\n", report.CostAnalysis.PotentialSavings, report.CostAnalysis.SavingsPercent)
		}
		fmt.Println()
	}

	// Print performance analysis
	fmt.Println("================================================")
	fmt.Println("  Performance Analysis")
	fmt.Println("================================================")
	fmt.Println()
	fmt.Printf("Health Status:       %s\n", strings.ToUpper(report.PerformanceAnalysis.HealthStatus))
	fmt.Println()

	if len(report.PerformanceAnalysis.Bottlenecks) > 0 {
		fmt.Println("Performance Bottlenecks:")
		for _, bottleneck := range report.PerformanceAnalysis.Bottlenecks {
			fmt.Printf("  ! %s\n", bottleneck)
		}
		fmt.Println()
	} else {
		fmt.Println("No performance bottlenecks detected.")
		fmt.Println()
	}

	// Print recommendations
	fmt.Println("================================================")
	fmt.Println("  Recommendations")
	fmt.Println("================================================")
	fmt.Println()

	// Group by priority
	highPriority := []pricing.Recommendation{}
	mediumPriority := []pricing.Recommendation{}
	lowPriority := []pricing.Recommendation{}

	for _, rec := range report.Recommendations {
		switch rec.Priority {
		case "high":
			highPriority = append(highPriority, rec)
		case "medium":
			mediumPriority = append(mediumPriority, rec)
		case "low":
			lowPriority = append(lowPriority, rec)
		}
	}

	printRecommendations := func(priority string, recommendations []pricing.Recommendation) {
		if len(recommendations) == 0 {
			return
		}
		fmt.Printf("--- %s Priority ---\n", strings.ToUpper(priority))
		fmt.Println()
		for i, rec := range recommendations {
			fmt.Printf("%d. [%s] %s\n", i+1, strings.ToUpper(rec.Category), rec.Title)
			fmt.Printf("   Description: %s\n", rec.Description)
			fmt.Printf("   Impact: %s\n", rec.Impact)
			if rec.Savings > 0 {
				fmt.Printf("   Savings: $%.2f/month\n", rec.Savings)
			}
			fmt.Println()
		}
	}

	printRecommendations("high", highPriority)
	printRecommendations("medium", mediumPriority)
	printRecommendations("low", lowPriority)

	// Output JSON for GUI integration
	jsonOutput, _ := json.Marshal(report)
	fmt.Printf("__OPTIMIZATION_REPORT__%s\n", string(jsonOutput))
}
