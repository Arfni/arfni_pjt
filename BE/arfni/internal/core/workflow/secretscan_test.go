package workflow

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"github.com/arfni/arfni/internal/core/stack"
)

// ${VAR} is the safe form: generate.go marshals it into the compose untouched and Docker
// Compose resolves it from .env on the deploy host. Flagging it would push people back to
// literals, so the distinction has to be exact.
func TestIsEnvVarReference(t *testing.T) {
	cases := []struct {
		value string
		want  bool
	}{
		{"${CLAUDE_CODE_OAUTH_TOKEN}", true},
		{"${CLAUDE_CODE_OAUTH_TOKEN:-}", true},
		{"  ${TOKEN}  ", true},
		{"sk-ant-oat01-abc", false},
		{"", false},
		{"${A}${B}", false},
		{"${A}-suffix", false},
		{"prefix-${A}", false},
		{"$TOKEN", false},
	}

	for _, c := range cases {
		if got := isEnvVarReference(c.value); got != c.want {
			t.Errorf("isEnvVarReference(%q) = %v, want %v", c.value, got, c.want)
		}
	}
}

func TestLooksLikeLiteralSecret(t *testing.T) {
	cases := []struct {
		name  string
		key   string
		value string
		want  bool
	}{
		{"anthropic oauth token", "CLAUDE_CODE_OAUTH_TOKEN", "sk-ant-oat01-" + strings.Repeat("A", 90), true},
		{"github pat", "GH_TOKEN", "ghp_" + strings.Repeat("b", 36), true},
		{"aws access key", "AWS_ACCESS_KEY_ID", "AKIAIOSFODNN7EXAMPLE", true},
		{"slack bot token", "SLACK_BOT", "xoxb-1-2-abcdef", true},

		// The reference form must pass no matter what the key is called.
		{"token via reference", "CLAUDE_CODE_OAUTH_TOKEN", "${CLAUDE_CODE_OAUTH_TOKEN}", false},
		{"token via reference with default", "CLAUDE_CODE_OAUTH_TOKEN", "${CLAUDE_CODE_OAUTH_TOKEN:-}", false},

		// Short placeholders in example stacks are not findings: GF_SECURITY_ADMIN_PASSWORD
		// ships as "admin" in this repo's own monitoring plugin.
		{"short admin password", "GF_SECURITY_ADMIN_PASSWORD", "admin", false},
		{"empty value", "SOME_TOKEN", "", false},

		// A long value under a credential-named key is a secret even with no known prefix.
		{"long opaque password", "DB_PASSWORD", strings.Repeat("z", 40), true},
		{"long value under a harmless key", "GF_SERVER_ROOT_URL", strings.Repeat("z", 40), false},

		// Ordinary configuration must never trip the check.
		{"port", "GF_SERVER_HTTP_PORT", "3200", false},
		{"bool", "GF_AUTH_ANONYMOUS_ENABLED", "true", false},
		{"url", "PROMETHEUS_URL", "http://prometheus:9090", false},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			reason, got := looksLikeLiteralSecret(c.key, c.value)
			if got != c.want {
				t.Fatalf("looksLikeLiteralSecret(%q, ...) = %v (%s), want %v", c.key, got, reason, c.want)
			}
			if got && reason == "" {
				t.Fatal("a finding must explain itself")
			}
		})
	}
}

func TestScanStackForLiteralSecretsIsSortedAndComplete(t *testing.T) {
	s := &stack.Stack{
		Services: map[string]stack.Service{
			"worker": {Spec: stack.ServiceSpec{Env: map[string]string{
				"GH_TOKEN": "ghp_" + strings.Repeat("c", 36),
			}}},
			"api": {Spec: stack.ServiceSpec{Env: map[string]string{
				"CLAUDE_CODE_OAUTH_TOKEN": "sk-ant-oat01-" + strings.Repeat("A", 90),
				"SAFE_TOKEN":              "${SAFE_TOKEN}",
				"PORT":                    "8000",
			}}},
		},
	}

	findings := ScanStackForLiteralSecrets(s)
	if len(findings) != 2 {
		t.Fatalf("expected 2 findings, got %d: %+v", len(findings), findings)
	}
	if findings[0].Service != "api" || findings[0].Key != "CLAUDE_CODE_OAUTH_TOKEN" {
		t.Errorf("unexpected first finding: %+v", findings[0])
	}
	if findings[1].Service != "worker" || findings[1].Key != "GH_TOKEN" {
		t.Errorf("unexpected second finding: %+v", findings[1])
	}

	msg := FormatSecretFindings(findings)
	for _, want := range []string{"services.api.spec.env.CLAUDE_CODE_OAUTH_TOKEN", "${CLAUDE_CODE_OAUTH_TOKEN}", ".env"} {
		if !strings.Contains(msg, want) {
			t.Errorf("message is missing %q:\n%s", want, msg)
		}
	}

	// The message is what the operator sees; it must never echo the secret back into the
	// deploy log.
	if strings.Contains(msg, "sk-ant-oat01-") {
		t.Errorf("finding message leaks the secret value:\n%s", msg)
	}
}

func TestScanStackForLiteralSecretsOnCleanStack(t *testing.T) {
	s := &stack.Stack{Services: map[string]stack.Service{
		"api": {Spec: stack.ServiceSpec{Env: map[string]string{"TOKEN": "${TOKEN}"}}},
	}}
	if findings := ScanStackForLiteralSecrets(s); len(findings) != 0 {
		t.Fatalf("clean stack produced findings: %+v", findings)
	}
}

// The warning exists because arfni regenerates docker-compose.yml over whatever is
// already there, including a file the target project wrote and committed.
func TestIsGitTracked(t *testing.T) {
	if _, err := exec.LookPath("git"); err != nil {
		t.Skip("git not available")
	}

	dir := t.TempDir()
	run := func(args ...string) {
		t.Helper()
		cmd := exec.Command("git", args...)
		cmd.Dir = dir
		if out, err := cmd.CombinedOutput(); err != nil {
			t.Fatalf("git %v: %v\n%s", args, err, out)
		}
	}
	run("init")
	run("config", "user.email", "t@example.com")
	run("config", "user.name", "t")

	tracked := filepath.Join(dir, "docker-compose.yml")
	if err := os.WriteFile(tracked, []byte("services: {}\n"), 0600); err != nil {
		t.Fatal(err)
	}
	untracked := filepath.Join(dir, "generated.yml")
	if err := os.WriteFile(untracked, []byte("services: {}\n"), 0600); err != nil {
		t.Fatal(err)
	}
	run("add", "docker-compose.yml")
	run("commit", "-m", "add compose")

	if !isGitTracked(tracked) {
		t.Error("committed compose reported as untracked")
	}
	if isGitTracked(untracked) {
		t.Error("untracked file reported as tracked")
	}
	// A path outside any repository must not be reported as tracked, and must not error.
	if isGitTracked(filepath.Join(t.TempDir(), "docker-compose.yml")) {
		t.Error("file outside a repository reported as tracked")
	}
}

func TestStrictSecretsEnabled(t *testing.T) {
	for _, on := range []string{"1", "true", "TRUE", "yes", "on"} {
		t.Setenv(strictSecretsEnv, on)
		if !strictSecretsEnabled() {
			t.Errorf("%s=%q should enable strict mode", strictSecretsEnv, on)
		}
	}
	for _, off := range []string{"", "0", "false", "no"} {
		t.Setenv(strictSecretsEnv, off)
		if strictSecretsEnabled() {
			t.Errorf("%s=%q should leave strict mode off", strictSecretsEnv, off)
		}
	}
}
