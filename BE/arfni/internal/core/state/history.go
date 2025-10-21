package state

// History management for rollback

// GetHistory returns deployment history
func GetHistory() (*History, error) {
	// TODO: 배포 이력 조회
	return &History{}, nil
}

// AddToHistory adds a deployment to history
func AddToHistory(state *DeploymentState) error {
	// TODO: 배포 이력 추가
	return nil
}
