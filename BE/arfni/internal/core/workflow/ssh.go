package workflow

import (
	"fmt"
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
	target     stack.Target
	projectDir string
}

// NewSSHClient는 새로운 SSH 클라이언트를 생성합니다
func NewSSHClient(target stack.Target, projectDir string) *SSHClient {
	return &SSHClient{
		target:     target,
		projectDir: projectDir,
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
		"-r", // 디렉토리도 전송 가능
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

	// scp -r source target을 하면 target/source가 되므로
	// 상위 디렉토리를 만들고 상위 디렉토리로 전송
	parentDir := filepath.Dir(remoteDir)

	// 상위 디렉토리 생성
	if err := c.RunCommand(stream, fmt.Sprintf("mkdir -p %s", parentDir)); err != nil {
		return fmt.Errorf("failed to create remote directory: %w", err)
	}

	// SCP로 디렉토리 전송 (상위 디렉토리로)
	return c.UploadFile(stream, localDir, parentDir)
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
