package workflow

import (
	"strings"
	"testing"

	"github.com/arfni/arfni/internal/core/stack"
)

// A volume marked readOnly must reach docker-compose as ":ro".
//
// node-exporter mounts the host root at /host to read metrics. Without :ro the
// container can write anywhere on the host (authorized_keys, cron, ...), which
// turns a container compromise into host takeover.
func TestGenerateDockerCompose_ReadOnlyVolume(t *testing.T) {
	s := &stack.Stack{
		APIVersion: "v0.1",
		Name:       "ro-test",
		Targets:    map[string]stack.Target{"local": {Type: "local.docker"}},
		Services: map[string]stack.Service{
			"node-exporter": {
				Kind:   "docker.container",
				Target: "local",
				Spec: stack.ServiceSpec{
					Image: "prom/node-exporter:latest",
					Volumes: []stack.Volume{
						{Host: "/", Mount: "/host", ReadOnly: true},
						{Host: "data-vol", Mount: "/data"},
					},
				},
			},
		},
	}

	out, err := GenerateDockerCompose(s, t.TempDir())
	if err != nil {
		t.Fatalf("generate: %v", err)
	}
	t.Logf("\n%s", out)

	if !strings.Contains(out, "/:/host:ro") {
		t.Error(`expected "/:/host:ro" in generated compose`)
	}
	// A writable volume must not grow a stray :ro
	if strings.Contains(out, "data-vol:/data:ro") {
		t.Error("writable volume must not be marked :ro")
	}
	if !strings.Contains(out, "data-vol:/data") {
		t.Error("writable volume missing")
	}
}
