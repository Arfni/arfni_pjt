package sys

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"os"
	"os/exec"
	"runtime"
	"syscall"
)

func Run(ctx context.Context, name string, args ...string) (string, error) {
	cmd := exec.CommandContext(ctx, name, args...)
	var out bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = &out

	// Windows에서 콘솔 창 숨김 처리
	if runtime.GOOS == "windows" {
		cmd.SysProcAttr = &syscall.SysProcAttr{
			HideWindow:    true,
			CreationFlags: 0x08000000 | 0x00000200, // CREATE_NO_WINDOW | CREATE_NEW_PROCESS_GROUP
		}
	}

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

	// Windows에서 콘솔 창 숨김 처리
	if runtime.GOOS == "windows" {
		cmd.SysProcAttr = &syscall.SysProcAttr{
			HideWindow:    true,
			CreationFlags: 0x08000000 | 0x00000200, // CREATE_NO_WINDOW | CREATE_NEW_PROCESS_GROUP
		}
	}

	err := cmd.Run()
	if err != nil {
		return outBuf.String(), fmt.Errorf("%w", err)
	}
	return outBuf.String(), nil
}
