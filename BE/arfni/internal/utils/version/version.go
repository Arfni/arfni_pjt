package version

// These variables are set at build time via -ldflags
var (
	Version   = "dev"
	GitCommit = "unknown"
	BuildDate = "unknown"
)

// GetVersion returns the current version information
func GetVersion() string {
	return Version
}

// GetFullVersion returns full version information
func GetFullVersion() string {
	return "arfni version " + Version + " (commit: " + GitCommit + ", built: " + BuildDate + ")"
}
