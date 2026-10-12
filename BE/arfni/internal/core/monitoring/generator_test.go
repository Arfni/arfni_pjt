package monitoring

import (
	"os"
	"path/filepath"
	"testing"
)

func TestCopyAndUpdateProvisioningFilesFailsWhenDashboardSourceIsMissing(t *testing.T) {
	plugins := t.TempDir()
	datasources := filepath.Join(plugins, "grafana", "provisioning", "datasources")
	if err := os.MkdirAll(datasources, 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(datasources, "datasource.yml"), []byte("apiVersion: 1\n"), 0644); err != nil {
		t.Fatal(err)
	}

	if err := CopyAndUpdateProvisioningFiles(plugins, t.TempDir(), ModeAllInOne); err == nil {
		t.Fatal("missing dashboard provisioning source was accepted")
	}
}
