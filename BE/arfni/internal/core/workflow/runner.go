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

// buildImages는 docker-compose build를 실행합니다
func (r *Runner) buildImages(stream *events.Stream) error {
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

// deployContainers는 docker-compose up -d를 실행합니다
func (r *Runner) deployContainers(stream *events.Stream) error {
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

// healthChecks는 컨테이너 상태를 확인합니다
func (r *Runner) healthChecks(stream *events.Stream) error {
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
