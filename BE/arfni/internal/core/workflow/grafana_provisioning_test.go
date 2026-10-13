package workflow

import (
	"context"
	"encoding/json"
	"fmt"
	"github.com/arfni/arfni/internal/events"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/arfni/arfni/internal/core/stack"
)

func TestDeployProjectName(t *testing.T) {
	cases := map[string]string{
		"/home/ubuntu/arfni-deploy":  "arfni-deploy",
		"/home/ubuntu/arfni-deploy/": "arfni-deploy",
		"/srv/app":                   "app",
		"/":                          "default",
		"":                           "default",
	}
	for workdir, want := range cases {
		if got := deployProjectName(workdir); got != want {
			t.Errorf("deployProjectName(%q) = %q, want %q", workdir, got, want)
		}
	}
}

func TestGrafanaProvisioningLayoutSeparatesSameNamedWorkdirs(t *testing.T) {
	first := grafanaProvisioningLayoutFor(grafanaManagedRoot, "/srv/alpha/arfni-deploy", true)
	second := grafanaProvisioningLayoutFor(grafanaManagedRoot, "/srv/beta/arfni-deploy", true)
	if first.Root == second.Root {
		t.Fatalf("different deployments share provisioning root %q", first.Root)
	}
	if again := grafanaProvisioningLayoutFor(grafanaManagedRoot, "/srv/alpha/arfni-deploy", true); again.Root != first.Root {
		t.Fatalf("same deployment changed root: %q to %q", first.Root, again.Root)
	}
}

// The mount has to move off the deploy user's home, because Grafana's uid cannot traverse
// a 0750 home no matter how open the leaf directory is.
func TestRedirectGrafanaProvisioningVolume(t *testing.T) {
	s := &stack.Stack{Services: map[string]stack.Service{
		"grafana": {Spec: stack.ServiceSpec{Volumes: []stack.Volume{
			{Host: "./grafana/provisioning", Mount: "/etc/grafana/provisioning"},
			{Host: "grafana-data", Mount: "/var/lib/grafana"},
		}}},
		"prometheus": {Spec: stack.ServiceSpec{Volumes: []stack.Volume{
			{Host: "./prometheus.yml", Mount: "/etc/prometheus/prometheus.yml"},
		}}},
	}}

	const hostDir = "/opt/arfni/arfni-deploy/grafana/provisioning"
	if !redirectGrafanaProvisioningVolume(s, hostDir) {
		t.Fatal("expected the provisioning mount to be rewritten")
	}

	grafana := s.Services["grafana"]
	if grafana.Spec.Volumes[0].Host != hostDir {
		t.Errorf("provisioning host = %q, want %q", grafana.Spec.Volumes[0].Host, hostDir)
	}
	// Named volumes and other services must be left alone: grafana-data holds the
	// database, and moving it would strand the existing one.
	if grafana.Spec.Volumes[1].Host != "grafana-data" {
		t.Errorf("data volume was rewritten to %q", grafana.Spec.Volumes[1].Host)
	}
	if s.Services["prometheus"].Spec.Volumes[0].Host != "./prometheus.yml" {
		t.Error("prometheus volume was rewritten")
	}

	// Re-running a deploy must be a no-op rather than a repeated rewrite.
	if redirectGrafanaProvisioningVolume(s, hostDir) {
		t.Error("second redirect reported a change")
	}
}

func TestGrafanaHTTPPort(t *testing.T) {
	withEnv := &stack.Stack{Services: map[string]stack.Service{
		"grafana": {Spec: stack.ServiceSpec{
			Env:   map[string]string{"GF_SERVER_HTTP_PORT": "3200"},
			Ports: []string{"3300:3200"},
		}},
	}}
	// The verifier runs on the host, so it must use the published side.
	if got := grafanaHTTPPort(withEnv); got != "3300" {
		t.Errorf("port = %q, want host port 3300", got)
	}

	portsOnly := &stack.Stack{Services: map[string]stack.Service{
		"grafana": {Spec: stack.ServiceSpec{Ports: []string{"127.0.0.1:3200:3000"}}},
	}}
	if got := grafanaHTTPPort(portsOnly); got != "3200" {
		t.Errorf("port = %q, want 3200 (host side)", got)
	}

	if got := grafanaHTTPPort(&stack.Stack{Services: map[string]stack.Service{}}); got != "3000" {
		t.Errorf("port = %q, want Grafana's default 3000", got)
	}
}

func TestGrafanaHTTPPortUsesPublishedHostPort(t *testing.T) {
	s := &stack.Stack{Services: map[string]stack.Service{
		"grafana": {Spec: stack.ServiceSpec{
			Env:   map[string]string{"GF_SERVER_HTTP_PORT": "3000"},
			Ports: []string{"127.0.0.1:3200:3000"},
		}},
	}}
	if got := grafanaHTTPPort(s); got != "3200" {
		t.Fatalf("host Grafana port = %q, want published port 3200", got)
	}
}

func TestGrafanaHTTPPortSelectsMappingForContainerHTTPPort(t *testing.T) {
	s := &stack.Stack{Services: map[string]stack.Service{
		"grafana": {Spec: stack.ServiceSpec{
			Env:   map[string]string{"GF_SERVER_HTTP_PORT": "3200"},
			Ports: []string{"127.0.0.1:9090:9090", "127.0.0.1:3300:3200"},
		}},
	}}
	if got := grafanaHTTPPort(s); got != "3300" {
		t.Fatalf("host Grafana port = %q, want mapped HTTP port 3300", got)
	}
}

func TestGrafanaHTTPPortRejectsNoMatchingMapping(t *testing.T) {
	s := &stack.Stack{Services: map[string]stack.Service{
		"grafana": {Spec: stack.ServiceSpec{
			Env:   map[string]string{"GF_SERVER_HTTP_PORT": "3200"},
			Ports: []string{"3300:3300"},
		}},
	}}
	if got := grafanaHTTPPort(s); got != "" {
		t.Fatalf("unmapped Grafana HTTP port accepted: %q", got)
	}
}

func TestGrafanaHTTPPortRejectsShellInput(t *testing.T) {
	s := &stack.Stack{Services: map[string]stack.Service{
		"grafana": {Spec: stack.ServiceSpec{
			Ports: []string{"3000' && touch /tmp/pwn #:3000"},
		}},
	}}
	if got := grafanaHTTPPort(s); got != "" {
		t.Fatalf("unsafe Grafana host port accepted: %q", got)
	}
}

func TestParseDashboardUIDs(t *testing.T) {
	uids := parseDashboardUIDs(`[{"uid":"rYdddlPWk","type":"dash-db"},{"uid":"abc","type":"dash-db"}]`)
	if len(uids) != 2 || uids[0] != "rYdddlPWk" {
		t.Fatalf("unexpected uids: %v", uids)
	}

	// Everything that is not a populated dashboard array means "not provisioned yet".
	// An empty array is the exact symptom this check exists to catch.
	for _, body := range []string{"[]", "", "   ", "<html>502 Bad Gateway</html>", `{"message":"Unauthorized"}`, "[{"} {
		if got := parseDashboardUIDs(body); len(got) != 0 {
			t.Errorf("parseDashboardUIDs(%q) = %v, want none", body, got)
		}
	}
}

func TestDashboardVerificationRequiresProvisionedUID(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "dashboard.json"), []byte(`{"uid":"new-dashboard","title":"New"}`), 0644); err != nil {
		t.Fatal(err)
	}
	expected, err := expectedGrafanaDashboardUIDs(dir)
	if err != nil {
		t.Fatal(err)
	}
	if missing := missingGrafanaDashboardUIDs(`[{"uid":"stale-dashboard","type":"dash-db"}]`, expected); len(missing) != 1 || missing[0] != "new-dashboard" {
		t.Fatalf("stale dashboard satisfied verification: missing %v", missing)
	}
	if missing := missingGrafanaDashboardUIDs(`[{"uid":"new-dashboard","type":"dash-db"}]`, expected); len(missing) != 0 {
		t.Fatalf("provisioned dashboard was reported missing: %v", missing)
	}
}

// The privileged layout is the only one that keeps provisioning unreadable to other
// accounts: gid 0 gets read+traverse because Grafana runs with it, other gets nothing.
func TestRemoteProvisioningCommands_Privileged(t *testing.T) {
	layout := grafanaProvisioningLayoutFor(grafanaManagedRoot, "/home/ubuntu/arfni-deploy", true)

	if !strings.HasPrefix(layout.Dir, "/opt/arfni/arfni-deploy-") {
		t.Fatalf("dir = %q", layout.Dir)
	}

	setup := remoteProvisioningSetupCmd(layout, "ubuntu")
	if !strings.HasPrefix(setup, "sudo -n mkdir -p ") {
		t.Errorf("setup does not create directories with sudo: %s", setup)
	}
	// Grafana logs a level=error line for every provisioning directory it cannot open, so
	// all four exist even when only two have content.
	for _, sub := range []string{"datasources", "dashboards", "plugins", "alerting"} {
		if !strings.Contains(setup, layout.Dir+"/"+sub) {
			t.Errorf("setup does not create %s: %s", sub, setup)
		}
	}
	// scp runs as the deploy user, so it has to own the tree before the upload.
	if !strings.Contains(setup, "chown -R 'ubuntu' "+layout.Root) {
		t.Errorf("setup does not hand the tree to the deploy user: %s", setup)
	}

	harden := remoteProvisioningHardenCmd(layout, "ubuntu")
	if !strings.Contains(harden, "chown -R 'ubuntu:0' "+layout.Root) {
		t.Errorf("harden does not give the group to gid 0: %s", harden)
	}
	if !strings.Contains(harden, "chmod -R u=rwX,g=rX,o= "+layout.Root) {
		t.Errorf("harden does not close the file to other accounts: %s", harden)
	}
}

// Without sudo there is no way to hand files to gid 0, so the fallback trades secrecy for
// working monitoring — and must not pretend otherwise by emitting sudo.
func TestRemoteProvisioningCommands_Fallback(t *testing.T) {
	layout := grafanaProvisioningLayoutFor(grafanaFallbackRoot, "/home/ubuntu/arfni-deploy", false)

	if !strings.HasPrefix(layout.Dir, "/var/tmp/arfni/arfni-deploy-") {
		t.Fatalf("dir = %q", layout.Dir)
	}

	setup := remoteProvisioningSetupCmd(layout, "ubuntu")
	harden := remoteProvisioningHardenCmd(layout, "ubuntu")
	if !strings.Contains(setup, "test ! -L /var/tmp/arfni") || !strings.Contains(setup, "stat -c %u /var/tmp/arfni") {
		t.Errorf("fallback accepts a symlink or another user's shared root: %s", setup)
	}
	for _, cmd := range []string{setup, harden} {
		if strings.Contains(cmd, "sudo") {
			t.Errorf("fallback command uses sudo: %s", cmd)
		}
	}
	if !strings.Contains(harden, "chmod -R u=rwX,go=rX") {
		t.Errorf("fallback must make the files readable to Grafana's uid: %s", harden)
	}
}

func TestRemoteProvisioningCommandsQuoteDeployUser(t *testing.T) {
	layout := grafanaProvisioningLayoutFor(grafanaManagedRoot, "/srv/app", true)
	user := "ubuntu;touch /tmp/pwn"
	setup := remoteProvisioningSetupCmd(layout, user)
	harden := remoteProvisioningHardenCmd(layout, user)
	if !strings.Contains(setup, "chown -R 'ubuntu;touch /tmp/pwn' ") {
		t.Errorf("setup interpolates deploy user into shell: %s", setup)
	}
	if !strings.Contains(harden, "chown -R 'ubuntu;touch /tmp/pwn:0' ") {
		t.Errorf("harden interpolates deploy user into shell: %s", harden)
	}
}

func TestGrafanaHTTPPortTCPAndUnsafeMappings(t *testing.T) {
	for _, tc := range []struct{ mapping, want string }{
		{"3300:3000/tcp", "3300"}, {"127.0.0.1:3300:3000/tcp", "3300"},
		{"[::1]:3300:3000/tcp", "3300"}, {"3300:3000/udp", ""},
		{"bad;host:3300:3000", ""}, {"3300:3000/tcp;echo bad", ""},
	} {
		s := &stack.Stack{Services: map[string]stack.Service{"grafana": {Spec: stack.ServiceSpec{Ports: []string{tc.mapping}}}}}
		if got := grafanaHTTPPort(s); got != tc.want {
			t.Errorf("%q: got %q want %q", tc.mapping, got, tc.want)
		}
	}
}

func TestGrafanaSearchURL(t *testing.T) {
	for _, tc := range []struct{ protocol, root, subpath, want string }{
		{"https", "https://example.com/grafana/", "true", "https://localhost:3300/grafana/api/search?type=dash-db"},
		{"http", "%(protocol)s://%(domain)s:%(http_port)s/grafana/", "true", "http://localhost:3300/grafana/api/search?type=dash-db"},
		{"http", "https://example.com/grafana/", "false", "http://localhost:3300/api/search?type=dash-db"},
		{"socket", "", "", ""}, {"https;echo bad", "", "", ""},
		{"http", "https://user:secret@example.com/grafana/", "true", ""},
	} {
		s := &stack.Stack{Services: map[string]stack.Service{"grafana": {Spec: stack.ServiceSpec{Ports: []string{"3300:3000/tcp"}, Env: map[string]string{"GF_SERVER_PROTOCOL": tc.protocol, "GF_SERVER_ROOT_URL": tc.root, "GF_SERVER_SERVE_FROM_SUB_PATH": tc.subpath}}}}}
		got, err := grafanaSearchURL(s)
		if got != tc.want || (err != nil) != (tc.want == "") {
			t.Errorf("protocol %q: got %q, err %v; want %q", tc.protocol, got, err, tc.want)
		}
	}
}

func TestGrafanaFallbackRootPerAccount(t *testing.T) {
	a, b := grafanaFallbackRootFor("alice"), grafanaFallbackRootFor("bob")
	if a == b || a != grafanaFallbackRootFor("alice") {
		t.Fatal("fallback must be stable and account-specific")
	}
	unsafe := grafanaFallbackRootFor("name;echo bad/../")
	if !strings.HasPrefix(unsafe, "/var/tmp/arfni-") || strings.ContainsAny(strings.TrimPrefix(unsafe, "/var/tmp/"), "/; ") {
		t.Fatalf("unsafe root %q", unsafe)
	}
	layout := grafanaProvisioningLayoutFor(a, "/srv/app", false)
	cmd := remoteProvisioningSetupCmd(layout, "alice")
	if !strings.Contains(cmd, "test ! -L "+a) || !strings.Contains(cmd, "stat -c %u "+a) {
		t.Fatal("missing account-root safety checks")
	}
}

func TestPollGrafanaDashboards(t *testing.T) {
	for _, tc := range []struct{ name, response, wantError string }{
		{"verified", "[{\"uid\":\"expected\"}]\n200", ""},
		{"unauthorized", "secret response\n401", "login required"},
		{"forbidden", "secret response\n403", "login required"},
		{"redirect", "secret response\n302", "redirect"},
		{"missing", "[]\n200", "missing"},
		{"invalid", "secret response\n200", "valid dashboard"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			ctx, cancel := context.WithTimeout(context.Background(), 30*time.Millisecond)
			defer cancel()
			err := pollGrafanaDashboards(ctx, []string{"expected"}, func(context.Context) (string, error) { return tc.response, nil })
			if tc.wantError == "" {
				if err != nil {
					t.Fatal(err)
				}
				return
			}
			if err == nil || !strings.Contains(err.Error(), tc.wantError) || strings.Contains(err.Error(), "secret response") {
				t.Fatalf("unsafe or wrong error: %v", err)
			}
		})
	}
}

func TestPollGrafanaDashboardsBoundsBlockedSSH(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Millisecond)
	defer cancel()
	start := time.Now()
	err := pollGrafanaDashboards(ctx, []string{"expected"}, func(ctx context.Context) (string, error) { <-ctx.Done(); return "", ctx.Err() })
	if err == nil || time.Since(start) > time.Second {
		t.Fatalf("probe not bounded: %v", err)
	}
}

func TestMonitoringVerificationEvents(t *testing.T) {
	for _, verifyErr := range []error{nil, fmt.Errorf("Grafana login required")} {
		old := os.Stdout
		read, write, err := os.Pipe()
		if err != nil {
			t.Fatal(err)
		}
		os.Stdout = write
		reportGrafanaVerification(events.NewStream(true), verifyErr)
		write.Close()
		os.Stdout = old
		raw, _ := io.ReadAll(read)
		read.Close()
		var event struct {
			Type string                 `json:"type"`
			Data map[string]interface{} `json:"data"`
		}
		if err := json.Unmarshal(raw, &event); err != nil {
			t.Fatal(err)
		}
		wantType, wantStatus := events.TypeSuccess, "verified"
		if verifyErr != nil {
			wantType, wantStatus = events.TypeWarning, "unverified"
		}
		if event.Type != wantType || event.Data["monitoring_verification"] != wantStatus {
			t.Fatalf("unexpected event: %s", raw)
		}
	}
}

func TestSSHOutputHonorsCancelledContext(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	client := &SSHClient{}
	_, err := client.RunCommandWithOutputContext(ctx, events.NewStream(false), "echo should-not-run")
	if err == nil || !strings.Contains(err.Error(), "context canceled") {
		t.Fatalf("SSH ignored cancelled context: %v", err)
	}
}

func TestPollGrafanaRejectsExpiredContextSuccess(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	err := pollGrafanaDashboards(ctx, []string{"expected"}, func(context.Context) (string, error) { return "[{\"uid\":\"expected\"}]\n200", nil })
	if err == nil {
		t.Fatal("expired probe claimed verified")
	}
}
