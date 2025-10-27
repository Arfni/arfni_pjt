package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"path/filepath"

	"github.com/arfni/arfni/internal/core/stack"
	"github.com/arfni/arfni/internal/core/workflow"
	"github.com/arfni/arfni/internal/events"
)

func main() {
	// CLI flags
	stackFile := flag.String("f", "stack.yaml", "Path to stack.yaml")
	projectDir := flag.String("project-dir", ".", "Project directory")
	command := flag.String("", "run", "Command to execute (run, validate)")
	flag.Parse()

	// Remaining args
	args := flag.Args()
	if len(args) > 0 {
		*command = args[0]
	}

	switch *command {
	case "run":
		runDeploy(*stackFile, *projectDir)
	case "validate":
		validateStack(*stackFile)
	default:
		fmt.Printf("Unknown command: %s\n", *command)
		os.Exit(1)
	}
}

func runDeploy(stackFile, projectDir string) {
	// Event stream setup
	stream := events.NewStream(true)

	stream.Info("Starting deployment workflow...")
	stream.Info(fmt.Sprintf("Stack file: %s", stackFile))
	stream.Info(fmt.Sprintf("Project directory: %s", projectDir))

	// Parse stack.yaml
	stream.Info("Parsing stack.yaml...")
	stackData, err := stack.ParseFile(stackFile)
	if err != nil {
		stream.ErrorStr(fmt.Sprintf("Failed to parse stack.yaml: %v", err))
		os.Exit(1)
	}

	stream.Success(fmt.Sprintf("Loaded stack: %s", stackData.Name))

	// Run workflow
	runner := workflow.NewRunner(stackData, projectDir)

	// Execute workflow
	err = runner.Execute(stream)
	if err != nil {
		stream.ErrorStr(fmt.Sprintf("Deployment failed: %v", err))
		os.Exit(1)
	}

	stream.Success("🎉 Deployment completed successfully!")

	// Output results
	composeDir := filepath.Join(projectDir, ".arfni", "compose")
	outputs := map[string]string{
		"status":      "success",
		"services":    fmt.Sprintf("%d", len(stackData.Services)),
		"compose_dir": composeDir,
	}

	outputJSON, _ := json.Marshal(outputs)
	fmt.Printf("\n__OUTPUTS__%s\n", string(outputJSON))
}

func validateStack(stackFile string) {
	stream := events.NewStream(true)

	stream.Info(fmt.Sprintf("Validating %s...", stackFile))

	_, err := stack.ParseFile(stackFile)
	if err != nil {
		stream.ErrorStr(fmt.Sprintf("Validation failed: %v", err))
		os.Exit(1)
	}

	stream.Success("✅ stack.yaml is valid")
}
