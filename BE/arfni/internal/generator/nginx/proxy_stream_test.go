package nginx

import (
	"strings"
	"testing"

	"github.com/arfni/arfni/internal/core/stack"
)

func streamStack(timeout string, streaming bool) *stack.Stack {
	return &stack.Stack{
		APIVersion: "v0.1",
		Name:       "stream",
		Targets:    map[string]stack.Target{"ec2": {Type: "ec2.ssh", Host: "h", User: "u", SSHKey: "k"}},
		Services: map[string]stack.Service{
			"nginx": {
				Kind:   "proxy.nginx",
				Target: "ec2",
				Spec: stack.ServiceSpec{
					Image: "nginx:alpine",
					Nginx: &stack.NginxConfig{
						ListenPort:       80,
						ServerName:       "example.com",
						ProxyReadTimeout: timeout,
						Keepalive:        32,
						Upstreams: []stack.NginxUpstream{
							{Name: "api", Service: "api", Port: 8000, Route: "/", Streaming: streaming},
						},
					},
				},
			},
		},
	}
}

// The generator always writes "keepalive" into the upstream block. nginx only
// honours a keepalive pool over HTTP/1.1 with the Connection header cleared;
// left at the default HTTP/1.0 the proxied response stalls until a timeout
// fires. This is a correctness requirement, not an option.
func TestGenerateNginxConfig_KeepaliveNeedsHTTP11(t *testing.T) {
	out, err := GenerateNginxConfig(streamStack("", false))
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(out, "keepalive 32;") {
		t.Fatalf("expected the upstream keepalive pool in:\n%s", out)
	}
	for _, want := range []string{
		"proxy_http_version 1.1;",
		`proxy_set_header Connection "";`,
	} {
		if !strings.Contains(out, want) {
			t.Errorf("missing %q in:\n%s", want, out)
		}
	}
}

// nginx defaults proxy_read_timeout to 60s. An app allowed a longer budget of
// its own gets 504 at the gateway before it ever gives up, so the value has to
// be settable.
func TestGenerateNginxConfig_ProxyReadTimeout(t *testing.T) {
	t.Run("emits the configured timeout", func(t *testing.T) {
		out, err := GenerateNginxConfig(streamStack("180s", false))
		if err != nil {
			t.Fatal(err)
		}
		if !strings.Contains(out, "proxy_read_timeout 180s;") {
			t.Errorf("missing read timeout in:\n%s", out)
		}
		if !strings.Contains(out, "proxy_send_timeout 180s;") {
			t.Errorf("missing send timeout in:\n%s", out)
		}
	})

	t.Run("omitted when unset", func(t *testing.T) {
		out, err := GenerateNginxConfig(streamStack("", false))
		if err != nil {
			t.Fatal(err)
		}
		if strings.Contains(out, "proxy_read_timeout") {
			t.Error("must not emit a read timeout when unset")
		}
	})

	t.Run("rejects a malformed duration", func(t *testing.T) {
		if _, err := GenerateNginxConfig(streamStack("180 seconds; evil on", false)); err == nil {
			t.Error("expected an error for a malformed duration")
		}
	})
}

// A route that streams (server-sent events) must not be buffered, or the client
// sees nothing until the response ends.
func TestGenerateNginxConfig_StreamingRouteDisablesBuffering(t *testing.T) {
	on, err := GenerateNginxConfig(streamStack("", true))
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(on, "proxy_buffering off;") {
		t.Errorf("streaming route must disable buffering in:\n%s", on)
	}

	off, err := GenerateNginxConfig(streamStack("", false))
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(off, "proxy_buffering off;") {
		t.Error("a non-streaming route must keep nginx buffering")
	}
}
