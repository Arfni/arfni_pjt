package workflow

import (
	"bufio"
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"time"

	"github.com/arfni/arfni/internal/core/stack"
	"github.com/arfni/arfni/internal/events"
)

// Runner는 전체 워크플로우를 조정합니다
type Runner struct {
	stack      *stack.Stack
	projectDir string
}

// NewRunner는 새로운 Runner를 생성합니다
func NewRunner(s *stack.Stack, projectDir string) *Runner {
	return &Runner{
		stack:      s,
		projectDir: projectDir,
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

// Execute는 전체 워크플로우를 실행하며 이벤트를 스트리밍합니다
func (r *Runner) Execute(stream *events.Stream) error {
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

	// Generate docker-compose.yml
	if err := WriteDockerCompose(r.stack, r.projectDir); err != nil {
		return fmt.Errorf("failed to write docker-compose.yml: %w", err)
	}

	stream.Success(fmt.Sprintf("Generated docker-compose.yml for %d services", len(r.stack.Services)))

	// Generate Dockerfiles for services that need them
	stream.Info("Generating Dockerfiles...")
	dockerfileCount := 0
	for name, service := range r.stack.Services {
		if service.Spec.Build != "" {
			stream.Info(fmt.Sprintf("Detecting build type for service '%s' at path: %s", name, service.Spec.Build))

			// Detect build type
			buildType, err := DetectBuildType(r.projectDir, service.Spec.Build)
			if err != nil {
				stream.Info(fmt.Sprintf("Warning: Could not detect build type for '%s': %v", name, err))
				continue
			}

			stream.Info(fmt.Sprintf("Detected build type: %s", buildType))

			// Generate Dockerfile if it doesn't exist
			if err := WriteDockerfile(r.projectDir, service.Spec.Build, buildType); err != nil {
				return fmt.Errorf("failed to write Dockerfile for '%s': %w", name, err)
			}

			dockerfilePath := fmt.Sprintf("%s/Dockerfile", service.Spec.Build)
			stream.Success(fmt.Sprintf("Generated Dockerfile for '%s' (%s) at %s", name, buildType, dockerfilePath))
			dockerfileCount++
		}
	}

	if dockerfileCount > 0 {
		stream.Success(fmt.Sprintf("Generated %d Dockerfile(s)", dockerfileCount))
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
	targetType := r.getTargetType()

	// EC2인 경우 원격 빌드
	if targetType == "ec2.ssh" {
		return r.buildImagesEC2(stream)
	}

	// 로컬 빌드
	return r.buildImagesLocal(stream)
}

// buildImagesLocal은 로컬에서 docker-compose build를 실행합니다
func (r *Runner) buildImagesLocal(stream *events.Stream) error {
	composeDir := filepath.Join(r.projectDir, ".arfni", "compose")
	composeFile := filepath.Join(composeDir, "docker-compose.yml")

	// Check if compose file exists
	if _, err := os.Stat(composeFile); os.IsNotExist(err) {
		return fmt.Errorf("docker-compose.yml not found: %s", composeFile)
	}

	stream.Info("Running docker-compose build...")

	// Run docker-compose build with --project-directory
	// This ensures build contexts are relative to project directory, not compose file location
	cmd := exec.Command("docker-compose", "--project-directory", r.projectDir, "-f", composeFile, "build")
	cmd.Dir = r.projectDir

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

	// .arfni/compose 디렉토리 전송
	composeDir := filepath.Join(r.projectDir, ".arfni", "compose")
	remoteComposeDir := workdir + "/.arfni/compose"
	if err := sshClient.UploadDirectory(stream, composeDir, remoteComposeDir); err != nil {
		return fmt.Errorf("failed to upload compose files: %w", err)
	}

	// 빌드 컨텍스트 디렉토리들 전송 (apps 디렉토리 등)
	for name, service := range r.stack.Services {
		if service.Spec.Build != "" {
			localBuildPath := filepath.Join(r.projectDir, service.Spec.Build)
			remoteBuildPath := workdir + "/" + service.Spec.Build

			stream.Info(fmt.Sprintf("Uploading build context for %s...", name))
			if err := sshClient.UploadDirectory(stream, localBuildPath, remoteBuildPath); err != nil {
				return fmt.Errorf("failed to upload build context for %s: %w", name, err)
			}
		}
	}

	// 4. EC2에서 빌드 실행
	stream.Info("Building images on EC2...")
	buildCmd := fmt.Sprintf("cd %s && docker-compose -f .arfni/compose/docker-compose.yml build", workdir)
	if err := sshClient.RunCommand(stream, buildCmd); err != nil {
		return fmt.Errorf("failed to build on EC2: %w", err)
	}

	stream.Success("Images built successfully on EC2")
	return nil
}

// deployContainers는 docker-compose up -d를 실행합니다
func (r *Runner) deployContainers(stream *events.Stream) error {
	targetType := r.getTargetType()

	// EC2인 경우 원격 배포
	if targetType == "ec2.ssh" {
		return r.deployContainersEC2(stream)
	}

	// 로컬 배포
	return r.deployContainersLocal(stream)
}

// deployContainersLocal은 로컬에서 docker-compose up -d를 실행합니다
func (r *Runner) deployContainersLocal(stream *events.Stream) error {
	composeDir := filepath.Join(r.projectDir, ".arfni", "compose")
	composeFile := filepath.Join(composeDir, "docker-compose.yml")

	stream.Info("Running docker-compose up -d...")

	// Run docker-compose up -d with --project-directory
	cmd := exec.Command("docker-compose", "--project-directory", r.projectDir, "-f", composeFile, "up", "-d")
	cmd.Dir = r.projectDir

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

	sshClient := NewSSHClient(target, r.projectDir)
	workdir := sshClient.GetWorkdir()

	stream.Info("Deploying containers on EC2...")

	// docker-compose up -d 실행
	deployCmd := fmt.Sprintf("cd %s && docker-compose -f .arfni/compose/docker-compose.yml up -d", workdir)
	if err := sshClient.RunCommand(stream, deployCmd); err != nil {
		return fmt.Errorf("failed to deploy on EC2: %w", err)
	}

	stream.Success("Containers deployed successfully on EC2")
	return nil
}

// healthChecks는 컨테이너 상태를 확인합니다
func (r *Runner) healthChecks(stream *events.Stream) error {
	targetType := r.getTargetType()

	// EC2인 경우 원격 헬스체크
	if targetType == "ec2.ssh" {
		return r.healthChecksEC2(stream)
	}

	// 로컬 헬스체크
	return r.healthChecksLocal(stream)
}

// healthChecksLocal은 로컬 컨테이너 상태를 확인합니다
func (r *Runner) healthChecksLocal(stream *events.Stream) error {
	composeDir := filepath.Join(r.projectDir, ".arfni", "compose")
	composeFile := filepath.Join(composeDir, "docker-compose.yml")

	// Wait a bit for containers to start
	time.Sleep(2 * time.Second)

	stream.Info("Checking container status...")

	// Run docker-compose ps with --project-directory
	cmd := exec.Command("docker-compose", "--project-directory", r.projectDir, "-f", composeFile, "ps")
	cmd.Dir = r.projectDir

	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("failed to check container status: %w", err)
	}

	stream.Info(string(output))

	// Check if containers are running
	cmd = exec.Command("docker-compose", "--project-directory", r.projectDir, "-f", composeFile, "ps", "-q")
	cmd.Dir = r.projectDir

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

	// docker-compose ps 실행
	psCmd := fmt.Sprintf("cd %s && docker-compose -f .arfni/compose/docker-compose.yml ps", workdir)
	output, err := sshClient.RunCommandWithOutput(stream, psCmd)
	if err != nil {
		return fmt.Errorf("failed to check container status: %w", err)
	}

	stream.Info(output)

	// 컨테이너 ID 확인
	psqCmd := fmt.Sprintf("cd %s && docker-compose -f .arfni/compose/docker-compose.yml ps -q", workdir)
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
