package main

import (
	"flag"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"syscall"

	"gopkg.in/yaml.v3"
)

func main() {
	if len(os.Args) < 2 {
		printUsage()
		os.Exit(1)
	}

	command := os.Args[1]

	switch command {
	case "deploy", "run":
		runDeploy(os.Args[2:])
	case "monitor", "monitoring":
		runMonitoring(os.Args[2:])
	case "help", "-h", "--help":
		printUsage()
	default:
		fmt.Printf("[ERROR] Unknown command: %s\n\n", command)
		printUsage()
		os.Exit(1)
	}
}

func printUsage() {
	fmt.Println("================================================")
	fmt.Println("  Arfni CLI")
	fmt.Println("================================================")
	fmt.Println()
	fmt.Println("Usage:")
	fmt.Println("  arfni-go.exe <command> [options]")
	fmt.Println()
	fmt.Println("Commands:")
	fmt.Println("  deploy      Deploy services (alias: run)")
	fmt.Println("  monitor     Start monitoring (alias: monitoring)")
	fmt.Println("  help        Show this help message")
	fmt.Println()
	fmt.Println("Deploy Options:")
	fmt.Println("  -f string")
	fmt.Println("        Path to stack.yaml (default: stack.yaml)")
	fmt.Println("  -project-dir string")
	fmt.Println("        Project root directory (default: stack.yaml directory)")
	fmt.Println()
	fmt.Println("Monitor Options:")
	fmt.Println("  -f string")
	fmt.Println("        Path to stack.yaml (default: stack.yaml)")
	fmt.Println()
	fmt.Println("Examples:")
	fmt.Println("  arfni-go.exe deploy -f stack.yaml")
	fmt.Println("  arfni-go.exe monitor -f stack.yaml")
	fmt.Println()
}

// ========== Deploy Command ==========

func runDeploy(args []string) {
	fs := flag.NewFlagSet("deploy", flag.ExitOnError)
	stackFileFlag := fs.String("f", "stack.yaml", "path to stack.yaml")
	projectDirFlag := fs.String("project-dir", "", "project root directory")
	fs.Parse(args)

	stackFile := *stackFileFlag
	projectDir := *projectDirFlag

	// 현재 실행 파일의 위치 찾기
	exePath, err := os.Executable()
	if err != nil {
		fmt.Printf("[ERROR] Failed to get executable path: %v\n", err)
		os.Exit(1)
	}
	exeDir := filepath.Dir(exePath)

	// ic.exe 경로 찾기
	icExe := findICExecutable(exeDir)
	if icExe == "" {
		fmt.Println("[ERROR] ic.exe not found. Tried the following locations:")
		fmt.Printf("  1. %s\n", filepath.Join(exeDir, "ic.exe"))
		fmt.Printf("  2. %s\n", filepath.Join(exeDir, "..", "ic.exe"))
		cwd, _ := os.Getwd()
		fmt.Printf("  3. %s\n", filepath.Join(cwd, "ic.exe"))
		os.Exit(1)
	}

	// stack.yaml 절대 경로 계산
	if !filepath.IsAbs(stackFile) {
		cwd, err := os.Getwd()
		if err != nil {
			fmt.Printf("[ERROR] Failed to get current directory: %v\n", err)
			os.Exit(1)
		}
		stackFile = filepath.Join(cwd, stackFile)
	}

	if _, err := os.Stat(stackFile); os.IsNotExist(err) {
		fmt.Printf("[ERROR] stack.yaml not found at: %s\n", stackFile)
		os.Exit(1)
	}

	fmt.Println()
	fmt.Println("================================================")
	fmt.Println("  Arfni - Deploy")
	fmt.Println("================================================")
	fmt.Println()
	fmt.Printf("Stack File:    %s\n", stackFile)
	if projectDir != "" {
		fmt.Printf("Project Dir:   %s\n", projectDir)
	}
	fmt.Printf("IC Engine:     %s\n", icExe)
	fmt.Println()

	// ic.exe run -f 직접 실행 (project-dir 포함)
	cmdArgs := []string{"run", "-f", stackFile}
	if projectDir != "" {
		cmdArgs = append(cmdArgs, "-project-dir", projectDir)
	}

	deployCmd := exec.Command(icExe, cmdArgs...)
	deployCmd.Stdout = os.Stdout
	deployCmd.Stderr = os.Stderr
	deployCmd.Stdin = os.Stdin

	// Windows에서 콘솔 창 숨김
	if runtime.GOOS == "windows" {
		deployCmd.SysProcAttr = &syscall.SysProcAttr{
			HideWindow:    true,
			CreationFlags: 0x08000000 | 0x00000200, // CREATE_NO_WINDOW | CREATE_NEW_PROCESS_GROUP
		}
	}

	if err := deployCmd.Run(); err != nil {
		fmt.Println()
		fmt.Println("================================================")
		fmt.Println("[FAILED] Deployment failed!")
		fmt.Println("================================================")
		os.Exit(1)
	}

	fmt.Println()
	fmt.Println("[SUCCESS] Deployment completed successfully!")
	fmt.Println()
}

// ========== Monitor Command ==========

type StackYAML struct {
	Targets map[string]Target `yaml:"targets"`
}

type Target struct {
	Type   string `yaml:"type"`
	Host   string `yaml:"host"`
	User   string `yaml:"user"`
	SSHKey string `yaml:"sshKey"`
}

func runMonitoring(args []string) {
	fs := flag.NewFlagSet("monitor", flag.ExitOnError)
	stackFileFlag := fs.String("f", "stack.yaml", "path to stack.yaml")
	fs.Parse(args)

	stackFile := *stackFileFlag

	// stack.yaml 절대 경로 계산
	if !filepath.IsAbs(stackFile) {
		cwd, err := os.Getwd()
		if err != nil {
			fmt.Printf("[ERROR] Failed to get current directory: %v\n", err)
			os.Exit(1)
		}
		stackFile = filepath.Join(cwd, stackFile)
	}

	if _, err := os.Stat(stackFile); os.IsNotExist(err) {
		fmt.Printf("[ERROR] stack.yaml not found at: %s\n", stackFile)
		os.Exit(1)
	}

	// stack.yaml에서 EC2 정보 추출
	data, err := os.ReadFile(stackFile)
	if err != nil {
		fmt.Printf("[ERROR] Failed to read stack.yaml: %v\n", err)
		os.Exit(1)
	}

	var stack StackYAML
	if err := yaml.Unmarshal(data, &stack); err != nil {
		fmt.Printf("[ERROR] Failed to parse YAML: %v\n", err)
		os.Exit(1)
	}

	// EC2 타겟 찾기
	var host, user, sshKey string
	for _, target := range stack.Targets {
		if strings.EqualFold(target.Type, "ec2.ssh") {
			host = target.Host
			user = target.User
			sshKey = target.SSHKey
			break
		}
	}

	if host == "" || user == "" || sshKey == "" {
		fmt.Println("[ERROR] EC2 target not found in stack.yaml")
		fmt.Println("[INFO] Monitoring is only available for EC2 deployments")
		os.Exit(1)
	}

	// 현재 실행 파일의 위치에서 start-monitoring-v2.exe 찾기
	exePath, _ := os.Executable()
	exeDir := filepath.Dir(exePath)

	monitoringExe := filepath.Join(exeDir, "start-monitoring-v2.exe")
	if _, err := os.Stat(monitoringExe); os.IsNotExist(err) {
		fmt.Printf("[ERROR] start-monitoring-v2.exe not found at: %s\n", monitoringExe)
		os.Exit(1)
	}

	fmt.Println()
	fmt.Println("================================================")
	fmt.Println("  Arfni - Monitoring")
	fmt.Println("================================================")
	fmt.Println()
	fmt.Printf("EC2 Host:      %s\n", host)
	fmt.Printf("SSH User:      %s\n", user)
	fmt.Printf("Monitoring:    %s\n", monitoringExe)
	fmt.Println()

	// start-monitoring-v2.exe 호출
	// 사용법: start-monitoring-v2.exe <host> <key> <user> <stack-path>
	cmd := exec.Command(monitoringExe, host, sshKey, user, stackFile)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	cmd.Stdin = os.Stdin

	// Windows에서 콘솔 창 숨김
	if runtime.GOOS == "windows" {
		cmd.SysProcAttr = &syscall.SysProcAttr{
			HideWindow:    true,
			CreationFlags: 0x08000000, // CREATE_NO_WINDOW
		}
	}

	if err := cmd.Run(); err != nil {
		fmt.Printf("[ERROR] Monitoring failed: %v\n", err)
		os.Exit(1)
	}
}

// ========== Helper Functions ==========

func findICExecutable(exeDir string) string {
	cwd, _ := os.Getwd()

	candidates := []string{
		filepath.Join(exeDir, "ic.exe"),
		filepath.Join(exeDir, "..", "ic.exe"),
		filepath.Join(cwd, "ic.exe"),
	}

	for _, candidate := range candidates {
		absPath, err := filepath.Abs(candidate)
		if err != nil {
			continue
		}
		if _, err := os.Stat(absPath); err == nil {
			return absPath
		}
	}

	return ""
}
