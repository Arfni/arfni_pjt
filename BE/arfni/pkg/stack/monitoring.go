package stack

import (
	"fmt"
	"os"
	"strings"

	"gopkg.in/yaml.v3"
)

// EnsureMonitoringServices는 metadata.monitoring.mode에 따라 필요한 모니터링 서비스를 자동으로 추가합니다
func EnsureMonitoringServices(stackPath string) error {
	// stack.yaml 읽기
	data, err := os.ReadFile(stackPath)
	if err != nil {
		return fmt.Errorf("failed to read stack.yaml: %w", err)
	}

	var stack Stack
	if err := yaml.Unmarshal(data, &stack); err != nil {
		return fmt.Errorf("failed to parse stack.yaml: %w", err)
	}

	// EC2 타겟 찾기
	var ec2TargetName string
	for name, target := range stack.Targets {
		if strings.EqualFold(target.Type, "ec2.ssh") {
			ec2TargetName = name
			break
		}
	}

	// EC2 타겟이 없으면 모니터링 추가 안 함
	if ec2TargetName == "" {
		return nil
	}

	// 서비스 맵 초기화
	if stack.Services == nil {
		stack.Services = make(map[string]Service)
	}

	// 모니터링 모드 결정 (기본값: local)
	mode := "local"
	if stack.Metadata != nil && stack.Metadata.Monitoring != nil && stack.Metadata.Monitoring.Mode != "" {
		mode = stack.Metadata.Monitoring.Mode
	}

	fmt.Printf("[INFO] Monitoring mode: %s\n", mode)

	// Node Exporter는 항상 추가 (EC2에서 메트릭 수집)
	if err := ensureNodeExporter(&stack, ec2TargetName); err != nil {
		return err
	}

	// 모드에 따라 Prometheus, Grafana 추가
	needsPrometheus := false
	switch mode {
	case "hybrid":
		// Prometheus를 EC2에 추가
		if err := ensurePrometheus(&stack, ec2TargetName); err != nil {
			return err
		}
		needsPrometheus = true
		fmt.Println("[INFO] Hybrid mode: Prometheus on EC2, Grafana on local")

	case "all-in-one":
		// Prometheus와 Grafana 모두 EC2에 추가
		if err := ensurePrometheus(&stack, ec2TargetName); err != nil {
			return err
		}
		if err := ensureGrafana(&stack, ec2TargetName); err != nil {
			return err
		}
		needsPrometheus = true
		fmt.Println("[INFO] All-in-one mode: Prometheus and Grafana on EC2")

	default: // "local"
		fmt.Println("[INFO] Local mode: Prometheus and Grafana on local machine")
	}

	// Prometheus 설정 파일 생성
	if needsPrometheus {
		stackDir := strings.TrimSuffix(stackPath, "/stack.yaml")
		stackDir = strings.TrimSuffix(stackDir, "\\stack.yaml")
		if err := createPrometheusConfig(stackDir); err != nil {
			return fmt.Errorf("failed to create prometheus.yml: %w", err)
		}
	}

	// stack.yaml 다시 저장
	newData, err := yaml.Marshal(&stack)
	if err != nil {
		return fmt.Errorf("failed to marshal stack.yaml: %w", err)
	}

	if err := os.WriteFile(stackPath, newData, 0644); err != nil {
		return fmt.Errorf("failed to write stack.yaml: %w", err)
	}

	return nil
}

// ensureNodeExporter는 node-exporter 서비스를 추가합니다
func ensureNodeExporter(stack *Stack, targetName string) error {
	if _, exists := stack.Services["node-exporter"]; exists {
		fmt.Println("[INFO] node-exporter already exists, skipping")
		return nil
	}

	fmt.Println("[INFO] Adding node-exporter service to stack.yaml")
	stack.Services["node-exporter"] = Service{
		Kind:   "docker.container",
		Target: targetName,
		Spec: ServiceSpec{
			Image: "prom/node-exporter:latest",
			Command: []string{
				"--path.rootfs=/host",
			},
			Ports: []string{"9100:9100"},
			Volumes: []Volume{
				{Host: "/", Mount: "/host"},
			},
		},
	}

	return nil
}

// ensurePrometheus는 prometheus 서비스를 추가합니다
func ensurePrometheus(stack *Stack, targetName string) error {
	if _, exists := stack.Services["prometheus"]; exists {
		fmt.Println("[INFO] prometheus already exists, skipping")
		return nil
	}

	fmt.Println("[INFO] Adding prometheus service to stack.yaml")
	stack.Services["prometheus"] = Service{
		Kind:   "docker.container",
		Target: targetName,
		Spec: ServiceSpec{
			Image: "prom/prometheus:latest",
			Ports: []string{"9090:9090"},
			Volumes: []Volume{
				{Host: "./prometheus/prometheus.yml", Mount: "/etc/prometheus/prometheus.yml"},
				{Host: "./prometheus/data", Mount: "/prometheus"},
			},
			Command: []string{
				"--config.file=/etc/prometheus/prometheus.yml",
				"--storage.tsdb.path=/prometheus",
			},
		},
	}

	return nil
}

// ensureGrafana는 grafana 서비스를 추가합니다
func ensureGrafana(stack *Stack, targetName string) error {
	if _, exists := stack.Services["grafana"]; exists {
		fmt.Println("[INFO] grafana already exists, skipping")
		return nil
	}

	fmt.Println("[INFO] Adding grafana service to stack.yaml")
	stack.Services["grafana"] = Service{
		Kind:   "docker.container",
		Target: targetName,
		Spec: ServiceSpec{
			Image: "grafana/grafana:latest",
			Ports: []string{"3000:3000"},
			Env: map[string]string{
				"GF_AUTH_ANONYMOUS_ENABLED":  "true",
				"GF_AUTH_ANONYMOUS_ORG_ROLE": "Admin",
				"GF_AUTH_DISABLE_LOGIN_FORM": "true",
			},
		},
	}

	return nil
}

// createPrometheusConfig는 prometheus.yml 설정 파일을 생성합니다
func createPrometheusConfig(stackDir string) error {
	// prometheus 디렉토리 생성
	prometheusDir := fmt.Sprintf("%s/prometheus", stackDir)
	if err := os.MkdirAll(prometheusDir, 0755); err != nil {
		return fmt.Errorf("failed to create prometheus directory: %w", err)
	}

	prometheusYmlPath := fmt.Sprintf("%s/prometheus.yml", prometheusDir)

	// 이미 존재하면 스킵
	if _, err := os.Stat(prometheusYmlPath); err == nil {
		fmt.Printf("[INFO] prometheus.yml already exists at %s\n", prometheusYmlPath)
		return nil
	}

	fmt.Printf("[INFO] Creating prometheus.yml at %s\n", prometheusYmlPath)

	prometheusConfig := `global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'prometheus'
    static_configs:
      - targets: ['localhost:9090']

  - job_name: 'node-exporter'
    static_configs:
      - targets: ['node-exporter:9100']
`

	if err := os.WriteFile(prometheusYmlPath, []byte(prometheusConfig), 0644); err != nil {
		return fmt.Errorf("failed to write prometheus.yml: %w", err)
	}

	fmt.Printf("[SUCCESS] prometheus.yml created at: %s\n", prometheusYmlPath)

	// prometheus/data 디렉토리 생성
	dataDir := fmt.Sprintf("%s/data", prometheusDir)
	if err := os.MkdirAll(dataDir, 0755); err != nil {
		return fmt.Errorf("failed to create prometheus data directory: %w", err)
	}
	fmt.Printf("[INFO] prometheus/data directory created at: %s\n", dataDir)

	return nil
}
