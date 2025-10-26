package workflow

import (
	"context"
	"fmt"
	"os"
	"path/filepath"

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
	compose := DockerCompose{
		Version:  "3.8",
		Services: make(map[string]DockerComposeService),
		Volumes:  make(map[string]interface{}),
	}

	// Convert each service
	for name, service := range s.Services {
		dcService := DockerComposeService{
			Environment: service.Spec.Env,
			Ports:       service.Spec.Ports,
			Command:     service.Spec.Command,
			DependsOn:   service.DependsOn,
		}

		// Handle image or build
		if service.Spec.Image != "" {
			dcService.Image = service.Spec.Image
		} else if service.Spec.Build != "" {
			// Build path is relative to project directory (where docker-compose runs from)
			dcService.Build = &DockerComposeBuild{
				Context:    service.Spec.Build,
				Dockerfile: "Dockerfile",
			}
		}

		// Handle volumes
		if len(service.Spec.Volumes) > 0 {
			for _, vol := range service.Spec.Volumes {
				// Convert volume format
				// Volumes are relative to project directory (where docker-compose runs from)
				volumeStr := fmt.Sprintf("%s:%s", vol.Host, vol.Mount)
				dcService.Volumes = append(dcService.Volumes, volumeStr)
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

	// Create compose directory
	composeDir := filepath.Join(projectDir, ".arfni", "compose")
	if err := os.MkdirAll(composeDir, 0755); err != nil {
		return fmt.Errorf("failed to create compose directory: %w", err)
	}

	// Write file
	composeFile := filepath.Join(composeDir, "docker-compose.yml")
	if err := os.WriteFile(composeFile, []byte(content), 0644); err != nil {
		return fmt.Errorf("failed to write docker-compose.yml: %w", err)
	}

	return nil
}
