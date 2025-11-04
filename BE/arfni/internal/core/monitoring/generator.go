package monitoring

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"gopkg.in/yaml.v3"
)

// MonitoringMode represents the monitoring deployment mode
type MonitoringMode string

const (
	ModeLocal     MonitoringMode = "local"
	ModeHybrid    MonitoringMode = "hybrid"
	ModeAllInOne  MonitoringMode = "all-in-one"
)

// PluginSpec represents a monitoring plugin specification
type PluginSpec struct {
	APIVersion string `yaml:"apiVersion"`
	Name       string `yaml:"name"`
	Contributes struct {
		Services map[string]struct {
			Kind string `yaml:"kind"`
			Spec struct {
				Image   string   `yaml:"image"`
				Ports   []string `yaml:"ports"`
				Volumes []struct {
					Host  string `yaml:"host"`
					Mount string `yaml:"mount"`
				} `yaml:"volumes"`
				Command []string          `yaml:"command,omitempty"`
				Env     map[string]string `yaml:"env,omitempty"`
			} `yaml:"spec"`
		} `yaml:"services"`
	} `yaml:"contributes"`
}

// DockerComposeService represents a service in docker-compose.yml
type DockerComposeService struct {
	Image       string            `yaml:"image"`
	Ports       []string          `yaml:"ports,omitempty"`
	Volumes     []string          `yaml:"volumes,omitempty"`
	Command     []string          `yaml:"command,omitempty"`
	Environment map[string]string `yaml:"environment,omitempty"`
	Networks    []string          `yaml:"networks,omitempty"`
	Restart     string            `yaml:"restart,omitempty"`
}

// DockerCompose represents the docker-compose.yml structure
type DockerCompose struct {
	Version  string                          `yaml:"version"`
	Services map[string]DockerComposeService `yaml:"services"`
	Networks map[string]interface{}          `yaml:"networks,omitempty"`
	Volumes  map[string]interface{}          `yaml:"volumes,omitempty"`
}

// LoadMonitoringPlugin loads a monitoring plugin from a YAML file
func LoadMonitoringPlugin(pluginPath string) (*PluginSpec, error) {
	data, err := os.ReadFile(pluginPath)
	if err != nil {
		return nil, fmt.Errorf("failed to read plugin file: %w", err)
	}

	var plugin PluginSpec
	if err := yaml.Unmarshal(data, &plugin); err != nil {
		return nil, fmt.Errorf("failed to parse plugin YAML: %w", err)
	}

	return &plugin, nil
}

// GenerateDockerComposeFromPlugins generates a docker-compose.yml from plugin specs
func GenerateDockerComposeFromPlugins(pluginsDir string, mode MonitoringMode, outputPath string) error {
	compose := DockerCompose{
		Version:  "3.8",
		Services: make(map[string]DockerComposeService),
		Networks: map[string]interface{}{
			"monitoring": nil,
		},
	}

	// Determine which services to include based on mode
	var servicesToLoad []string
	switch mode {
	case ModeLocal:
		servicesToLoad = []string{"prometheus", "grafana"}
	case ModeHybrid:
		servicesToLoad = []string{"grafana"} // Prometheus on EC2
	case ModeAllInOne:
		// All services on EC2, no local containers
		return nil
	default:
		servicesToLoad = []string{"prometheus", "grafana", "node-exporter"}
	}

	// Load and convert each service
	for _, serviceName := range servicesToLoad {
		pluginPath := filepath.Join(pluginsDir, serviceName, "plugin.yaml")
		plugin, err := LoadMonitoringPlugin(pluginPath)
		if err != nil {
			return fmt.Errorf("failed to load %s plugin: %w", serviceName, err)
		}

		// Convert plugin spec to docker-compose service
		for name, svc := range plugin.Contributes.Services {
			composeService := DockerComposeService{
				Image:       svc.Spec.Image,
				Ports:       svc.Spec.Ports,
				Command:     svc.Spec.Command,
				Environment: svc.Spec.Env,
				Networks:    []string{"monitoring"},
				Restart:     "unless-stopped",
			}

			// Convert volume format from plugin to docker-compose
			for _, vol := range svc.Spec.Volumes {
				// Replace relative paths with absolute paths
				hostPath := vol.Host
				if strings.HasPrefix(hostPath, "./") {
					// Make path relative to the plugin directory
					hostPath = filepath.Join(pluginsDir, serviceName, strings.TrimPrefix(hostPath, "./"))
				}
				volumeStr := fmt.Sprintf("%s:%s", hostPath, vol.Mount)
				composeService.Volumes = append(composeService.Volumes, volumeStr)
			}

			// Special handling for Grafana in hybrid mode
			if name == "grafana" && mode == ModeHybrid {
				// Update datasource to point to host.docker.internal
				// This will be handled by CopyAndUpdateProvisioningFiles
			}

			compose.Services[name] = composeService
		}
	}

	// Add node-exporter for local testing (always included for local/hybrid)
	if mode == ModeLocal || mode == ModeHybrid {
		// Load node-exporter plugin
		nodeExporterPath := filepath.Join(pluginsDir, "node-exporter", "plugin.yaml")
		if plugin, err := LoadMonitoringPlugin(nodeExporterPath); err == nil {
			for name, svc := range plugin.Contributes.Services {
				compose.Services[name] = DockerComposeService{
					Image:    svc.Spec.Image,
					Ports:    svc.Spec.Ports,
					Command:  svc.Spec.Command,
					Networks: []string{"monitoring"},
					Restart:  "unless-stopped",
				}
			}
		}
	}

	// Write docker-compose.yml
	data, err := yaml.Marshal(&compose)
	if err != nil {
		return fmt.Errorf("failed to marshal docker-compose: %w", err)
	}

	if err := os.WriteFile(outputPath, data, 0644); err != nil {
		return fmt.Errorf("failed to write docker-compose.yml: %w", err)
	}

	return nil
}

// CopyAndUpdateProvisioningFiles copies provisioning files and updates them based on mode
func CopyAndUpdateProvisioningFiles(pluginsDir, outputDir string, mode MonitoringMode) error {
	// Copy Grafana provisioning files
	grafanaProvDir := filepath.Join(pluginsDir, "grafana", "provisioning")
	outputProvDir := filepath.Join(outputDir, "grafana", "provisioning")

	// Create directories
	os.MkdirAll(filepath.Join(outputProvDir, "datasources"), 0755)
	os.MkdirAll(filepath.Join(outputProvDir, "dashboards"), 0755)

	// Copy datasource
	datasourcePath := filepath.Join(grafanaProvDir, "datasources", "datasource.yml")
	if data, err := os.ReadFile(datasourcePath); err == nil {
		// Update Prometheus URL based on mode
		content := string(data)
		if mode == ModeHybrid {
			// For hybrid mode, Prometheus is on EC2
			content = strings.ReplaceAll(content, "http://prometheus:9090", "http://host.docker.internal:9090")
		}

		outputPath := filepath.Join(outputProvDir, "datasources", "datasource.yml")
		if err := os.WriteFile(outputPath, []byte(content), 0644); err != nil {
			return fmt.Errorf("failed to write datasource.yml: %w", err)
		}
	}

	// Copy dashboard configuration
	dashboardPath := filepath.Join(grafanaProvDir, "dashboards", "dashboard.yml")
	if data, err := os.ReadFile(dashboardPath); err == nil {
		outputPath := filepath.Join(outputProvDir, "dashboards", "dashboard.yml")
		if err := os.WriteFile(outputPath, data, 0644); err != nil {
			return fmt.Errorf("failed to write dashboard.yml: %w", err)
		}
	}

	// Copy dashboard JSON files
	dashboardsDir := filepath.Join(grafanaProvDir, "dashboards")
	if files, err := os.ReadDir(dashboardsDir); err == nil {
		for _, file := range files {
			if strings.HasSuffix(file.Name(), ".json") {
				src := filepath.Join(dashboardsDir, file.Name())
				dst := filepath.Join(outputProvDir, "dashboards", file.Name())
				if data, err := os.ReadFile(src); err == nil {
					os.WriteFile(dst, data, 0644)
				}
			}
		}
	}

	// Copy Prometheus configuration
	prometheusPath := filepath.Join(pluginsDir, "prometheus", "prometheus.yml")
	if data, err := os.ReadFile(prometheusPath); err == nil {
		outputPath := filepath.Join(outputDir, "prometheus.yml")
		if err := os.WriteFile(outputPath, data, 0644); err != nil {
			return fmt.Errorf("failed to write prometheus.yml: %w", err)
		}
	}

	return nil
}

// PrepareMonitoringStack prepares the complete monitoring stack from plugins
func PrepareMonitoringStack(pluginsDir string, mode MonitoringMode, outputDir string) error {
	// Create output directory
	if err := os.MkdirAll(outputDir, 0755); err != nil {
		return fmt.Errorf("failed to create output directory: %w", err)
	}

	// Generate docker-compose.yml
	composePath := filepath.Join(outputDir, "docker-compose.yml")
	if err := GenerateDockerComposeFromPlugins(pluginsDir, mode, composePath); err != nil {
		return fmt.Errorf("failed to generate docker-compose.yml: %w", err)
	}

	// Copy and update provisioning files
	if err := CopyAndUpdateProvisioningFiles(pluginsDir, outputDir, mode); err != nil {
		return fmt.Errorf("failed to copy provisioning files: %w", err)
	}

	return nil
}