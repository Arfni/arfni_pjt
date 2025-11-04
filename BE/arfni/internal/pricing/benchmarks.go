package pricing

import (
	"fmt"
	"strings"
)

// DetectServiceBenchmark identifies the appropriate benchmark for a service
func DetectServiceBenchmark(serviceName, serviceType, image string) (*ServiceBenchmark, error) {
	db, err := GetBenchmarkDB()
	if err != nil {
		return nil, fmt.Errorf("failed to load benchmark database: %w", err)
	}

	nameLower := strings.ToLower(serviceName)
	imageLower := strings.ToLower(image)

	// Monitoring service detection (check FIRST to avoid false matches with "node")
	// Prometheus detection
	if strings.Contains(nameLower, "prometheus") || strings.Contains(imageLower, "prometheus") {
		if benchmark, exists := db.Monitoring["prometheus"]; exists {
			return &benchmark, nil
		}
	}
	// Grafana detection
	if strings.Contains(nameLower, "grafana") || strings.Contains(imageLower, "grafana") {
		if benchmark, exists := db.Monitoring["grafana"]; exists {
			return &benchmark, nil
		}
	}
	// Node Exporter detection (handles both hyphen and underscore)
	// IMPORTANT: Must check before nodejs detection to avoid "node" substring match
	if strings.Contains(nameLower, "node-exporter") || strings.Contains(nameLower, "node_exporter") ||
		strings.Contains(imageLower, "node-exporter") || strings.Contains(imageLower, "node_exporter") {
		if benchmark, exists := db.Monitoring["node-exporter"]; exists {
			return &benchmark, nil
		}
	}

	// Check service name and image for framework/database identification
	if serviceType == "backend" {
		// Spring Boot detection
		if strings.Contains(nameLower, "spring") || strings.Contains(imageLower, "spring") {
			if benchmark, exists := db.Backends["spring-boot"]; exists {
				return &benchmark, nil
			}
		}
		// Node.js detection
		if strings.Contains(nameLower, "node") || strings.Contains(imageLower, "node") ||
			strings.Contains(nameLower, "express") {
			if benchmark, exists := db.Backends["nodejs"]; exists {
				return &benchmark, nil
			}
		}
		// Python detection
		if strings.Contains(nameLower, "python") || strings.Contains(imageLower, "python") ||
			strings.Contains(nameLower, "django") || strings.Contains(nameLower, "flask") {
			if benchmark, exists := db.Backends["python"]; exists {
				return &benchmark, nil
			}
		}
	}

	if serviceType == "database" {
		// MySQL detection
		if strings.Contains(nameLower, "mysql") || strings.Contains(imageLower, "mysql") ||
			strings.Contains(nameLower, "mariadb") {
			if benchmark, exists := db.Databases["mysql"]; exists {
				return &benchmark, nil
			}
		}
		// PostgreSQL detection
		if strings.Contains(nameLower, "postgres") || strings.Contains(imageLower, "postgres") {
			if benchmark, exists := db.Databases["postgresql"]; exists {
				return &benchmark, nil
			}
		}
	}

	if serviceType == "cache" {
		// Redis detection
		if strings.Contains(nameLower, "redis") || strings.Contains(imageLower, "redis") {
			if benchmark, exists := db.Databases["redis"]; exists {
				return &benchmark, nil
			}
		}
	}

	return nil, fmt.Errorf("no benchmark data for service: %s (type: %s)", serviceName, serviceType)
}

// FormatBenchmarkForPrompt formats benchmark data for inclusion in OpenAI prompt
func FormatBenchmarkForPrompt(benchmark *ServiceBenchmark, serviceName string) string {
	var result strings.Builder

	result.WriteString(fmt.Sprintf("\n%s Performance Data:\n", serviceName))
	result.WriteString(fmt.Sprintf("Minimum Memory: %dMB (VERIFIED from official docs)\n", benchmark.MinMemoryMB))
	result.WriteString(fmt.Sprintf("Data Source: %s\n", benchmark.Metadata.Source))
	result.WriteString(fmt.Sprintf("Confidence Level: %s\n", strings.ToUpper(benchmark.Metadata.Confidence)))
	result.WriteString("\nEstimated Instance Capacity (derived from verified data):\n")

	// Order instances by size
	instanceOrder := []string{"t3.micro", "t3.small", "t3.medium", "t3.large", "t3.xlarge", "m5.large", "m5.xlarge"}

	for _, instanceType := range instanceOrder {
		if capacity, exists := benchmark.Instances[instanceType]; exists {
			if capacity.MaxConcurrentUsers > 0 {
				result.WriteString(fmt.Sprintf("  - %s: %d-%d concurrent users. %s\n",
					instanceType,
					capacity.MinConcurrentUsers,
					capacity.MaxConcurrentUsers,
					capacity.Notes))
			} else {
				result.WriteString(fmt.Sprintf("  - %s: %s\n",
					instanceType,
					capacity.Notes))
			}
		}
	}

	return result.String()
}

// BuildBenchmarkContext builds benchmark context for all services in the request
func BuildBenchmarkContext(services []ServiceInfo) string {
	var context strings.Builder

	context.WriteString("\n--- Benchmark Data (from Verified Sources) ---\n")
	context.WriteString("The following data includes VERIFIED memory requirements and ESTIMATED capacity ranges.\n")
	context.WriteString("Data sources: public benchmarks and production case studies.\n")
	context.WriteString("Use this data as PRIMARY reference, but validate reasonability (see confidence levels).\n")

	foundBenchmarks := false
	for _, svc := range services {
		benchmark, err := DetectServiceBenchmark(svc.Name, svc.Type, svc.Image)
		if err != nil {
			// No benchmark data for this service
			continue
		}

		foundBenchmarks = true
		context.WriteString(FormatBenchmarkForPrompt(benchmark, svc.Name))
	}

	if !foundBenchmarks {
		return "\n--- No benchmark data available for these services ---\n" +
			"Use your general knowledge to recommend appropriate instance types.\n"
	}

	context.WriteString("\n--- End of Benchmark Data ---\n")
	context.WriteString("IMPORTANT: Use the data above as primary reference.\n")
	context.WriteString("Note: Capacity ranges are ESTIMATES. Validate reasonability against instance specs.\n")
	context.WriteString("If data seems unreasonable, use your judgment and explain in your reason.\n")
	context.WriteString("If user count falls between ranges, choose the larger instance for safety.\n\n")

	return context.String()
}

// GetBenchmarkSummaryForService returns a brief summary of benchmark data for a service
func GetBenchmarkSummaryForService(serviceName, serviceType, image string) string {
	benchmark, err := DetectServiceBenchmark(serviceName, serviceType, image)
	if err != nil {
		return fmt.Sprintf("No benchmark data available for %s", serviceName)
	}

	return fmt.Sprintf("%s: Min memory %dMB (Source: %s, Confidence: %s)",
		serviceName,
		benchmark.MinMemoryMB,
		benchmark.Metadata.Source,
		strings.ToUpper(benchmark.Metadata.Confidence))
}
