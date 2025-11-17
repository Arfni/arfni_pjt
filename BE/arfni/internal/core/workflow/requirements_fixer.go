package workflow

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/arfni/arfni/internal/core/plugin"
	"gopkg.in/yaml.v3"
)

// loadFastAPIDependencies loads required dependencies from FastAPI plugin.yaml
func loadFastAPIDependencies(bundledPluginsDir string) ([]plugin.Dependency, error) {
	// Try to find FastAPI plugin.yaml
	pluginYamlPath := filepath.Join(bundledPluginsDir, "framework", "fastapi", "plugin.yaml")

	// Check if file exists
	if _, err := os.Stat(pluginYamlPath); os.IsNotExist(err) {
		// Fallback to hardcoded values if plugin.yaml not found
		return []plugin.Dependency{
			{Name: "uvicorn", Version: "0.30.6"},
			{Name: "gunicorn", Version: "22.0.0"},
		}, nil
	}

	// Read and parse plugin.yaml
	data, err := os.ReadFile(pluginYamlPath)
	if err != nil {
		// Fallback to hardcoded values
		return []plugin.Dependency{
			{Name: "uvicorn", Version: "0.30.6"},
			{Name: "gunicorn", Version: "22.0.0"},
		}, nil
	}

	var metadata plugin.PluginMetadata
	if err := yaml.Unmarshal(data, &metadata); err != nil {
		// Fallback to hardcoded values
		return []plugin.Dependency{
			{Name: "uvicorn", Version: "0.30.6"},
			{Name: "gunicorn", Version: "22.0.0"},
		}, nil
	}

	if len(metadata.Dependencies.Required) > 0 {
		return metadata.Dependencies.Required, nil
	}

	// Fallback to hardcoded values if no dependencies in yaml
	return []plugin.Dependency{
		{Name: "uvicorn", Version: "0.30.6"},
		{Name: "gunicorn", Version: "22.0.0"},
	}, nil
}

// FixFastAPIRequirements automatically adds missing uvicorn and gunicorn to requirements.txt
// for FastAPI projects to ensure successful deployment
func FixFastAPIRequirements(projectDir, buildContext string) error {
	return FixFastAPIRequirementsWithPlugins(projectDir, buildContext, "")
}

// FixFastAPIRequirementsWithPlugins fixes requirements.txt using plugin configuration
func FixFastAPIRequirementsWithPlugins(projectDir, buildContext, bundledPluginsDir string) error {
	reqPath := filepath.Join(projectDir, buildContext, "requirements.txt")

	// Load dependencies from plugin.yaml or use fallback
	dependencies, _ := loadFastAPIDependencies(bundledPluginsDir)

	// Read the requirements.txt file
	content, err := os.ReadFile(reqPath)
	if err != nil {
		// If requirements.txt doesn't exist, create it with necessary packages
		if os.IsNotExist(err) {
			var defaultContent strings.Builder
			defaultContent.WriteString("fastapi==0.115.0\n")
			for _, dep := range dependencies {
				defaultContent.WriteString(fmt.Sprintf("%s==%s\n", dep.Name, dep.Version))
			}

			err = os.WriteFile(reqPath, []byte(defaultContent.String()), 0644)
			if err != nil {
				return fmt.Errorf("failed to create requirements.txt: %w", err)
			}
			fmt.Println("✓ Created requirements.txt with FastAPI dependencies")
			return nil
		}
		return fmt.Errorf("failed to read requirements.txt: %w", err)
	}

	// Convert to lowercase for case-insensitive search
	contentStr := strings.ToLower(string(content))
	lines := strings.Split(string(content), "\n")

	// Track if we modified the file
	modified := false

	// Check and add each required dependency
	for _, dep := range dependencies {
		if !containsPackage(contentStr, dep.Name) {
			// Remove empty lines at the end before adding
			if !modified {
				for len(lines) > 0 && strings.TrimSpace(lines[len(lines)-1]) == "" {
					lines = lines[:len(lines)-1]
				}
			}
			depLine := fmt.Sprintf("%s==%s", dep.Name, dep.Version)
			lines = append(lines, depLine)
			modified = true
			fmt.Printf("✓ Added %s to requirements.txt\n", depLine)
		}
	}

	// Save the modified file if changes were made
	if modified {
		// Ensure the file ends with a newline
		newContent := strings.Join(lines, "\n")
		if !strings.HasSuffix(newContent, "\n") {
			newContent += "\n"
		}

		err = os.WriteFile(reqPath, []byte(newContent), 0644)
		if err != nil {
			return fmt.Errorf("failed to update requirements.txt: %w", err)
		}
		fmt.Println("✓ requirements.txt updated successfully for FastAPI deployment")
	} else {
		fmt.Println("✓ requirements.txt already contains all necessary FastAPI dependencies")
	}

	return nil
}

// containsPackage checks if a package name exists in the requirements content
// It handles various formats like: package, package==version, package>=version, etc.
func containsPackage(content, packageName string) bool {
	// Split into lines for more accurate checking
	lines := strings.Split(content, "\n")
	packageLower := strings.ToLower(packageName)

	for _, line := range lines {
		// Skip comments and empty lines
		trimmedLine := strings.TrimSpace(line)
		if trimmedLine == "" || strings.HasPrefix(trimmedLine, "#") {
			continue
		}

		// Convert to lowercase for comparison
		lineLower := strings.ToLower(trimmedLine)

		// Check if the line starts with the package name
		// This handles: package, package==version, package>=version, package[extra], etc.
		if strings.HasPrefix(lineLower, packageLower) {
			// Make sure it's the exact package name, not a prefix of another package
			// e.g., "uvicorn" should not match "uvicorn-workers"
			if len(lineLower) == len(packageLower) {
				return true // Exact match (e.g., "uvicorn")
			}
			// Check if the next character is a version specifier or bracket
			if len(lineLower) > len(packageLower) {
				nextChar := lineLower[len(packageLower)]
				if nextChar == '=' || nextChar == '>' || nextChar == '<' || nextChar == '[' || nextChar == '!' || nextChar == '~' {
					return true
				}
			}
		}
	}

	return false
}

// FixDjangoRequirements can be added later for Django projects
func FixDjangoRequirements(projectDir, buildContext string) error {
	// TODO: Implement Django-specific requirements fixing
	// For now, Django projects should work fine with user-provided requirements
	return nil
}

// FixFlaskRequirements can be added later for Flask projects
func FixFlaskRequirements(projectDir, buildContext string) error {
	// TODO: Implement Flask-specific requirements fixing
	// For now, Flask projects should work fine with user-provided requirements
	return nil
}