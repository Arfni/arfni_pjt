package main

import (
	"context"
	"flag"
	"fmt"
	"os"
	"path/filepath"

	"ic.local/ic/internal/runner"
	"ic.local/ic/pkg/stack"
)

func main() {
	var stackPath string
	flag.StringVar(&stackPath, "f", "stack.yaml", "path to stack.yaml")
	flag.Parse()

	absStack, _ := filepath.Abs(stackPath)
	st, err := stack.Load(absStack)
	if err != nil {
		fmt.Fprintf(os.Stderr, "[error] load stack: %v\n", err)
		os.Exit(1)
	}

	stackDir := filepath.Dir(absStack)
	outDir := filepath.Join(stackDir, ".infracanvas", "compose")
	if err := os.MkdirAll(outDir, 0o755); err != nil {
		fmt.Fprintf(os.Stderr, "[error] mkdir: %v\n", err)
		os.Exit(1)
	}

	if err := runner.Run(context.Background(), st, stackDir, outDir); err != nil {
		fmt.Fprintf(os.Stderr, "[error] run: %v\n", err)
		os.Exit(1)
	}
	fmt.Println("[ok] done")
}
