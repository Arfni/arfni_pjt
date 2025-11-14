package workflow

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"syscall"

	"github.com/arfni/arfni/internal/core/stack"
	"github.com/arfni/arfni/internal/events"
)

// SSHClient는 EC2 SSH 연결을 관리합니다
type SSHClient struct {
	target       stack.Target
	projectDir   string
	arfniIgnore  *ArfniIgnore
}

// NewSSHClient는 새로운 SSH 클라이언트를 생성합니다
func NewSSHClient(target stack.Target, projectDir string) *SSHClient {
	// Load .arfniignore file (creates default if not exists)
	arfniIgnore, err := LoadArfniIgnore(projectDir)
	if err != nil {
		// If loading fails, use nil and fall back to default patterns
		arfniIgnore = nil
	}

	return &SSHClient{
		target:       target,
		projectDir:   projectDir,
		arfniIgnore:  arfniIgnore,
	}
}

// UploadFile은 로컬 파일을 EC2로 SCP 전송합니다
func (c *SSHClient) UploadFile(stream *events.Stream, localPath, remotePath string) error {
	stream.Info(fmt.Sprintf("Uploading %s to %s:%s", localPath, c.target.Host, remotePath))

	// SCP 명령 구성: scp -i key local remote
	args := []string{
		"-i", c.target.SSHKey,
		"-o", "StrictHostKeyChecking=no",
		"-o", "LogLevel=ERROR", // 불필요한 출력 숨김
		localPath,
		fmt.Sprintf("%s@%s:%s", c.target.User, c.target.Host, remotePath),
	}

	cmd := exec.Command("scp", args...)

	// Windows에서 콘솔 창 숨김 (더 강력한 설정)
	if runtime.GOOS == "windows" {
		cmd.SysProcAttr = &syscall.SysProcAttr{
			HideWindow:    true,
			CreationFlags: 0x08000000 | 0x00000200, // CREATE_NO_WINDOW | CREATE_NEW_PROCESS_GROUP
		}
	}

	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("scp failed: %w\nOutput: %s", err, string(output))
	}

	stream.Success(fmt.Sprintf("Uploaded %s", filepath.Base(localPath)))
	return nil
}

// UploadDirectory는 로컬 디렉토리 전체를 EC2로 전송합니다
func (c *SSHClient) UploadDirectory(stream *events.Stream, localDir, remoteDir string) error {
	stream.Info(fmt.Sprintf("Uploading directory %s to %s:%s", localDir, c.target.Host, remoteDir))

	// 원격 디렉토리 생성
	if err := c.RunCommand(stream, fmt.Sprintf("mkdir -p %s", remoteDir)); err != nil {
		return fmt.Errorf("failed to create remote directory: %w", err)
	}

	// 로컬 디렉토리 내 모든 항목 찾기
	entries, err := os.ReadDir(localDir)
	if err != nil {
		return fmt.Errorf("failed to read local directory: %w", err)
	}

	// 각 항목을 개별적으로 업로드
	for _, entry := range entries {
		localPath := filepath.Join(localDir, entry.Name())

		// .arfniignore 패턴에 매칭되는 항목은 건너뛰기
		if c.arfniIgnore != nil && c.arfniIgnore.ShouldIgnore(localPath) {
			stream.Info(fmt.Sprintf("Skipping ignored item: %s", entry.Name()))
			continue
		}

		args := []string{
			"-i", c.target.SSHKey,
			"-o", "StrictHostKeyChecking=no",
			"-o", "LogLevel=ERROR",
			"-r", // 디렉토리도 지원
			localPath,
			fmt.Sprintf("%s@%s:%s", c.target.User, c.target.Host, remoteDir),
		}

		cmd := exec.Command("scp", args...)

		// Windows에서 콘솔 창 숨김
		if runtime.GOOS == "windows" {
			cmd.SysProcAttr = &syscall.SysProcAttr{
				HideWindow:    true,
				CreationFlags: 0x08000000 | 0x00000200,
			}
		}

		output, err := cmd.CombinedOutput()
		if err != nil {
			return fmt.Errorf("scp failed for %s: %w\nOutput: %s", entry.Name(), err, string(output))
		}
	}

	stream.Success(fmt.Sprintf("Uploaded directory %s", filepath.Base(localDir)))
	return nil
}

// RunCommand는 EC2에서 SSH 명령을 실행합니다
func (c *SSHClient) RunCommand(stream *events.Stream, command string) error {
	stream.Info(fmt.Sprintf("Running: %s", command))

	// SSH 명령 구성: ssh -i key user@host "command"
	args := []string{
		"-i", c.target.SSHKey,
		"-o", "StrictHostKeyChecking=no",
		"-o", "BatchMode=yes", // 인터랙티브 프롬프트 비활성화
		"-o", "LogLevel=ERROR", // 불필요한 출력 숨김
		fmt.Sprintf("%s@%s", c.target.User, c.target.Host),
		command,
	}

	cmd := exec.Command("ssh", args...)

	// Windows에서 콘솔 창 숨김 (더 강력한 설정)
	if runtime.GOOS == "windows" {
		cmd.SysProcAttr = &syscall.SysProcAttr{
			HideWindow:    true,
			CreationFlags: 0x08000000 | 0x00000200, // CREATE_NO_WINDOW | CREATE_NEW_PROCESS_GROUP
		}
	}

	output, err := cmd.CombinedOutput()

	// 출력이 있으면 표시
	if len(output) > 0 {
		lines := strings.Split(string(output), "\n")
		for _, line := range lines {
			if line != "" {
				stream.Info(fmt.Sprintf("[ssh] %s", line))
			}
		}
	}

	if err != nil {
		return fmt.Errorf("ssh command failed: %w", err)
	}

	return nil
}

// RunCommandWithOutput은 SSH 명령을 실행하고 출력을 반환합니다
func (c *SSHClient) RunCommandWithOutput(stream *events.Stream, command string) (string, error) {
	stream.Info(fmt.Sprintf("Running: %s", command))

	args := []string{
		"-i", c.target.SSHKey,
		"-o", "StrictHostKeyChecking=no",
		"-o", "BatchMode=yes", // 인터랙티브 프롬프트 비활성화
		"-o", "LogLevel=ERROR", // 불필요한 출력 숨김
		fmt.Sprintf("%s@%s", c.target.User, c.target.Host),
		command,
	}

	cmd := exec.Command("ssh", args...)

	// Windows에서 콘솔 창 숨김 (더 강력한 설정)
	if runtime.GOOS == "windows" {
		cmd.SysProcAttr = &syscall.SysProcAttr{
			HideWindow:    true,
			CreationFlags: 0x08000000 | 0x00000200, // CREATE_NO_WINDOW | CREATE_NEW_PROCESS_GROUP
		}
	}

	output, err := cmd.CombinedOutput()
	if err != nil {
		return "", fmt.Errorf("ssh command failed: %w\nOutput: %s", err, string(output))
	}

	return string(output), nil
}

// CheckDockerInstalled는 EC2에 Docker가 설치되어 있는지 확인하고, 없으면 자동으로 설치합니다
func (c *SSHClient) CheckDockerInstalled(stream *events.Stream) error {
	stream.Info("Checking Docker installation on EC2...")

	// Docker 확인 (docker compose v2 플러그인 확인)
	checkCmd := "command -v docker && docker compose version"
	output, err := c.RunCommandWithOutput(stream, checkCmd)

	if err == nil && strings.Contains(output, "docker") {
		stream.Success("Docker is already installed on EC2")
		return nil
	}

	// Docker가 없으면 자동 설치
	stream.Info("Docker not found. Installing Docker...")

	installScript := `bash -c '
if command -v yum &> /dev/null; then
	echo "Detected Amazon Linux/CentOS"
	sudo yum update -y
	sudo yum install -y docker
	sudo yum update docker -y
	sudo systemctl start docker
	sudo systemctl enable docker
	sudo usermod -aG docker $USER
	sudo mkdir -p /usr/local/lib/docker/cli-plugins
	# Install Docker Compose
	sudo curl -SL https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64 -o /usr/local/lib/docker/cli-plugins/docker-compose
	sudo chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
	# Install Docker Buildx (v0.17.1+)
	sudo curl -SL https://github.com/docker/buildx/releases/download/v0.17.1/buildx-v0.17.1.linux-amd64 -o /usr/local/lib/docker/cli-plugins/docker-buildx
	sudo chmod +x /usr/local/lib/docker/cli-plugins/docker-buildx
elif command -v apt-get &> /dev/null; then
	echo "Detected Ubuntu/Debian"
	sudo apt-get update
	sudo apt-get install -y docker.io docker-compose-v2
	sudo apt-get upgrade -y docker.io
	sudo systemctl start docker
	sudo systemctl enable docker
	sudo usermod -aG docker $USER
	sudo mkdir -p /usr/local/lib/docker/cli-plugins
	# Install Docker Buildx (v0.17.1+)
	sudo curl -SL https://github.com/docker/buildx/releases/download/v0.17.1/buildx-v0.17.1.linux-amd64 -o /usr/local/lib/docker/cli-plugins/docker-buildx
	sudo chmod +x /usr/local/lib/docker/cli-plugins/docker-buildx
else
	echo "Unsupported OS"
	exit 1
fi
'`

	if err := c.RunCommand(stream, installScript); err != nil {
		return fmt.Errorf("failed to install Docker: %w", err)
	}

	stream.Success("Docker installed successfully")
	return nil
}

// PrepareWorkdir는 EC2에 작업 디렉토리를 준비합니다
func (c *SSHClient) PrepareWorkdir(stream *events.Stream) error {
	workdir := c.target.Workdir
	if workdir == "" {
		workdir = "/home/" + c.target.User + "/arfni-deploy"
	}

	stream.Info(fmt.Sprintf("Preparing workdir: %s", workdir))

	// 작업 디렉토리 생성
	if err := c.RunCommand(stream, fmt.Sprintf("mkdir -p %s", workdir)); err != nil {
		return fmt.Errorf("failed to create workdir: %w", err)
	}

	return nil
}

// GetWorkdir는 작업 디렉토리 경로를 반환합니다
func (c *SSHClient) GetWorkdir() string {
	if c.target.Workdir != "" {
		return c.target.Workdir
	}
	return "/home/" + c.target.User + "/arfni-deploy"
}
