package ec2

import (
	"fmt"
	"os"
	"time"

	"golang.org/x/crypto/ssh"
)

// SSHClient manages SSH connections

// createSSHClientFromKeyPath SSH 키 파일로 클라이언트 생성
func createSSHClientFromKeyPath(host, user, keyPath string) (*ssh.Client, error) {
	// SSH 키 파일 읽기
	key, err := os.ReadFile(keyPath)
	if err != nil {
		return nil, fmt.Errorf("SSH 키 파일 읽기 실패: %w", err)
	}

	// Private Key 파싱
	signer, err := ssh.ParsePrivateKey(key)
	if err != nil {
		return nil, fmt.Errorf("SSH 키 파싱 실패: %w", err)
	}

	// SSH 클라이언트 설정
	config := &ssh.ClientConfig{
		User: user,
		Auth: []ssh.AuthMethod{
			ssh.PublicKeys(signer),
		},
		HostKeyCallback: ssh.InsecureIgnoreHostKey(), // TODO: 프로덕션에서는 검증 추가
		Timeout:         10 * time.Second,
	}

	// SSH 연결
	addr := fmt.Sprintf("%s:22", host)
	client, err := ssh.Dial("tcp", addr, config)
	if err != nil {
		return nil, fmt.Errorf("SSH 연결 실패: %w", err)
	}

	return client, nil
}

// Connect establishes SSH connection
func Connect(host, user, keyPath string) error {
	// TODO: SSH 연결 구현
	return nil
}

// ExecuteCommand runs a command via SSH
func ExecuteCommand(command string) (string, error) {
	// TODO: 원격 명령 실행
	return "", nil
}

// Close closes SSH connection
func Close() error {
	// TODO: 연결 종료
	return nil
}
