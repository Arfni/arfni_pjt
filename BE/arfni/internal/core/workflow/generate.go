package workflow

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"gopkg.in/yaml.v3"

	"github.com/arfni/arfni/internal/core/stack"
)

// Generate creates docker-compose.yaml from stack
func Generate(ctx context.Context) error {
	// TODO: Stack을 docker-compose.yaml로 변환
	return nil
}

// DockerComposeService represents a service in docker-compose.yml
type DockerComposeService struct {
	Build       *DockerComposeBuild   `yaml:"build,omitempty"`
	Image       string                `yaml:"image,omitempty"`
	Environment map[string]string     `yaml:"environment,omitempty"`
	Ports       []string              `yaml:"ports,omitempty"`
	Volumes     []string              `yaml:"volumes,omitempty"`
	Command     []string              `yaml:"command,omitempty"`
	DependsOn   []string              `yaml:"depends_on,omitempty"`
	Restart     string                `yaml:"restart,omitempty"`
}

// DockerComposeBuild represents build configuration
type DockerComposeBuild struct {
	Context    string `yaml:"context"`
	Dockerfile string `yaml:"dockerfile,omitempty"`
}

// DockerCompose represents the docker-compose.yml structure
type DockerCompose struct {
	Version  string                          `yaml:"version"`
	Services map[string]DockerComposeService `yaml:"services"`
	Volumes  map[string]interface{}          `yaml:"volumes,omitempty"`
}

// GenerateDockerCompose generates docker-compose.yml from stack
func GenerateDockerCompose(s *stack.Stack, projectDir string) (string, error) {
	return GenerateDockerComposeWithTarget(s, projectDir, "")
}

// GenerateDockerComposeWithTarget generates docker-compose.yml from stack filtering by target type
func GenerateDockerComposeWithTarget(s *stack.Stack, projectDir string, targetType string) (string, error) {
	compose := DockerCompose{
		Version:  "3.8",
		Services: make(map[string]DockerComposeService),
		Volumes:  make(map[string]interface{}),
	}

	// Convert each service
	for name, service := range s.Services {
		// Filter by target type if specified
		if targetType != "" {
			if target, exists := s.Targets[service.Target]; exists {
				// Skip services that don't match the target type
				if target.Type != targetType {
					continue
				}
			}
		}
		dcService := DockerComposeService{
			Environment: service.Spec.Env,
			Ports:       service.Spec.Ports,
			Command:     service.Spec.Command,
			DependsOn:   service.DependsOn,
			Restart:     service.Spec.Restart,
		}

		// Handle image or build
		if service.Spec.Image != "" {
			dcService.Image = service.Spec.Image
		} else if service.Spec.Build != nil && !service.Spec.Build.IsEmpty() {
			// Build path is relative to project directory (where docker-compose runs from)
			dcService.Build = &DockerComposeBuild{
				Context:    service.Spec.Build.GetContext(),
				Dockerfile: service.Spec.Build.GetDockerfile(),
			}
		}

		// Handle volumes
		if len(service.Spec.Volumes) > 0 {
			for _, vol := range service.Spec.Volumes {
				// Convert volume format
				// Volumes are relative to project directory (where docker-compose runs from)
				volumeStr := fmt.Sprintf("%s:%s", vol.Host, vol.Mount)
				dcService.Volumes = append(dcService.Volumes, volumeStr)

				// Check if this is a named volume (not a path)
				if !strings.HasPrefix(vol.Host, ".") && !strings.HasPrefix(vol.Host, "/") && !strings.Contains(vol.Host, ":") {
					// This is a named volume - add to top-level volumes section
					compose.Volumes[vol.Host] = nil // empty config for named volume
				}
			}
		}

		compose.Services[name] = dcService
	}

	// Marshal to YAML
	data, err := yaml.Marshal(&compose)
	if err != nil {
		return "", fmt.Errorf("failed to marshal docker-compose: %w", err)
	}

	return string(data), nil
}

// WriteDockerCompose writes docker-compose.yml to disk
func WriteDockerCompose(s *stack.Stack, projectDir string) error {
	content, err := GenerateDockerCompose(s, projectDir)
	if err != nil {
		return err
	}

	// Create .arfni directory
	arfniDir := filepath.Join(projectDir, ".arfni")
	if err := os.MkdirAll(arfniDir, 0755); err != nil {
		return fmt.Errorf("failed to create .arfni directory: %w", err)
	}

	// Write docker-compose.yml to project root (for correct build context resolution)
	composeFile := filepath.Join(projectDir, "docker-compose.yml")
	if err := os.WriteFile(composeFile, []byte(content), 0644); err != nil {
		return fmt.Errorf("failed to write docker-compose.yml: %w", err)
	}

	return nil
}

// GenerateGrafanaProvisioning generates Grafana provisioning files based on deployment topology
func GenerateGrafanaProvisioning(s *stack.Stack, projectDir string, bundledPluginsDir string) error {
	// Check if Grafana service exists
	var grafanaService *stack.Service
	var grafanaTarget *stack.Target
	for name, service := range s.Services {
		if name == "grafana" || service.Spec.Image == "grafana/grafana:latest" {
			grafanaService = &service
			if target, exists := s.Targets[service.Target]; exists {
				grafanaTarget = &target
			}
			break
		}
	}

	if grafanaService == nil {
		// No Grafana service, skip
		return nil
	}

	// Check if Prometheus service exists and determine its location
	var prometheusTarget *stack.Target
	for name, service := range s.Services {
		if name == "prometheus" || service.Spec.Image == "prom/prometheus:latest" {
			if target, exists := s.Targets[service.Target]; exists {
				prometheusTarget = &target
			}
			break
		}
	}

	if prometheusTarget == nil {
		// No Prometheus service, skip
		return nil
	}

	// Determine Prometheus URL based on deployment topology
	var prometheusURL string

	// Case 1: Both on same target (all-in-one or both local)
	if grafanaTarget != nil && prometheusTarget != nil && grafanaTarget.Type == prometheusTarget.Type {
		// Use docker network name
		prometheusURL = "http://prometheus:9090"
	} else if grafanaTarget != nil && grafanaTarget.Type == "local" && prometheusTarget.Type == "ec2.ssh" {
		// Case 2: Hybrid - Grafana local, Prometheus on EC2
		prometheusURL = fmt.Sprintf("http://%s:9090", prometheusTarget.Host)
	} else if grafanaTarget != nil && grafanaTarget.Type == "local" {
		// Case 3: Both local but different configs
		prometheusURL = "http://host.docker.internal:9090"
	} else {
		// Default: same network
		prometheusURL = "http://prometheus:9090"
	}

	// Create grafana provisioning directory structure
	provisioningDir := filepath.Join(projectDir, "grafana", "provisioning")
	datasourcesDir := filepath.Join(provisioningDir, "datasources")
	dashboardsDir := filepath.Join(provisioningDir, "dashboards")

	if err := os.MkdirAll(datasourcesDir, 0755); err != nil {
		return fmt.Errorf("failed to create datasources directory: %w", err)
	}
	if err := os.MkdirAll(dashboardsDir, 0755); err != nil {
		return fmt.Errorf("failed to create dashboards directory: %w", err)
	}

	// Generate datasource.yml with dynamic Prometheus URL
	datasourceContent := fmt.Sprintf(`apiVersion: 1

datasources:
  - name: Prometheus
    type: prometheus
    access: proxy
    url: %s
    isDefault: true
    editable: true
    jsonData:
      timeInterval: "15s"
`, prometheusURL)

	datasourcePath := filepath.Join(datasourcesDir, "datasource.yml")
	if err := os.WriteFile(datasourcePath, []byte(datasourceContent), 0644); err != nil {
		return fmt.Errorf("failed to write datasource.yml: %w", err)
	}

	// Generate dashboard.yml
	dashboardContent := `apiVersion: 1

providers:
  - name: 'default'
    orgId: 1
    folder: ''
    type: file
    disableDeletion: false
    updateIntervalSeconds: 10
    allowUiUpdates: true
    options:
      path: /etc/grafana/provisioning/dashboards
`

	dashboardPath := filepath.Join(dashboardsDir, "dashboard.yml")
	if err := os.WriteFile(dashboardPath, []byte(dashboardContent), 0644); err != nil {
		return fmt.Errorf("failed to write dashboard.yml: %w", err)
	}

	// Copy Node Exporter dashboard JSON from bundled plugins
	if bundledPluginsDir != "" {
		pluginDashboardPath := filepath.Join(bundledPluginsDir, "monitoring", "grafana", "provisioning", "dashboards", "node-exporter-full.json")
		if _, err := os.Stat(pluginDashboardPath); err == nil {
			// Dashboard exists in plugin, copy it
			dashboardJSON, err := os.ReadFile(pluginDashboardPath)
			if err != nil {
				return fmt.Errorf("failed to read dashboard JSON: %w", err)
			}

			targetDashboardPath := filepath.Join(dashboardsDir, "node-exporter-full.json")
			if err := os.WriteFile(targetDashboardPath, dashboardJSON, 0644); err != nil {
				return fmt.Errorf("failed to write dashboard JSON: %w", err)
			}
		}
	}

	return nil
}
