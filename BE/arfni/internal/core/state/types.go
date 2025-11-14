package state

import "time"

// DeploymentState는 배포 상태를 나타냅니다
type DeploymentState struct {
	ID          string                 `json:"id"`
	StackName   string                 `json:"stackName"`
	CreatedAt   time.Time              `json:"createdAt"`
	UpdatedAt   time.Time              `json:"updatedAt"`
	Status      string                 `json:"status"` // deployed, failed, destroyed
	Services    map[string]ServiceState `json:"services"`
	Metadata    map[string]string      `json:"metadata,omitempty"`
}

// ServiceState는 개별 서비스 상태입니다
type ServiceState struct {
	Name       string    `json:"name"`
	Status     string    `json:"status"`
	ContainerID string    `json:"containerID,omitempty"`
	ImageID    string    `json:"imageID,omitempty"`
	StartedAt  time.Time `json:"startedAt,omitempty"`
}

// History는 배포 이력을 나타냅니다
type History struct {
	Deployments []DeploymentState `json:"deployments"`
}
