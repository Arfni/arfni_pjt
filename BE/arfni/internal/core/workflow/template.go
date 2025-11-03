package workflow

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"text/template"
)

// TemplateRenderer renders Dockerfile templates from plugins
type TemplateRenderer struct {
	pluginsDir string
}

// NewTemplateRenderer creates a new template renderer
func NewTemplateRenderer(pluginsDir string) *TemplateRenderer {
	return &TemplateRenderer{pluginsDir: pluginsDir}
}

// NewBundledTemplateRenderer creates a new template renderer for bundled plugins
func NewBundledTemplateRenderer(bundledPluginsDir string) *TemplateRenderer {
	return &TemplateRenderer{pluginsDir: bundledPluginsDir}
}

// FindPluginTemplate finds Dockerfile.tmpl for a service type
// Tries multiple standard paths:
// 1. {pluginsDir}/installed/framework/{serviceType}/templates/Dockerfile.tmpl (GUI installed)
// 2. {pluginsDir}/frameworks/{serviceType}/templates/Dockerfile.tmpl (Development)
func (tr *TemplateRenderer) FindPluginTemplate(serviceType string) (string, error) {
	// Try GUI installed path first
	paths := []string{
		filepath.Join(tr.pluginsDir, "installed", "framework", serviceType, "templates", "Dockerfile.tmpl"),
		filepath.Join(tr.pluginsDir, "frameworks", serviceType, "templates", "Dockerfile.tmpl"),
	}

	for _, templatePath := range paths {
		if _, err := os.Stat(templatePath); err == nil {
			return templatePath, nil
		}
	}

	return "", fmt.Errorf("template not found for service type: %s (tried: %v)", serviceType, paths)
}

// FindBundledTemplate finds Dockerfile.tmpl in bundled plugins
// Tries: {bundledPluginsDir}/framework/{serviceType}/templates/Dockerfile.tmpl
func (tr *TemplateRenderer) FindBundledTemplate(serviceType string) (string, error) {
	// Bundled plugins structure: public/plugins/bundled/framework/{serviceType}/templates/Dockerfile.tmpl
	paths := []string{
		filepath.Join(tr.pluginsDir, "framework", serviceType, "templates", "Dockerfile.tmpl"),
		filepath.Join(tr.pluginsDir, "database", serviceType, "templates", "Dockerfile.tmpl"),
		filepath.Join(tr.pluginsDir, "cache", serviceType, "templates", "Dockerfile.tmpl"),
	}

	for _, templatePath := range paths {
		if _, err := os.Stat(templatePath); err == nil {
			return templatePath, nil
		}
	}

	return "", fmt.Errorf("bundled template not found for service type: %s (tried: %v)", serviceType, paths)
}

// RenderTemplate renders a Dockerfile template with buildConfig variables
func (tr *TemplateRenderer) RenderTemplate(templatePath string, buildConfig map[string]interface{}) (string, error) {
	// Read template file
	tmplContent, err := os.ReadFile(templatePath)
	if err != nil {
		return "", fmt.Errorf("failed to read template: %w", err)
	}

	// Parse template with custom functions
	tmpl, err := template.New("dockerfile").
		Delims("{{", "}}").
		Funcs(template.FuncMap{
			"default": func(def interface{}, val interface{}) interface{} {
				if val == nil || val == "" {
					return def
				}
				return val
			},
		}).
		Parse(string(tmplContent))

	if err != nil {
		return "", fmt.Errorf("failed to parse template: %w", err)
	}

	// Render template
	var buf strings.Builder
	if err := tmpl.Execute(&buf, buildConfig); err != nil {
		return "", fmt.Errorf("failed to render template: %w", err)
	}

	return buf.String(), nil
}
