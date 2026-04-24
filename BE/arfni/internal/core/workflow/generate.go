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

		// proxy.nginx: auto-inject nginx.conf volume mount + optional certbot
		if service.Kind == "proxy.nginx" {
			hasNginxConf := false
			for _, v := range service.Spec.Volumes {
				if strings.Contains(v.Mount, "nginx.conf") {
					hasNginxConf = true
					break
				}
			}
			if !hasNginxConf {
				service.Spec.Volumes = append(service.Spec.Volumes, stack.Volume{
					Host:  "./nginx.conf",
					Mount: "/etc/nginx/nginx.conf",
				})
			}

			// Auto SSL: inject certbot companion service, 443 port, and shared volumes
			if service.Spec.Nginx != nil && service.Spec.Nginx.SSL != nil &&
				service.Spec.Nginx.SSL.Enabled && service.Spec.Nginx.SSL.Auto {

				// Add 443 port if not already present
				has443 := false
				for _, p := range dcService.Ports {
					if strings.Contains(p, "443") {
						has443 = true
						break
					}
				}
				if !has443 {
					dcService.Ports = append(dcService.Ports, "443:443")
				}

				// Add shared volumes to nginx (processed in volumes loop below)
				service.Spec.Volumes = append(service.Spec.Volumes,
					stack.Volume{Host: "letsencrypt", Mount: "/etc/letsencrypt"},
					stack.Volume{Host: "certbot-webroot", Mount: "/var/www/certbot"},
				)

				// Build certbot command
				serverName := service.Spec.Nginx.ServerName
				certbotCmd := []string{
					"certonly", "--webroot",
					"-w", "/var/www/certbot",
					"-d", serverName,
				}
				if email := service.Spec.Nginx.SSL.Email; email != "" {
					certbotCmd = append(certbotCmd, "--email", email)
				}
				certbotCmd = append(certbotCmd, "--agree-tos", "--non-interactive", "--expand")

				compose.Services["certbot"] = DockerComposeService{
					Image:   "certbot/certbot",
					Volumes: []string{"letsencrypt:/etc/letsencrypt", "certbot-webroot:/var/www/certbot"},
					Command: certbotCmd,
				}
				compose.Volumes["letsencrypt"] = nil
				compose.Volumes["certbot-webroot"] = nil
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

// Note: Grafana provisioning has been moved to arfni-monitoring.exe
// which handles it at runtime with better support for:
// - Hybrid deployments (Grafana local, Prometheus on EC2)
// - OS-specific Docker networking (Windows/Mac vs Linux)
// - Dynamic mode detection from stack.yaml
// - SSH tunnel management for remote services
