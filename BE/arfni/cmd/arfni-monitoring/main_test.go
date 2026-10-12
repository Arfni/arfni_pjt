package main

import "testing"

func TestMonitoringRuntimeDirOverride(t *testing.T) {
	t.Setenv("ARFNI_MONITORING_RUNTIME_DIR", "/project/.arfni/monitoring")
	dir, removeOnExit := monitoringRuntimeDir("/tmp/arfni-monitoring-default")
	if dir != "/project/.arfni/monitoring" || removeOnExit {
		t.Fatalf("runtime dir = %q, remove on exit = %v", dir, removeOnExit)
	}
}

func TestMonitoringRuntimeDirDefault(t *testing.T) {
	t.Setenv("ARFNI_MONITORING_RUNTIME_DIR", "")
	dir, removeOnExit := monitoringRuntimeDir("/tmp/arfni-monitoring-default")
	if dir != "/tmp/arfni-monitoring-default" || !removeOnExit {
		t.Fatalf("runtime dir = %q, remove on exit = %v", dir, removeOnExit)
	}
}
