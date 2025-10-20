package runner

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"ic.local/ic/internal/generator"
	"ic.local/ic/internal/sys"
	"ic.local/ic/pkg/stack"
)

// 간단 헬퍼: ec2.ssh 타깃 존재 여부와 세부정보를 찾습니다.
func resolveEC2Target(st *stack.Stack) (name string, t *stack.Target, ok bool) {
	for k, v := range st.Targets {
		// v 는 struct 값이므로 nil 비교가 아니라 Type만 체크
		if strings.EqualFold(v.Type, "ec2.ssh") {
			// &v 를 바로 반환하면 루프 변수 주소 문제가 있을 수 있어
			// 한 번 복사한 뒤 주소를 반환합니다.
			vv := v
			return k, &vv, true
		}
	}
	return "", nil, false
}
func Run(ctx context.Context, st *stack.Stack, stackDir, outDir string) error {
	// .env 생성(없으면 secrets 키만 CHANGE_ME로 채움)
	envPath := filepath.Join(stackDir, ".env")
	if _, err := os.Stat(envPath); errors.Is(err, os.ErrNotExist) {
		var b []byte
		for _, k := range st.Secrets {
			b = append(b, []byte(fmt.Sprintf("%s=CHANGE_ME\n", k))...)
		}
		_ = os.WriteFile(envPath, b, 0o600)
	}

	// compose 파일 생성 (항상 로컬에 생성)
	composePath, err := generator.GenerateCompose(st, stackDir, outDir)
	if err != nil {
		return fmt.Errorf("generate compose: %w", err)
	}

	// ec2.ssh 타깃이 있으면 원격 경로로 수행
	tgtName, ec2, hasEC2 := resolveEC2Target(st)
	if hasEC2 {
		if ec2.Host == "" || ec2.User == "" || ec2.SSHKey == "" || ec2.Workdir == "" {
			return fmt.Errorf("target %q (ec2.ssh) requires host/user/sshKey/workdir", tgtName)
		}

		// ssh/scp 존재 확인
		if _, err := sys.Run(ctx, "ssh", "-V"); err != nil {
			return fmt.Errorf("ssh not available: %w", err)
		}
		if _, err := sys.Run(ctx, "scp", "-V"); err != nil {
			return fmt.Errorf("scp not available: %w", err)
		}

		// 1) 원격에 Docker 없으면 설치 + workdir 준비
		prepare := `
set -e
if ! command -v docker >/dev/null 2>&1; then
  echo "[ic] installing docker..."
  curl -fsSL https://get.docker.com | sh
  sudo systemctl enable --now docker
  sudo usermod -aG docker $USER || true
fi
mkdir -p "` + ec2.Workdir + `/.infracanvas/compose"
echo "[ic] remote ready at ` + ec2.Workdir + `"
`
		if out, err := sys.Run(ctx,
			"ssh", "-o", "StrictHostKeyChecking=no",
			"-i", ec2.SSHKey, ec2.User+"@"+ec2.Host,
			"bash", "-lc", prepare,
		); err != nil {
			return fmt.Errorf("prepare ec2: %w\n%s", err, out)
		}

		// 2) 애플리케이션 소스 동기화(간단 버전)
		//    - 최소한 ./apps 는 보내줍니다. (build 컨텍스트로 사용)
		//      필요시 여기서 rsync/tar 방식으로 최적화 가능.
		appsDir := filepath.Join(stackDir, "apps")
		if fi, err := os.Stat(appsDir); err == nil && fi.IsDir() {
			if out, err := sys.Run(ctx,
				"scp", "-o", "StrictHostKeyChecking=no",
				"-i", ec2.SSHKey, "-r", appsDir,
				ec2.User+"@"+ec2.Host+":"+filepath.ToSlash(filepath.Join(ec2.Workdir, "apps")),
			); err != nil {
				return fmt.Errorf("scp apps: %w\n%s", err, out)
			}
		}

		// 3) compose와 .env를 원격에 업로드
		if out, err := sys.Run(ctx,
			"scp", "-o", "StrictHostKeyChecking=no",
			"-i", ec2.SSHKey, composePath,
			ec2.User+"@"+ec2.Host+":"+filepath.ToSlash(filepath.Join(ec2.Workdir, ".infracanvas/compose/docker-compose.yaml")),
		); err != nil {
			return fmt.Errorf("scp compose: %w\n%s", err, out)
		}
		if out, err := sys.Run(ctx,
			"scp", "-o", "StrictHostKeyChecking=no",
			"-i", ec2.SSHKey, envPath,
			ec2.User+"@"+ec2.Host+":"+filepath.ToSlash(filepath.Join(ec2.Workdir, ".env")),
		); err != nil {
			return fmt.Errorf("scp env: %w\n%s", err, out)
		}

		// 4) 원격에서 compose up -d --build
		if out, err := sys.Run(ctx,
			"ssh", "-o", "StrictHostKeyChecking=no",
			"-i", ec2.SSHKey, ec2.User+"@"+ec2.Host,
			"docker", "compose",
			"-f", filepath.ToSlash(filepath.Join(ec2.Workdir, ".infracanvas/compose/docker-compose.yaml")),
			"--env-file", filepath.ToSlash(filepath.Join(ec2.Workdir, ".env")),
			"up", "-d", "--build",
		); err != nil {
			return fmt.Errorf("remote compose up: %w\n%s", err, out)
		}

		// (선택) 간단 헬스 확인은 여기서 추가 가능
		// ex) curl http://localhost:8080/health 등

		return nil
	}

	// ---- 로컬 경로 (기존 동작 그대로) ----
	if _, err := sys.Run(ctx, "docker", "version"); err != nil {
		return fmt.Errorf("docker not available: %w", err)
	}
	if _, err := sys.Run(ctx, "docker", "compose", "version"); err != nil {
		return fmt.Errorf("docker compose not available: %w", err)
	}
	if out, err := sys.Run(ctx, "docker", "compose",
		"-f", composePath, "--env-file", envPath, "up", "-d", "--build"); err != nil {
		return fmt.Errorf("docker compose up: %w\n%s", err, out)
	}
	return nil
}
