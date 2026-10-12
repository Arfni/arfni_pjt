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
	ModeLocal    MonitoringMode = "local"
	ModeHybrid   MonitoringMode = "hybrid"
	ModeAllInOne MonitoringMode = "all-in-one"
)

// PluginSpec represents a monitoring plugin specification
type PluginSpec struct {
	APIVersion  string `yaml:"apiVersion"`
	Name        string `yaml:"name"`
	Contributes struct {
		Services map[string]struct {
			Kind string `yaml:"kind"`
			Spec struct {
				Image   string   `yaml:"image"`
				Ports   []string `yaml:"ports"`
				Volumes []struct {
					Host  string `yaml:"host"`
					Mount string `yaml:"mount"`
					// Mirrors stack.Volume.ReadOnly — a host mount the container
					// only reads must not be writable.
					ReadOnly bool `yaml:"readOnly,omitempty"`
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

// composeFileMode restricts the generated compose to its owner: it holds the monitoring
// services' env values in plain text.
const composeFileMode os.FileMode = 0600

// GenerateDockerComposeFromPlugins generates a docker-compose.yml from plugin specs
func GenerateDockerComposeFromPlugins(pluginsDir string, mode MonitoringMode, outputPath string) error {
	// outputPath is like /tmp/arfni-monitoring-xxx/docker-compose.yml
	// outputDir is /tmp/arfni-monitoring-xxx
	outputDir := filepath.Dir(outputPath)
	compose := DockerCompose{
		Version:  "3.8",
		Services: make(map[string]DockerComposeService),
		Networks: map[string]interface{}{
			"monitoring": nil,
		},
		Volumes: make(map[string]interface{}),
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
				hostPath := vol.Host

				// Check if it's a named volume (no path separators)
				if !strings.Contains(hostPath, "/") && !strings.Contains(hostPath, "\\") && !strings.HasPrefix(hostPath, ".") {
					// Named volume - add to volumes section and use as-is
					compose.Volumes[hostPath] = nil
					volumeStr := fmt.Sprintf("%s:%s", hostPath, vol.Mount)
					if vol.ReadOnly {
						volumeStr += ":ro"
					}
					composeService.Volumes = append(composeService.Volumes, volumeStr)
				} else {
					// Host path - replace relative paths with absolute paths
					if strings.HasPrefix(hostPath, "./") {
						// Remove leading "./" and join with output directory (where files are copied to)
						// This allows CopyAndUpdateProvisioningFiles to copy files to the right location
						relativePath := strings.TrimPrefix(hostPath, "./")
						hostPath = filepath.Join(outputDir, relativePath)
					}
					volumeStr := fmt.Sprintf("%s:%s", hostPath, vol.Mount)
					if vol.ReadOnly {
						volumeStr += ":ro"
					}
					composeService.Volumes = append(composeService.Volumes, volumeStr)
				}
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

	// This compose carries the plugin env values verbatim, Grafana's admin password among
	// them, so it is owner-only like the deploy compose. WriteFile only applies the mode
	// when it creates the file, so an existing 0644 file needs the explicit chmod.
	if err := os.WriteFile(outputPath, data, composeFileMode); err != nil {
		return fmt.Errorf("failed to write docker-compose.yml: %w", err)
	}
	if err := os.Chmod(outputPath, composeFileMode); err != nil {
		return fmt.Errorf("failed to restrict docker-compose.yml permissions: %w", err)
	}

	return nil
}

// CopyAndUpdateProvisioningFiles copies provisioning files and updates them based on mode
func CopyAndUpdateProvisioningFiles(pluginsDir, outputDir string, mode MonitoringMode) error {
	// Copy Grafana provisioning files
	grafanaProvDir := filepath.Join(pluginsDir, "grafana", "provisioning")
	// Output matches the volume path: outputDir/grafana/provisioning
	outputProvDir := filepath.Join(outputDir, "grafana", "provisioning")

	// Create directories
	if err := os.MkdirAll(filepath.Join(outputProvDir, "datasources"), 0755); err != nil {
		return fmt.Errorf("failed to create datasource directory: %w", err)
	}
	if err := os.MkdirAll(filepath.Join(outputProvDir, "dashboards"), 0755); err != nil {
		return fmt.Errorf("failed to create dashboard directory: %w", err)
	}

	// Copy datasource
	datasourcePath := filepath.Join(grafanaProvDir, "datasources", "datasource.yml")
	data, err := os.ReadFile(datasourcePath)
	if err != nil {
		return fmt.Errorf("failed to read datasource.yml: %w", err)
	}
	content := string(data)
	if mode == ModeHybrid {
		content = strings.ReplaceAll(content, "http://prometheus:9090", "http://host.docker.internal:9090")
	}
	outputPath := filepath.Join(outputProvDir, "datasources", "datasource.yml")
	if err := os.WriteFile(outputPath, []byte(content), 0644); err != nil {
		return fmt.Errorf("failed to write datasource.yml: %w", err)
	}

	// Copy dashboard configuration
	dashboardPath := filepath.Join(grafanaProvDir, "dashboards", "dashboard.yml")
	data, err = os.ReadFile(dashboardPath)
	if err != nil {
		return fmt.Errorf("failed to read dashboard.yml: %w", err)
	}
	outputPath = filepath.Join(outputProvDir, "dashboards", "dashboard.yml")
	if err := os.WriteFile(outputPath, data, 0644); err != nil {
		return fmt.Errorf("failed to write dashboard.yml: %w", err)
	}

	// Copy dashboard JSON files
	dashboardsDir := filepath.Join(grafanaProvDir, "dashboards")
	files, err := os.ReadDir(dashboardsDir)
	if err != nil {
		return fmt.Errorf("failed to list dashboards: %w", err)
	}
	for _, file := range files {
		if strings.HasSuffix(file.Name(), ".json") {
			src := filepath.Join(dashboardsDir, file.Name())
			dst := filepath.Join(outputProvDir, "dashboards", file.Name())
			data, err := os.ReadFile(src)
			if err != nil {
				return fmt.Errorf("failed to read dashboard %s: %w", file.Name(), err)
			}
			if err := os.WriteFile(dst, data, 0644); err != nil {
				return fmt.Errorf("failed to write dashboard %s: %w", file.Name(), err)
			}
		}
	}

	// Copy Prometheus configuration
	prometheusPath := filepath.Join(pluginsDir, "prometheus", "prometheus.yml")
	data, err = os.ReadFile(prometheusPath)
	if err != nil {
		return fmt.Errorf("failed to read prometheus.yml: %w", err)
	}
	outputPath = filepath.Join(outputDir, "prometheus.yml")
	if err := os.WriteFile(outputPath, data, 0644); err != nil {
		return fmt.Errorf("failed to write prometheus.yml: %w", err)
	}

	return nil
}

// PrepareMonitoringStack prepares the complete monitoring stack from plugins
func PrepareMonitoringStack(pluginsDir string, mode MonitoringMode, outputDir string) error {
	// Create output directory
	if err := os.MkdirAll(outputDir, 0755); err != nil {
		return fmt.Errorf("failed to create output directory: %w", err)
	}

	// Generate docker-compose.yml (skip for All-in-one mode)
	if mode != ModeAllInOne {
		composePath := filepath.Join(outputDir, "docker-compose.yml")
		if err := GenerateDockerComposeFromPlugins(pluginsDir, mode, composePath); err != nil {
			return fmt.Errorf("failed to generate docker-compose.yml: %w", err)
		}
	}

	// Copy and update provisioning files
	if err := CopyAndUpdateProvisioningFiles(pluginsDir, outputDir, mode); err != nil {
		return fmt.Errorf("failed to copy provisioning files: %w", err)
	}

	return nil
}
