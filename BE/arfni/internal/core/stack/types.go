package stack

// Stack은 stack.yaml의 최상위 구조체입니다
type Stack struct {
	APIVersion string                 `yaml:"apiVersion"`
	Name       string                 `yaml:"name"`
	Metadata   *Metadata              `yaml:"metadata,omitempty"`
	Targets    map[string]Target      `yaml:"targets"`
	Services   map[string]Service     `yaml:"services"`
	Secrets    []string               `yaml:"secrets,omitempty"`
	Outputs    map[string]string      `yaml:"outputs,omitempty"`
}

// Metadata는 stack의 메타데이터입니다
type Metadata struct {
	Monitoring *MonitoringConfig `yaml:"monitoring,omitempty"`
}

// MonitoringConfig는 모니터링 설정입니다
type MonitoringConfig struct {
	Mode string `yaml:"mode,omitempty"` // "local", "hybrid", "all-in-one"
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
	Image       string                 `yaml:"image,omitempty"`
	Build       *BuildSpec             `yaml:"build,omitempty"`
	BuildConfig map[string]interface{} `yaml:"buildConfig,omitempty"` // Dockerfile template variables
	Env         map[string]string      `yaml:"env,omitempty"`
	Ports       []string               `yaml:"ports,omitempty"`
	Volumes     []Volume               `yaml:"volumes,omitempty"`
	Command     []string               `yaml:"command,omitempty"`
	Restart     string                 `yaml:"restart,omitempty"`
	Health      *HealthCheck           `yaml:"health,omitempty"`
}

// BuildSpec은 빌드 설정을 정의합니다 (문자열 또는 객체)
type BuildSpec struct {
	Context    string `yaml:"context,omitempty"`
	Dockerfile string `yaml:"dockerfile,omitempty"`
}

// UnmarshalYAML은 build 필드가 문자열 또는 객체일 수 있도록 처리합니다
func (b *BuildSpec) UnmarshalYAML(unmarshal func(interface{}) error) error {
	// 먼저 문자열로 시도
	var str string
	if err := unmarshal(&str); err == nil {
		b.Context = str
		return nil
	}

	// 객체로 시도
	type buildSpecAlias BuildSpec
	var obj buildSpecAlias
	if err := unmarshal(&obj); err != nil {
		return err
	}
	*b = BuildSpec(obj)
	return nil
}

// GetContext는 빌드 컨텍스트 경로를 반환합니다
func (b *BuildSpec) GetContext() string {
	if b.Context != "" {
		return b.Context
	}
	return "."
}

// GetDockerfile은 Dockerfile 경로를 반환합니다
func (b *BuildSpec) GetDockerfile() string {
	if b.Dockerfile != "" {
		return b.Dockerfile
	}
	return "Dockerfile"
}

// IsEmpty는 BuildSpec이 비어있는지 확인합니다
func (b *BuildSpec) IsEmpty() bool {
	return b == nil || (b.Context == "" && b.Dockerfile == "")
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
