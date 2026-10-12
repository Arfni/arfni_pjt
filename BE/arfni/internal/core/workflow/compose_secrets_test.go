package workflow

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"

	"github.com/arfni/arfni/internal/core/stack"
	"github.com/arfni/arfni/internal/events"
)

func secretStack() *stack.Stack {
	return &stack.Stack{
		APIVersion: "v0.1",
		Name:       "secret-test",
		Targets:    map[string]stack.Target{"ec2": {Type: "ec2.ssh", Host: "h", User: "ubuntu"}},
		Services: map[string]stack.Service{
			"api": {
				Kind:   "docker.container",
				Target: "ec2",
				Spec: stack.ServiceSpec{
					Image: "api:latest",
					Env:   map[string]string{"CLAUDE_CODE_OAUTH_TOKEN": "sk-ant-oat01-TESTVALUE"},
				},
			},
		},
	}
}

// docker-compose.yml carries stack.yaml env values verbatim, so the generated file
// holds every secret the stack declares.
//
// This is the reason the file has to be owner-only. If someone later moves secrets
// out of the compose (env_file, docker secrets), this test fails and the mode
// decision should be revisited rather than silently inherited.
func TestGenerateDockerCompose_EmbedsEnvValuesVerbatim(t *testing.T) {
	out, err := GenerateDockerCompose(secretStack(), t.TempDir())
	if err != nil {
		t.Fatalf("generate: %v", err)
	}

	if !strings.Contains(out, "sk-ant-oat01-TESTVALUE") {
		t.Fatalf("expected the env value to appear in the compose output; got:\n%s", out)
	}
}

// The remote copy is what other accounts on the deploy host can reach, so the
// upload has to be followed by a chmod. 0644 there let any local uid — including
// the node-exporter container, which mounts the whole host filesystem — read the
// token whenever the home directory happened to be world-traversable.
func TestRemoteSecretChmodCmd(t *testing.T) {
	got := remoteSecretChmodCmd("/home/ubuntu/arfni-deploy/docker-compose.yml")
	want := "chmod 600 /home/ubuntu/arfni-deploy/docker-compose.yml"

	if got != want {
		t.Fatalf("chmod command\n got: %q\nwant: %q", got, want)
	}
}

// Regenerating over an existing file must still end up owner-only.
//
// os.WriteFile only applies its mode when it creates the file, so a compose file
// left at 0644 by an earlier version stays 0644 forever unless the mode is set
// explicitly. That silent carry-over is exactly how a fixed default fails to reach
// the machines that need it.
func TestGenerateFiles_ComposeIsOwnerOnlyEvenWhenItAlreadyExists(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("windows does not carry POSIX file modes")
	}

	dir := t.TempDir()
	composePath := filepath.Join(dir, "docker-compose.yml")

	// Stand in for a file a previous arfni version generated.
	if err := os.WriteFile(composePath, []byte("stale: true\n"), 0644); err != nil {
		t.Fatalf("seed: %v", err)
	}

	r := NewRunner(secretStack(), dir)
	if err := r.generateFiles(events.NewStream(false)); err != nil {
		t.Fatalf("generateFiles: %v", err)
	}

	info, err := os.Stat(composePath)
	if err != nil {
		t.Fatalf("stat: %v", err)
	}
	if perm := info.Mode().Perm(); perm != 0600 {
		t.Fatalf("compose mode = %04o, want 0600 (secrets must not be world readable)", perm)
	}
}
