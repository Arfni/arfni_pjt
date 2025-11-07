package workflow

import (
	"fmt"

	"github.com/arfni/arfni/internal/core/plugin"
)

// BuildType represents the detected build type (plugin name)
type BuildType string

const (
	BuildTypeUnknown BuildType = "unknown"
)

// DetectBuildType detects the build type using plugin-based detection
func DetectBuildType(projectDir, buildPath string, pluginDirs ...string) (BuildType, error) {
	// Load detection rules from plugins
	rules, err := plugin.LoadDetectionRules(pluginDirs...)
	if err != nil {
		return BuildTypeUnknown, fmt.Errorf("failed to load plugin detection rules: %w", err)
	}

	// Detect framework using plugin rules
	framework, err := plugin.DetectFramework(projectDir, buildPath, rules)
	if err != nil {
		return BuildTypeUnknown, err
	}

	return BuildType(framework), nil
}
