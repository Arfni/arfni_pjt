package ec2

import (
	"context"
	"io"
)

// Driver는 EC2 SSH 드라이버입니다
type Driver struct {
	host    string
	user    string
	keyPath string
	workdir string
}

// NewDriver creates a new EC2 SSH driver
func NewDriver(host, user, keyPath, workdir string) *Driver {
	return &Driver{
		host:    host,
		user:    user,
		keyPath: keyPath,
		workdir: workdir,
	}
}

// Validate checks SSH connection
func (d *Driver) Validate(ctx context.Context) error {
	// TODO: SSH 연결 테스트
	return nil
}

// Deploy deploys to EC2 via SSH
func (d *Driver) Deploy(ctx context.Context, compose []byte) error {
	// TODO: 파일 전송 및 원격 docker-compose up
	return nil
}

// Destroy removes containers from EC2
func (d *Driver) Destroy(ctx context.Context) error {
	// TODO: 원격 docker-compose down
	return nil
}

// GetLogs returns logs from EC2
func (d *Driver) GetLogs(ctx context.Context, service string) (io.ReadCloser, error) {
	// TODO: SSH로 원격 로그 조회
	return nil, nil
}

// GetStatus returns status from EC2
func (d *Driver) GetStatus(ctx context.Context) (map[string]string, error) {
	// TODO: SSH로 원격 상태 조회
	return nil, nil
}
