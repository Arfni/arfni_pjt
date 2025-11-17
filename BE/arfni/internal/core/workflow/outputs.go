package workflow

import (
	"fmt"
	"strings"

	"github.com/arfni/arfni/internal/core/stack"
)

// OutputEndpoint represents a service endpoint
type OutputEndpoint struct {
	Name   string `json:"name"`
	URL    string `json:"url"`
	Type   string `json:"type"`   // "service", "health-check", "monitoring"
	Status string `json:"status"` // "ready", "pending" (for monitoring services in Hybrid/Local mode)
	Note   string `json:"note"`   // Additional information
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

	// Detect deployment mode
	deploymentMode := detectDeploymentModeForOutputs(st)

	// Extract endpoints from each service
	for name, service := range st.Services {
		endpoints := extractServiceEndpoints(name, service, st, deploymentMode)
		outputs.Endpoints = append(outputs.Endpoints, endpoints...)
	}

	return outputs
}

// extractServiceEndpoints extracts endpoints from a service
func extractServiceEndpoints(name string, service stack.Service, st *stack.Stack, deploymentMode string) []OutputEndpoint {
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
			endpointType := getEndpointType(name)

			// Check if this is a monitoring service in Hybrid/Local mode
			status := "ready"
			note := ""
			if endpointType == "monitoring" && (deploymentMode == "hybrid" || deploymentMode == "local") {
				if name == "prometheus" || name == "grafana" {
					status = "pending"
				}
			}

			// Main endpoint
			endpoints = append(endpoints, OutputEndpoint{
				Name:   name,
				URL:    fmt.Sprintf("http://%s:%s", host, publicPort),
				Type:   endpointType,
				Status: status,
				Note:   note,
			})

			// Health check endpoint
			if service.Spec.Health != nil && service.Spec.Health.HTTPGet != nil {
				healthPath := service.Spec.Health.HTTPGet.Path
				endpoints = append(endpoints, OutputEndpoint{
					Name:   fmt.Sprintf("%s-health", name),
					URL:    fmt.Sprintf("http://%s:%s%s", host, publicPort, healthPath),
					Type:   "health-check",
					Status: status,
					Note:   note,
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

// detectDeploymentModeForOutputs determines the deployment mode for monitoring services
func detectDeploymentModeForOutputs(st *stack.Stack) string {
	// Check if Prometheus and Grafana services exist
	prometheusService, hasPrometheus := st.Services["prometheus"]
	grafanaService, hasGrafana := st.Services["grafana"]

	if !hasPrometheus && !hasGrafana {
		return "none"
	}

	// Get targets
	var prometheusTarget, grafanaTarget stack.Target
	var prometheusTargetExists, grafanaTargetExists bool

	if hasPrometheus {
		prometheusTarget, prometheusTargetExists = st.Targets[prometheusService.Target]
	}
	if hasGrafana {
		grafanaTarget, grafanaTargetExists = st.Targets[grafanaService.Target]
	}

	// Detect deployment mode
	prometheusIsEC2 := prometheusTargetExists && prometheusTarget.Type == "ec2.ssh"
	grafanaIsLocal := grafanaTargetExists && grafanaTarget.Type == "local"
	grafanaIsEC2 := grafanaTargetExists && grafanaTarget.Type == "ec2.ssh"
	prometheusIsLocal := prometheusTargetExists && prometheusTarget.Type == "local"

	// Hybrid mode: Grafana local, Prometheus on EC2
	if grafanaIsLocal && prometheusIsEC2 {
		return "hybrid"
	}

	// All-in-one mode: Both on EC2
	if grafanaIsEC2 && prometheusIsEC2 {
		return "all-in-one"
	}

	// Local mode: Both local or only one exists locally
	if (grafanaIsLocal && prometheusIsLocal) || (grafanaIsLocal && !hasPrometheus) || (prometheusIsLocal && !hasGrafana) {
		return "local"
	}

	return "none"
}
