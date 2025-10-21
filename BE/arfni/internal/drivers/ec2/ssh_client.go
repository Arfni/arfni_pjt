package ec2

// SSHClient manages SSH connections

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
