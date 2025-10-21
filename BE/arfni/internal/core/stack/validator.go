package stack

import (
	"fmt"
)

// Validate는 Stack의 유효성을 검증합니다
func Validate(stack *Stack) error {
	if stack == nil {
		return fmt.Errorf("stack is nil")
	}

	// API 버전 확인
	if stack.APIVersion == "" {
		return fmt.Errorf("apiVersion is required")
	}

	// 이름 확인
	if stack.Name == "" {
		return fmt.Errorf("name is required")
	}

	// 타겟 확인
	if len(stack.Targets) == 0 {
		return fmt.Errorf("at least one target is required")
	}

	// 서비스 확인
	if len(stack.Services) == 0 {
		return fmt.Errorf("at least one service is required")
	}

	// 각 서비스의 타겟이 정의되어 있는지 확인
	for serviceName, service := range stack.Services {
		if _, exists := stack.Targets[service.Target]; !exists {
			return fmt.Errorf("service '%s' references undefined target '%s'", serviceName, service.Target)
		}

		// 이미지 또는 빌드 경로 필수
		if service.Spec.Image == "" && service.Spec.Build == "" {
			return fmt.Errorf("service '%s' must have either 'image' or 'build'", serviceName)
		}
	}

	// DependsOn 검증
	for serviceName, service := range stack.Services {
		for _, dep := range service.DependsOn {
			if _, exists := stack.Services[dep]; !exists {
				return fmt.Errorf("service '%s' depends on undefined service '%s'", serviceName, dep)
			}
		}
	}

	return nil
}
