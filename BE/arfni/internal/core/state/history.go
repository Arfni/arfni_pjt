package state

// GetHistory returns the full deployment history from state storage.
// 배포 이력 조회 — 미구현, Manager.Load()와 연동 필요
func GetHistory() (*History, error) {
	return &History{}, nil
}

// AddToHistory persists a deployment record to history.
// 배포 이력 추가 — 미구현, Manager.Save()와 연동 필요
func AddToHistory(state *DeploymentState) error {
	return nil
}
