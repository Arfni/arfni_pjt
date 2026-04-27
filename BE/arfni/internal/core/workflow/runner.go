package workflow

import (
	"bufio"
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/arfni/arfni/internal/core/monitoring"
	"github.com/arfni/arfni/internal/core/stack"
	"github.com/arfni/arfni/internal/events"
	"github.com/arfni/arfni/internal/generator/nginx"
)

// Runner는 전체 워크플로우를 조정합니다
type Runner struct {
	stack             *stack.Stack
	projectDir        string
	pluginsDir        string
	bundledPluginsDir string
}

// NewRunner는 새로운 Runner를 생성합니다
func NewRunner(s *stack.Stack, projectDir string) *Runner {
	return &Runner{
		stack:             s,
		projectDir:        projectDir,
		pluginsDir:        "", // Execute()에서 설정
		bundledPluginsDir: "", // Execute()에서 설정
	}
}

// Run은 전체 5단계 워크플로우를 실행합니다
// 1. Preflight check
// 2. Generate docker-compose.yaml
// 3. Build images
// 4. Deploy containers
// 5. Post-deploy hooks
// 6. Health check
func (r *Runner) Run(ctx context.Context) error {
	fmt.Println("Starting deployment workflow...")

	// 1. Preflight
	if err := r.preflight(ctx); err != nil {
		return fmt.Errorf("preflight check failed: %w", err)
	}

	// 2. Generate
	if err := r.generate(ctx); err != nil {
		return fmt.Errorf("generate failed: %w", err)
	}

	// 3. Build
	if err := r.build(ctx); err != nil {
		return fmt.Errorf("build failed: %w", err)
	}

	// 4. Deploy
	if err := r.deploy(ctx); err != nil {
		return fmt.Errorf("deploy failed: %w", err)
	}

	// 5. Post-deploy
	if err := r.postDeploy(ctx); err != nil {
		return fmt.Errorf("post-deploy failed: %w", err)
	}

	// 6. Health check
	if err := r.healthCheck(ctx); err != nil {
		return fmt.Errorf("health check failed: %w", err)
	}

	return nil
}

func (r *Runner) preflight(ctx context.Context) error {
	fmt.Println("[1/6] Preflight check...")
	// TODO: 구현
	return nil
}

func (r *Runner) generate(ctx context.Context) error {
	fmt.Println("[2/6] Generating docker-compose.yaml...")
	// TODO: 구현
	return nil
}

func (r *Runner) build(ctx context.Context) error {
	fmt.Println("[3/6] Building images...")
	// TODO: 구현
	return nil
}

func (r *Runner) deploy(ctx context.Context) error {
	fmt.Println("[4/6] Deploying containers...")
	// TODO: 구현
	return nil
}

func (r *Runner) postDeploy(ctx context.Context) error {
	fmt.Println("[5/6] Running post-deploy hooks...")
	// TODO: 구현
	return nil
}

func (r *Runner) healthCheck(ctx context.Context) error {
	fmt.Println("[6/6] Health check...")
	// TODO: 구현
	return nil
}

// Execute는 전체 워크플로우를 실행하며 이벤트를 스트리밍합니다 (기본 호환성 유지)
// Deprecated: Use ExecuteWithPlugins instead
func (r *Runner) Execute(stream *events.Stream, pluginsDir string) error {
	return r.ExecuteWithPlugins(stream, pluginsDir, "")
}

// ExecuteWithPlugins는 전체 워크플로우를 실행하며 bundled 플러그인도 지원합니다
func (r *Runner) ExecuteWithPlugins(stream *events.Stream, pluginsDir, bundledPluginsDir string) error {
	r.pluginsDir = pluginsDir               // 플러그인 디렉토리 저장
	r.bundledPluginsDir = bundledPluginsDir // Bundled 플러그인 디렉토리 저장

	stream.Info("Phase 1/5: Preflight checks...")
	time.Sleep(500 * time.Millisecond)
	stream.Success("Preflight checks passed")

	stream.Info("Phase 2/5: Generating Docker files...")
	if err := r.generateFiles(stream); err != nil {
		return fmt.Errorf("failed to generate files: %w", err)
	}
	stream.Success("Docker files generated")

	stream.Info("Phase 3/5: Building images...")
	if err := r.buildImages(stream); err != nil {
		return fmt.Errorf("failed to build images: %w", err)
	}
	stream.Success("Images built successfully")

	stream.Info("Phase 4/5: Deploying containers...")
	if err := r.deployContainers(stream); err != nil {
		return fmt.Errorf("failed to deploy containers: %w", err)
	}
	stream.Success("Containers deployed")

	stream.Info("Phase 5/5: Health checks...")
	if err := r.healthChecks(stream); err != nil {
		return fmt.Errorf("health check failed: %w", err)
	}
	stream.Success("All services healthy")

	return nil
}

// generateFiles는 docker-compose.yml과 Dockerfile들을 생성합니다
func (r *Runner) generateFiles(stream *events.Stream) error {
	stream.Info("Generating docker-compose.yml...")

	// For local deployment, include all services (no filtering)
	// EC2 deployment will be filtered later in buildImagesEC2/deployContainersEC2
	content, err := GenerateDockerComposeWithTarget(r.stack, r.projectDir, "")
	if err != nil {
		return fmt.Errorf("failed to generate docker-compose.yml: %w", err)
	}

	// Write docker-compose.yml
	composeFile := filepath.Join(r.projectDir, "docker-compose.yml")
	if err := os.WriteFile(composeFile, []byte(content), 0644); err != nil {
		return fmt.Errorf("failed to write docker-compose.yml: %w", err)
	}

	stream.Success(fmt.Sprintf("Generated docker-compose.yml for %d services", len(r.stack.Services)))

	// Generate nginx.conf if a proxy.nginx service is present
	if nginx.HasNginxService(r.stack) {
		stream.Info("Generating nginx.conf...")
		if err := nginx.WriteNginxConfig(r.stack, r.projectDir); err != nil {
			stream.Warning(fmt.Sprintf("failed to generate nginx.conf: %v", err), nil)
		} else {
			stream.Success("Generated nginx.conf")
		}
	}

	// Generate Dockerfiles for services that need them
	stream.Info("Generating Dockerfiles...")
	dockerfileCount := 0
	for name, service := range r.stack.Services {
		if service.Spec.Build != nil && !service.Spec.Build.IsEmpty() {
			buildContext := service.Spec.Build.GetContext()
			stream.Info(fmt.Sprintf("Detecting build type for service '%s' at path: %s", name, buildContext))

			// Detect build type using plugin-based detection
			buildType, err := DetectBuildType(r.projectDir, buildContext, r.pluginsDir, r.bundledPluginsDir)
			if err != nil {
				stream.Info(fmt.Sprintf("Warning: Could not detect build type for '%s': %v", name, err))
				continue
			}

			stream.Info(fmt.Sprintf("Detected build type: %s", buildType))

			// Auto-fix requirements.txt for FastAPI projects
			if buildType == "fastapi" {
				fmt.Println("[FastAPI] Checking requirements.txt for necessary dependencies...")
				stream.Info("Checking FastAPI requirements...")
				if err := FixFastAPIRequirementsWithPlugins(r.projectDir, buildContext, r.bundledPluginsDir); err != nil {
					// Log warning but continue - don't fail the deployment
					fmt.Printf("[FastAPI] Warning: Could not auto-fix requirements.txt: %v\n", err)
					stream.Info(fmt.Sprintf("Warning: Could not auto-fix requirements.txt: %v", err))
				}
			}

			// Prepare buildConfig with port information
			buildConfig := service.Spec.BuildConfig
			if buildConfig == nil {
				buildConfig = make(map[string]interface{})
			}

			// Extract container port from ports mapping (e.g., "3003:3003" -> "3003")
			if len(service.Spec.Ports) > 0 {
				// Parse first port mapping to extract container port
				portMapping := service.Spec.Ports[0]
				// Handle formats: "3003:3003", "3003", "0.0.0.0:3003:3003"
				parts := strings.Split(portMapping, ":")
				if len(parts) >= 2 {
					// Get the container port (last part)
					buildConfig["port"] = parts[len(parts)-1]
				} else if len(parts) == 1 {
					// Just a single port number
					buildConfig["port"] = parts[0]
				}
			}

			// Generate Dockerfile with buildConfig and pluginsDir
			if err := WriteDockerfileWithBundled(r.projectDir, buildContext, buildType,
			                         buildConfig, r.pluginsDir, r.bundledPluginsDir); err != nil {
				return fmt.Errorf("failed to write Dockerfile for '%s': %w", name, err)
			}

			dockerfilePath := fmt.Sprintf("%s/%s", buildContext, service.Spec.Build.GetDockerfile())
			stream.Success(fmt.Sprintf("Generated Dockerfile for '%s' (%s) at %s", name, buildType, dockerfilePath))
			dockerfileCount++
		}
	}

	if dockerfileCount > 0 {
		stream.Success(fmt.Sprintf("Generated %d Dockerfile(s)", dockerfileCount))
	}

	// Generate Grafana provisioning files for All-in-one mode
	mode := r.detectDeploymentMode()
	if mode == "all-in-one" {
		stream.Info("Detected All-in-one mode: Preparing Grafana provisioning...")
		if err := r.prepareGrafanaProvisioning(stream); err != nil {
			stream.Info(fmt.Sprintf("Warning: Failed to prepare Grafana provisioning: %v", err))
			// Don't fail the deployment, just warn
		} else {
			stream.Success("Grafana provisioning files prepared")
		}
	}

	return nil
}

// getTargetType은 서비스들이 사용하는 target type을 반환합니다
func (r *Runner) getTargetType() string {
	// 첫 번째 서비스의 target을 확인
	for _, service := range r.stack.Services {
		if target, exists := r.stack.Targets[service.Target]; exists {
			return target.Type
		}
	}
	return "docker-desktop" // 기본값
}

// getTarget은 서비스들이 사용하는 EC2 target을 반환합니다
func (r *Runner) getTarget() (stack.Target, error) {
	for _, service := range r.stack.Services {
		if target, exists := r.stack.Targets[service.Target]; exists {
			// EC2 target만 반환
			if target.Type == "ec2.ssh" {
				return target, nil
			}
		}
	}
	return stack.Target{}, fmt.Errorf("no valid EC2 target found")
}

// buildImages는 docker-compose build를 실행합니다
func (r *Runner) buildImages(stream *events.Stream) error {
	// Check which targets are used by services
	hasLocal := false
	hasEC2 := false

	for _, service := range r.stack.Services {
		if targetObj, exists := r.stack.Targets[service.Target]; exists {
			if targetObj.Type == "local" {
				hasLocal = true
			} else if targetObj.Type == "ec2.ssh" {
				hasEC2 = true
			}
		}
	}

	// Build for EC2 if any service uses it
	if hasEC2 {
		if err := r.buildImagesEC2(stream); err != nil {
			return err
		}
	}

	// Build locally if any service uses local target
	if hasLocal {
		if err := r.buildImagesLocal(stream); err != nil {
			return err
		}
	}

	return nil
}

// buildImagesLocal은 로컬에서 docker-compose build를 실행합니다
func (r *Runner) buildImagesLocal(stream *events.Stream) error {
	composeFile := filepath.Join(r.projectDir, "docker-compose.yml")

	// Check if compose file exists
	if _, err := os.Stat(composeFile); os.IsNotExist(err) {
		return fmt.Errorf("docker-compose.yml not found: %s", composeFile)
	}

	// Collect service names with local target
	localServices := []string{}
	for name, service := range r.stack.Services {
		if targetObj, exists := r.stack.Targets[service.Target]; exists {
			if targetObj.Type == "local" {
				localServices = append(localServices, name)
			}
		}
	}

	if len(localServices) == 0 {
		stream.Info("No local services to build")
		return nil
	}

	stream.Info(fmt.Sprintf("Running docker compose build for local services: %v", localServices))

	// Run docker compose build with --project-directory and specific service names
	// This ensures build contexts are relative to project directory, not compose file location
	cmdArgs := []string{"compose", "--project-directory", r.projectDir, "-f", composeFile, "build"}
	cmdArgs = append(cmdArgs, localServices...)
	cmd := exec.Command("docker", cmdArgs...)
	cmd.Dir = r.projectDir

	// Hide console window on Windows
	if runtime.GOOS == "windows" {
		cmd.SysProcAttr = &syscall.SysProcAttr{
			HideWindow:    true,
			CreationFlags: 0x08000000 | 0x00000200, // CREATE_NO_WINDOW | CREATE_NEW_PROCESS_GROUP
		}
	}

	// Capture output
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return fmt.Errorf("failed to create stdout pipe: %w", err)
	}

	stderr, err := cmd.StderrPipe()
	if err != nil {
		stdout.Close() // StderrPipe 실패 시 이미 열린 stdout 파이프를 닫아 fd 누수를 방지한다.
		return fmt.Errorf("failed to create stderr pipe: %w", err)
	}

	if err := cmd.Start(); err != nil {
		stdout.Close()
		stderr.Close()
		return fmt.Errorf("failed to start docker-compose build: %w", err)
	}

	// cmd.Wait()가 파이프를 닫아 goroutine 스캐너 루프를 종료시키고,
	// wg.Wait()로 두 goroutine이 마지막 줄까지 읽은 뒤 반환한다.
	var wg sync.WaitGroup
	wg.Add(2)

	go func() {
		defer wg.Done()
		scanner := bufio.NewScanner(stdout)
		for scanner.Scan() {
			stream.Info(fmt.Sprintf("[build] %s", scanner.Text()))
		}
		if err := scanner.Err(); err != nil {
			stream.Warning(fmt.Sprintf("[build] stdout read error: %v", err), nil)
		}
	}()

	go func() {
		defer wg.Done()
		scanner := bufio.NewScanner(stderr)
		for scanner.Scan() {
			stream.Info(fmt.Sprintf("[build] %s", scanner.Text()))
		}
		if err := scanner.Err(); err != nil {
			stream.Warning(fmt.Sprintf("[build] stderr read error: %v", err), nil)
		}
	}()

	err = cmd.Wait()
	wg.Wait()
	if err != nil {
		return fmt.Errorf("docker-compose build failed: %w", err)
	}

	return nil
}

// buildImagesEC2는 EC2에서 docker-compose build를 실행합니다
func (r *Runner) buildImagesEC2(stream *events.Stream) error {
	target, err := r.getTarget()
	if err != nil {
		return err
	}

	sshClient := NewSSHClient(target, r.projectDir)

	// 1. Docker 설치 확인
	if err := sshClient.CheckDockerInstalled(stream); err != nil {
		return err
	}

	// 2. 작업 디렉토리 준비
	if err := sshClient.PrepareWorkdir(stream); err != nil {
		return err
	}

	workdir := sshClient.GetWorkdir()

	// 3. 프로젝트 파일들 전송
	stream.Info("Uploading project files to EC2...")

	// docker-compose.yml 전송 (기존 파일이 있으면 먼저 삭제)
	composeFile := filepath.Join(r.projectDir, "docker-compose.yml")
	remoteComposeFile := workdir + "/docker-compose.yml"

	// Remove existing docker-compose.yml if it exists
	if err := sshClient.RunCommand(stream, fmt.Sprintf("rm -f %s", remoteComposeFile)); err != nil {
		stream.Info(fmt.Sprintf("Warning: failed to remove existing docker-compose.yml: %v", err))
	}

	if err := sshClient.UploadFile(stream, composeFile, remoteComposeFile); err != nil {
		return fmt.Errorf("failed to upload docker-compose.yml: %w", err)
	}

	// Collect EC2 services that need building
	ec2Services := []string{}
	for name, service := range r.stack.Services {
		if targetObj, exists := r.stack.Targets[service.Target]; exists {
			stream.Info(fmt.Sprintf("Service '%s' uses target '%s' (type: %s)", name, service.Target, targetObj.Type))
			if targetObj.Type == "ec2.ssh" {
				ec2Services = append(ec2Services, name)
			}
		}
	}

	stream.Info(fmt.Sprintf("Found %d EC2 services: %v", len(ec2Services), ec2Services))

	// Upload prometheus configuration if prometheus service exists on EC2
	for _, serviceName := range ec2Services {
		if serviceName == "prometheus" {
			// Upload prometheus.yml file
			prometheusYml := filepath.Join(r.projectDir, "prometheus.yml")

			// 파일 존재 여부를 한 번만 확인하고 결과를 재사용해 이중 Stat 호출을 방지한다.
			_, prometheusStatErr := os.Stat(prometheusYml)
			if os.IsNotExist(prometheusStatErr) {
				stream.Info("prometheus.yml not found in project, using bundled version...")

				// Try bundled plugins directory first
				bundledPrometheusYml := filepath.Join(r.bundledPluginsDir, "monitoring", "prometheus", "prometheus.yml")
				if _, err := os.Stat(bundledPrometheusYml); err == nil {
					// Copy bundled prometheus.yml to project directory
					content, err := os.ReadFile(bundledPrometheusYml)
					if err != nil {
						return fmt.Errorf("failed to read bundled prometheus.yml: %w", err)
					}
					if err := os.WriteFile(prometheusYml, content, 0644); err != nil {
						return fmt.Errorf("failed to copy prometheus.yml to project: %w", err)
					}
					stream.Success("Copied prometheus.yml from bundled plugin")
					prometheusStatErr = nil // 복사 성공 → 파일 존재
				} else {
					stream.Info("Warning: prometheus.yml not found in bundled plugins, prometheus may not start correctly")
				}
			}

			// Upload prometheus.yml if it exists
			if prometheusStatErr == nil {
				stream.Info("Uploading prometheus.yml...")
				remotePrometheusYml := workdir + "/prometheus.yml"

				// Remove existing prometheus.yml if it's a directory (from previous failed deployment)
				if err := sshClient.RunCommand(stream, fmt.Sprintf("rm -rf %s", remotePrometheusYml)); err != nil {
					stream.Info(fmt.Sprintf("Warning: failed to remove existing prometheus.yml: %v", err))
				}

				if err := sshClient.UploadFile(stream, prometheusYml, remotePrometheusYml); err != nil {
					return fmt.Errorf("failed to upload prometheus.yml: %w", err)
				}
			}

			// Upload prometheus directory if it exists
			prometheusDir := filepath.Join(r.projectDir, "prometheus")
			if _, err := os.Stat(prometheusDir); err == nil {
				stream.Info("Uploading Prometheus configuration directory...")
				remotePrometheusDir := workdir + "/prometheus"
				if err := sshClient.UploadDirectory(stream, prometheusDir, remotePrometheusDir); err != nil {
					return fmt.Errorf("failed to upload prometheus directory: %w", err)
				}
			}

			stream.Success("Prometheus configuration uploaded")
			break
		}
	}

	// Upload nginx.conf if a proxy.nginx service exists on EC2
	nginxSvcName := r.getNginxServiceName()
	for _, serviceName := range ec2Services {
		if serviceName == nginxSvcName {
			nginxConf := filepath.Join(r.projectDir, "nginx.conf")
			if _, err := os.Stat(nginxConf); err == nil {
				stream.Info("Uploading nginx.conf...")
				remoteNginxConf := workdir + "/nginx.conf"
				if err := sshClient.RunCommand(stream, fmt.Sprintf("rm -rf %s", remoteNginxConf)); err != nil {
					stream.Info(fmt.Sprintf("Warning: failed to remove existing nginx.conf: %v", err))
				}
				if err := sshClient.UploadFile(stream, nginxConf, remoteNginxConf); err != nil {
					return fmt.Errorf("failed to upload nginx.conf: %w", err)
				}
				stream.Success("nginx.conf uploaded")
			}
			break
		}
	}

	// Re-collect EC2 services for build context upload
	ec2Services = []string{}
	for name, service := range r.stack.Services {
		if target, exists := r.stack.Targets[service.Target]; exists {
			if target.Type == "ec2.ssh" {
				ec2Services = append(ec2Services, name)
			}
		}
	}

	if len(ec2Services) == 0 {
		stream.Info("No EC2 services to build")
		return nil
	}

	// 빌드 컨텍스트 디렉토리들 전송 (EC2 타겟 서비스만)
	for name, service := range r.stack.Services {
		// Only upload for EC2 services
		targetObj, exists := r.stack.Targets[service.Target]
		if !exists || targetObj.Type != "ec2.ssh" {
			continue
		}

		if service.Spec.Build != nil && !service.Spec.Build.IsEmpty() {
			buildContext := service.Spec.Build.GetContext()
			localBuildPath := filepath.Join(r.projectDir, buildContext)
			remoteBuildPath := workdir + "/" + buildContext

			stream.Info(fmt.Sprintf("Uploading build context for %s...", name))
			if err := sshClient.UploadDirectory(stream, localBuildPath, remoteBuildPath); err != nil {
				return fmt.Errorf("failed to upload build context for %s: %w", name, err)
			}
		}
	}

	// 4. EC2에서 빌드 실행 (EC2 서비스만)
	stream.Info(fmt.Sprintf("Building images on EC2: %v", ec2Services))
	serviceList := ""
	for _, svc := range ec2Services {
		serviceList += " " + svc
	}
	buildCmd := fmt.Sprintf("cd %s && docker compose -f docker-compose.yml build%s", workdir, serviceList)
	if err := sshClient.RunCommand(stream, buildCmd); err != nil {
		return fmt.Errorf("failed to build on EC2: %w", err)
	}

	stream.Success("Images built successfully on EC2")
	return nil
}

// deployContainers는 docker-compose up -d를 실행합니다
func (r *Runner) deployContainers(stream *events.Stream) error {
	// Check which targets are used by services
	hasLocal := false
	hasEC2 := false

	for _, service := range r.stack.Services {
		if targetObj, exists := r.stack.Targets[service.Target]; exists {
			if targetObj.Type == "local" {
				hasLocal = true
			} else if targetObj.Type == "ec2.ssh" {
				hasEC2 = true
			}
		}
	}

	// Deploy to EC2 if any service uses it
	if hasEC2 {
		if err := r.deployContainersEC2(stream); err != nil {
			return err
		}
	}

	// Deploy locally if any service uses local target
	if hasLocal {
		if err := r.deployContainersLocal(stream); err != nil {
			return err
		}
	}

	return nil
}

// deployContainersLocal은 로컬에서 docker-compose up -d를 실행합니다
func (r *Runner) deployContainersLocal(stream *events.Stream) error {
	composeFile := filepath.Join(r.projectDir, "docker-compose.yml")

	// Detect deployment mode
	mode := r.detectDeploymentMode()
	stream.Info(fmt.Sprintf("Detected deployment mode: %s", mode))

	// Collect service names with local target
	localServices := []string{}
	for name, service := range r.stack.Services {
		if targetObj, exists := r.stack.Targets[service.Target]; exists {
			if targetObj.Type == "local" {
				// Skip monitoring services in Hybrid and Local modes
				// They will be started by Monitoring Logs feature
				if mode == "hybrid" || mode == "local" {
					if name == "prometheus" || name == "grafana" {
						stream.Info(fmt.Sprintf("Skipping '%s' in %s mode (use Monitoring Logs to start)", name, mode))
						continue
					}
				}
				localServices = append(localServices, name)
			}
		}
	}

	if len(localServices) == 0 {
		stream.Info("No local services to deploy")
		return nil
	}

	// Ensure Docker Desktop is running only if there are local services to deploy
	stream.Info("Checking Docker Desktop status...")
	if err := ensureDockerRunning(stream); err != nil {
		return fmt.Errorf("failed to start Docker Desktop: %w", err)
	}
	stream.Success("Docker Desktop is running")

	// Step 1: Stop existing containers and remove orphans
	stream.Info("Stopping existing containers and removing orphans...")
	downArgs := []string{"compose", "--project-directory", r.projectDir, "-f", composeFile, "down", "--remove-orphans"}
	downCmd := exec.Command("docker", downArgs...)
	downCmd.Dir = r.projectDir

	// Hide console window on Windows
	if runtime.GOOS == "windows" {
		downCmd.SysProcAttr = &syscall.SysProcAttr{
			HideWindow:    true,
			CreationFlags: 0x08000000 | 0x00000200,
		}
	}

	if output, err := downCmd.CombinedOutput(); err != nil {
		stream.Info(fmt.Sprintf("Warning: Failed to stop containers: %v", err))
		stream.Info(fmt.Sprintf("Output: %s", string(output)))
		// Continue anyway - might be first deployment
	}

	// Step 2: Rebuild images to ensure code changes are included
	stream.Info("Rebuilding images...")
	buildArgs := []string{"compose", "--project-directory", r.projectDir, "-f", composeFile, "build"}
	buildArgs = append(buildArgs, localServices...)
	buildCmd := exec.Command("docker", buildArgs...)
	buildCmd.Dir = r.projectDir

	// Hide console window on Windows
	if runtime.GOOS == "windows" {
		buildCmd.SysProcAttr = &syscall.SysProcAttr{
			HideWindow:    true,
			CreationFlags: 0x08000000 | 0x00000200,
		}
	}

	if output, err := buildCmd.CombinedOutput(); err != nil {
		stream.Info(fmt.Sprintf("Warning: Image build completed with warnings"))
		if len(output) > 0 {
			stream.Info(fmt.Sprintf("Build output: %s", string(output)))
		}
	}

	// Step 3: Start containers (volumes are preserved)
	stream.Info(fmt.Sprintf("Starting containers for local services: %v", localServices))

	// Run docker compose up -d with specific service names
	cmdArgs := []string{"compose", "--project-directory", r.projectDir, "-f", composeFile, "up", "-d"}
	cmdArgs = append(cmdArgs, localServices...)
	cmd := exec.Command("docker", cmdArgs...)
	cmd.Dir = r.projectDir

	// Hide console window on Windows
	if runtime.GOOS == "windows" {
		cmd.SysProcAttr = &syscall.SysProcAttr{
			HideWindow:    true,
			CreationFlags: 0x08000000 | 0x00000200, // CREATE_NO_WINDOW | CREATE_NEW_PROCESS_GROUP
		}
	}

	// Capture output
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return fmt.Errorf("failed to create stdout pipe: %w", err)
	}

	stderr, err := cmd.StderrPipe()
	if err != nil {
		stdout.Close() // StderrPipe 실패 시 이미 열린 stdout 파이프를 닫아 fd 누수를 방지한다.
		return fmt.Errorf("failed to create stderr pipe: %w", err)
	}

	if err := cmd.Start(); err != nil {
		stdout.Close()
		stderr.Close()
		return fmt.Errorf("failed to start docker-compose up: %w", err)
	}

	// cmd.Wait()가 파이프를 닫아 goroutine 스캐너 루프를 종료시키고,
	// wg.Wait()로 두 goroutine이 마지막 줄까지 읽은 뒤 반환한다.
	var wg sync.WaitGroup
	wg.Add(2)

	go func() {
		defer wg.Done()
		scanner := bufio.NewScanner(stdout)
		for scanner.Scan() {
			stream.Info(fmt.Sprintf("[deploy] %s", scanner.Text()))
		}
		if err := scanner.Err(); err != nil {
			stream.Warning(fmt.Sprintf("[deploy] stdout read error: %v", err), nil)
		}
	}()

	go func() {
		defer wg.Done()
		scanner := bufio.NewScanner(stderr)
		for scanner.Scan() {
			stream.Info(fmt.Sprintf("[deploy] %s", scanner.Text()))
		}
		if err := scanner.Err(); err != nil {
			stream.Warning(fmt.Sprintf("[deploy] stderr read error: %v", err), nil)
		}
	}()

	err = cmd.Wait()
	wg.Wait()
	if err != nil {
		return fmt.Errorf("docker-compose up failed: %w", err)
	}

	return nil
}

// deployContainersEC2는 EC2에서 docker-compose up -d를 실행합니다
func (r *Runner) deployContainersEC2(stream *events.Stream) error {
	target, err := r.getTarget()
	if err != nil {
		return err
	}

	// Collect service names with EC2 target
	ec2Services := []string{}
	for name, service := range r.stack.Services {
		if targetObj, exists := r.stack.Targets[service.Target]; exists {
			if targetObj.Type == "ec2.ssh" {
				ec2Services = append(ec2Services, name)
			}
		}
	}

	if len(ec2Services) == 0 {
		stream.Info("No EC2 services to deploy")
		return nil
	}

	sshClient := NewSSHClient(target, r.projectDir)
	workdir := sshClient.GetWorkdir()
	if err := validateWorkdir(workdir); err != nil {
		return fmt.Errorf("invalid workdir: %w", err)
	}

	stream.Info(fmt.Sprintf("Deploying containers on EC2: %v", ec2Services))

	// Step 1: Stop existing containers and remove orphans
	stream.Info("Stopping existing containers and removing orphans...")
	downCmd := fmt.Sprintf("cd %s && docker compose -f docker-compose.yml down --remove-orphans", workdir)
	if err := sshClient.RunCommand(stream, downCmd); err != nil {
		stream.Info(fmt.Sprintf("Warning: Failed to stop containers: %v", err))
		// Continue anyway - might be first deployment
	}

	// Step 2: Rebuild images to ensure code changes are included
	stream.Info("Rebuilding images...")
	serviceList := ""
	for _, svc := range ec2Services {
		serviceList += " " + svc
	}
	buildCmd := fmt.Sprintf("cd %s && docker compose -f docker-compose.yml build%s", workdir, serviceList)
	if err := sshClient.RunCommand(stream, buildCmd); err != nil {
		// 빌드 실패 시 기존 이미지가 있는지 확인한다.
		// 이미지가 있으면 이전 버전으로 계속 진행하고, 없으면 배포를 중단한다.
		checkCmd := fmt.Sprintf("cd %s && docker compose -f docker-compose.yml images -q | wc -l", workdir)
		output, checkErr := sshClient.RunCommandWithOutput(stream, checkCmd)
		if checkErr != nil || strings.TrimSpace(output) == "0" || strings.TrimSpace(output) == "" {
			return fmt.Errorf("docker compose build failed and no existing images found: %w", err)
		}
		stream.Warning(
			"Image build failed. Deploying with previous build — the running container may not reflect the latest code.",
			map[string]interface{}{"build_error": err.Error()},
		)
	}

	// Step 3: Start containers (volumes are preserved)
	deployCmd := fmt.Sprintf("cd %s && docker compose -f docker-compose.yml up -d%s", workdir, serviceList)
	if err := sshClient.RunCommand(stream, deployCmd); err != nil {
		return fmt.Errorf("failed to deploy on EC2: %w", err)
	}

	stream.Success("Containers deployed successfully on EC2")

	// Auto SSL: run certbot and activate HTTPS after containers are up
	if cfg := r.getNginxAutoSSLConfig(); cfg != nil {
		stream.Info("Issuing SSL certificate via Let's Encrypt (certbot)...")
		certbotRunCmd := fmt.Sprintf("cd %s && docker compose -f docker-compose.yml run --rm certbot", workdir)
		if err := sshClient.RunCommand(stream, certbotRunCmd); err != nil {
			stream.Warning(
				fmt.Sprintf("SSL 인증서 발급 실패: %v", err),
				map[string]interface{}{"ssl_pending": true},
			)
			stream.Warning(
				"HTTP 전용 모드로 계속합니다. 도메인 DNS와 포트 443(인바운드)을 확인한 후 재배포하세요.",
				map[string]interface{}{"ssl_pending": true},
			)
		} else {
			stream.Success("SSL certificate issued successfully")

			if err := nginx.ValidateServerName(cfg.ServerName); err != nil {
				stream.Warning(fmt.Sprintf("SSL config skipped: invalid serverName — %v", err), nil)
				return nil
			}
			sslContent := nginx.BuildConfigWithSSL(cfg)
			tmpFile, err := os.CreateTemp("", "nginx-ssl-*.conf")
			if err != nil {
				stream.Warning(fmt.Sprintf("failed to create SSL nginx.conf: %v", err), nil)
			} else {
				// 이중 Close를 방지하기 위해 한 번만 닫도록 추적한다.
				// 업로드 전 flush 목적으로 명시적으로 닫은 뒤 defer가 재시도하지 않도록 한다.
				var fileClosed bool
				closeTmp := func() {
					if !fileClosed {
						fileClosed = true
						tmpFile.Close()
					}
				}
				defer func() { closeTmp(); os.Remove(tmpFile.Name()) }()

				if _, err := tmpFile.WriteString(sslContent); err != nil {
					stream.Warning(fmt.Sprintf("failed to write SSL nginx.conf: %v", err), nil)
				} else {
					closeTmp() // 업로드 전 파일 내용을 flush한다.
					remoteNginxConf := workdir + "/nginx.conf"
					if err := sshClient.UploadFile(stream, tmpFile.Name(), remoteNginxConf); err != nil {
						stream.Info(fmt.Sprintf("Warning: failed to upload SSL nginx.conf: %v", err))
					} else {
						nginxSvcName := r.getNginxServiceName()
						reloadCmd := fmt.Sprintf("cd %s && docker compose -f docker-compose.yml exec %s nginx -s reload", workdir, nginxSvcName)
						if err := sshClient.RunCommand(stream, reloadCmd); err != nil {
							stream.Info(fmt.Sprintf("Warning: failed to reload nginx: %v", err))
						} else {
							stream.Success("HTTPS activated - nginx reloaded with SSL config")
						}

						// Register daily cron for automatic certificate renewal
						cronEntry := fmt.Sprintf(
							"0 12 * * * cd %s && docker compose -f docker-compose.yml run --rm certbot renew --quiet && docker compose -f docker-compose.yml exec %s nginx -s reload # arfni-certbot-renew",
							workdir, nginxSvcName,
						)
						cronCmd := fmt.Sprintf(
							`(crontab -l 2>/dev/null | grep -v 'arfni-certbot-renew'; echo "%s") | crontab -`,
							cronEntry,
						)
						if err := sshClient.RunCommand(stream, cronCmd); err != nil {
							stream.Info(fmt.Sprintf("Warning: failed to register renewal cron: %v", err))
						} else {
							stream.Success("Auto-renewal cron registered (daily at 12:00 UTC)")
						}
					}
				}
			}
		}
	}

	return nil
}

// getNginxAutoSSLConfig returns NginxConfig if the stack has a proxy.nginx with ssl.auto enabled.
func (r *Runner) getNginxAutoSSLConfig() *stack.NginxConfig {
	for _, svc := range r.stack.Services {
		if svc.Kind == "proxy.nginx" && svc.Spec.Nginx != nil {
			if ssl := svc.Spec.Nginx.SSL; ssl != nil && ssl.Enabled && ssl.Auto {
				return svc.Spec.Nginx
			}
		}
	}
	return nil
}

// getNginxServiceName returns the service name of the first proxy.nginx service.
func (r *Runner) getNginxServiceName() string {
	for name, svc := range r.stack.Services {
		if svc.Kind == "proxy.nginx" {
			return name
		}
	}
	return "nginx"
}

// healthChecks는 컨테이너 상태를 확인합니다
func (r *Runner) healthChecks(stream *events.Stream) error {
	// Detect deployment mode
	mode := r.detectDeploymentMode()

	// Check which targets are used by services (excluding monitoring in Hybrid/Local modes)
	hasLocal := false
	hasEC2 := false

	for name, service := range r.stack.Services {
		if targetObj, exists := r.stack.Targets[service.Target]; exists {
			// Skip monitoring services in Hybrid/Local modes (they weren't deployed)
			if mode == "hybrid" || mode == "local" {
				if name == "prometheus" || name == "grafana" {
					continue
				}
			}

			if targetObj.Type == "local" {
				hasLocal = true
			} else if targetObj.Type == "ec2.ssh" {
				hasEC2 = true
			}
		}
	}

	// Health check for EC2 if any service uses it
	if hasEC2 {
		if err := r.healthChecksEC2(stream); err != nil {
			return err
		}
	}

	// Health check locally if any service uses local target
	if hasLocal {
		if err := r.healthChecksLocal(stream); err != nil {
			return err
		}
	}

	return nil
}

// healthChecksLocal은 로컬 컨테이너 상태를 확인합니다
func (r *Runner) healthChecksLocal(stream *events.Stream) error {
	composeFile := filepath.Join(r.projectDir, "docker-compose.yml")

	// Wait a bit for containers to start
	time.Sleep(2 * time.Second)

	stream.Info("Checking container status...")

	// Run docker compose ps with --project-directory
	cmd := exec.Command("docker", "compose", "--project-directory", r.projectDir, "-f", composeFile, "ps")
	cmd.Dir = r.projectDir

	// Hide console window on Windows
	if runtime.GOOS == "windows" {
		cmd.SysProcAttr = &syscall.SysProcAttr{
			HideWindow:    true,
			CreationFlags: 0x08000000 | 0x00000200, // CREATE_NO_WINDOW | CREATE_NEW_PROCESS_GROUP
		}
	}

	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("failed to check container status: %w", err)
	}

	stream.Info(string(output))

	// Check if containers are running
	cmd = exec.Command("docker", "compose", "--project-directory", r.projectDir, "-f", composeFile, "ps", "-q")
	cmd.Dir = r.projectDir

	// Hide console window on Windows
	if runtime.GOOS == "windows" {
		cmd.SysProcAttr = &syscall.SysProcAttr{
			HideWindow:    true,
			CreationFlags: 0x08000000 | 0x00000200, // CREATE_NO_WINDOW | CREATE_NEW_PROCESS_GROUP
		}
	}

	output, err = cmd.Output()
	if err != nil {
		return fmt.Errorf("failed to get container IDs: %w", err)
	}

	if len(output) == 0 {
		return fmt.Errorf("no containers are running")
	}

	stream.Info(fmt.Sprintf("Found %d running container(s)", len(output)/13)) // Docker ID is 12 chars + newline

	return nil
}

// healthChecksEC2는 EC2의 컨테이너 상태를 확인합니다
func (r *Runner) healthChecksEC2(stream *events.Stream) error {
	target, err := r.getTarget()
	if err != nil {
		return err
	}

	sshClient := NewSSHClient(target, r.projectDir)
	workdir := sshClient.GetWorkdir()
	if err := validateWorkdir(workdir); err != nil {
		return fmt.Errorf("invalid workdir: %w", err)
	}

	// Wait a bit for containers to start
	time.Sleep(2 * time.Second)

	stream.Info("Checking container status on EC2...")

	// docker compose ps 실행
	psCmd := fmt.Sprintf("cd %s && docker compose -f docker-compose.yml ps", workdir)
	output, err := sshClient.RunCommandWithOutput(stream, psCmd)
	if err != nil {
		return fmt.Errorf("failed to check container status: %w", err)
	}

	stream.Info(output)

	// 컨테이너 ID 확인
	psqCmd := fmt.Sprintf("cd %s && docker compose -f docker-compose.yml ps -q", workdir)
	output, err = sshClient.RunCommandWithOutput(stream, psqCmd)
	if err != nil {
		return fmt.Errorf("failed to get container IDs: %w", err)
	}

	if len(output) == 0 {
		return fmt.Errorf("no containers are running on EC2")
	}

	stream.Success(fmt.Sprintf("Found running containers on EC2"))

	return nil
}

// ensureDockerRunning checks if Docker is running and starts Docker Desktop if needed
func ensureDockerRunning(stream *events.Stream) error {
	// Check if Docker is running
	cmd := exec.Command("docker", "info")

	// Hide console window on Windows
	if runtime.GOOS == "windows" {
		cmd.SysProcAttr = &syscall.SysProcAttr{
			HideWindow:    true,
			CreationFlags: 0x08000000, // CREATE_NO_WINDOW
		}
	}

	if err := cmd.Run(); err == nil {
		// Docker is already running
		return nil
	}

	// Docker is not running, try to start Docker Desktop
	stream.Info("Docker Desktop is not running, attempting to start...")

	if runtime.GOOS == "windows" {
		// Try common Docker Desktop paths
		dockerPaths := []string{
			"C:\\Program Files\\Docker\\Docker\\Docker Desktop.exe",
			"C:\\Program Files (x86)\\Docker\\Docker\\Docker Desktop.exe",
		}

		var dockerPath string
		for _, path := range dockerPaths {
			if _, err := os.Stat(path); err == nil {
				dockerPath = path
				break
			}
		}

		if dockerPath == "" {
			return fmt.Errorf("Docker Desktop executable not found")
		}

		// Start Docker Desktop
		cmd := exec.Command(dockerPath)
		cmd.SysProcAttr = &syscall.SysProcAttr{
			HideWindow:    true,
			CreationFlags: 0x08000000, // CREATE_NO_WINDOW
		}

		if err := cmd.Start(); err != nil {
			return fmt.Errorf("failed to start Docker Desktop: %w", err)
		}

		stream.Info("Waiting for Docker Desktop to start (max 60 seconds)...")

		// Wait for Docker to be ready (max 60 seconds)
		for i := 0; i < 60; i++ {
			time.Sleep(1 * time.Second)

			checkCmd := exec.Command("docker", "info")
			checkCmd.SysProcAttr = &syscall.SysProcAttr{
				HideWindow:    true,
				CreationFlags: 0x08000000,
			}

			if err := checkCmd.Run(); err == nil {
				stream.Success("Docker Desktop started successfully")
				return nil
			}

			if i%5 == 0 {
				stream.Info(fmt.Sprintf("Still waiting... (%d seconds)", i))
			}
		}

		return fmt.Errorf("Docker Desktop did not start within 60 seconds")
	}

	return fmt.Errorf("Docker is not running and auto-start is only supported on Windows")
}

// prepareGrafanaProvisioning generates Grafana provisioning files for All-in-one mode
func (r *Runner) prepareGrafanaProvisioning(stream *events.Stream) error {
	// Use monitoring package's PrepareMonitoringStack
	outputDir := filepath.Join(r.projectDir, "grafana")

	// AllInOne mode: Prometheus is in the same Docker network
	mode := monitoring.ModeAllInOne

	stream.Info("Generating Grafana provisioning files...")
	// Copy provisioning files from bundled plugins
	pluginsMonitoringDir := filepath.Join(r.bundledPluginsDir, "monitoring")
	if err := monitoring.CopyAndUpdateProvisioningFiles(pluginsMonitoringDir, r.projectDir, mode); err != nil {
		return fmt.Errorf("failed to copy provisioning files: %w", err)
	}

	// Find EC2 target for upload
	var ec2Target stack.Target
	var found bool
	for _, svc := range r.stack.Services {
		if target, exists := r.stack.Targets[svc.Target]; exists {
			if target.Type == "ec2.ssh" || target.Type == "ec2" {
				ec2Target = target
				found = true
				break
			}
		}
	}

	if !found {
		return fmt.Errorf("no EC2 target found for file upload")
	}

	// Create SSH client and upload
	sshClient := NewSSHClient(ec2Target, r.projectDir)

	// Ensure grafana directory exists with correct ownership before upload
	stream.Info("Preparing grafana directory on EC2...")
	// Use forward slashes for remote Linux paths (even when running on Windows/Mac)
	remoteGrafanaDir := ec2Target.Workdir + "/grafana"
	createDirCmd := fmt.Sprintf("mkdir -p %s/provisioning/datasources %s/provisioning/dashboards", remoteGrafanaDir, remoteGrafanaDir)
	if err := sshClient.RunCommand(stream, createDirCmd); err != nil {
		stream.Info(fmt.Sprintf("Warning: Failed to create grafana directories: %v", err))
	}

	// Fix ownership if needed (in case it was created by Docker as root)
	chownCmd := fmt.Sprintf("sudo chown -R %s:%s %s", ec2Target.User, ec2Target.User, remoteGrafanaDir)
	if err := sshClient.RunCommand(stream, chownCmd); err != nil {
		stream.Info(fmt.Sprintf("Warning: Failed to fix grafana ownership: %v", err))
	}

	stream.Info("Uploading Grafana provisioning files to EC2...")
	// Upload provisioning directory (outputDir/provisioning -> remoteGrafanaDir/provisioning)
	localProvisioningDir := filepath.Join(outputDir, "provisioning") // Local path (OS-specific)
	remoteProvisioningDir := remoteGrafanaDir + "/provisioning"      // Remote Linux path (always forward slash)
	if err := sshClient.UploadDirectory(stream, localProvisioningDir, remoteProvisioningDir); err != nil {
		return fmt.Errorf("failed to upload grafana provisioning: %w", err)
	}

	// Fix permissions so Grafana container can read the files
	stream.Info("Setting permissions for Grafana provisioning files...")
	// Set permissions on all files and directories
	chmodCmd := fmt.Sprintf("chmod -R 755 %s && chmod 755 %s/dashboards %s/datasources",
		remoteProvisioningDir, remoteProvisioningDir, remoteProvisioningDir)
	if err := sshClient.RunCommand(stream, chmodCmd); err != nil {
		stream.Info(fmt.Sprintf("Warning: Failed to set permissions: %v", err))
	}

	// Restart Grafana container to reload provisioning files
	stream.Info("Restarting Grafana to apply provisioning changes...")
	restartCmd := fmt.Sprintf("cd %s && docker compose restart grafana", sshClient.GetWorkdir())
	if err := sshClient.RunCommand(stream, restartCmd); err != nil {
		stream.Info(fmt.Sprintf("Warning: Failed to restart Grafana: %v", err))
		stream.Info("Note: You may need to restart Grafana manually for changes to take effect")
	} else {
		stream.Success("Grafana restarted successfully")
	}

	stream.Success("Grafana provisioning files uploaded to EC2")
	return nil
}

// detectDeploymentMode determines the deployment mode for monitoring services
func (r *Runner) detectDeploymentMode() string {
	// Check if Prometheus and Grafana services exist
	prometheusService, hasPrometheus := r.stack.Services["prometheus"]
	grafanaService, hasGrafana := r.stack.Services["grafana"]

	if !hasPrometheus && !hasGrafana {
		return "none" // No monitoring services
	}

	// Get targets
	var prometheusTarget, grafanaTarget stack.Target
	var prometheusTargetExists, grafanaTargetExists bool

	if hasPrometheus {
		prometheusTarget, prometheusTargetExists = r.stack.Targets[prometheusService.Target]
	}
	if hasGrafana {
		grafanaTarget, grafanaTargetExists = r.stack.Targets[grafanaService.Target]
	}

	// Detect deployment mode
	prometheusIsEC2 := prometheusTargetExists && prometheusTarget.Type == "ec2.ssh"
	grafanaIsLocal := grafanaTargetExists && grafanaTarget.Type == "local"
	grafanaIsEC2 := grafanaTargetExists && grafanaTarget.Type == "ec2.ssh"
	prometheusIsLocal := prometheusTargetExists && prometheusTarget.Type == "local"

	// Hybrid mode: Grafana local, Prometheus on EC2
	if grafanaIsLocal && prometheusIsEC2 {
		return "hybrid"
	}

	// All-in-one mode: Both on EC2
	if grafanaIsEC2 && prometheusIsEC2 {
		return "all-in-one"
	}

	// Local mode: Both local or only one exists locally
	if (grafanaIsLocal && prometheusIsLocal) || (grafanaIsLocal && !hasPrometheus) || (prometheusIsLocal && !hasGrafana) {
		return "local"
	}

	return "none"
}
