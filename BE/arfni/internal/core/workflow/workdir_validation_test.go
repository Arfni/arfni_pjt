package workflow

import "testing"

func TestValidateWorkdirRejectsShellSyntax(t *testing.T) {
	for _, workdir := range []string{
		"/srv/app'foo",
		"/srv/app\"foo",
		"/srv/app name",
		"/srv/app\\foo",
		"/srv/app*",
	} {
		if err := validateWorkdir(workdir); err == nil {
			t.Errorf("unsafe workdir %q was accepted", workdir)
		}
	}
}
