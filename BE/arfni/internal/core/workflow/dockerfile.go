package workflow

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"

	"github.com/arfni/arfni/internal/core/plugin"
)

// BuildType represents the detected build type (now just a string alias for plugin names)
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

// fileExists checks if a file exists
func fileExists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}

// ProjectConfig holds detected project configuration
type ProjectConfig struct {
	NodeVersion   string
	JavaVersion   string
	BuildTool     string // "gradle" or "maven"
	BuildCommand  string
	OutputDir     string
	GradleVersion string
}

// AnalyzeProject analyzes project files to detect versions and configuration
func AnalyzeProject(projectDir, buildPath string) *ProjectConfig {
	fullPath := filepath.Join(projectDir, buildPath)
	config := &ProjectConfig{
		NodeVersion:   "18",   // defaults
		JavaVersion:   "17",
		BuildCommand:  "",
		OutputDir:     "",
		GradleVersion: "8.5",
	}

	// Analyze package.json for Node.js projects
	packageJSONPath := filepath.Join(fullPath, "package.json")
	if fileExists(packageJSONPath) {
		analyzePackageJSON(packageJSONPath, config)
	}

	// Analyze build.gradle for Spring Boot projects
	buildGradlePath := filepath.Join(fullPath, "build.gradle")
	if fileExists(buildGradlePath) {
		config.BuildTool = "gradle"
		analyzeBuildGradle(buildGradlePath, config)
	}

	// Check for build.gradle.kts
	buildGradleKtsPath := filepath.Join(fullPath, "build.gradle.kts")
	if fileExists(buildGradleKtsPath) {
		config.BuildTool = "gradle"
		analyzeBuildGradle(buildGradleKtsPath, config)
	}

	// Analyze pom.xml for Maven projects
	pomXMLPath := filepath.Join(fullPath, "pom.xml")
	if fileExists(pomXMLPath) {
		config.BuildTool = "maven"
		analyzePomXML(pomXMLPath, config)
	}

	return config
}

// analyzePackageJSON extracts Node.js version and build configuration
func analyzePackageJSON(path string, config *ProjectConfig) {
	data, err := os.ReadFile(path)
	if err != nil {
		return
	}

	var pkg map[string]interface{}
	if err := json.Unmarshal(data, &pkg); err != nil {
		return
	}

	// Check engines.node
	if engines, ok := pkg["engines"].(map[string]interface{}); ok {
		if nodeVersion, ok := engines["node"].(string); ok {
			// Extract major version: ">=18.0.0" -> "18"
			re := regexp.MustCompile(`(\d+)`)
			if matches := re.FindStringSubmatch(nodeVersion); len(matches) > 0 {
				config.NodeVersion = matches[1]
			}
		}
	}

	// Note: We always use "npm run build" instead of reading scripts.build
	// because Docker needs to run through npm to find node_modules binaries
	config.BuildCommand = "npm run build"

	// Detect output directory from dependencies
	if deps, ok := pkg["dependencies"].(map[string]interface{}); ok {
		// Vite projects typically use 'dist'
		if _, hasVite := deps["vite"]; hasVite {
			config.OutputDir = "dist"
		}
		// Create React App uses 'build'
		if _, hasReactScripts := deps["react-scripts"]; hasReactScripts {
			config.OutputDir = "build"
		}
	}

	// Check devDependencies too
	if devDeps, ok := pkg["devDependencies"].(map[string]interface{}); ok {
		if _, hasVite := devDeps["vite"]; hasVite {
			config.OutputDir = "dist"
		}
	}

	// Default output directory
	if config.OutputDir == "" {
		config.OutputDir = "build" // CRA default
	}
}

// analyzeBuildGradle extracts Java version from build.gradle
func analyzeBuildGradle(path string, config *ProjectConfig) {
	data, err := os.ReadFile(path)
	if err != nil {
		return
	}

	content := string(data)

	// Look for sourceCompatibility = '17' or sourceCompatibility = 17
	re := regexp.MustCompile(`sourceCompatibility\s*=\s*['"]?(\d+)['"]?`)
	if matches := re.FindStringSubmatch(content); len(matches) > 1 {
		config.JavaVersion = matches[1]
	}

	// Look for JavaLanguageVersion.of(17)
	re2 := regexp.MustCompile(`JavaLanguageVersion\.of\((\d+)\)`)
	if matches := re2.FindStringSubmatch(content); len(matches) > 1 {
		config.JavaVersion = matches[1]
	}
}

// analyzePomXML extracts Java version from pom.xml
func analyzePomXML(path string, config *ProjectConfig) {
	data, err := os.ReadFile(path)
	if err != nil {
		return
	}

	content := string(data)

	// Look for <maven.compiler.source>17</maven.compiler.source>
	re := regexp.MustCompile(`<maven\.compiler\.source>(\d+)</maven\.compiler\.source>`)
	if matches := re.FindStringSubmatch(content); len(matches) > 1 {
		config.JavaVersion = matches[1]
	}

	// Look for <java.version>17</java.version>
	re2 := regexp.MustCompile(`<java\.version>(\d+)</java\.version>`)
	if matches := re2.FindStringSubmatch(content); len(matches) > 1 {
		config.JavaVersion = matches[1]
	}
}

// All Dockerfile generation is now handled by plugin templates.
// Hardcoded generators have been removed in favor of plugin-based system.
