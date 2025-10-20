package generator

import (
	"os"
	"path/filepath"
	"regexp"
	"strconv"

	"gopkg.in/yaml.v3"
	"ic.local/ic/pkg/stack"
)

type Compose struct {
	Version  string                     `yaml:"version"`
	Services map[string]*ComposeService `yaml:"services"`
}

type ComposeService struct {
	Image       string            `yaml:"image,omitempty"`
	Build       *ComposeBuild     `yaml:"build,omitempty"`
	Environment map[string]string `yaml:"environment,omitempty"`
	DependsOn   map[string]any    `yaml:"depends_on,omitempty"`
	Ports       []string          `yaml:"ports,omitempty"`
	Volumes     []string          `yaml:"volumes,omitempty"`
	Healthcheck *Healthcheck      `yaml:"healthcheck,omitempty"`
}

type ComposeBuild struct {
	Context    string `yaml:"context"`
	Dockerfile string `yaml:"dockerfile,omitempty"`
}

type Healthcheck struct {
	Test     []string `yaml:"test"`
	Interval string   `yaml:"interval,omitempty"`
	Timeout  string   `yaml:"timeout,omitempty"`
	Retries  int      `yaml:"retries,omitempty"`
}

var reSecret = regexp.MustCompile(`\$\{secret:([A-Za-z0-9_]+)\}`)

func normalizeEnv(v string) string {
	return reSecret.ReplaceAllString(v, "${$1}")
}

func toSlashRel(base, target string) string {
	rel, _ := filepath.Rel(base, target)
	return filepath.ToSlash(rel)
}

func GenerateCompose(s *stack.Stack, stackDir, outDir string) (string, error) {
	c := &Compose{Version: "3.9", Services: map[string]*ComposeService{}}

	for name, svc := range s.Services {
		if svc.Kind != "docker.container" { continue }
		cs := &ComposeService{Environment: map[string]string{}}

		if svc.Spec.Image != "" {
			cs.Image = svc.Spec.Image
		}
		if svc.Spec.Build != "" {
			absCtx := filepath.Join(stackDir, svc.Spec.Build)
			cs.Build = &ComposeBuild{Context: toSlashRel(outDir, absCtx)}
			if svc.Spec.Dockerfile != "" {
				absDf := filepath.Join(stackDir, svc.Spec.Dockerfile)
				cs.Build.Dockerfile = toSlashRel(absCtx, absDf)
			}
		}

		for k, v := range svc.Spec.Env {
			cs.Environment[k] = normalizeEnv(v)
		}

		cs.Ports = append(cs.Ports, svc.Spec.Ports...)

		for _, v := range svc.Spec.Volumes {
			absHost := filepath.Join(stackDir, v.Host)
			relHost := toSlashRel(outDir, absHost)
			cs.Volumes = append(cs.Volumes, relHost+":"+v.Mount)
		}

		if len(svc.Spec.DependsOn) > 0 {
			cs.DependsOn = map[string]any{}
			for _, d := range svc.Spec.DependsOn {
				cs.DependsOn[d] = map[string]string{"condition": "service_started"}
			}
		}

		if svc.Spec.Health != nil && svc.Spec.Health.HTTPGet != nil {
			cs.Healthcheck = &Healthcheck{
				Test:     []string{"CMD-SHELL", "wget -qO- http://127.0.0.1:" + strconv.Itoa(svc.Spec.Health.HTTPGet.Port) + svc.Spec.Health.HTTPGet.Path + " || exit 1"},
				Interval: "10s", Timeout: "3s", Retries: 12,
			}
		} else if svc.Spec.Health != nil && svc.Spec.Health.TCP != nil {
			cs.Healthcheck = &Healthcheck{
				Test:     []string{"CMD-SHELL", "nc -z 127.0.0.1 " + strconv.Itoa(svc.Spec.Health.TCP.Port)},
				Interval: "10s", Timeout: "3s", Retries: 10,
			}
		}

		c.Services[name] = cs
	}

	path := filepath.Join(outDir, "docker-compose.yaml")
	b, err := yaml.Marshal(c)
	if err != nil { return "", err }
	if err := os.WriteFile(path, b, 0o644); err != nil { return "", err }
	return path, nil
}
