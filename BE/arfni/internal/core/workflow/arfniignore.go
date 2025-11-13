package workflow

import (
	"bufio"
	"os"
	"path/filepath"
	"strings"
)

// ArfniIgnore handles .arfniignore file parsing and pattern matching
type ArfniIgnore struct {
	patterns []string
	baseDir  string
}

// LoadArfniIgnore loads and parses .arfniignore file from the project directory
// If the file doesn't exist, it creates one with default patterns
func LoadArfniIgnore(projectDir string) (*ArfniIgnore, error) {
	ignoreFile := filepath.Join(projectDir, ".arfniignore")

	ai := &ArfniIgnore{
		patterns: make([]string, 0),
		baseDir:  projectDir,
	}

	// If .arfniignore doesn't exist, create it with default patterns
	if _, err := os.Stat(ignoreFile); os.IsNotExist(err) {
		if err := createDefaultArfniIgnore(ignoreFile); err != nil {
			// If creation fails, still use default patterns in memory
			ai.patterns = getDefaultIgnorePatterns()
			return ai, nil
		}
	}

	// Read and parse .arfniignore file
	file, err := os.Open(ignoreFile)
	if err != nil {
		return nil, err
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())

		// Skip empty lines and comments
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}

		ai.patterns = append(ai.patterns, line)
	}

	if err := scanner.Err(); err != nil {
		return nil, err
	}

	return ai, nil
}

// ShouldIgnore checks if a file or directory should be ignored
func (ai *ArfniIgnore) ShouldIgnore(path string) bool {
	// Get relative path from base directory
	relPath, err := filepath.Rel(ai.baseDir, path)
	if err != nil {
		relPath = filepath.Base(path)
	}

	// Normalize path separators for consistent matching
	relPath = filepath.ToSlash(relPath)
	baseName := filepath.Base(path)

	for _, pattern := range ai.patterns {
		if ai.matchPattern(pattern, relPath, baseName) {
			return true
		}
	}

	return false
}

// matchPattern checks if a path matches an ignore pattern
func (ai *ArfniIgnore) matchPattern(pattern, relPath, baseName string) bool {
	pattern = strings.TrimSpace(pattern)

	// Handle negation patterns (lines starting with !)
	if strings.HasPrefix(pattern, "!") {
		return false // Negation patterns can be implemented later if needed
	}

	// Remove trailing slash for consistency
	pattern = strings.TrimSuffix(pattern, "/")

	// Exact name match (e.g., "node_modules")
	if !strings.Contains(pattern, "/") && !strings.Contains(pattern, "*") && !strings.Contains(pattern, "?") {
		return baseName == pattern
	}

	// Wildcard patterns (*, **)
	if strings.Contains(pattern, "*") || strings.Contains(pattern, "?") {
		// Handle ** pattern (matches any directory depth)
		if strings.Contains(pattern, "**") {
			// Convert ** to match any path segment
			pattern = strings.ReplaceAll(pattern, "**", "*")
		}

		// Try matching against full relative path
		matched, _ := filepath.Match(pattern, relPath)
		if matched {
			return true
		}

		// Try matching against basename
		matched, _ = filepath.Match(pattern, baseName)
		if matched {
			return true
		}

		// Try matching against path components
		pathParts := strings.Split(relPath, "/")
		for _, part := range pathParts {
			matched, _ := filepath.Match(pattern, part)
			if matched {
				return true
			}
		}

		return false
	}

	// Direct path match
	if relPath == pattern || baseName == pattern {
		return true
	}

	// Prefix match for directories
	if strings.HasPrefix(relPath, pattern+"/") {
		return true
	}

	return false
}

// createDefaultArfniIgnore creates .arfniignore file with default patterns
func createDefaultArfniIgnore(filePath string) error {
	content := `# Arfni Ignore File
# This file specifies which files/directories should NOT be uploaded to the server during deployment
# Similar to .gitignore, but for deployment purposes
#
# Files that WILL be uploaded (do NOT add these):
# - Source code (.js, .py, .go, etc)
# - Configuration files (.env, config.json, etc)
# - Dependency manifests (package.json, requirements.txt, go.mod, etc)
# - Docker files (Dockerfile, docker-compose.yml)
# - Static resources (images, css, etc)

# Node.js
node_modules/

# Python
venv/
.venv/
env/
__pycache__/
*.pyc
*.pyo
*.pyd
.pytest_cache/

# Go
vendor/

# Java
target/
.gradle/
.maven/

# Build outputs
build/
dist/
out/
.next/
.nuxt/
.output/

# Cache directories
.cache/
.parcel-cache/
.turbo/

# IDE and editors
.idea/
.vscode/
.vs/
*.swp
*.swo
*~

# Version control
.git/
.svn/
.hg/

# OS files
.DS_Store
Thumbs.db
desktop.ini

# Logs
*.log
logs/
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Test coverage
coverage/
.nyc_output/

# Documentation (optional, uncomment if you don't want to upload docs)
# docs/
# documentation/
`

	return os.WriteFile(filePath, []byte(content), 0644)
}

// getDefaultIgnorePatterns returns default patterns (used as fallback)
func getDefaultIgnorePatterns() []string {
	return []string{
		// Node.js
		"node_modules",

		// Python
		"venv",
		".venv",
		"env",
		"__pycache__",
		"*.pyc",
		"*.pyo",
		"*.pyd",
		".pytest_cache",

		// Go
		"vendor",

		// Java
		"target",
		".gradle",
		".maven",

		// Build outputs
		"build",
		"dist",
		"out",
		".next",
		".nuxt",
		".output",

		// Cache
		".cache",
		".parcel-cache",
		".turbo",

		// IDE
		".idea",
		".vscode",
		".vs",
		"*.swp",
		"*.swo",

		// Version control
		".git",
		".svn",
		".hg",

		// OS files
		".DS_Store",
		"Thumbs.db",
		"desktop.ini",

		// Logs
		"*.log",
		"logs",
		"npm-debug.log*",
		"yarn-debug.log*",
		"yarn-error.log*",

		// Coverage
		"coverage",
		".nyc_output",
	}
}

// GetPatterns returns all loaded patterns (useful for debugging/display)
func (ai *ArfniIgnore) GetPatterns() []string {
	return ai.patterns
}
