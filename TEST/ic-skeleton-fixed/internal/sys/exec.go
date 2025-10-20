package sys

import (
	"bytes"
	"context"
	"fmt"
	"os/exec"
)

func Run(ctx context.Context, name string, args ...string) (string, error) {
	cmd := exec.CommandContext(ctx, name, args...)
	var out bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = &out
	err := cmd.Run()
	if err != nil {
		return out.String(), fmt.Errorf("%w\n%s", err, out.String())
	}
	return out.String(), nil
}
