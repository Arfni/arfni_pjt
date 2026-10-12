package workflow

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/arfni/arfni/internal/core/stack"
	"github.com/arfni/arfni/internal/sys"
)

// strictSecretsEnv promotes literal-secret findings from a warning to a hard failure.
//
// The default is a warning: refusing to deploy a stack that worked yesterday because a
// new check dislikes one of its values would break existing users. Operators who want
// the check enforced set this.
const strictSecretsEnv = "ARFNI_STRICT_SECRETS"

// SecretFinding is one env value in stack.yaml that looks like a secret written out in
// full instead of referenced through ${VAR}.
type SecretFinding struct {
	Service string
	Key     string
	Reason  string
}

// secretPrefixes are issuer prefixes that no non-secret configuration value ever starts
// with. Matching on them keeps the check free of false positives.
var secretPrefixes = []struct {
	prefix string
	issuer string
}{
	{"sk-ant-", "Anthropic API/OAuth token"},
	{"sk-", "OpenAI-style API key"},
	{"ghp_", "GitHub personal access token"},
	{"gho_", "GitHub OAuth token"},
	{"ghs_", "GitHub server token"},
	{"github_pat_", "GitHub fine-grained PAT"},
	{"glpat-", "GitLab personal access token"},
	{"AKIA", "AWS access key ID"},
	{"ASIA", "AWS temporary access key ID"},
	{"xoxb-", "Slack bot token"},
	{"xoxp-", "Slack user token"},
	{"xoxa-", "Slack app token"},
	{"xoxr-", "Slack refresh token"},
	{"xoxs-", "Slack session token"},
	{"AIza", "Google API key"},
}

// secretKeyHints mark a key whose value is a credential by contract. They only trigger a
// finding together with a length threshold, because keys like GF_SECURITY_ADMIN_PASSWORD
// legitimately carry short placeholder values in example stacks.
var secretKeyHints = []string{"TOKEN", "SECRET", "PASSWORD", "PASSWD", "APIKEY", "API_KEY", "PRIVATE_KEY", "CREDENTIAL", "ACCESS_KEY"}

// longSecretThreshold is the value length above which a credential-named key is treated
// as a real secret rather than a placeholder.
const longSecretThreshold = 24

// isEnvVarReference reports whether the whole value is a single ${VAR} reference.
//
// These are the form we want people to use: generate.go passes env values through
// yaml.Marshal verbatim, so ${VAR} reaches the compose file intact and Docker Compose
// resolves it from .env on the deploy host. Such a value must never be flagged.
func isEnvVarReference(value string) bool {
	v := strings.TrimSpace(value)
	if !strings.HasPrefix(v, "${") || !strings.HasSuffix(v, "}") {
		return false
	}
	// Reject "${A} ${B}" and "${A}tail": only a single reference spanning the whole
	// value is a clean indirection.
	return !strings.Contains(v[:len(v)-1], "}")
}

// looksLikeLiteralSecret classifies one env entry. The reason is empty when the value is
// fine.
func looksLikeLiteralSecret(key, value string) (string, bool) {
	if strings.TrimSpace(value) == "" || isEnvVarReference(value) {
		return "", false
	}
	if strings.Contains(value, "${") {
		// Partially interpolated (e.g. "prefix-${VAR}"): the secret part is not literal.
		return "", false
	}

	for _, rule := range secretPrefixes {
		if strings.HasPrefix(value, rule.prefix) {
			return fmt.Sprintf("value looks like a %s (prefix %q)", rule.issuer, rule.prefix), true
		}
	}

	upperKey := strings.ToUpper(key)
	for _, hint := range secretKeyHints {
		if strings.Contains(upperKey, hint) && len(value) >= longSecretThreshold {
			return fmt.Sprintf("key names a credential and the value is %d characters long", len(value)), true
		}
	}

	return "", false
}

// ScanStackForLiteralSecrets reports every env value that carries a credential inline.
// Results are sorted so the same stack always produces the same log.
func ScanStackForLiteralSecrets(s *stack.Stack) []SecretFinding {
	if s == nil {
		return nil
	}

	var findings []SecretFinding
	for serviceName, service := range s.Services {
		for key, value := range service.Spec.Env {
			if reason, bad := looksLikeLiteralSecret(key, value); bad {
				findings = append(findings, SecretFinding{Service: serviceName, Key: key, Reason: reason})
			}
		}
	}

	sort.Slice(findings, func(i, j int) bool {
		if findings[i].Service != findings[j].Service {
			return findings[i].Service < findings[j].Service
		}
		return findings[i].Key < findings[j].Key
	})
	return findings
}

// FormatSecretFindings renders findings into the message shown to the operator, including
// how to fix them.
func FormatSecretFindings(findings []SecretFinding) string {
	if len(findings) == 0 {
		return ""
	}

	var b strings.Builder
	fmt.Fprintf(&b, "stack.yaml holds %d secret value(s) in plain text:\n", len(findings))
	for _, f := range findings {
		fmt.Fprintf(&b, "  - services.%s.spec.env.%s — %s\n", f.Service, f.Key, f.Reason)
	}
	b.WriteString("These values are copied verbatim into docker-compose.yml and into every\n")
	b.WriteString("`docker compose config` dump and log line that follows.\n")
	b.WriteString("Fix: put the value in a .env file on the deploy host (mode 0600) and write\n")
	b.WriteString("  ")
	fmt.Fprintf(&b, "%s: \"${%s}\"\n", findings[0].Key, findings[0].Key)
	b.WriteString("in stack.yaml instead. ${VAR} references pass through untouched and are\n")
	b.WriteString("resolved by Docker Compose at deploy time.")
	return b.String()
}

// strictSecretsEnabled reports whether literal secrets should fail the deploy.
func strictSecretsEnabled() bool {
	switch strings.ToLower(strings.TrimSpace(os.Getenv(strictSecretsEnv))) {
	case "1", "true", "yes", "on":
		return true
	default:
		return false
	}
}

// isGitTracked reports whether path is a file git tracks in the repository containing it.
//
// arfni regenerates docker-compose.yml from stack.yaml on every deploy. When the target
// project keeps a hand written compose under version control, that regeneration silently
// destroys the user's file — and, if stack.yaml holds literal secrets, replaces a
// ${VAR} reference with the secret itself, one `git commit -a` away from being published.
// The caller warns before overwriting.
//
// A missing git, a path outside any repository, or an untracked file all return false:
// the check exists to add a warning, never to block a deploy on its own tooling.
func isGitTracked(path string) bool {
	dir := filepath.Dir(path)
	if _, err := os.Stat(dir); err != nil {
		return false
	}

	// A hung git here would stall the deploy, so the probe gets its own deadline.
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	_, err := sys.Run(ctx, "git", "-C", dir, "ls-files", "--error-unmatch", "--", filepath.Base(path))
	return err == nil
}
