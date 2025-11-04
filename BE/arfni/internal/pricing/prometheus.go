package pricing

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"time"
)

// PrometheusClient handles Prometheus API queries
type PrometheusClient struct {
	BaseURL string
	Client  *http.Client
}

// NewPrometheusClient creates a new Prometheus client
// Default URL: http://localhost:9090 (from monitoring system)
func NewPrometheusClient(baseURL string) *PrometheusClient {
	if baseURL == "" {
		baseURL = "http://localhost:9090"
	}
	return &PrometheusClient{
		BaseURL: baseURL,
		Client: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
}

// PrometheusResponse represents the API response
type PrometheusResponse struct {
	Status string `json:"status"`
	Data   struct {
		ResultType string `json:"resultType"`
		Result     []struct {
			Metric map[string]string `json:"metric"`
			Value  []interface{}     `json:"value"`
		} `json:"result"`
	} `json:"data"`
}

// MetricValue represents a single metric value
type MetricValue struct {
	Timestamp time.Time
	Value     float64
	Labels    map[string]string
}

// Query executes a PromQL query
func (c *PrometheusClient) Query(query string) ([]MetricValue, error) {
	queryURL := fmt.Sprintf("%s/api/v1/query", c.BaseURL)

	params := url.Values{}
	params.Add("query", query)

	fullURL := fmt.Sprintf("%s?%s", queryURL, params.Encode())

	resp, err := c.Client.Get(fullURL)
	if err != nil {
		return nil, fmt.Errorf("failed to query Prometheus: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("Prometheus API error (status %d): %s", resp.StatusCode, string(body))
	}

	var promResp PrometheusResponse
	if err := json.Unmarshal(body, &promResp); err != nil {
		return nil, fmt.Errorf("failed to parse response: %w", err)
	}

	if promResp.Status != "success" {
		return nil, fmt.Errorf("query failed: %s", promResp.Status)
	}

	var results []MetricValue
	for _, result := range promResp.Data.Result {
		if len(result.Value) < 2 {
			continue
		}

		timestamp := int64(result.Value[0].(float64))
		valueStr, ok := result.Value[1].(string)
		if !ok {
			continue
		}

		var value float64
		fmt.Sscanf(valueStr, "%f", &value)

		results = append(results, MetricValue{
			Timestamp: time.Unix(timestamp, 0),
			Value:     value,
			Labels:    result.Metric,
		})
	}

	return results, nil
}

// GetCPUUsage gets current CPU usage percentage (0-100)
func (c *PrometheusClient) GetCPUUsage() (float64, error) {
	query := `100 - (avg by (instance) (rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)`
	results, err := c.Query(query)
	if err != nil {
		return 0, err
	}

	if len(results) == 0 {
		return 0, fmt.Errorf("no CPU data available")
	}

	return results[0].Value, nil
}

// GetMemoryUsage gets current memory usage in MB and percentage
func (c *PrometheusClient) GetMemoryUsage() (usedMB float64, usagePercent float64, err error) {
	// Total memory
	totalQuery := `node_memory_MemTotal_bytes / 1024 / 1024`
	totalResults, err := c.Query(totalQuery)
	if err != nil {
		return 0, 0, err
	}
	if len(totalResults) == 0 {
		return 0, 0, fmt.Errorf("no total memory data available")
	}
	totalMB := totalResults[0].Value

	// Available memory
	availQuery := `node_memory_MemAvailable_bytes / 1024 / 1024`
	availResults, err := c.Query(availQuery)
	if err != nil {
		return 0, 0, err
	}
	if len(availResults) == 0 {
		return 0, 0, fmt.Errorf("no available memory data available")
	}
	availMB := availResults[0].Value

	usedMB = totalMB - availMB
	usagePercent = (usedMB / totalMB) * 100

	return usedMB, usagePercent, nil
}

// GetNetworkTraffic gets network traffic in MB (last 24 hours)
func (c *PrometheusClient) GetNetworkTraffic() (inboundMB float64, outboundMB float64, err error) {
	// Outbound traffic (transmitted)
	outQuery := `sum(increase(node_network_transmit_bytes_total[24h])) / 1024 / 1024`
	outResults, err := c.Query(outQuery)
	if err != nil {
		return 0, 0, err
	}
	if len(outResults) > 0 {
		outboundMB = outResults[0].Value
	}

	// Inbound traffic (received)
	inQuery := `sum(increase(node_network_receive_bytes_total[24h])) / 1024 / 1024`
	inResults, err := c.Query(inQuery)
	if err != nil {
		return 0, 0, err
	}
	if len(inResults) > 0 {
		inboundMB = inResults[0].Value
	}

	return inboundMB, outboundMB, nil
}

// GetDiskUsage gets disk usage in GB and percentage
func (c *PrometheusClient) GetDiskUsage() (usedGB float64, usagePercent float64, err error) {
	// Total disk space (try /host for containerized node_exporter, fallback to /)
	totalQuery := `node_filesystem_size_bytes{mountpoint=~"/host|/"} / 1024 / 1024 / 1024`
	totalResults, err := c.Query(totalQuery)
	if err != nil {
		return 0, 0, err
	}
	if len(totalResults) == 0 {
		return 0, 0, fmt.Errorf("no total disk data available")
	}
	totalGB := totalResults[0].Value

	// Available disk space
	availQuery := `node_filesystem_avail_bytes{mountpoint=~"/host|/"} / 1024 / 1024 / 1024`
	availResults, err := c.Query(availQuery)
	if err != nil {
		return 0, 0, err
	}
	if len(availResults) == 0 {
		return 0, 0, fmt.Errorf("no available disk data available")
	}
	availGB := availResults[0].Value

	usedGB = totalGB - availGB
	usagePercent = (usedGB / totalGB) * 100

	return usedGB, usagePercent, nil
}

// GetInstanceInfo retrieves EC2 instance type from node_exporter labels
func (c *PrometheusClient) GetInstanceInfo() (string, error) {
	query := `node_uname_info`
	results, err := c.Query(query)
	if err != nil {
		return "", err
	}

	if len(results) == 0 {
		return "", fmt.Errorf("no instance info available")
	}

	// Try to get instance type from labels
	if instanceType, ok := results[0].Labels["instance_type"]; ok {
		return instanceType, nil
	}

	return "unknown", nil
}
