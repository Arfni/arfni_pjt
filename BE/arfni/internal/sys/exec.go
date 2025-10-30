package sys

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"os"
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

// RunWithLiveOutput runs a command and streams output to stdout in real-time
// while also capturing it for return value
func RunWithLiveOutput(ctx context.Context, name string, args ...string) (string, error) {
	cmd := exec.CommandContext(ctx, name, args...)

	var outBuf bytes.Buffer

	// Create multi-writers to both capture and display output
	stdout := io.MultiWriter(os.Stdout, &outBuf)
	stderr := io.MultiWriter(os.Stderr, &outBuf)

	cmd.Stdout = stdout
	cmd.Stderr = stderr

	err := cmd.Run()
	if err != nil {
		return outBuf.String(), fmt.Errorf("%w", err)
	}
	return outBuf.String(), nil
}
