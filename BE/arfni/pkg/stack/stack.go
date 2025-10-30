package stack

import (
	"fmt"
	"os"

	"gopkg.in/yaml.v3"
)

type Stack struct {
	APIVersion string             `yaml:"apiVersion"`
	Name       string             `yaml:"name"`
	Targets    map[string]Target  `yaml:"targets"`
	Secrets    []string           `yaml:"secrets"`
	Services   map[string]Service `yaml:"services"`
	Outputs    map[string]string  `yaml:"outputs"`
}

type Target struct {
	Type string `yaml:"type"` // "docker-desktop" | "ec2.ssh"

	// ec2.ssh 전용 필드 (yaml에서 그대로 매핑됩니다)
	Host    string `yaml:"host,omitempty"`    // "13.x.x.x" or "ec2-...amazonaws.com"
	User    string `yaml:"user,omitempty"`    // "ubuntu" | "ec2-user" 등
	SSHKey  string `yaml:"sshKey,omitempty"`  // "~/.ssh/your.pem"
	Port    int    `yaml:"port,omitempty"`    // 기본 22, 0이면 Run에서 22로 처리해도 됨
	Workdir string `yaml:"workdir,omitempty"` // "/opt/my-app"
}

type Service struct {
	Kind      string      `yaml:"kind"`              // "docker.container"
	Target    string      `yaml:"target"`            // "local"
	Spec      ServiceSpec `yaml:"spec"`
	DependsOn []string    `yaml:"dependsOn,omitempty"`
}

type Volume struct {
	Host  string `yaml:"host"`
	Mount string `yaml:"mount"`
}

type ServiceSpec struct {
	Image      string            `yaml:"image,omitempty"`
	Build      string            `yaml:"build,omitempty"`
	Dockerfile string            `yaml:"dockerfile,omitempty"`
	Env        map[string]string `yaml:"env,omitempty"`
	Ports      []string          `yaml:"ports,omitempty"` // "host:container"
	Volumes    []Volume          `yaml:"volumes,omitempty"`
	Command    []string          `yaml:"command,omitempty"`
	Health     *HealthCheck      `yaml:"health,omitempty"`
}

type HealthCheck struct {
	HTTPGet *HTTPGetAction `yaml:"httpGet,omitempty"`
	TCP     *TCPAction     `yaml:"tcp,omitempty"`
}

type HTTPGetAction struct {
	Path string `yaml:"path"`
	Port int    `yaml:"port"`
}

type TCPAction struct {
	Port int `yaml:"port"`
}

func Load(path string) (*Stack, error) {
	b, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var s Stack
	if err := yaml.Unmarshal(b, &s); err != nil {
		return nil, fmt.Errorf("yaml: %w", err)
	}
	if s.Services == nil || s.Targets == nil {
		return nil, fmt.Errorf("invalid stack: missing services or targets")
	}
	return &s, nil
}
