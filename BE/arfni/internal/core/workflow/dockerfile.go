package workflow

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

// BuildType represents the detected build type
type BuildType string

const (
	BuildTypeNodeJS     BuildType = "nodejs"
	BuildTypeReact      BuildType = "react"
	BuildTypeVue        BuildType = "vue"
	BuildTypeSpring     BuildType = "spring"
	BuildTypeSpringBoot BuildType = "springboot"
	BuildTypeGo         BuildType = "go"
	BuildTypePython     BuildType = "python"
	BuildTypeUnknown    BuildType = "unknown"
)

// DetectBuildType detects the build type from the build path
func DetectBuildType(projectDir, buildPath string) (BuildType, error) {
	fullPath := filepath.Join(projectDir, buildPath)

	// Check if directory exists
	if _, err := os.Stat(fullPath); os.IsNotExist(err) {
		return BuildTypeUnknown, fmt.Errorf("build path does not exist: %s", fullPath)
	}

	// Check for Node.js/React/Vue
	if fileExists(filepath.Join(fullPath, "package.json")) {
		// Read package.json to determine if it's React or Vue
		packageJSON, err := os.ReadFile(filepath.Join(fullPath, "package.json"))
		if err == nil {
			content := string(packageJSON)
			if strings.Contains(content, "\"react\"") {
				return BuildTypeReact, nil
			}
			if strings.Contains(content, "\"vue\"") {
				return BuildTypeVue, nil
			}
		}
		return BuildTypeNodeJS, nil
	}

	// Check for Spring Boot (Gradle)
	if fileExists(filepath.Join(fullPath, "build.gradle")) || fileExists(filepath.Join(fullPath, "build.gradle.kts")) {
		return BuildTypeSpringBoot, nil
	}

	// Check for Spring Boot (Maven)
	if fileExists(filepath.Join(fullPath, "pom.xml")) {
		return BuildTypeSpringBoot, nil
	}

	// Check for Go
	if fileExists(filepath.Join(fullPath, "go.mod")) {
		return BuildTypeGo, nil
	}

	// Check for Python
	if fileExists(filepath.Join(fullPath, "requirements.txt")) || fileExists(filepath.Join(fullPath, "Pipfile")) {
		return BuildTypePython, nil
	}

	return BuildTypeUnknown, nil
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

// GenerateDockerfile generates a Dockerfile based on the build type (legacy, no config)
func GenerateDockerfile(buildType BuildType) string {
	return GenerateDockerfileWithConfig(buildType, nil)
}

// GenerateDockerfileWithConfig generates a Dockerfile with project configuration
func GenerateDockerfileWithConfig(buildType BuildType, config *ProjectConfig) string {
	// Use default config if none provided
	if config == nil {
		config = &ProjectConfig{
			NodeVersion:   "18",
			JavaVersion:   "17",
			BuildCommand:  "npm run build",
			OutputDir:     "build",
			GradleVersion: "8.5",
			BuildTool:     "gradle",
		}
	}

	switch buildType {
	case BuildTypeReact:
		return generateReactDockerfileWithConfig(config)
	case BuildTypeVue:
		return generateVueDockerfileWithConfig(config)
	case BuildTypeNodeJS:
		return generateNodeJSDockerfileWithConfig(config)
	case BuildTypeSpringBoot:
		return generateSpringBootDockerfileWithConfig(config)
	case BuildTypeGo:
		return generateGoDockerfile()
	case BuildTypePython:
		return generatePythonDockerfile()
	default:
		return generateDefaultDockerfile()
	}
}

// Dynamic Dockerfile generators with project config

func generateReactDockerfileWithConfig(config *ProjectConfig) string {
	buildCmd := config.BuildCommand
	if buildCmd == "" {
		buildCmd = "npm run build"
	}

	outputDir := config.OutputDir
	if outputDir == "" {
		outputDir = "build"
	}

	return fmt.Sprintf(`# Build stage
FROM node:%s-alpine AS build
WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm install

# Copy source code
COPY . .

# Build the app
RUN %s

# Production stage
FROM nginx:alpine
COPY --from=build /app/%s /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
`, config.NodeVersion, buildCmd, outputDir)
}

func generateReactDockerfile() string {
	return generateReactDockerfileWithConfig(&ProjectConfig{
		NodeVersion:  "18",
		BuildCommand: "npm run build",
		OutputDir:    "build",
	})
}

func generateVueDockerfileWithConfig(config *ProjectConfig) string {
	buildCmd := config.BuildCommand
	if buildCmd == "" {
		buildCmd = "npm run build"
	}

	outputDir := config.OutputDir
	if outputDir == "" {
		outputDir = "dist"
	}

	return fmt.Sprintf(`# Build stage
FROM node:%s-alpine AS build
WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm install

# Copy source code
COPY . .

# Build the app
RUN %s

# Production stage
FROM nginx:alpine
COPY --from=build /app/%s /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
`, config.NodeVersion, buildCmd, outputDir)
}

func generateVueDockerfile() string {
	return generateVueDockerfileWithConfig(&ProjectConfig{
		NodeVersion:  "18",
		BuildCommand: "npm run build",
		OutputDir:    "dist",
	})
}

func generateNodeJSDockerfileWithConfig(config *ProjectConfig) string {
	return fmt.Sprintf(`FROM node:%s-alpine
WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm install --production

# Copy source code
COPY . .

EXPOSE 3000
CMD ["npm", "start"]
`, config.NodeVersion)
}

func generateNodeJSDockerfile() string {
	return generateNodeJSDockerfileWithConfig(&ProjectConfig{
		NodeVersion: "18",
	})
}

func generateSpringBootDockerfileWithConfig(config *ProjectConfig) string {
	if config.BuildTool == "maven" {
		return generateSpringBootMavenDockerfile(config)
	}
	return generateSpringBootGradleDockerfile(config)
}

func generateSpringBootGradleDockerfile(config *ProjectConfig) string {
	javaVersion := config.JavaVersion
	gradleVersion := config.GradleVersion

	return fmt.Sprintf(`# Build stage
FROM gradle:%s-jdk%s AS build
WORKDIR /app

# Copy all files
COPY . .

# Build the application
RUN gradle build --no-daemon -x test

# Production stage
FROM openjdk:%s-slim
WORKDIR /app

# Copy the built jar
COPY --from=build /app/build/libs/*.jar app.jar

EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
`, gradleVersion, javaVersion, javaVersion)
}

func generateSpringBootMavenDockerfile(config *ProjectConfig) string {
	javaVersion := config.JavaVersion

	return fmt.Sprintf(`# Build stage
FROM maven:3.9-eclipse-temurin-%s AS build
WORKDIR /app

# Copy pom.xml and download dependencies
COPY pom.xml ./
RUN mvn dependency:go-offline -B

# Copy source code and build
COPY src ./src
RUN mvn clean package -DskipTests

# Production stage
FROM openjdk:%s-slim
WORKDIR /app

# Copy the built jar
COPY --from=build /app/target/*.jar app.jar

EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
`, javaVersion, javaVersion)
}

func generateSpringBootDockerfile() string {
	return generateSpringBootGradleDockerfile(&ProjectConfig{
		JavaVersion:   "17",
		GradleVersion: "8.5",
		BuildTool:     "gradle",
	})
}

func generateGoDockerfile() string {
	return `# Build stage
FROM golang:1.21-alpine AS build
WORKDIR /app

# Copy go mod files
COPY go.mod go.sum ./
RUN go mod download

# Copy source code
COPY . .

# Build the application
RUN CGO_ENABLED=0 GOOS=linux go build -o main .

# Production stage
FROM alpine:latest
WORKDIR /root/

# Copy the binary
COPY --from=build /app/main .

EXPOSE 8080
CMD ["./main"]
`
}

func generatePythonDockerfile() string {
	return `FROM python:3.11-slim
WORKDIR /app

# Copy requirements
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy source code
COPY . .

EXPOSE 8000
CMD ["python", "main.py"]
`
}

func generateDefaultDockerfile() string {
	return `# Default Dockerfile
# Please customize this based on your application
FROM alpine:latest
WORKDIR /app

COPY . .

EXPOSE 8080
CMD ["/bin/sh"]
`
}

// WriteDockerfile writes a Dockerfile to the specified path (기본 호환성 유지)
func WriteDockerfile(projectDir, buildPath string, buildType BuildType,
                     buildConfig map[string]interface{}, pluginsDir string) error {
	return WriteDockerfileWithBundled(projectDir, buildPath, buildType, buildConfig, pluginsDir, "")
}

// WriteDockerfileWithBundled writes a Dockerfile to the specified path
// Priority: 1) User Dockerfile 2) Plugin template + buildConfig 3) Auto-generation
func WriteDockerfileWithBundled(projectDir, buildPath string, buildType BuildType,
                     buildConfig map[string]interface{}, pluginsDir, bundledPluginsDir string) error {
	dockerfilePath := filepath.Join(projectDir, buildPath, "Dockerfile")

	// Priority 1: User-provided Dockerfile
	if fileExists(dockerfilePath) {
		fmt.Printf("[INFO] Using existing Dockerfile at %s\n", dockerfilePath)
		return nil
	}

	var dockerfileContent string

	// Priority 2: Plugin template + buildConfig substitution
	// Convert buildType to service type name
	serviceType := buildTypeToServiceType(buildType, buildConfig)

	// Try installed plugins first, then bundled plugins
	var templatePath string
	var templateErr error

	if pluginsDir != "" {
		renderer := NewTemplateRenderer(pluginsDir)
		templatePath, templateErr = renderer.FindPluginTemplate(serviceType)
		if templateErr == nil {
			fmt.Printf("[INFO] Found plugin template in installed plugins: %s\n", templatePath)
		}
	}

	// If not found in installed plugins, try bundled plugins
	if templatePath == "" && bundledPluginsDir != "" {
		bundledRenderer := NewBundledTemplateRenderer(bundledPluginsDir)
		templatePath, templateErr = bundledRenderer.FindBundledTemplate(serviceType)
		if templateErr == nil {
			fmt.Printf("[INFO] Found plugin template in bundled plugins: %s\n", templatePath)
		}
	}

	// If template found, render it
	if templatePath != "" {
		// Initialize buildConfig if nil
		if buildConfig == nil {
			buildConfig = make(map[string]interface{})
		}

		// Fill missing values with project analysis
		fillDefaultBuildConfig(projectDir, buildPath, buildType, buildConfig)

		// Create appropriate renderer based on where template was found
		var rendered string
		var renderErr error

		if pluginsDir != "" && strings.Contains(templatePath, pluginsDir) {
			renderer := NewTemplateRenderer(pluginsDir)
			rendered, renderErr = renderer.RenderTemplate(templatePath, buildConfig)
		} else {
			bundledRenderer := NewBundledTemplateRenderer(bundledPluginsDir)
			rendered, renderErr = bundledRenderer.RenderTemplate(templatePath, buildConfig)
		}

		if renderErr == nil {
			dockerfileContent = rendered
			fmt.Printf("[INFO] Successfully rendered Dockerfile template\n")
		} else {
			fmt.Printf("[WARN] Failed to render template: %v, falling back to auto-generation\n", renderErr)
		}
	} else {
		fmt.Printf("[INFO] No plugin template found for %s, using auto-generation\n", serviceType)
	}

	// Priority 3: Auto-generation (fallback)
	if dockerfileContent == "" {
		config := AnalyzeProject(projectDir, buildPath)
		dockerfileContent = GenerateDockerfileWithConfig(buildType, config)
		fmt.Printf("[INFO] Generated Dockerfile using auto-detection (BuildType: %s)\n", buildType)
	}

	// Write Dockerfile
	if err := os.WriteFile(dockerfilePath, []byte(dockerfileContent), 0644); err != nil {
		return fmt.Errorf("failed to write Dockerfile: %w", err)
	}

	return nil
}

// buildTypeToServiceType converts BuildType to service type name for plugin lookup
func buildTypeToServiceType(buildType BuildType, buildConfig map[string]interface{}) string {
	// Check buildConfig for explicit framework
	if framework, ok := buildConfig["framework"].(string); ok {
		return framework
	}

	// Infer from BuildType
	switch buildType {
	case BuildTypePython:
		// Check if Django is in buildConfig or default to python
		return "django" // Can be enhanced to check requirements.txt
	case BuildTypeSpringBoot:
		return "springboot"
	case BuildTypeReact:
		return "react"
	case BuildTypeNodeJS:
		return "nodejs"
	case BuildTypeVue:
		return "vue"
	case BuildTypeGo:
		return "go"
	default:
		return strings.ToLower(string(buildType))
	}
}

// fillDefaultBuildConfig fills missing buildConfig values from project analysis
func fillDefaultBuildConfig(projectDir, buildPath string, buildType BuildType,
                            buildConfig map[string]interface{}) {
	config := AnalyzeProject(projectDir, buildPath)

	switch buildType {
	case BuildTypePython:
		if _, ok := buildConfig["python_version"]; !ok {
			buildConfig["python_version"] = "3.11"
		}
		if _, ok := buildConfig["workers"]; !ok {
			buildConfig["workers"] = 4
		}
	case BuildTypeSpringBoot:
		if _, ok := buildConfig["java_version"]; !ok {
			buildConfig["java_version"] = config.JavaVersion
		}
		if _, ok := buildConfig["gradle_version"]; !ok {
			buildConfig["gradle_version"] = config.GradleVersion
		}
		if _, ok := buildConfig["build_tool"]; !ok {
			buildConfig["build_tool"] = config.BuildTool
		}
	case BuildTypeReact, BuildTypeVue, BuildTypeNodeJS:
		if _, ok := buildConfig["node_version"]; !ok {
			buildConfig["node_version"] = config.NodeVersion
		}
		if _, ok := buildConfig["build_command"]; !ok && config.BuildCommand != "" {
			buildConfig["build_command"] = config.BuildCommand
		}
		if _, ok := buildConfig["output_dir"]; !ok && config.OutputDir != "" {
			buildConfig["output_dir"] = config.OutputDir
		}
	}
}
