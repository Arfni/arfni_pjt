package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"net"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"runtime"
	"strings"
	"syscall"
	"time"

	"gopkg.in/yaml.v2"
	"github.com/arfni/arfni/internal/core/monitoring"
)

const (
	colorReset  = "\033[0m"
	colorRed    = "\033[31m"
	colorGreen  = "\033[32m"
	colorYellow = "\033[33m"
	colorBlue   = "\033[34m"
	colorPurple = "\033[35m"
	colorCyan   = "\033[36m"
	colorWhite  = "\033[37m"
)

// MonitoringMode 타입
type MonitoringMode string

const (
	ModeLocal     MonitoringMode = "local"      // Prometheus + Grafana 로컬
	ModeHybrid    MonitoringMode = "hybrid"     // Prometheus EC2, Grafana 로컬
	ModeAllInOne  MonitoringMode = "all-in-one" // 모두 EC2
)

// Config 구조체 - JSON 파일 또는 CLI 플래그로 설정
type Config struct {
	SSH struct {
		Host    string `json:"host"`
		User    string `json:"user"`
		PemPath string `json:"pem_path"`
	} `json:"ssh"`
	Monitoring struct {
		Mode              MonitoringMode `json:"mode"`
		StackPath         string         `json:"stack_path"`
		PrometheusPort    int            `json:"prometheus_port"`
		GrafanaPort       int            `json:"grafana_port"`
		NodeExporterPort  int            `json:"node_exporter_port"`
	} `json:"monitoring"`
	Options struct {
		AutoOpenBrowser bool `json:"auto_open_browser"`
		CleanupOnExit   bool `json:"cleanup_on_exit"`
	} `json:"options"`
}

// Stack YAML 구조체 (간소화 버전)
type StackYAML struct {
	Targets  map[string]StackTarget  `yaml:"targets"`
	Services map[string]StackService `yaml:"services"`
	Metadata StackMetadata           `yaml:"metadata"`
}

type StackMetadata struct {
	Monitoring MonitoringMetadata `yaml:"monitoring"`
}

type MonitoringMetadata struct {
	Mode string `yaml:"mode"`
}

type StackTarget struct {
	Type   string `yaml:"type"`
	Host   string `yaml:"host"`
	User   string `yaml:"user"`
	SSHKey string `yaml:"sshKey"`
}

type StackService struct {
	Kind   string `yaml:"kind"`
	Target string `yaml:"target"`
}

// EC2Config - stack.yaml에서 추출한 EC2 연결 정보
type EC2Config struct {
	Host   string
	User   string
	SSHKey string
}

func main() {
	// 배너 출력
	printBanner()

	// CLI 플래그 정의
	configFile := flag.String("config", "", "Path to JSON config file")
	sshHost := flag.String("host", "", "EC2 host address")
	sshUser := flag.String("user", "ec2-user", "SSH user")
	sshKey := flag.String("key", "", "Path to SSH private key (.pem)")
	stackPath := flag.String("stack", "", "Path to stack.yaml for mode detection")
	mode := flag.String("mode", "", "Monitoring mode: local, hybrid, or all-in-one")
	flag.Parse()

	// Config 로드 (우선순위: CLI 플래그 > JSON 파일 > 기본값)
	cfg, err := loadConfig(*configFile, *sshHost, *sshUser, *sshKey, *stackPath, *mode, flag.Args())
	if err != nil {
		fmt.Printf("%s❌ Configuration error: %v%s\n", colorRed, err, colorReset)
		printUsageV2()
		pressEnterToExit()
		os.Exit(1)
	}

	// 설정 검증
	if err := validateConfig(cfg); err != nil {
		fmt.Printf("%s❌ Configuration validation failed:%s\n", colorRed, colorReset)
		fmt.Println(err.Error())
		fmt.Println()
		pressEnterToExit()
		os.Exit(1)
	}

	// 설정 정보 출력
	fmt.Printf("📡 EC2 Host: %s\n", cfg.SSH.Host)
	fmt.Printf("🔑 SSH Key:  %s\n", cfg.SSH.PemPath)
	fmt.Printf("👤 SSH User: %s\n", cfg.SSH.User)
	fmt.Println()

	// Context 설정 (Ctrl+C 처리)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	sigChan := make(chan os.Signal, 1)
	// Windows에서 CMD 창 닫기, Ctrl+C, 종료 시그널 모두 처리
	if runtime.GOOS == "windows" {
		signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM, syscall.SIGINT)
	} else {
		signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)
	}

	// Cleanup 함수
	var tunnelCmd *exec.Cmd
	var composeDir string
	cleanup := func() {
		fmt.Println()
		fmt.Printf("%s🧹 Cleaning up...%s\n", colorYellow, colorReset)

		// SSH 터널 종료
		if tunnelCmd != nil && tunnelCmd.Process != nil {
			fmt.Println("   Stopping SSH tunnel...")
			tunnelCmd.Process.Kill()
		}

		// Docker Compose Down (선택적)
		if cfg.Options.CleanupOnExit && composeDir != "" {
			fmt.Println("   Stopping Docker containers...")
			cmd := exec.Command("docker", "compose", "down")
			cmd.Dir = composeDir
			cmd.Run()
		}

		fmt.Printf("%s✅ Cleanup complete%s\n", colorGreen, colorReset)
	}
	defer cleanup()

	// 고루틴에서 시그널 처리
	go func() {
		<-sigChan
		fmt.Println()
		fmt.Printf("%s⚠️  Received interrupt signal%s\n", colorYellow, colorReset)
		cancel()
	}()

	// Step 1: Docker Desktop 확인
	if err := checkDockerDesktop(ctx); err != nil {
		fmt.Printf("%s❌ %s%s\n", colorRed, err.Error(), colorReset)
		pressEnterToExit()
		os.Exit(1)
	}

	// Step 2: 포트 확인
	if err := checkPorts(cfg.Monitoring.PrometheusPort, cfg.Monitoring.GrafanaPort, cfg.Monitoring.NodeExporterPort); err != nil {
		fmt.Printf("%s❌ %s%s\n", colorRed, err.Error(), colorReset)
		pressEnterToExit()
		os.Exit(1)
	}

	// Step 3: SSH 키 파일 확인
	if err := checkFileExists(cfg.SSH.PemPath); err != nil {
		fmt.Printf("%s❌ SSH key file not found: %s%s\n", colorRed, cfg.SSH.PemPath, colorReset)
		pressEnterToExit()
		os.Exit(1)
	}

	// Step 3.5: PEM 파일 권한 자동 수정 (Windows)
	if err := fixPemPermissions(cfg.SSH.PemPath); err != nil {
		fmt.Printf("%s❌ Failed to fix PEM permissions: %v%s\n", colorRed, err, colorReset)
		pressEnterToExit()
		os.Exit(1)
	}

	// Step 4: EC2 연결 테스트
	if err := testEC2Connection(ctx, cfg.SSH.Host, cfg.SSH.User, cfg.SSH.PemPath); err != nil {
		fmt.Printf("%s❌ %s%s\n", colorRed, err.Error(), colorReset)
		pressEnterToExit()
		os.Exit(1)
	}

	// Step 5: 플러그인 기반 모니터링 스택 준비
	pluginsDir := findPluginsDirectory()
	fmt.Printf("%s📦 Using plugins from: %s%s\n", colorCyan, pluginsDir, colorReset)

	// 임시 디렉토리에 docker-compose.yml 생성
	tempDir := filepath.Join(os.TempDir(), "arfni-monitoring-"+time.Now().Format("20060102-150405"))
	if err := os.MkdirAll(tempDir, 0755); err != nil {
		fmt.Printf("%s❌ Failed to create temp directory: %v%s\n", colorRed, err, colorReset)
		pressEnterToExit()
		os.Exit(1)
	}
	defer os.RemoveAll(tempDir) // Clean up on exit

	// 플러그인에서 docker-compose.yml 생성
	monitoringMode := monitoring.MonitoringMode(cfg.Monitoring.Mode)
	if err := monitoring.PrepareMonitoringStack(pluginsDir, monitoringMode, tempDir); err != nil {
		// Fallback to legacy monitoring directory
		fmt.Printf("%s⚠️  Failed to use plugins, falling back to legacy monitoring: %v%s\n", colorYellow, err, colorReset)
		composeDir = findMonitoringDirectory()
		composePath := filepath.Join(composeDir, "docker-compose.yml")
		if _, err := os.Stat(composePath); os.IsNotExist(err) {
			fmt.Printf("%s❌ docker-compose.yml not found at: %s%s\n", colorRed, composePath, colorReset)
			pressEnterToExit()
			os.Exit(1)
		}
	} else {
		composeDir = tempDir
		fmt.Printf("%s✓ Generated monitoring stack from plugins%s\n", colorGreen, colorReset)
	}

	// Step 6: Docker Compose Up (모드에 따라 다르게 실행)
	fmt.Printf("%s🚀 Starting monitoring stack (mode: %s)...%s\n", colorBlue, cfg.Monitoring.Mode, colorReset)
	if err := dockerComposeUp(ctx, composeDir, cfg.Monitoring.Mode); err != nil {
		fmt.Printf("%s❌ Failed to start monitoring stack: %v%s\n", colorRed, err, colorReset)
		pressEnterToExit()
		os.Exit(1)
	}
	if cfg.Monitoring.Mode != ModeAllInOne {
		fmt.Printf("%s   ✓ Docker containers started%s\n", colorGreen, colorReset)
	}

	// Step 7: SSH 터널 시작 (모드별 포트)
	fmt.Printf("%s🔌 Establishing SSH tunnel to EC2...%s\n", colorBlue, colorReset)

	// 모드별 포트 설정
	var ports []int
	switch cfg.Monitoring.Mode {
	case ModeLocal:
		ports = []int{cfg.Monitoring.NodeExporterPort} // 9100
	case ModeHybrid:
		ports = []int{cfg.Monitoring.NodeExporterPort, cfg.Monitoring.PrometheusPort} // 9100, 9090
	case ModeAllInOne:
		ports = []int{cfg.Monitoring.PrometheusPort, cfg.Monitoring.GrafanaPort} // 9090, 3000
	}

	tunnelCmd, err = startSSHTunnels(ctx, cfg.SSH.Host, cfg.SSH.User, cfg.SSH.PemPath, ports)
	if err != nil {
		fmt.Printf("%s❌ Failed to start SSH tunnel: %v%s\n", colorRed, err, colorReset)
		pressEnterToExit()
		os.Exit(1)
	}

	// 포트 정보 출력
	portInfo := ""
	for i, port := range ports {
		if i > 0 {
			portInfo += ", "
		}
		portInfo += fmt.Sprintf("%d", port)
	}
	fmt.Printf("%s   ✓ SSH tunnel established (ports: %s)%s\n", colorGreen, portInfo, colorReset)

	// Step 8: 서비스 준비 대기 (로컬에서 실행되는 경우만)
	if cfg.Monitoring.Mode != ModeAllInOne {
		fmt.Printf("%s⏳ Waiting for services to be ready...%s\n", colorBlue, colorReset)
		if err := waitForGrafana(ctx, cfg.Monitoring.GrafanaPort); err != nil {
			fmt.Printf("%s❌ %s%s\n", colorRed, err.Error(), colorReset)
			pressEnterToExit()
			os.Exit(1)
		}
		fmt.Printf("%s   ✓ Grafana is ready%s\n", colorGreen, colorReset)
	}

	// Step 9: 브라우저 자동 오픈
	if cfg.Options.AutoOpenBrowser {
		fmt.Printf("%s🌐 Opening Grafana in browser...%s\n", colorBlue, colorReset)
		time.Sleep(1 * time.Second)
		openBrowser(fmt.Sprintf("http://localhost:%d", cfg.Monitoring.GrafanaPort))
	}

	// 완료 메시지
	printSuccess(cfg.Monitoring.GrafanaPort, cfg.Monitoring.PrometheusPort)

	// 대기 (Ctrl+C까지)
	<-ctx.Done()
}

// Config 로드 함수 (JSON 파일 또는 CLI 플래그)
func loadConfig(configFile, host, user, key, stackPath, mode string, args []string) (*Config, error) {
	cfg := &Config{}

	// 기본값 설정
	cfg.SSH.User = "ec2-user"
	cfg.Monitoring.PrometheusPort = 9090
	cfg.Monitoring.GrafanaPort = 3000
	cfg.Monitoring.NodeExporterPort = 9100
	cfg.Monitoring.Mode = ModeLocal // 기본 모드
	cfg.Options.AutoOpenBrowser = false  // GUI에서 iframe으로 보여주므로 브라우저 자동 열기 비활성화
	cfg.Options.CleanupOnExit = true

	// 1. JSON 파일에서 로드 (있으면)
	if configFile != "" {
		data, err := os.ReadFile(configFile)
		if err != nil {
			return nil, fmt.Errorf("failed to read config file: %w", err)
		}

		if err := json.Unmarshal(data, cfg); err != nil {
			return nil, fmt.Errorf("failed to parse config JSON: %w", err)
		}

		fmt.Printf("%s✓ Loaded config from: %s%s\n", colorGreen, configFile, colorReset)
		// CLI 플래그로 모드 오버라이드
		if mode != "" {
			cfg.Monitoring.Mode = MonitoringMode(mode)
		}
		if stackPath != "" {
			cfg.Monitoring.StackPath = stackPath
		}
		return cfg, nil
	}

	// 2. CLI 플래그에서 로드
	if host != "" && key != "" {
		cfg.SSH.Host = host
		cfg.SSH.User = user
		cfg.SSH.PemPath = key
		cfg.Monitoring.StackPath = stackPath

		// 모드 결정: CLI 플래그 > stack.yaml 자동 감지 > 기본값
		if mode != "" {
			cfg.Monitoring.Mode = MonitoringMode(mode)
			fmt.Printf("%s✓ Using CLI flags (mode: %s)%s\n", colorGreen, mode, colorReset)
		} else if stackPath != "" {
			cfg.Monitoring.Mode = detectModeFromStack(stackPath)
			fmt.Printf("%s✓ Using CLI flags (mode auto-detected: %s)%s\n", colorGreen, cfg.Monitoring.Mode, colorReset)
		} else {
			fmt.Printf("%s✓ Using CLI flags (mode: %s - default)%s\n", colorGreen, cfg.Monitoring.Mode, colorReset)
		}
		return cfg, nil
	}

	// 3. 위치 기반 인자
	fmt.Printf("[DEBUG] Positional args count: %d\n", len(args))
	for i, arg := range args {
		fmt.Printf("[DEBUG] args[%d] = %s\n", i, arg)
	}

	// 3a. stack.yaml만 제공된 경우 (방식 1: 권장)
	if len(args) == 1 && (strings.HasSuffix(strings.ToLower(args[0]), ".yaml") || strings.HasSuffix(strings.ToLower(args[0]), ".yml")) {
		stackYamlPath := args[0]

		// stack.yaml이 상대 경로면 절대 경로로 변환
		if !filepath.IsAbs(stackYamlPath) {
			cwd, _ := os.Getwd()
			stackYamlPath = filepath.Join(cwd, stackYamlPath)
		}

		cfg.Monitoring.StackPath = stackYamlPath

		// stack.yaml에서 EC2 정보 자동 추출
		ec2Info, err := parseEC2InfoFromStack(stackYamlPath)
		if err != nil {
			return nil, fmt.Errorf("failed to parse EC2 info from stack.yaml: %w", err)
		}

		cfg.SSH.Host = ec2Info.Host
		cfg.SSH.User = ec2Info.User
		cfg.SSH.PemPath = ec2Info.SSHKey

		// 모드 자동 감지
		if mode != "" {
			cfg.Monitoring.Mode = MonitoringMode(mode)
			fmt.Printf("%s✓ Using stack.yaml only (mode: %s from CLI flag)%s\n", colorGreen, cfg.Monitoring.Mode, colorReset)
		} else {
			cfg.Monitoring.Mode = detectModeFromStack(stackYamlPath)
			fmt.Printf("%s✓ Using stack.yaml only (mode auto-detected: %s)%s\n", colorGreen, cfg.Monitoring.Mode, colorReset)
		}

		return cfg, nil
	}

	// 3b. 기존 호환성: 2개 이상의 위치 인자 (방식 2: 호환성)
	if len(args) >= 2 {
		cfg.SSH.Host = args[0]
		cfg.SSH.PemPath = args[1]
		if len(args) >= 3 {
			cfg.SSH.User = args[2]
		}
		if len(args) >= 4 {
			// 4번째 위치 인자로 stack.yaml 경로 전달
			cfg.Monitoring.StackPath = args[3]
			fmt.Printf("[DEBUG] Stack path from 4th arg: %s\n", cfg.Monitoring.StackPath)
		}

		// 모드 결정: CLI 플래그 > 4번째 위치 인자(stack) > CLI --stack 플래그 > 기본값
		if mode != "" {
			cfg.Monitoring.Mode = MonitoringMode(mode)
			fmt.Printf("%s✓ Using positional arguments (mode: %s from CLI flag)%s\n", colorGreen, cfg.Monitoring.Mode, colorReset)
		} else if cfg.Monitoring.StackPath != "" {
			cfg.Monitoring.Mode = detectModeFromStack(cfg.Monitoring.StackPath)
			fmt.Printf("%s✓ Using positional arguments (mode auto-detected: %s from stack.yaml)%s\n", colorGreen, cfg.Monitoring.Mode, colorReset)
		} else if stackPath != "" {
			cfg.Monitoring.StackPath = stackPath
			cfg.Monitoring.Mode = detectModeFromStack(stackPath)
			fmt.Printf("%s✓ Using positional arguments (mode auto-detected: %s from --stack flag)%s\n", colorGreen, cfg.Monitoring.Mode, colorReset)
		} else {
			fmt.Printf("%s✓ Using positional arguments (mode: %s - default)%s\n", colorYellow, cfg.Monitoring.Mode, colorReset)
		}

		return cfg, nil
	}

	// 아무것도 제공되지 않음
	return nil, fmt.Errorf("no configuration provided")
}

// validateConfig - 설정 검증 함수
func validateConfig(cfg *Config) error {
	var errors []string

	// 1. SSH 설정 검증
	if cfg.SSH.Host == "" {
		errors = append(errors, fmt.Sprintf("%s  ✗ EC2 host is empty%s\n    → Please provide EC2 instance address (e.g., ec2-xxx.compute.amazonaws.com)", colorRed, colorReset))
	}

	if cfg.SSH.User == "" {
		errors = append(errors, fmt.Sprintf("%s  ✗ SSH user is empty%s\n    → Please provide SSH user (e.g., ec2-user, ubuntu)", colorRed, colorReset))
	}

	if cfg.SSH.PemPath == "" {
		errors = append(errors, fmt.Sprintf("%s  ✗ PEM file path is empty%s\n    → Please provide path to SSH private key (.pem file)", colorRed, colorReset))
	} else {
		// PEM 파일 존재 확인
		if _, err := os.Stat(cfg.SSH.PemPath); os.IsNotExist(err) {
			errors = append(errors, fmt.Sprintf("%s  ✗ PEM file not found: %s%s\n    → Check if file exists and path is correct", colorRed, cfg.SSH.PemPath, colorReset))
		} else if err != nil {
			errors = append(errors, fmt.Sprintf("%s  ✗ Cannot access PEM file: %s%s\n    → Error: %v", colorRed, cfg.SSH.PemPath, colorReset, err))
		}
	}

	// 2. 포트 검증
	ports := map[string]int{
		"Prometheus":    cfg.Monitoring.PrometheusPort,
		"Grafana":       cfg.Monitoring.GrafanaPort,
		"Node Exporter": cfg.Monitoring.NodeExporterPort,
	}

	for name, port := range ports {
		if port < 1 || port > 65535 {
			errors = append(errors, fmt.Sprintf("%s  ✗ Invalid %s port: %d (must be 1-65535)%s\n    → Use a valid port number", colorRed, name, port, colorReset))
		} else if port > 0 && port < 1024 {
			errors = append(errors, fmt.Sprintf("%s  ⚠ %s port %d is in privileged range (1-1024)%s\n    → May require administrator/root privileges", colorYellow, name, port, colorReset))
		}
	}

	// 포트 중복 체크
	if cfg.Monitoring.PrometheusPort == cfg.Monitoring.GrafanaPort {
		errors = append(errors, fmt.Sprintf("%s  ✗ Prometheus and Grafana cannot use the same port: %d%s\n    → Assign different ports", colorRed, cfg.Monitoring.PrometheusPort, colorReset))
	}
	if cfg.Monitoring.PrometheusPort == cfg.Monitoring.NodeExporterPort {
		errors = append(errors, fmt.Sprintf("%s  ✗ Prometheus and Node Exporter cannot use the same port: %d%s\n    → Assign different ports", colorRed, cfg.Monitoring.PrometheusPort, colorReset))
	}
	if cfg.Monitoring.GrafanaPort == cfg.Monitoring.NodeExporterPort {
		errors = append(errors, fmt.Sprintf("%s  ✗ Grafana and Node Exporter cannot use the same port: %d%s\n    → Assign different ports", colorRed, cfg.Monitoring.GrafanaPort, colorReset))
	}

	// 3. Docker Compose 파일 확인 (다중 경로 시도)
	composeDir := findMonitoringDirectory()
	composePath := filepath.Join(composeDir, "docker-compose.yml")

	if _, err := os.Stat(composePath); os.IsNotExist(err) {
		errors = append(errors, fmt.Sprintf("%s  ✗ docker-compose.yml not found at: %s%s\n    → Ensure monitoring directory with docker-compose.yml exists", colorRed, composePath, colorReset))
	}

	// 에러가 있으면 모두 출력
	if len(errors) > 0 {
		return fmt.Errorf("\n%s", strings.Join(errors, "\n"))
	}

	fmt.Printf("%s✓ Configuration validated successfully%s\n", colorGreen, colorReset)
	return nil
}

func printBanner() {
	fmt.Println()
	fmt.Printf("%s╔════════════════════════════════════════════════╗%s\n", colorCyan, colorReset)
	fmt.Printf("%s║   🎯 Arfni Monitoring Stack v2 - Launcher     ║%s\n", colorCyan, colorReset)
	fmt.Printf("%s╚════════════════════════════════════════════════╝%s\n", colorCyan, colorReset)
	fmt.Println()
}

func printUsageV2() {
	fmt.Println("Usage:")
	fmt.Println()
	fmt.Println("  Method 1: stack.yaml only (RECOMMENDED)")
	fmt.Println("    start-monitoring-v2.exe <path/to/stack.yaml>")
	fmt.Println("    - Extracts EC2 info (host, user, sshKey) from stack.yaml automatically")
	fmt.Println("    - Auto-detects monitoring mode (local, hybrid, all-in-one)")
	fmt.Println()
	fmt.Println("  Method 2: Detailed arguments (compatibility)")
	fmt.Println("    start-monitoring-v2.exe <EC2_HOST> <SSH_KEY_PATH> <SSH_USER> <STACK_YAML_PATH>")
	fmt.Println()
	fmt.Println("  Method 3: JSON config file (for Tauri)")
	fmt.Println("    start-monitoring-v2.exe --config <path/to/config.json>")
	fmt.Println()
	fmt.Println("  Method 4: CLI flags")
	fmt.Println("    start-monitoring-v2.exe --host <EC2_HOST> --key <SSH_KEY_PATH> [--user <SSH_USER>]")
	fmt.Println()
	fmt.Println("Examples:")
	fmt.Println("  start-monitoring-v2.exe test_gui_app/test123/stack.yaml")
	fmt.Println("  start-monitoring-v2.exe ec2-host.amazonaws.com \"C:\\key.pem\" ec2-user \"C:\\project\\stack.yaml\"")
	fmt.Println("  start-monitoring-v2.exe --config config/ssh_config.json")
	fmt.Println("  start-monitoring-v2.exe --host ec2-3-39-237-124.ap-northeast-2.compute.amazonaws.com --key \"C:\\key.pem\"")
	fmt.Println()
}

func printSuccess(grafanaPort, prometheusPort int) {
	fmt.Println()
	fmt.Printf("%s════════════════════════════════════════════════%s\n", colorGreen, colorReset)
	fmt.Printf("%s✅ Monitoring stack is ready!%s\n", colorGreen, colorReset)
	fmt.Println()
	fmt.Printf("   %sGrafana:%s      http://localhost:%d\n", colorCyan, colorReset, grafanaPort)
	fmt.Printf("   %sPrometheus:%s   http://localhost:%d\n", colorCyan, colorReset, prometheusPort)
	fmt.Println()
	fmt.Printf("%s⚠️  Press Ctrl+C to stop monitoring and close SSH tunnel%s\n", colorYellow, colorReset)
	fmt.Printf("%s════════════════════════════════════════════════%s\n", colorGreen, colorReset)
	fmt.Println()
}

// Docker Desktop 실행 확인
func checkDockerDesktop(ctx context.Context) error {
	fmt.Printf("%s🐳 Checking Docker Desktop...%s\n", colorBlue, colorReset)

	cmd := exec.CommandContext(ctx, "docker", "info")
	if err := cmd.Run(); err != nil {
		return fmt.Errorf(`Docker Desktop is not running!

Please:
1. Start Docker Desktop
2. Wait for the whale icon to be steady
3. Run this command again`)
	}

	fmt.Printf("%s   ✓ Docker Desktop is running%s\n", colorGreen, colorReset)
	return nil
}

// 포트 사용 가능 여부 확인
func checkPorts(prometheusPort, grafanaPort, nodeExporterPort int) error {
	fmt.Printf("%s🔍 Checking port availability...%s\n", colorBlue, colorReset)

	ports := []int{prometheusPort, grafanaPort, nodeExporterPort}
	for _, port := range ports {
		ln, err := net.Listen("tcp", fmt.Sprintf(":%d", port))
		if err != nil {
			return fmt.Errorf(`Port %d is already in use!

Please stop the application using this port:
- Windows: netstat -ano | findstr :%d
- Then:    taskkill /PID <PID> /F`, port, port)
		}
		ln.Close()
	}

	fmt.Printf("%s   ✓ Ports %d, %d, %d are available%s\n", colorGreen, prometheusPort, grafanaPort, nodeExporterPort, colorReset)
	return nil
}

// 파일 존재 확인
func checkFileExists(path string) error {
	if _, err := os.Stat(path); os.IsNotExist(err) {
		return fmt.Errorf("file not found: %s", path)
	}
	return nil
}

// EC2 연결 테스트
func testEC2Connection(ctx context.Context, host, user, keyPath string) error {
	fmt.Printf("%s🔐 Testing EC2 connection...%s\n", colorBlue, colorReset)

	testCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	cmd := exec.CommandContext(testCtx, "ssh",
		"-i", keyPath,
		"-o", "ConnectTimeout=5",
		"-o", "StrictHostKeyChecking=no",
		fmt.Sprintf("%s@%s", user, host),
		"echo ok",
	)

	if err := cmd.Run(); err != nil {
		return fmt.Errorf(`Cannot connect to EC2!

Possible issues:
1. EC2 instance is stopped (check AWS console)
2. Security group doesn't allow SSH from your IP
3. SSH key path is incorrect: %s
4. Host address is wrong: %s

Please check and try again.`, keyPath, host)
	}

	fmt.Printf("%s   ✓ EC2 connection successful%s\n", colorGreen, colorReset)
	return nil
}

// docker-compose up -d 실행 (모드별로 다른 서비스 실행)
func dockerComposeUp(ctx context.Context, dir string, mode MonitoringMode) error {
	switch mode {
	case ModeAllInOne:
		// All-in-One: Docker Compose 실행 안 함
		fmt.Printf("%s   ✓ Prometheus and Grafana are running on EC2%s\n", colorGreen, colorReset)
		fmt.Println("   Access via SSH tunnel:")
		fmt.Println("     - Prometheus: http://localhost:9090")
		fmt.Println("     - Grafana:    http://localhost:3000")
		return nil

	case ModeHybrid:
		// Hybrid: Grafana만 실행
		fmt.Printf("%s   Pulling Grafana image...%s\n", colorBlue, colorReset)
		pullCmd := exec.CommandContext(ctx, "docker", "compose", "pull", "grafana")
		pullCmd.Dir = dir
		pullCmd.Stdout = os.Stdout
		pullCmd.Stderr = os.Stderr
		pullCmd.Run() // 에러 무시

		// Prometheus 컨테이너 중지 (있으면)
		stopCmd := exec.CommandContext(ctx, "docker", "compose", "stop", "prometheus")
		stopCmd.Dir = dir
		stopCmd.Run() // 에러 무시

		// Hybrid 모드용 datasource 파일 생성 (OS별로 다른 URL 사용)
		datasourcePath := filepath.Join(dir, "grafana-datasource.yml")

		// OS별로 Prometheus URL 결정
		prometheusURL := "http://host.docker.internal:9090" // Windows/Mac 기본값
		if runtime.GOOS == "linux" {
			// Linux에서는 Docker bridge gateway IP 사용
			prometheusURL = "http://172.17.0.1:9090"
		}

		hybridDatasource := fmt.Sprintf(`apiVersion: 1

datasources:
  - name: Prometheus
    type: prometheus
    access: proxy
    url: %s
    isDefault: true
    editable: true
`, prometheusURL)
		if err := os.WriteFile(datasourcePath, []byte(hybridDatasource), 0644); err != nil {
			fmt.Printf("%s[WARNING] Failed to create hybrid datasource config: %v%s\n", colorYellow, err, colorReset)
		}

		fmt.Printf("%s   Starting Grafana container...%s\n", colorBlue, colorReset)

		// Docker Compose를 사용하되 extra_hosts 추가
		// host-gateway를 사용하여 호스트 IP로 매핑
		cmd := exec.CommandContext(ctx, "docker", "run", "-d",
			"--name", "grafana",
			"--add-host=host.docker.internal:host-gateway",
			"-p", "3000:3000",
			"-v", "grafana-data:/var/lib/grafana",
			"-v", filepath.Join(dir, "grafana-datasource.yml")+":/etc/grafana/provisioning/datasources/datasource.yml",
			"-v", filepath.Join(dir, "grafana-dashboard.yml")+":/etc/grafana/provisioning/dashboards/dashboard.yml",
			"-v", filepath.Join(dir, "dashboards")+":/etc/grafana/provisioning/dashboards",
			"-e", "GF_SECURITY_ADMIN_USER=admin",
			"-e", "GF_SECURITY_ADMIN_PASSWORD=admin",
			"-e", "GF_AUTH_ANONYMOUS_ENABLED=true",
			"-e", "GF_AUTH_ANONYMOUS_ORG_ROLE=Admin",
			"-e", "GF_AUTH_DISABLE_LOGIN_FORM=true",
			"-e", "GF_SECURITY_ALLOW_EMBEDDING=true",
			"--restart=unless-stopped",
			"grafana/grafana:latest")
		cmd.Stdout = os.Stdout
		cmd.Stderr = os.Stderr
		if err := cmd.Run(); err != nil {
			// 이미 존재하는 컨테이너가 있으면 제거하고 다시 시도
			removeCmd := exec.CommandContext(ctx, "docker", "rm", "-f", "grafana")
			removeCmd.Run()

			cmd = exec.CommandContext(ctx, "docker", "run", "-d",
				"--name", "grafana",
				"--add-host=host.docker.internal:host-gateway",
				"-p", "3000:3000",
				"-v", "grafana-data:/var/lib/grafana",
				"-v", filepath.Join(dir, "grafana-datasource.yml")+":/etc/grafana/provisioning/datasources/datasource.yml",
				"-v", filepath.Join(dir, "grafana-dashboard.yml")+":/etc/grafana/provisioning/dashboards/dashboard.yml",
				"-v", filepath.Join(dir, "dashboards")+":/etc/grafana/provisioning/dashboards",
				"-e", "GF_SECURITY_ADMIN_USER=admin",
				"-e", "GF_SECURITY_ADMIN_PASSWORD=admin",
				"-e", "GF_AUTH_ANONYMOUS_ENABLED=true",
				"-e", "GF_AUTH_ANONYMOUS_ORG_ROLE=Admin",
				"-e", "GF_AUTH_DISABLE_LOGIN_FORM=true",
				"-e", "GF_SECURITY_ALLOW_EMBEDDING=true",
				"--restart=unless-stopped",
				"grafana/grafana:latest")
			cmd.Stdout = os.Stdout
			cmd.Stderr = os.Stderr
			return cmd.Run()
		}
		return nil

	default: // ModeLocal
		// Local: Prometheus + Grafana 둘 다
		// Local 모드용 datasource 파일 복원 (prometheus 호스트 사용)
		datasourcePath := filepath.Join(dir, "grafana-datasource.yml")
		localDatasource := `apiVersion: 1

datasources:
  - name: Prometheus
    type: prometheus
    access: proxy
    url: http://prometheus:9090
    isDefault: true
    editable: true
`
		if err := os.WriteFile(datasourcePath, []byte(localDatasource), 0644); err != nil {
			fmt.Printf("%s[WARNING] Failed to create local datasource config: %v%s\n", colorYellow, err, colorReset)
		}

		fmt.Printf("%s   Pulling Docker images...%s\n", colorBlue, colorReset)
		pullCmd := exec.CommandContext(ctx, "docker", "compose", "pull")
		pullCmd.Dir = dir
		pullCmd.Stdout = os.Stdout
		pullCmd.Stderr = os.Stderr
		pullCmd.Run() // 에러 무시

		fmt.Printf("%s   Starting containers...%s\n", colorBlue, colorReset)
		cmd := exec.CommandContext(ctx, "docker", "compose", "up", "-d")
		cmd.Dir = dir
		cmd.Stdout = os.Stdout
		cmd.Stderr = os.Stderr
		return cmd.Run()
	}
}

// SSH 터널 백그라운드 실행 (여러 포트 지원)
func startSSHTunnels(ctx context.Context, host, user, keyPath string, ports []int) (*exec.Cmd, error) {
	// SSH 명령 구성: ssh -L port1:localhost:port1 -L port2:localhost:port2 ...
	args := []string{
		"-i", keyPath,
	}

	// 각 포트에 대한 -L 플래그 추가
	// OS별로 다른 바인딩 전략 사용
	for _, port := range ports {
		if runtime.GOOS == "linux" {
			// Linux: localhost와 Docker bridge gateway 둘 다 바인딩
			// localhost용 - 호스트 애플리케이션(optimize 등)에서 접근
			forwardSpec1 := fmt.Sprintf("127.0.0.1:%d:localhost:%d", port, port)
			args = append(args, "-L", forwardSpec1)

			// Docker bridge gateway용 - Docker 컨테이너(Grafana)에서 접근
			forwardSpec2 := fmt.Sprintf("172.17.0.1:%d:localhost:%d", port, port)
			args = append(args, "-L", forwardSpec2)
		} else {
			// Windows/Mac: localhost만 사용 (host.docker.internal이 자동 매핑)
			forwardSpec := fmt.Sprintf("127.0.0.1:%d:localhost:%d", port, port)
			args = append(args, "-L", forwardSpec)
		}
	}

	args = append(args,
		"-o", "StrictHostKeyChecking=no",
		"-o", "ExitOnForwardFailure=yes",
		"-N",
		fmt.Sprintf("%s@%s", user, host),
	)

	cmd := exec.CommandContext(ctx, "ssh", args...)

	// 에러 출력 캡처
	stderr, _ := cmd.StderrPipe()

	if err := cmd.Start(); err != nil {
		return nil, fmt.Errorf("failed to start SSH tunnel: %w", err)
	}

	// 백그라운드에서 stderr 모니터링
	go func() {
		buf := make([]byte, 1024)
		for {
			n, err := stderr.Read(buf)
			if err != nil {
				break
			}
			if n > 0 {
				fmt.Printf("%s[SSH] %s%s\n", colorYellow, string(buf[:n]), colorReset)
			}
		}
	}()

	// 터널 연결 확인 (최대 10초) - 첫 번째 포트로 확인
	if len(ports) > 0 {
		if err := waitForTunnel(ctx, ports[0], 10); err != nil {
			cmd.Process.Kill()
			return nil, err
		}
	}

	return cmd, nil
}

// SSH 터널 연결 확인
func waitForTunnel(ctx context.Context, port int, maxSeconds int) error {
	for i := 0; i < maxSeconds; i++ {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}

		// localhost:port에 연결 시도
		conn, err := net.DialTimeout("tcp", fmt.Sprintf("localhost:%d", port), 500*time.Millisecond)
		if err == nil {
			conn.Close()
			return nil // 연결 성공!
		}

		time.Sleep(1 * time.Second)
	}

	return fmt.Errorf("SSH tunnel did not establish within %d seconds", maxSeconds)
}

// Grafana 준비 대기 (헬스체크)
func waitForGrafana(ctx context.Context, port int) error {
	maxRetries := 60
	client := &http.Client{
		Timeout: 1 * time.Second,
	}

	for i := 0; i < maxRetries; i++ {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}

		url := fmt.Sprintf("http://localhost:%d/api/health", port)
		resp, err := client.Get(url)
		if err == nil && resp.StatusCode == 200 {
			resp.Body.Close()
			return nil
		}
		if resp != nil {
			resp.Body.Close()
		}

		time.Sleep(1 * time.Second)
	}

	return fmt.Errorf("Grafana did not start in time")
}

// 브라우저 오픈 (OS별)
func openBrowser(url string) {
	var cmd *exec.Cmd

	switch runtime.GOOS {
	case "windows":
		cmd = exec.Command("cmd", "/c", "start", url)
	case "darwin":
		cmd = exec.Command("open", url)
	default: // linux
		cmd = exec.Command("xdg-open", url)
	}

	cmd.Start()
}

func pressEnterToExit() {
	fmt.Println()
	fmt.Print("Press Enter to exit...")
	fmt.Scanln()
}

// stack.yaml을 파싱해서 모니터링 모드 자동 감지
func detectModeFromStack(stackPath string) MonitoringMode {
	// 파일이 없으면 기본값
	if stackPath == "" {
		fmt.Println("[DEBUG] No stack path provided, using ModeLocal")
		return ModeLocal
	}

	// YAML 파일 읽기
	data, err := os.ReadFile(stackPath)
	if err != nil {
		fmt.Printf("[WARNING] Failed to read stack.yaml: %v\n", err)
		return ModeLocal
	}

	// YAML 파싱
	var stack StackYAML
	if err := yaml.Unmarshal(data, &stack); err != nil {
		fmt.Printf("[WARNING] Failed to parse stack.yaml: %v\n", err)
		return ModeLocal
	}

	// metadata.monitoring.mode가 있으면 우선 사용
	if stack.Metadata.Monitoring.Mode != "" {
		mode := stack.Metadata.Monitoring.Mode
		fmt.Printf("[DEBUG] Mode from metadata.monitoring.mode: %s\n", mode)
		switch strings.ToLower(mode) {
		case "local":
			return ModeLocal
		case "hybrid":
			return ModeHybrid
		case "all-in-one":
			return ModeAllInOne
		default:
			fmt.Printf("[WARNING] Unknown mode in metadata: %s, fallback to auto-detection\n", mode)
		}
	}

	// EC2 타겟 찾기
	var ec2TargetNames []string
	for name, target := range stack.Targets {
		fmt.Printf("[DEBUG] Target: %s, Type: %s\n", name, target.Type)
		if strings.EqualFold(target.Type, "ec2.ssh") {
			ec2TargetNames = append(ec2TargetNames, name)
		}
	}

	fmt.Printf("[DEBUG] EC2 targets found: %v\n", ec2TargetNames)

	// EC2 타겟이 없으면 로컬 모드
	if len(ec2TargetNames) == 0 {
		fmt.Println("[DEBUG] No EC2 targets found, using ModeLocal")
		return ModeLocal
	}

	// EC2 타겟에 prometheus/grafana가 있는지 확인
	hasPrometheusOnEC2 := false
	hasGrafanaOnEC2 := false

	// Services map을 순회해서 키(서비스 이름)로 판단
	for svcName, svc := range stack.Services {
		fmt.Printf("[DEBUG] Service: %s, Target: %s\n", svcName, svc.Target)

		// EC2 타겟에 배포된 서비스인지 확인
		isEC2Service := false
		for _, ec2Target := range ec2TargetNames {
			if strings.EqualFold(svc.Target, ec2Target) {
				isEC2Service = true
				break
			}
		}

		if isEC2Service {
			fmt.Printf("[DEBUG] Service %s is on EC2\n", svcName)
			if strings.EqualFold(svcName, "prometheus") {
				hasPrometheusOnEC2 = true
				fmt.Println("[DEBUG] Prometheus found on EC2")
			}
			if strings.EqualFold(svcName, "grafana") {
				hasGrafanaOnEC2 = true
				fmt.Println("[DEBUG] Grafana found on EC2")
			}
		}
	}

	// 모드 결정
	fmt.Printf("[DEBUG] hasPrometheusOnEC2: %v, hasGrafanaOnEC2: %v\n", hasPrometheusOnEC2, hasGrafanaOnEC2)

	if hasPrometheusOnEC2 && hasGrafanaOnEC2 {
		fmt.Println("[DEBUG] Mode detected: ModeAllInOne")
		return ModeAllInOne
	} else if hasPrometheusOnEC2 {
		fmt.Println("[DEBUG] Mode detected: ModeHybrid")
		return ModeHybrid
	} else {
		fmt.Println("[DEBUG] Mode detected: ModeLocal")
		return ModeLocal
	}
}

func fixPemPermissions(pemPath string) error {
	if runtime.GOOS != "windows" {
		// Unix 시스템에서는 chmod 사용
		cmd := exec.Command("chmod", "400", pemPath)
		if err := cmd.Run(); err != nil {
			return fmt.Errorf("failed to chmod: %w", err)
		}
		return nil
	}

	// Windows에서 icacls를 사용하여 권한 설정
	fmt.Printf("%s🔧 Fixing PEM file permissions...%s\n", colorBlue, colorReset)

	// 1. 상속 제거
	cmd := exec.Command("icacls", pemPath, "/inheritance:r")
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("failed to remove inheritance: %w", err)
	}

	// 2. 현재 사용자에게만 읽기 권한 부여
	username := os.Getenv("USERNAME")
	if username == "" {
		username = os.Getenv("USER")
	}

	cmd = exec.Command("icacls", pemPath, "/grant:r", fmt.Sprintf("%s:R", username))
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("failed to grant permissions: %w", err)
	}

	fmt.Printf("%s   ✓ PEM permissions fixed%s\n", colorGreen, colorReset)
	return nil
}

// parseEC2InfoFromStack - stack.yaml에서 EC2 연결 정보 추출
func parseEC2InfoFromStack(stackPath string) (*EC2Config, error) {
	// YAML 파일 읽기
	data, err := os.ReadFile(stackPath)
	if err != nil {
		return nil, fmt.Errorf("failed to read stack.yaml: %w", err)
	}

	// YAML 파싱
	var stack StackYAML
	if err := yaml.Unmarshal(data, &stack); err != nil {
		return nil, fmt.Errorf("failed to parse YAML: %w", err)
	}

	// ec2 타깃 찾기
	for name, target := range stack.Targets {
		if strings.EqualFold(target.Type, "ec2.ssh") {
			// EC2 타깃 발견
			if target.Host == "" {
				return nil, fmt.Errorf("target '%s' is missing 'host' field", name)
			}
			if target.User == "" {
				return nil, fmt.Errorf("target '%s' is missing 'user' field", name)
			}
			if target.SSHKey == "" {
				return nil, fmt.Errorf("target '%s' is missing 'sshKey' field", name)
			}

			return &EC2Config{
				Host:   target.Host,
				User:   target.User,
				SSHKey: target.SSHKey,
			}, nil
		}
	}

	return nil, fmt.Errorf("no EC2 target found in stack.yaml (type: ec2.ssh)")
}

// findPluginsDirectory는 bundled plugins 디렉토리를 찾습니다
func findPluginsDirectory() string {
	exePath, _ := os.Executable()
	baseDir := filepath.Dir(exePath)
	cwd, _ := os.Getwd()

	// 시도할 경로 목록 (우선순위 순서)
	candidates := []string{
		// 1. 개발 환경: arfni-gui/public/plugins/bundled/monitoring
		filepath.Join(cwd, "arfni-gui", "public", "plugins", "bundled", "monitoring"),
		// 2. Tauri 번들: _up_/public/plugins/bundled/monitoring
		filepath.Join(baseDir, "_up_", "public", "plugins", "bundled", "monitoring"),
		// 3. 실행파일 기준 상대 경로
		filepath.Join(baseDir, "..", "..", "..", "arfni-gui", "public", "plugins", "bundled", "monitoring"),
		// 4. 레거시 폴백: monitoring 디렉토리
		filepath.Join(cwd, "monitoring"),
		filepath.Join(baseDir, "..", "..", "..", "monitoring"),
	}

	for _, candidate := range candidates {
		absPath, err := filepath.Abs(candidate)
		if err != nil {
			continue
		}
		// Check if Grafana plugin exists as indicator
		grafanaPluginPath := filepath.Join(absPath, "grafana", "plugin.yaml")
		if _, err := os.Stat(grafanaPluginPath); err == nil {
			return absPath
		}
	}

	// 레거시 fallback
	return findMonitoringDirectory()
}

// findMonitoringDirectory는 레거시 monitoring 디렉토리를 찾습니다 (fallback)
func findMonitoringDirectory() string {
	exePath, _ := os.Executable()
	baseDir := filepath.Dir(exePath)
	cwd, _ := os.Getwd()

	candidates := []string{
		filepath.Join(cwd, "monitoring"),
		filepath.Join(baseDir, "..", "..", "..", "monitoring"),
	}

	for _, candidate := range candidates {
		absPath, err := filepath.Abs(candidate)
		if err != nil {
			continue
		}
		composePath := filepath.Join(absPath, "docker-compose.yml")
		if _, err := os.Stat(composePath); err == nil {
			return absPath
		}
	}

	return filepath.Join(cwd, "monitoring")
}
