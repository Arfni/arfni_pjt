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

	// 엔드포인트 수집 - stack.yaml의 포트 정보 사용
	endpoints := []map[string]string{}
	for serviceName, service := range stackData.Services {
		// 서비스의 첫 번째 포트를 사용
		port := 8080 // 기본값
		if len(service.Spec.Ports) > 0 {
			// "8080:8080" 형식에서 앞의 포트(호스트 포트) 추출
			portStr := service.Spec.Ports[0]
			if colonIdx := 0; colonIdx < len(portStr) {
				// : 앞의 포트 번호 파싱
				var hostPort string
				for i, c := range portStr {
					if c == ':' {
						hostPort = portStr[:i]
						break
					}
				}
				if hostPort != "" {
					fmt.Sscanf(hostPort, "%d", &port)
				} else {
					// : 없으면 전체가 포트 번호
					fmt.Sscanf(portStr, "%d", &port)
				}
			}
		}

		endpoints = append(endpoints, map[string]string{
			"name": serviceName,
			"url":  fmt.Sprintf("http://localhost:%d", port),
			"type": "service",
		})
	}

	outputs := map[string]interface{}{
		"status":          "success",
		"service_count":   len(stackData.Services),
		"container_count": len(stackData.Services), // 임시로 서비스 개수와 동일
		"compose_dir":     composeDir,
		"endpoints":       endpoints,
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
