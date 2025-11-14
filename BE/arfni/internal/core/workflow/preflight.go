package workflow

import "context"

// Preflight checks system requirements before deployment
func Preflight(ctx context.Context) error {
	// TODO: Docker 설치 확인
	// TODO: 포트 충돌 확인
	// TODO: 권한 확인
	return nil
}
