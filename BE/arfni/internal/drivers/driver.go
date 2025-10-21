package drivers

import (
	"context"
	"io"
)

// Driver는 배포 드라이버의 공통 인터페이스입니다
type Driver interface {
	// Validate checks if the driver can run in current environment
	Validate(ctx context.Context) error

	// Deploy deploys services
	Deploy(ctx context.Context, compose []byte) error

	// Destroy removes deployed services
	Destroy(ctx context.Context) error

	// GetLogs returns logs from a service
	GetLogs(ctx context.Context, service string) (io.ReadCloser, error)

	// GetStatus returns the current deployment status
	GetStatus(ctx context.Context) (map[string]string, error)
}
