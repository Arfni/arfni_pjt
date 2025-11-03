package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"path/filepath"

	"github.com/arfni/arfni/internal/events"
	"github.com/arfni/arfni/internal/core/workflow"
	"github.com/arfni/arfni/internal/core/stack"
)

func main() {
	if len(os.Args) < 2 {
		fmt.Fprintf(os.Stderr, "usage: %s <run|status> -f <stack.yaml>\n", filepath.Base(os.Args[0]))
		os.Exit(2)
	}
	sub := os.Args[1]

	fs := flag.NewFlagSet(sub, flag.ExitOnError)
	stackPath := fs.String("f", "stack.yaml", "path to stack.yaml")
	projectDir := fs.String("project-dir", "", "project root directory (default: stack.yaml directory)")
	pluginsDir := fs.String("plugins-dir", "", "plugins directory path (for template-based Dockerfile generation)")
	bundledPluginsDir := fs.String("bundled-plugins-dir", "", "bundled plugins directory path (for built-in plugins)")
	_ = fs.Parse(os.Args[2:])

	// stack.yaml 절대경로 계산
	absPath, err := filepath.Abs(*stackPath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "[error] resolve stack path: %v\n", err)
		os.Exit(1)
	}

	// 프로젝트 디렉터리 결정: -project-dir 플래그 우선, 없으면 stack.yaml 위치 사용
	var stackDir string
	if *projectDir != "" {
		stackDir, err = filepath.Abs(*projectDir)
		if err != nil {
			fmt.Fprintf(os.Stderr, "[error] resolve project-dir: %v\n", err)
			os.Exit(1)
		}
	} else {
		stackDir = filepath.Dir(absPath)
	}

	// Monitoring services are now managed by frontend plugin system
	// No need to inject monitoring services here anymore

	st, err := stack.Parse(absPath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "[error] load stack: %v\n", err)
		os.Exit(1)
	}

	switch sub {
	case "run":
		// Create event stream for logging
		stream := events.NewStream(true)

		// Create runner with new workflow
		runner := workflow.NewRunner(st, stackDir)

		// Execute workflow with pluginsDir and bundledPluginsDir
		if err := runner.ExecuteWithPlugins(stream, *pluginsDir, *bundledPluginsDir); err != nil {
			fmt.Fprintf(os.Stderr, "[error] run: %v\n", err)
			os.Exit(1)
		}

		// Generate and output deployment results
		outputs := workflow.GenerateOutputs(st, stackDir)
		if outputsJSON, err := json.Marshal(outputs); err == nil {
			fmt.Printf("__OUTPUTS__%s\n", string(outputsJSON))
		}

		fmt.Println("\n[SUCCESS] Deployment completed successfully!")

	case "status":
		// Status command uses old implementation
		// You can update this later if needed
		fmt.Println("Status command - not yet implemented in new workflow")
		os.Exit(0)

	default:
		fmt.Fprintf(os.Stderr, "unknown subcommand: %s (use run|status)\n", sub)
		os.Exit(2)
	}
}
