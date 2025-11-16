package pricing

import (
	"encoding/json"
	"fmt"
	"io"
	"math"
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

// GetInstanceInfo retrieves EC2 instance type from node_exporter textfile collector
func (c *PrometheusClient) GetInstanceInfo() (string, error) {
	// Try ec2_instance_type_info first (from textfile collector)
	query := `ec2_instance_type_info`
	results, err := c.Query(query)
	if err == nil && len(results) > 0 {
		// Get instance type from label
		if instanceType, ok := results[0].Labels["type"]; ok && instanceType != "unknown" {
			return instanceType, nil
		}
	}

	// Fallback: Try ec2_instance_info (full metadata)
	query = `ec2_instance_info`
	results, err = c.Query(query)
	if err == nil && len(results) > 0 {
		if instanceType, ok := results[0].Labels["instance_type"]; ok && instanceType != "unknown" {
			return instanceType, nil
		}
	}

	// Fallback: Try node_uname_info (legacy)
	query = `node_uname_info`
	results, err = c.Query(query)
	if err == nil && len(results) > 0 {
		if instanceType, ok := results[0].Labels["instance_type"]; ok {
			return instanceType, nil
		}
	}

	return "unknown", nil
}

// TimeSeriesData represents a time series of metric values
type TimeSeriesData struct {
	Timestamps []time.Time
	Values     []float64
}

// TimeSeriesStats contains statistical analysis of time series data
type TimeSeriesStats struct {
	Min       float64
	Max       float64
	Average   float64
	P50       float64 // Median
	P95       float64 // 95th percentile
	P99       float64 // 99th percentile
	StdDev    float64 // Standard deviation
	PeakHours []int   // Hours (0-23) with highest usage
}

// QueryRange executes a PromQL range query for time series data
func (c *PrometheusClient) QueryRange(query string, duration time.Duration, step time.Duration) (*TimeSeriesData, error) {
	queryURL := fmt.Sprintf("%s/api/v1/query_range", c.BaseURL)

	end := time.Now()
	start := end.Add(-duration)

	params := url.Values{}
	params.Add("query", query)
	params.Add("start", fmt.Sprintf("%d", start.Unix()))
	params.Add("end", fmt.Sprintf("%d", end.Unix()))
	params.Add("step", fmt.Sprintf("%ds", int(step.Seconds())))

	fullURL := fmt.Sprintf("%s?%s", queryURL, params.Encode())

	resp, err := c.Client.Get(fullURL)
	if err != nil {
		return nil, fmt.Errorf("failed to query Prometheus range: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("Prometheus API error (status %d): %s", resp.StatusCode, string(body))
	}

	var promResp struct {
		Status string `json:"status"`
		Data   struct {
			ResultType string `json:"resultType"`
			Result     []struct {
				Metric map[string]string `json:"metric"`
				Values [][]interface{}   `json:"values"`
			} `json:"result"`
		} `json:"data"`
	}

	if err := json.Unmarshal(body, &promResp); err != nil {
		return nil, fmt.Errorf("failed to parse response: %w", err)
	}

	if promResp.Status != "success" {
		return nil, fmt.Errorf("query failed: %s", promResp.Status)
	}

	if len(promResp.Data.Result) == 0 {
		return nil, fmt.Errorf("no data returned")
	}

	tsData := &TimeSeriesData{
		Timestamps: make([]time.Time, 0),
		Values:     make([]float64, 0),
	}

	for _, valueArr := range promResp.Data.Result[0].Values {
		if len(valueArr) < 2 {
			continue
		}

		timestamp := int64(valueArr[0].(float64))
		valueStr, ok := valueArr[1].(string)
		if !ok {
			continue
		}

		var value float64
		fmt.Sscanf(valueStr, "%f", &value)

		tsData.Timestamps = append(tsData.Timestamps, time.Unix(timestamp, 0))
		tsData.Values = append(tsData.Values, value)
	}

	return tsData, nil
}

// CalculateStats computes statistical metrics for time series data
func (ts *TimeSeriesData) CalculateStats() TimeSeriesStats {
	if len(ts.Values) == 0 {
		return TimeSeriesStats{}
	}

	// Sort values for percentile calculations
	sortedValues := make([]float64, len(ts.Values))
	copy(sortedValues, ts.Values)

	// Simple bubble sort (good enough for small datasets)
	for i := 0; i < len(sortedValues); i++ {
		for j := i + 1; j < len(sortedValues); j++ {
			if sortedValues[i] > sortedValues[j] {
				sortedValues[i], sortedValues[j] = sortedValues[j], sortedValues[i]
			}
		}
	}

	// Calculate basic stats
	stats := TimeSeriesStats{
		Min: sortedValues[0],
		Max: sortedValues[len(sortedValues)-1],
	}

	// Average
	sum := 0.0
	for _, v := range ts.Values {
		sum += v
	}
	stats.Average = sum / float64(len(ts.Values))

	// Percentiles
	stats.P50 = sortedValues[int(float64(len(sortedValues))*0.50)]
	stats.P95 = sortedValues[int(float64(len(sortedValues))*0.95)]
	stats.P99 = sortedValues[int(float64(len(sortedValues))*0.99)]

	// Standard deviation
	variance := 0.0
	for _, v := range ts.Values {
		diff := v - stats.Average
		variance += diff * diff
	}
	variance = variance / float64(len(ts.Values))
	stdDev := math.Sqrt(variance)
	stats.StdDev = float64(int(stdDev*100)) / 100 // Round to 2 decimal places

	// Peak hours analysis (group by hour)
	hourlyMax := make(map[int]float64)
	for i, timestamp := range ts.Timestamps {
		hour := timestamp.Hour()
		if val, exists := hourlyMax[hour]; !exists || ts.Values[i] > val {
			hourlyMax[hour] = ts.Values[i]
		}
	}

	// Find top 3 peak hours
	type hourValue struct {
		hour  int
		value float64
	}
	hours := make([]hourValue, 0, len(hourlyMax))
	for h, v := range hourlyMax {
		hours = append(hours, hourValue{h, v})
	}

	// Sort by value descending
	for i := 0; i < len(hours); i++ {
		for j := i + 1; j < len(hours); j++ {
			if hours[i].value < hours[j].value {
				hours[i], hours[j] = hours[j], hours[i]
			}
		}
	}

	// Get top 3 hours
	for i := 0; i < 3 && i < len(hours); i++ {
		stats.PeakHours = append(stats.PeakHours, hours[i].hour)
	}

	return stats
}

// GetCPUUsageTimeSeries gets CPU usage over the last 24 hours
func (c *PrometheusClient) GetCPUUsageTimeSeries() (*TimeSeriesData, error) {
	query := `100 - (avg by (instance) (rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)`
	return c.QueryRange(query, 24*time.Hour, 30*time.Minute)
}

// GetMemoryUsageTimeSeries gets memory usage percentage over the last 24 hours
func (c *PrometheusClient) GetMemoryUsageTimeSeries() (*TimeSeriesData, error) {
	query := `100 * (1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes))`
	return c.QueryRange(query, 24*time.Hour, 30*time.Minute)
}
