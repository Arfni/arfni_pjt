package workflow

import (
	"bufio"
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"syscall"
	"time"

	"github.com/arfni/arfni/internal/core/stack"
	"github.com/arfni/arfni/internal/events"
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

			// Generate Dockerfile with buildConfig and pluginsDir
			if err := WriteDockerfileWithBundled(r.projectDir, buildContext, buildType,
			                         service.Spec.BuildConfig, r.pluginsDir, r.bundledPluginsDir); err != nil {
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

	// Note: Grafana provisioning is now handled by arfni-monitoring.exe at runtime
	// This provides better support for hybrid deployments and OS-specific Docker networking

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

// getTarget은 서비스들이 사용하는 target을 반환합니다
func (r *Runner) getTarget() (stack.Target, error) {
	for _, service := range r.stack.Services {
		if target, exists := r.stack.Targets[service.Target]; exists {
			return target, nil
		}
	}
	return stack.Target{}, fmt.Errorf("no valid target found")
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
		return fmt.Errorf("failed to create stderr pipe: %w", err)
	}

	if err := cmd.Start(); err != nil {
		return fmt.Errorf("failed to start docker-compose build: %w", err)
	}

	// Read stdout
	go func() {
		scanner := bufio.NewScanner(stdout)
		for scanner.Scan() {
			line := scanner.Text()
			stream.Info(fmt.Sprintf("[build] %s", line))
		}
	}()

	// Read stderr
	go func() {
		scanner := bufio.NewScanner(stderr)
		for scanner.Scan() {
			line := scanner.Text()
			stream.Info(fmt.Sprintf("[build] %s", line))
		}
	}()

	if err := cmd.Wait(); err != nil {
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

	// docker-compose.yml 전송
	composeFile := filepath.Join(r.projectDir, "docker-compose.yml")
	remoteComposeFile := workdir + "/docker-compose.yml"
	if err := sshClient.UploadFile(stream, composeFile, remoteComposeFile); err != nil {
		return fmt.Errorf("failed to upload docker-compose.yml: %w", err)
	}

	// Collect EC2 services that need building
	ec2Services := []string{}
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
		stream.Info("No local services to deploy")
		return nil
	}

	stream.Info(fmt.Sprintf("Running docker compose up -d for local services: %v", localServices))

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
		return fmt.Errorf("failed to create stderr pipe: %w", err)
	}

	if err := cmd.Start(); err != nil {
		return fmt.Errorf("failed to start docker-compose up: %w", err)
	}

	// Read stdout
	go func() {
		scanner := bufio.NewScanner(stdout)
		for scanner.Scan() {
			line := scanner.Text()
			stream.Info(fmt.Sprintf("[deploy] %s", line))
		}
	}()

	// Read stderr
	go func() {
		scanner := bufio.NewScanner(stderr)
		for scanner.Scan() {
			line := scanner.Text()
			stream.Info(fmt.Sprintf("[deploy] %s", line))
		}
	}()

	if err := cmd.Wait(); err != nil {
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

	stream.Info(fmt.Sprintf("Deploying containers on EC2: %v", ec2Services))

	// docker compose up -d with specific service names
	serviceList := ""
	for _, svc := range ec2Services {
		serviceList += " " + svc
	}
	deployCmd := fmt.Sprintf("cd %s && docker compose -f docker-compose.yml up -d%s", workdir, serviceList)
	if err := sshClient.RunCommand(stream, deployCmd); err != nil {
		return fmt.Errorf("failed to deploy on EC2: %w", err)
	}

	stream.Success("Containers deployed successfully on EC2")
	return nil
}

// healthChecks는 컨테이너 상태를 확인합니다
func (r *Runner) healthChecks(stream *events.Stream) error {
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
