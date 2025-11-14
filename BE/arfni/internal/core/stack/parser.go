package stack

import (
	"fmt"
	"os"

	"gopkg.in/yaml.v3"
)

// Parse는 stack.yaml 파일을 파싱하여 Stack 구조체로 변환합니다
func Parse(filepath string) (*Stack, error) {
	data, err := os.ReadFile(filepath)
	if err != nil {
		return nil, fmt.Errorf("failed to read stack file: %w", err)
	}

	var stack Stack
	if err := yaml.Unmarshal(data, &stack); err != nil {
		return nil, fmt.Errorf("failed to parse stack YAML: %w", err)
	}

	return &stack, nil
}

// ParseFile은 Parse의 별칭입니다 (호환성)
func ParseFile(filepath string) (*Stack, error) {
	return Parse(filepath)
}

// ParseBytes는 바이트 데이터를 파싱하여 Stack 구조체로 변환합니다
func ParseBytes(data []byte) (*Stack, error) {
	var stack Stack
	if err := yaml.Unmarshal(data, &stack); err != nil {
		return nil, fmt.Errorf("failed to parse stack YAML: %w", err)
	}

	return &stack, nil
}
