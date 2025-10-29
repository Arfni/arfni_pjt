package stack

// Stack은 stack.yaml의 최상위 구조체입니다
type Stack struct {
	APIVersion string                 `yaml:"apiVersion"`
	Name       string                 `yaml:"name"`
	Targets    map[string]Target      `yaml:"targets"`
	Services   map[string]Service     `yaml:"services"`
	Secrets    []string               `yaml:"secrets,omitempty"`
	Outputs    map[string]string      `yaml:"outputs,omitempty"`
}

// Target은 배포 대상 (로컬, EC2 등)을 정의합니다
type Target struct {
	Type    string `yaml:"type"`              // docker-desktop, ec2.ssh, k8s 등
	Host    string `yaml:"host,omitempty"`    // EC2 호스트
	User    string `yaml:"user,omitempty"`    // SSH 사용자
	SSHKey  string `yaml:"sshKey,omitempty"`  // SSH 키 경로
	Workdir string `yaml:"workdir,omitempty"` // 작업 디렉토리
	Mode    string `yaml:"mode,omitempty"`    // all-in-one, hybrid 등
}

// Service는 배포할 개별 서비스를 정의합니다
type Service struct {
	Kind      string      `yaml:"kind"`      // docker.container, k8s.pod 등
	Target    string      `yaml:"target"`    // targets에서 정의한 타겟 이름
	Spec      ServiceSpec `yaml:"spec"`
	DependsOn []string    `yaml:"dependsOn,omitempty"`
}

// ServiceSpec은 서비스의 상세 스펙입니다
type ServiceSpec struct {
	Image   string            `yaml:"image,omitempty"`
	Build   string            `yaml:"build,omitempty"`
	Env     map[string]string `yaml:"env,omitempty"`
	Ports   []string          `yaml:"ports,omitempty"`
	Volumes []Volume          `yaml:"volumes,omitempty"`
	Command []string          `yaml:"command,omitempty"`
	Health  *HealthCheck      `yaml:"health,omitempty"`
}

// Volume은 볼륨 마운트를 정의합니다
type Volume struct {
	Host  string `yaml:"host"`
	Mount string `yaml:"mount"`
}

// HealthCheck는 헬스체크 설정입니다
type HealthCheck struct {
	HTTPGet *HTTPGetAction `yaml:"httpGet,omitempty"`
	TCP     *TCPAction     `yaml:"tcp,omitempty"`
}

// HTTPGetAction은 HTTP 헬스체크 설정입니다
type HTTPGetAction struct {
	Path string `yaml:"path"`
	Port int    `yaml:"port"`
}

// TCPAction은 TCP 헬스체크 설정입니다
type TCPAction struct {
	Port int `yaml:"port"`
}
