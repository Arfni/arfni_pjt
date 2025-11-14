package workflow

import (
    "fmt"
    "os"
    "path/filepath"
)

// WriteDockerfileWithBundled writes a Dockerfile using plugin templates
// It tries user-installed plugins first, then bundled plugins
func WriteDockerfileWithBundled(
    projectDir string,
    buildPath string,
    buildType BuildType,
    buildConfig map[string]interface{},
    pluginsDir string,
    bundledPluginsDir string,
) error {
    serviceType := string(buildType)

    // Initialize buildConfig if nil
    if buildConfig == nil {
        buildConfig = make(map[string]interface{})
    }

    // Try to find and render template from plugins
    // Priority: user-installed plugins > bundled plugins
    searchDirs := []string{pluginsDir, bundledPluginsDir}

    var lastErr error
    for _, dir := range searchDirs {
        if dir == "" {
            continue
        }

        renderer := NewTemplateRenderer(dir)
        templatePath, findErr := renderer.FindTemplate(serviceType)
        if findErr != nil {
            lastErr = findErr
            continue
        }

        dockerfileContent, err := renderer.RenderTemplate(templatePath, buildConfig)
        if err != nil {
            lastErr = err
            continue
        }

        return writeDockerfile(projectDir, buildPath, dockerfileContent)
    }

    // If no plugin template found, return error with details
    if lastErr != nil {
        return fmt.Errorf("no Dockerfile template found for service type '%s': %w", serviceType, lastErr)
    }
    return fmt.Errorf("no Dockerfile template found for service type '%s' in plugin directories", serviceType)
}

// writeDockerfile writes Dockerfile content to the specified build path
// If Dockerfile already exists, it will be preserved and not overwritten
func writeDockerfile(projectDir, buildPath, content string) error {
    fullPath := filepath.Join(projectDir, buildPath)

    // Ensure build directory exists
    if err := os.MkdirAll(fullPath, 0755); err != nil {
        return fmt.Errorf("failed to create build directory: %w", err)
    }

    // Check if Dockerfile already exists
    dockerfilePath := filepath.Join(fullPath, "Dockerfile")
    if _, err := os.Stat(dockerfilePath); err == nil {
        // Dockerfile already exists, skip writing
        return nil
    }

    // Write Dockerfile only if it doesn't exist
    if err := os.WriteFile(dockerfilePath, []byte(content), 0644); err != nil {
        return fmt.Errorf("failed to write Dockerfile: %w", err)
    }

    return nil
}
