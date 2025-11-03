package pricing

import (
	_ "embed"
	"encoding/json"
	"fmt"
	"sync"
)

//go:embed data/benchmarks.json
var benchmarkData []byte

// BenchmarkDatabase represents the complete benchmark database
type BenchmarkDatabase struct {
	LastUpdated string                        `json:"last_updated"`
	DataSource  string                        `json:"data_source"`
	Backends    map[string]ServiceBenchmark   `json:"backends"`
	Databases   map[string]ServiceBenchmark   `json:"databases"`
	Monitoring  map[string]ServiceBenchmark   `json:"monitoring"`
}

// ServiceBenchmark represents performance characteristics for a service type
type ServiceBenchmark struct {
	ServiceType      string                           `json:"service_type"`
	MinMemoryMB      int                              `json:"min_memory_mb"`
	Instances        map[string]PerformanceCapacity   `json:"instances"`
	Metadata         BenchmarkMetadata                `json:"metadata"`
}

// PerformanceCapacity represents expected capacity for an instance type
type PerformanceCapacity struct {
	MinConcurrentUsers int    `json:"min_concurrent_users"`
	MaxConcurrentUsers int    `json:"max_concurrent_users"`
	AvgResponseMs      int    `json:"avg_response_ms"`
	Notes              string `json:"notes"`
}

// BenchmarkMetadata contains source information
type BenchmarkMetadata struct {
	Source     string `json:"source"`
	Confidence string `json:"confidence"`
}

var (
	benchmarkDB   *BenchmarkDatabase
	benchmarkOnce sync.Once
)

// GetBenchmarkDB returns the singleton benchmark database
func GetBenchmarkDB() (*BenchmarkDatabase, error) {
	var err error
	benchmarkOnce.Do(func() {
		benchmarkDB = &BenchmarkDatabase{}
		if unmarshalErr := json.Unmarshal(benchmarkData, benchmarkDB); unmarshalErr != nil {
			err = fmt.Errorf("failed to unmarshal benchmark data: %w", unmarshalErr)
			return
		}
	})
	if err != nil {
		return nil, err
	}
	return benchmarkDB, nil
}

// GetBenchmarkSummary returns a formatted summary of available benchmarks
func GetBenchmarkSummary() (string, error) {
	db, err := GetBenchmarkDB()
	if err != nil {
		return "", err
	}

	return fmt.Sprintf(`Benchmark Database
Last Updated: %s
Data Source: %s

Available Backend Frameworks: %d
Available Databases: %d
Available Monitoring Tools: %d

Backend Frameworks:
%s

Databases:
%s

Monitoring Tools:
%s`,
		db.LastUpdated,
		db.DataSource,
		len(db.Backends),
		len(db.Databases),
		len(db.Monitoring),
		formatBenchmarkList(db.Backends),
		formatBenchmarkList(db.Databases),
		formatBenchmarkList(db.Monitoring),
	), nil
}

func formatBenchmarkList(benchmarks map[string]ServiceBenchmark) string {
	result := ""
	for name, benchmark := range benchmarks {
		result += fmt.Sprintf("  - %s (min: %dMB, confidence: %s)\n",
			name,
			benchmark.MinMemoryMB,
			benchmark.Metadata.Confidence)
	}
	return result
}
