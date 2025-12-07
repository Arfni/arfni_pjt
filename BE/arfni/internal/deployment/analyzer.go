package deployment

import (
	"encoding/json"
	"fmt"
	"os"
)

// AnalyzeDeploymentFailureCommand analyzes deployment failure using AI
func AnalyzeDeploymentFailureCommand(logsPath, stackYAMLPath, environment, language string) error {
	// Read deployment logs
	logsContent, err := os.ReadFile(logsPath)
	if err != nil {
		return fmt.Errorf("failed to read deployment logs: %w", err)
	}

	// Read stack.yaml
	stackYAMLContent, err := os.ReadFile(stackYAMLPath)
	if err != nil {
		return fmt.Errorf("failed to read stack.yaml: %w", err)
	}

	// Extract error messages from logs
	errorMessages := extractErrorMessages(string(logsContent))

	// Create AI client
	client := NewAITroubleshootClient()

	// Prepare request
	req := DeploymentFailureRequest{
		DeploymentLogs: string(logsContent),
		StackYAML:      string(stackYAMLContent),
		Environment:    environment,
		ErrorMessages:  errorMessages,
		Language:       language,
	}

	// Analyze with AI
	result, err := client.AnalyzeDeploymentFailure(req)
	if err != nil {
		return fmt.Errorf("failed to analyze deployment failure: %w", err)
	}

	// Output result as JSON with marker
	jsonOutput, err := json.MarshalIndent(result, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal result: %w", err)
	}

	fmt.Printf("__TROUBLESHOOT_RESULT__%s\n", string(jsonOutput))
	return nil
}

// extractErrorMessages extracts key error messages from deployment logs
func extractErrorMessages(logs string) string {
	// Simple extraction: find lines containing common error keywords
	errorKeywords := []string{
		"ERROR",
		"error",
		"Error",
		"FATAL",
		"fatal",
		"Failed",
		"failed",
		"FAILED",
		"Exception",
		"exception",
		"panic",
		"PANIC",
	}

	var errorLines []string
	lines := splitLines(logs)

	for _, line := range lines {
		for _, keyword := range errorKeywords {
			if contains(line, keyword) {
				errorLines = append(errorLines, line)
				break
			}
		}
	}

	// Limit to last 50 error lines to avoid token limits
	if len(errorLines) > 50 {
		errorLines = errorLines[len(errorLines)-50:]
	}

	result := ""
	for _, line := range errorLines {
		result += line + "\n"
	}

	if result == "" {
		return "No explicit error messages found in logs"
	}

	return result
}

// Helper functions
func splitLines(s string) []string {
	var lines []string
	var line string
	for _, ch := range s {
		if ch == '\n' {
			lines = append(lines, line)
			line = ""
		} else {
			line += string(ch)
		}
	}
	if line != "" {
		lines = append(lines, line)
	}
	return lines
}

func contains(s, substr string) bool {
	return len(s) >= len(substr) && findSubstring(s, substr) >= 0
}

func findSubstring(s, substr string) int {
	if len(substr) == 0 {
		return 0
	}
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return i
		}
	}
	return -1
}
