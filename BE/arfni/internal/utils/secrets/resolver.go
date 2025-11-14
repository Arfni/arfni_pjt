package secrets

import (
	"fmt"
	"os"
)

// Resolver resolves secret values from various sources
type Resolver struct {
	// TODO: Add keychain support
}

// NewResolver creates a new secret resolver
func NewResolver() *Resolver {
	return &Resolver{}
}

// Resolve resolves a secret value
// Supported formats:
// - ${SECRET_NAME} -> environment variable
// - ${keychain:SECRET_NAME} -> OS keychain
// - ${file:/path/to/file} -> file contents
func (r *Resolver) Resolve(ref string) (string, error) {
	// Simple env var resolution for now
	// TODO: Support other secret sources
	if value := os.Getenv(ref); value != "" {
		return value, nil
	}

	return "", fmt.Errorf("secret not found: %s", ref)
}

// ResolveMap resolves all secrets in a map
func (r *Resolver) ResolveMap(env map[string]string) (map[string]string, error) {
	resolved := make(map[string]string)
	for k, v := range env {
		// TODO: 변수 치환 처리 ${VAR}
		resolved[k] = v
	}
	return resolved, nil
}
