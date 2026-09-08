package nginx

import (
	"strings"
	"testing"

	"github.com/arfni/arfni/internal/core/stack"
)

// nginx defaults client_max_body_size to 1MB, so an app that accepts larger
// uploads gets 413 at the gateway before its own limit is ever consulted.
// The generated config must carry the configured value.
func TestGenerateNginxConfig_MaxBodySize(t *testing.T) {
	mk := func(size string) *stack.Stack {
		return &stack.Stack{
			APIVersion: "v0.1",
			Name:       "body",
			Targets:    map[string]stack.Target{"ec2": {Type: "ec2.ssh", Host: "h", User: "u", SSHKey: "k"}},
			Services: map[string]stack.Service{
				"nginx": {
					Kind:   "proxy.nginx",
					Target: "ec2",
					Spec: stack.ServiceSpec{
						Image: "nginx:alpine",
						Nginx: &stack.NginxConfig{
							ListenPort:  80,
							ServerName:  "example.com",
							MaxBodySize: size,
							Upstreams: []stack.NginxUpstream{
								{Name: "api", Service: "api", Port: 8000, Route: "/"},
							},
						},
					},
				},
			},
		}
	}

	t.Run("emits the configured size", func(t *testing.T) {
		out, err := GenerateNginxConfig(mk("20m"))
		if err != nil {
			t.Fatal(err)
		}
		if !strings.Contains(out, "client_max_body_size 20m;") {
			t.Errorf("missing directive in:\n%s", out)
		}
	})

	t.Run("omitted when unset", func(t *testing.T) {
		out, err := GenerateNginxConfig(mk(""))
		if err != nil {
			t.Fatal(err)
		}
		if strings.Contains(out, "client_max_body_size") {
			t.Error("must not emit the directive when unset")
		}
	})

	t.Run("rejects a malformed size", func(t *testing.T) {
		if _, err := GenerateNginxConfig(mk("20 megabytes; evil_directive on")); err == nil {
			t.Error("expected an error for a malformed size")
		}
	})
}
