package workflow

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/arfni/arfni/internal/events"
	"github.com/arfni/arfni/internal/sys"
	"github.com/arfni/arfni/pkg/stack"
)

// Runner는 전체 워크플로우를 조정합니다
type Runner struct {
	stack      *stack.Stack
	projectDir string
	targetType string // "docker-desktop" or "ec2.ssh"
	ec2Target  *stack.Target
}

// NewRunner는 새로운 Runner를 생성합니다
func NewRunner(s *stack.Stack, projectDir string) *Runner {
	targetType, ec2 := getTargetInfo(s)
	return &Runner{
		stack:      s,
		projectDir: projectDir,
		targetType: targetType,
		ec2Target:  ec2,
	}
}

// getTargetInfo는 target 타입과 EC2 target을 반환합니다
func getTargetInfo(s *stack.Stack) (string, *stack.Target) {
	for _, target := range s.Targets {
		if strings.EqualFold(target.Type, "ec2.ssh") {
			return "ec2.ssh", &target
		}
	}
	return "docker-desktop", nil
}

// Execute는 전체 워크플로우를 실행하며 이벤트를 스트리밍합니다
func (r *Runner) Execute(stream *events.Stream) error {
	// 1. Preflight
	stream.Info("Phase 1/5: Preflight checks...")
	if err := r.preflight(stream); err != nil {
		return fmt.Errorf("preflight check failed: %w", err)
	}
	stream.Success("Preflight checks passed")

	// 2. Generate
	stream.Info("Phase 2/5: Generating Docker files...")
	if err := r.generate(stream); err != nil {
		return fmt.Errorf("generate failed: %w", err)
	}
	stream.Success("Docker files generated")

	// 3. Build (target별로 분기)
	stream.Info("Phase 3/5: Building images...")
	if err := r.build(stream); err != nil {
		return fmt.Errorf("build failed: %w", err)
	}
	stream.Success("Images built successfully")

	// 4. Deploy
	stream.Info("Phase 4/5: Deploying containers...")
	if err := r.deploy(stream); err != nil {
		return fmt.Errorf("deploy failed: %w", err)
	}
	stream.Success("Containers deployed")

	// 5. Health check
	stream.Info("Phase 5/5: Health checks...")
	if err := r.healthCheck(stream); err != nil {
		return fmt.Errorf("health check failed: %w", err)
	}
	stream.Success("All services healthy")

	return nil
}

// preflight는 사전 검사를 수행합니다
func (r *Runner) preflight(stream *events.Stream) error {
	// .env 파일 준비 (없으면 secrets를 CHANGE_ME로 채움)
	envPath := filepath.Join(r.projectDir, ".env")
	if _, err := os.Stat(envPath); errors.Is(err, os.ErrNotExist) {
		var content string
		for _, k := range r.stack.Secrets {
			content += fmt.Sprintf("%s=CHANGE_ME\n", k)
		}
		if err := os.WriteFile(envPath, []byte(content), 0600); err != nil {
			return fmt.Errorf("failed to create .env: %w", err)
		}
		stream.Info("Created .env file with placeholder values")
	}

	// Docker 확인
	if r.targetType == "docker-desktop" {
		if _, err := exec.LookPath("docker"); err != nil {
			return fmt.Errorf("docker not found in PATH: %w", err)
		}
		stream.Info("Docker is available")
	}

	// EC2 SSH 확인
	if r.targetType == "ec2.ssh" {
		if _, err := exec.LookPath("ssh"); err != nil {
			return fmt.Errorf("ssh not found in PATH: %w", err)
		}
		if _, err := exec.LookPath("scp"); err != nil {
			return fmt.Errorf("scp not found in PATH: %w", err)
		}
		stream.Info("SSH/SCP are available")
	}

	return nil
}

// generate는 docker-compose.yml과 Dockerfile들을 생성합니다
func (r *Runner) generate(stream *events.Stream) error {
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

// build는 이미지를 빌드합니다
func (r *Runner) build(stream *events.Stream) error {
	if r.targetType == "ec2.ssh" {
		return r.buildEC2(stream)
	}
	return r.buildLocal(stream)
}

// buildLocal은 로컬에서 docker-compose build를 실행합니다
func (r *Runner) buildLocal(stream *events.Stream) error {
	composeDir := filepath.Join(r.projectDir, ".arfni", "compose")
	composeFile := filepath.Join(composeDir, "docker-compose.yml")

	// Check if compose file exists
	if _, err := os.Stat(composeFile); os.IsNotExist(err) {
		return fmt.Errorf("docker-compose.yml not found: %s", composeFile)
	}

	stream.Info("Running docker compose build...")

	ctx := context.Background()

	// Run docker compose build
	if out, err := sys.Run(ctx, "docker", "compose",
		"--project-directory", r.projectDir,
		"-f", composeFile,
		"build"); err != nil {
		return fmt.Errorf("docker compose build failed: %w\n%s", err, out)
	}

	return nil
}

// buildEC2는 EC2에서 이미지를 빌드합니다 (기존 runEC2 로직 사용)
func (r *Runner) buildEC2(stream *events.Stream) error {
	ctx := context.Background()
	ec2 := r.ec2Target

	if ec2.Host == "" || ec2.User == "" || ec2.SSHKey == "" {
		return fmt.Errorf("target(ec2.ssh) requires host/user/sshKey")
	}

	// workdir 설정
	if ec2.Workdir == "" {
		ec2.Workdir = fmt.Sprintf("/home/%s/%s", ec2.User, r.stack.Name)
		stream.Info(fmt.Sprintf("workdir not specified, using: %s", ec2.Workdir))
	}

	// Docker 설치 확인 및 설치
	stream.Info("Checking Docker installation on EC2...")
	if err := r.ec2EnsureDocker(ctx, ec2); err != nil {
		return err
	}

	// 앱 소스 업로드
	stream.Info("Uploading application source code to EC2...")
	if err := r.scpDir(ctx, filepath.Join(r.projectDir, "apps"), ec2, "apps"); err != nil {
		if !errors.Is(err, os.ErrNotExist) {
			return err
		}
		stream.Info("No apps directory found, skipping...")
	} else {
		stream.Success("Application source uploaded successfully!")
	}

	// 이미지 빌드 (각 서비스)
	imageTags := make(map[string]string)
	targetName := r.findTargetName(ec2)

	var servicesToBuild []string
	for svcName, svc := range r.stack.Services {
		if !strings.EqualFold(svc.Target, targetName) {
			continue
		}
		img := strings.TrimSpace(svc.Spec.Image)
		if img != "" {
			imageTags[svcName] = img
			continue
		}
		if svc.Spec.Build != "" {
			servicesToBuild = append(servicesToBuild, svcName)
		}
	}

	if len(servicesToBuild) > 0 {
		stream.Info(fmt.Sprintf("Building %d service(s) on EC2...", len(servicesToBuild)))
		for i, svcName := range servicesToBuild {
			svc := r.stack.Services[svcName]
			tag := fmt.Sprintf("%s:latest", svcName)
			imageTags[svcName] = tag

			stream.Info(fmt.Sprintf("[%d/%d] Building %s...", i+1, len(servicesToBuild), svcName))
			if err := r.remoteBuildImage(ctx, ec2, svc.Spec.Build, svc.Spec.Dockerfile, tag); err != nil {
				return fmt.Errorf("failed to build %s: %w", svcName, err)
			}
			stream.Success(fmt.Sprintf("Built %s successfully", svcName))
		}
	}

	return nil
}

// deploy는 컨테이너를 배포합니다
func (r *Runner) deploy(stream *events.Stream) error {
	if r.targetType == "ec2.ssh" {
		return r.deployEC2(stream)
	}
	return r.deployLocal(stream)
}

// deployLocal은 로컬에서 docker-compose up -d를 실행합니다
func (r *Runner) deployLocal(stream *events.Stream) error {
	composeDir := filepath.Join(r.projectDir, ".arfni", "compose")
	composeFile := filepath.Join(composeDir, "docker-compose.yml")

	stream.Info("Running docker compose up -d...")

	ctx := context.Background()

	// Run docker compose up -d with build
	if out, err := sys.Run(ctx, "docker", "compose",
		"--project-directory", r.projectDir,
		"-f", composeFile,
		"up", "-d", "--build"); err != nil {
		return fmt.Errorf("docker compose up failed: %w\n%s", err, out)
	}

	// 컨테이너 개수 확인
	containerCountOut, _ := sys.Run(ctx, "docker", "compose",
		"--project-directory", r.projectDir,
		"-f", composeFile,
		"ps", "-q")

	containerCount := 0
	if strings.TrimSpace(containerCountOut) != "" {
		containerCount = len(strings.Split(strings.TrimSpace(containerCountOut), "\n"))
	}

	// 엔드포인트 수집
	endpoints := r.extractEndpoints()

	// GUI용 출력 (JSON 형식)
	outputs := map[string]interface{}{
		"status":          "success",
		"service_count":   len(r.stack.Services),
		"container_count": containerCount,
		"compose_dir":     composeDir,
		"endpoints":       endpoints,
	}

	outputJSON, _ := json.Marshal(outputs)
	fmt.Printf("\n__OUTPUTS__%s\n", string(outputJSON))

	stream.Success(fmt.Sprintf("Deployment completed! Services: %d, Containers: %d", len(r.stack.Services), containerCount))

	return nil
}

// deployEC2는 EC2에서 컨테이너를 배포합니다
func (r *Runner) deployEC2(stream *events.Stream) error {
	ctx := context.Background()
	ec2 := r.ec2Target

	// docker-compose.yaml 생성 (EC2용)
	composeYaml := r.generateEC2ComposeYaml()

	// Compose 설정 업로드
	stream.Info("Uploading Docker Compose configuration to EC2...")
	composeRemote := ec2.Workdir + "/docker-compose.yaml"
	if err := r.scpContent(ctx, []byte(composeYaml), ec2, composeRemote); err != nil {
		return fmt.Errorf("failed to upload compose: %w", err)
	}

	// .env 업로드
	envPath := filepath.Join(r.projectDir, ".env")
	if _, err := os.Stat(envPath); err == nil {
		envRemote := ec2.Workdir + "/.env"
		if err := r.scpFile(ctx, envPath, ec2, envRemote); err != nil {
			return fmt.Errorf("failed to upload .env: %w", err)
		}
	}
	stream.Success("Configuration files uploaded successfully!")

	// 볼륨 파일 업로드
	stream.Info("Uploading volume files to EC2...")
	for _, svc := range r.stack.Services {
		for _, vol := range svc.Spec.Volumes {
			localPath := filepath.Join(r.projectDir, vol.Host)
			// Clean vol.Host path (remove ./ prefix)
			cleanPath := strings.TrimPrefix(vol.Host, "./")
			remotePath := ec2.Workdir + "/" + cleanPath

			fi, err := os.Stat(localPath)
			if err != nil {
				stream.Info(fmt.Sprintf("Warning: Volume not found: %s", vol.Host))
				continue
			}

			if fi.IsDir() {
				if err := r.scpDir(ctx, localPath, ec2, cleanPath); err != nil {
					return fmt.Errorf("failed to upload volume dir %s: %w", vol.Host, err)
				}
			} else {
				// Create parent directory on EC2 before uploading file
				// Use path package for Unix paths (not filepath which uses OS separator)
				remoteDir := ec2.Workdir
				if idx := strings.LastIndex(cleanPath, "/"); idx > 0 {
					remoteDir = ec2.Workdir + "/" + cleanPath[:idx]
				}
				mkdirCmd := fmt.Sprintf("mkdir -p %s", remoteDir)
				if _, err := r.sshRun(ctx, ec2, mkdirCmd); err != nil {
					return fmt.Errorf("failed to create remote directory for %s: %w", vol.Host, err)
				}

				if err := r.scpFile(ctx, localPath, ec2, remotePath); err != nil {
					return fmt.Errorf("failed to upload volume file %s: %w", vol.Host, err)
				}
			}
			stream.Info(fmt.Sprintf("Uploaded volume: %s", vol.Host))
		}
	}

	// Docker Compose 실행
	stream.Info("Starting Docker Compose on EC2...")
	cmd := fmt.Sprintf("cd %s && docker compose -f docker-compose.yaml up -d", ec2.Workdir)
	if out, err := r.sshRun(ctx, ec2, cmd); err != nil {
		return fmt.Errorf("docker compose up failed: %w\n%s", err, out)
	}

	// 컨테이너 개수 확인
	cntCmd := fmt.Sprintf("cd %s && docker compose -f docker-compose.yaml ps -q | wc -l", ec2.Workdir)
	containerCountOut, _ := r.sshRun(ctx, ec2, cntCmd)
	containerCountStr := strings.TrimSpace(containerCountOut)
	if containerCountStr == "" {
		containerCountStr = "0"
	}

	containerCount, _ := strconv.Atoi(containerCountStr)

	// 엔드포인트 수집 (EC2는 public IP 사용)
	endpoints := r.extractEndpointsEC2(ec2)

	// GUI용 출력 (JSON 형식)
	outputs := map[string]interface{}{
		"status":          "success",
		"service_count":   len(r.stack.Services),
		"container_count": containerCount,
		"endpoints":       endpoints,
	}

	outputJSON, _ := json.Marshal(outputs)
	fmt.Printf("\n__OUTPUTS__%s\n", string(outputJSON))

	stream.Success(fmt.Sprintf("Deployment completed! Services: %d, Containers: %d", len(r.stack.Services), containerCount))

	return nil
}

// healthCheck는 컨테이너 상태를 확인합니다
func (r *Runner) healthCheck(stream *events.Stream) error {
	if r.targetType == "ec2.ssh" {
		return r.healthCheckEC2(stream)
	}
	return r.healthCheckLocal(stream)
}

// healthCheckLocal은 로컬 컨테이너 상태를 확인합니다
func (r *Runner) healthCheckLocal(stream *events.Stream) error {
	composeDir := filepath.Join(r.projectDir, ".arfni", "compose")
	composeFile := filepath.Join(composeDir, "docker-compose.yml")

	// Wait a bit for containers to start
	time.Sleep(2 * time.Second)

	stream.Info("Checking container status...")

	ctx := context.Background()

	// Check container status
	output, err := sys.Run(ctx, "docker", "compose",
		"--project-directory", r.projectDir,
		"-f", composeFile,
		"ps")
	if err != nil {
		return fmt.Errorf("failed to check container status: %w", err)
	}

	stream.Info(output)

	// Get container count
	output, _ = sys.Run(ctx, "docker", "compose",
		"--project-directory", r.projectDir,
		"-f", composeFile,
		"ps", "-q")

	if strings.TrimSpace(output) == "" {
		return fmt.Errorf("no containers are running")
	}

	containerCount := len(strings.Split(strings.TrimSpace(output), "\n"))
	stream.Info(fmt.Sprintf("Found %d running container(s)", containerCount))

	return nil
}

// healthCheckEC2는 EC2의 컨테이너 상태를 확인합니다
func (r *Runner) healthCheckEC2(stream *events.Stream) error {
	ctx := context.Background()
	ec2 := r.ec2Target

	// Wait a bit for containers to start
	time.Sleep(2 * time.Second)

	stream.Info("Checking container status on EC2...")

	// docker compose ps 실행
	psCmd := fmt.Sprintf("cd %s && docker compose -f docker-compose.yaml ps", ec2.Workdir)
	output, err := r.sshRun(ctx, ec2, psCmd)
	if err != nil {
		return fmt.Errorf("failed to check container status: %w", err)
	}

	stream.Info(output)

	// 컨테이너 ID 확인
	psqCmd := fmt.Sprintf("cd %s && docker compose -f docker-compose.yaml ps -q", ec2.Workdir)
	output, err = r.sshRun(ctx, ec2, psqCmd)
	if err != nil {
		return fmt.Errorf("failed to get container IDs: %w", err)
	}

	if strings.TrimSpace(output) == "" {
		return fmt.Errorf("no containers are running on EC2")
	}

	stream.Success("Found running containers on EC2")

	return nil
}

// Helper functions (from original run.go)

func (r *Runner) findTargetName(want *stack.Target) string {
	for k, v := range r.stack.Targets {
		if want != nil && v.Host == want.Host && v.User == want.User {
			return k
		}
		if strings.EqualFold(v.Type, "ec2.ssh") {
			return k
		}
	}
	return ""
}

func (r *Runner) scpDir(ctx context.Context, localDir string, ec2 *stack.Target, remoteRel string) error {
	fi, err := os.Stat(localDir)
	if err != nil {
		return err
	}
	if !fi.IsDir() {
		return fmt.Errorf("%s is not a directory", localDir)
	}

	remoteDir := ec2.Workdir + "/" + remoteRel
	mkdirCmd := fmt.Sprintf("mkdir -p %s", remoteDir)
	if _, err := r.sshRun(ctx, ec2, mkdirCmd); err != nil {
		return fmt.Errorf("failed to mkdir on remote: %w", err)
	}

	scpCmd := exec.CommandContext(ctx, "scp",
		"-i", ec2.SSHKey,
		"-o", "StrictHostKeyChecking=no",
		"-r",
		localDir,
		fmt.Sprintf("%s@%s:%s", ec2.User, ec2.Host, ec2.Workdir),
	)

	// Windows에서 콘솔 창 숨김
	if runtime.GOOS == "windows" {
		scpCmd.SysProcAttr = &syscall.SysProcAttr{
			HideWindow:    true,
			CreationFlags: 0x08000000, // CREATE_NO_WINDOW
		}
	}

	out, err := scpCmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("scp failed: %w\n%s", err, out)
	}

	return nil
}

func (r *Runner) scpFile(ctx context.Context, localFile string, ec2 *stack.Target, remotePath string) error {
	scpCmd := exec.CommandContext(ctx, "scp",
		"-i", ec2.SSHKey,
		"-o", "StrictHostKeyChecking=no",
		localFile,
		fmt.Sprintf("%s@%s:%s", ec2.User, ec2.Host, remotePath),
	)

	// Windows에서 콘솔 창 숨김
	if runtime.GOOS == "windows" {
		scpCmd.SysProcAttr = &syscall.SysProcAttr{
			HideWindow:    true,
			CreationFlags: 0x08000000, // CREATE_NO_WINDOW
		}
	}

	out, err := scpCmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("scp failed: %w\n%s", err, out)
	}

	return nil
}

func (r *Runner) scpContent(ctx context.Context, content []byte, ec2 *stack.Target, remotePath string) error {
	tmpFile, err := os.CreateTemp("", "arfni-*.tmp")
	if err != nil {
		return err
	}
	defer os.Remove(tmpFile.Name())

	if _, err := tmpFile.Write(content); err != nil {
		return err
	}
	tmpFile.Close()

	return r.scpFile(ctx, tmpFile.Name(), ec2, remotePath)
}

func (r *Runner) sshRun(ctx context.Context, ec2 *stack.Target, cmd string) (string, error) {
	sshCmd := exec.CommandContext(ctx, "ssh",
		"-i", ec2.SSHKey,
		"-o", "StrictHostKeyChecking=no",
		fmt.Sprintf("%s@%s", ec2.User, ec2.Host),
		cmd,
	)

	// Windows에서 콘솔 창 숨김
	if runtime.GOOS == "windows" {
		sshCmd.SysProcAttr = &syscall.SysProcAttr{
			HideWindow:    true,
			CreationFlags: 0x08000000, // CREATE_NO_WINDOW
		}
	}

	out, err := sshCmd.CombinedOutput()
	return string(out), err
}

func (r *Runner) ec2EnsureDocker(ctx context.Context, ec2 *stack.Target) error {
	checkCmd := "command -v docker && docker compose version"
	if out, err := r.sshRun(ctx, ec2, checkCmd); err == nil && strings.Contains(out, "docker") {
		fmt.Println("[INFO] Docker is already installed on EC2")
		return nil
	}

	fmt.Println("[INFO] Docker not found. Installing Docker...")

	// Detect OS and install
	installScript := `
	if command -v yum &> /dev/null; then
		echo "Detected Amazon Linux/CentOS"
		sudo yum update -y
		sudo yum install -y docker
		sudo systemctl start docker
		sudo systemctl enable docker
		sudo usermod -aG docker $USER

		# Install Docker Compose plugin
		sudo mkdir -p /usr/local/lib/docker/cli-plugins
		sudo curl -SL https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64 -o /usr/local/lib/docker/cli-plugins/docker-compose
		sudo chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
	elif command -v apt-get &> /dev/null; then
		echo "Detected Ubuntu/Debian"
		sudo apt-get update
		sudo apt-get install -y docker.io docker-compose-v2
		sudo systemctl start docker
		sudo systemctl enable docker
		sudo usermod -aG docker $USER
	else
		echo "Unsupported OS"
		exit 1
	fi
	`

	if _, err := r.sshRun(ctx, ec2, installScript); err != nil {
		return fmt.Errorf("failed to install Docker: %w", err)
	}

	fmt.Println("[SUCCESS] Docker installed successfully")
	return nil
}

func (r *Runner) remoteBuildImage(ctx context.Context, ec2 *stack.Target, buildPath, dockerfile, tag string) error {
	ctxDir := ec2.Workdir + "/" + buildPath
	dfPath := "Dockerfile"
	if dockerfile != "" {
		dfPath = dockerfile
	}

	fmt.Printf("[INFO] Building Docker image: %s\n", tag)
	fmt.Printf("[INFO] Build context: %s\n", ctxDir)
	fmt.Printf("[INFO] Dockerfile: %s\n", dfPath)

	buildCmd := fmt.Sprintf(
		"cd %s && docker buildx build --load -t %s -f %s .",
		ctxDir, tag, dfPath,
	)

	if out, err := r.sshRun(ctx, ec2, buildCmd); err != nil {
		return fmt.Errorf("buildx build failed: %w\n%s", err, out)
	}

	return nil
}

func (r *Runner) generateEC2ComposeYaml() string {
	var b strings.Builder
	b.WriteString("version: \"3.9\"\n")
	b.WriteString("services:\n")

	targetName := r.findTargetName(r.ec2Target)

	for svcName, svc := range r.stack.Services {
		if !strings.EqualFold(svc.Target, targetName) {
			continue
		}

		b.WriteString(fmt.Sprintf("  %s:\n", svcName))

		// image
		img := strings.TrimSpace(svc.Spec.Image)
		if img == "" && svc.Spec.Build != "" {
			img = fmt.Sprintf("%s:latest", svcName)
		}
		if img != "" {
			b.WriteString(fmt.Sprintf("    image: %s\n", img))
		}

		// env
		if len(svc.Spec.Env) > 0 {
			b.WriteString("    environment:\n")
			for k, v := range svc.Spec.Env {
				b.WriteString(fmt.Sprintf("      %s: %q\n", k, v))
			}
		}

		// ports
		if len(svc.Spec.Ports) > 0 {
			b.WriteString("    ports:\n")
			for _, p := range svc.Spec.Ports {
				b.WriteString(fmt.Sprintf("      - %q\n", p))
			}
		}

		// volumes
		if len(svc.Spec.Volumes) > 0 {
			b.WriteString("    volumes:\n")
			for _, vol := range svc.Spec.Volumes {
				b.WriteString(fmt.Sprintf("      - %q\n", vol.Host+":"+vol.Mount))
			}
		}

		// depends_on
		if len(svc.DependsOn) > 0 {
			b.WriteString("    depends_on:\n")
			for _, dep := range svc.DependsOn {
				b.WriteString("      - " + dep + "\n")
			}
		}
	}

	return b.String()
}

// extractEndpoints는 로컬 배포 시 엔드포인트를 추출합니다
func (r *Runner) extractEndpoints() []map[string]string {
	endpoints := []map[string]string{}

	for serviceName, service := range r.stack.Services {
		// 서비스의 첫 번째 포트를 사용
		port := 8080 // 기본값
		if len(service.Spec.Ports) > 0 {
			// "8080:8080" 형식에서 앞의 포트(호스트 포트) 추출
			portStr := service.Spec.Ports[0]
			if colonIdx := strings.Index(portStr, ":"); colonIdx > 0 {
				// : 앞의 포트 번호 파싱
				hostPort := portStr[:colonIdx]
				fmt.Sscanf(hostPort, "%d", &port)
			} else {
				// : 없으면 전체가 포트 번호
				fmt.Sscanf(portStr, "%d", &port)
			}
		}

		endpoints = append(endpoints, map[string]string{
			"name": serviceName,
			"url":  fmt.Sprintf("http://localhost:%d", port),
			"type": "service",
		})
	}

	return endpoints
}

// extractEndpointsEC2는 EC2 배포 시 엔드포인트를 추출합니다
func (r *Runner) extractEndpointsEC2(ec2 *stack.Target) []map[string]string {
	endpoints := []map[string]string{}

	for serviceName, service := range r.stack.Services {
		// 서비스의 첫 번째 포트를 사용
		port := 8080 // 기본값
		if len(service.Spec.Ports) > 0 {
			// "8080:8080" 형식에서 앞의 포트(호스트 포트) 추출
			portStr := service.Spec.Ports[0]
			if colonIdx := strings.Index(portStr, ":"); colonIdx > 0 {
				// : 앞의 포트 번호 파싱
				hostPort := portStr[:colonIdx]
				fmt.Sscanf(hostPort, "%d", &port)
			} else {
				// : 없으면 전체가 포트 번호
				fmt.Sscanf(portStr, "%d", &port)
			}
		}

		endpoints = append(endpoints, map[string]string{
			"name": serviceName,
			"url":  fmt.Sprintf("http://%s:%d", ec2.Host, port),
			"type": "service",
		})
	}

	return endpoints
}
