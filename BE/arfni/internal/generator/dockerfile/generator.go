package dockerfile

// Generate creates Dockerfile for a given language
func Generate(language, appPath string) (string, error) {
	// TODO: 언어별 Dockerfile 자동 생성
	// - Java: Gradle/Maven 감지
	// - Node.js: package.json 분석
	// - Python: requirements.txt 분석

	dockerfile := `# Auto-generated Dockerfile
FROM scratch
# TODO: Generate based on language
`
	return dockerfile, nil
}

// DetectLanguage detects the programming language from source code
func DetectLanguage(appPath string) (string, error) {
	// TODO: 소스 코드에서 언어 감지
	// - package.json -> nodejs
	// - requirements.txt -> python
	// - pom.xml/build.gradle -> java
	return "unknown", nil
}
