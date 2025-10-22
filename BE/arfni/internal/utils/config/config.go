package config

// Config holds application configuration
type Config struct {
	LogLevel string
	StateDir string
	Verbose  bool
}

// Load loads configuration from file
func Load(path string) (*Config, error) {
	// TODO: viper를 사용한 설정 로드
	return &Config{
		LogLevel: "info",
		StateDir: ".arfni",
		Verbose:  false,
	}, nil
}

// Save saves configuration to file
func Save(config *Config, path string) error {
	// TODO: 설정 파일 저장
	return nil
}
