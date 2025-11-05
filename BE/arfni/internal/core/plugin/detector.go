package plugin

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"gopkg.in/yaml.v3"
)

// DetectionConfig represents the detection section in plugin.yaml
type DetectionConfig struct {
	Enabled             bool              `yaml:"enabled"`
	Priority            int               `yaml:"priority"`
	RequiredFiles       []string          `yaml:"required_files"`
	RequiredFilesAnyOf  []string          `yaml:"required_files_any_of"`
	FileContentPatterns map[string]struct {
		Contains []string `yaml:"contains"`
	} `yaml:"file_content_patterns"`
}

// PluginMetadata represents minimal plugin.yaml structure for detection
type PluginMetadata struct {
	Name      string           `yaml:"name"`
	Detection DetectionConfig `yaml:"detection"`
}

// DetectionRule holds a plugin's detection logic
type DetectionRule struct {
	PluginName string
	Priority   int
	Config     DetectionConfig
}

// LoadDetectionRules loads detection rules from all plugin.yaml files in given directories
func LoadDetectionRules(pluginDirs ...string) ([]DetectionRule, error) {
	var rules []DetectionRule

	fmt.Fprintf(os.Stderr, "[detector] Loading detection rules from %d directories\n", len(pluginDirs))

	for i, dir := range pluginDirs {
		if dir == "" {
			fmt.Fprintf(os.Stderr, "[detector] Skipping empty directory at index %d\n", i)
			continue
		}

		// Check if directory exists
		if _, err := os.Stat(dir); os.IsNotExist(err) {
			fmt.Fprintf(os.Stderr, "[detector] Directory does not exist: %s\n", dir)
			continue
		}

		fmt.Fprintf(os.Stderr, "[detector] Scanning directory: %s\n", dir)
		pluginCount := 0

		// Walk through plugin directories
		err := filepath.Walk(dir, func(path string, info os.FileInfo, err error) error {
			if err != nil {
				return nil // Skip errors
			}

			// Look for plugin.yaml files
			if !info.IsDir() && (info.Name() == "plugin.yaml" || info.Name() == "plugin.yml") {
				fmt.Fprintf(os.Stderr, "[detector] Found plugin.yaml: %s\n", path)
				rule, err := loadPluginDetection(path)
				if err != nil {
					fmt.Fprintf(os.Stderr, "[detector] Failed to load plugin: %v\n", err)
					// Skip plugins with invalid detection config
					return nil
				}
				if rule != nil && rule.Config.Enabled {
					rules = append(rules, *rule)
					pluginCount++
					fmt.Fprintf(os.Stderr, "[detector] ✅ Loaded plugin '%s' with priority %d\n",
						rule.PluginName, rule.Priority)
				} else if rule != nil && !rule.Config.Enabled {
					fmt.Fprintf(os.Stderr, "[detector] ⏭️  Skipped plugin '%s' (detection disabled)\n", rule.PluginName)
				}
			}
			return nil
		})

		fmt.Fprintf(os.Stderr, "[detector] Loaded %d plugin(s) from %s\n", pluginCount, dir)

		if err != nil {
			return nil, fmt.Errorf("failed to walk plugin directory %s: %w", dir, err)
		}
	}

	fmt.Fprintf(os.Stderr, "[detector] Total %d detection rules loaded\n", len(rules))

	// Sort by priority (higher priority first)
	sort.SliceStable(rules, func(i, j int) bool {
		return rules[i].Priority > rules[j].Priority
	})

	return rules, nil
}

// loadPluginDetection loads detection config from a single plugin.yaml file
func loadPluginDetection(pluginYamlPath string) (*DetectionRule, error) {
	data, err := os.ReadFile(pluginYamlPath)
	if err != nil {
		return nil, err
	}

	var meta PluginMetadata
	if err := yaml.Unmarshal(data, &meta); err != nil {
		return nil, err
	}

	// Skip if detection is not configured or disabled
	if !meta.Detection.Enabled {
		return nil, nil
	}

	return &DetectionRule{
		PluginName: meta.Name,
		Priority:   meta.Detection.Priority,
		Config:     meta.Detection,
	}, nil
}

// DetectFramework detects which framework/plugin matches the given project directory
func DetectFramework(projectDir, buildPath string, rules []DetectionRule) (string, error) {
	fullPath := filepath.Join(projectDir, buildPath)

	// Check if directory exists
	if _, err := os.Stat(fullPath); os.IsNotExist(err) {
		return "unknown", fmt.Errorf("build path does not exist: %s", fullPath)
	}

	// Try each detection rule in priority order
	for _, rule := range rules {
		if matchesRule(fullPath, rule) {
			return rule.PluginName, nil
		}
	}

	return "unknown", nil
}

// matchesRule checks if a project matches a detection rule
func matchesRule(projectPath string, rule DetectionRule) bool {
	config := rule.Config

	// Check required_files (ALL must exist)
	if len(config.RequiredFiles) > 0 {
		for _, file := range config.RequiredFiles {
			filePath := filepath.Join(projectPath, file)
			if _, err := os.Stat(filePath); os.IsNotExist(err) {
				return false
			}
		}
	}

	// Check required_files_any_of (AT LEAST ONE must exist)
	if len(config.RequiredFilesAnyOf) > 0 {
		found := false
		for _, file := range config.RequiredFilesAnyOf {
			filePath := filepath.Join(projectPath, file)
			if _, err := os.Stat(filePath); err == nil {
				found = true
				break
			}
		}
		if !found {
			return false
		}
	}

	// Check file_content_patterns
	if len(config.FileContentPatterns) > 0 {
		for fileName, pattern := range config.FileContentPatterns {
			filePath := filepath.Join(projectPath, fileName)

			// File must exist
			content, err := os.ReadFile(filePath)
			if err != nil {
				return false
			}

			contentStr := string(content)

			// Check if content contains required patterns
			if len(pattern.Contains) > 0 {
				foundPattern := false
				for _, searchStr := range pattern.Contains {
					if strings.Contains(contentStr, searchStr) {
						foundPattern = true
						break
					}
				}
				if !foundPattern {
					return false
				}
			}
		}
	}

	// All checks passed
	return true
}
