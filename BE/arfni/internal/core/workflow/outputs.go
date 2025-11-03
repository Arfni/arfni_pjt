package workflow

import (
	"fmt"
	"strings"

	"github.com/arfni/arfni/internal/core/stack"
)

// OutputEndpoint represents a service endpoint
type OutputEndpoint struct {
	Name string `json:"name"`
	URL  string `json:"url"`
	Type string `json:"type"` // "service", "health-check", "monitoring"
}

// DeploymentOutputs represents deployment result data
type DeploymentOutputs struct {
	ServiceCount   int              `json:"service_count"`
	ContainerCount int              `json:"container_count"`
	ComposeDir     string           `json:"compose_dir"`
	Endpoints      []OutputEndpoint `json:"endpoints"`
}

// GenerateOutputs generates deployment outputs from stack
func GenerateOutputs(st *stack.Stack, projectDir string) DeploymentOutputs {
	outputs := DeploymentOutputs{
		ServiceCount:   len(st.Services),
		ContainerCount: len(st.Services), // Each service = 1 container
		ComposeDir:     projectDir,
		Endpoints:      make([]OutputEndpoint, 0),
	}

	// Extract endpoints from each service
	for name, service := range st.Services {
		endpoints := extractServiceEndpoints(name, service, st)
		outputs.Endpoints = append(outputs.Endpoints, endpoints...)
	}

	return outputs
}

// extractServiceEndpoints extracts endpoints from a service
func extractServiceEndpoints(name string, service stack.Service, st *stack.Stack) []OutputEndpoint {
	endpoints := make([]OutputEndpoint, 0)

	// Get target information
	target, exists := st.Targets[service.Target]
	if !exists {
		return endpoints
	}

	// Determine host (EC2 vs local)
	var host string
	if target.Type == "ec2.ssh" {
		host = target.Host
	} else {
		host = "localhost"
	}

	// Extract endpoints from ports
	for _, portMapping := range service.Spec.Ports {
		parts := strings.Split(portMapping, ":")
		if len(parts) >= 2 {
			publicPort := parts[0]

			// Main endpoint
			endpoints = append(endpoints, OutputEndpoint{
				Name: name,
				URL:  fmt.Sprintf("http://%s:%s", host, publicPort),
				Type: getEndpointType(name),
			})

			// Health check endpoint
			if service.Spec.Health != nil && service.Spec.Health.HTTPGet != nil {
				healthPath := service.Spec.Health.HTTPGet.Path
				endpoints = append(endpoints, OutputEndpoint{
					Name: fmt.Sprintf("%s-health", name),
					URL:  fmt.Sprintf("http://%s:%s%s", host, publicPort, healthPath),
					Type: "health-check",
				})
			}
		}
	}

	return endpoints
}

// getEndpointType determines endpoint type from service name
func getEndpointType(serviceName string) string {
	// Check for monitoring services
	monitoringServices := []string{"grafana", "prometheus", "node-exporter"}
	lowerName := strings.ToLower(serviceName)
	for _, ms := range monitoringServices {
		if strings.Contains(lowerName, ms) {
			return "monitoring"
		}
	}
	return "service"
}
