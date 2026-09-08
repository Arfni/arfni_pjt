package workflow

import (
	"os"
	"path/filepath"
	"testing"
)

// .arfni는 arfni 내부 상태 디렉토리다(잠금 파일·캔버스 상태·생성된 compose).
// GUI가 .arfni/.lock을 배타적으로 열어 두므로 Windows에서 이 디렉토리가 빌드
// 컨텍스트에 포함되면 scp가 "Broken pipe"로 실패한다. 사용자의 .arfniignore에
// 적혀 있든 없든 항상 제외되어야 한다.
func TestArfniIgnore_AlwaysSkipsArfniStateDir(t *testing.T) {
	t.Run("without .arfniignore (default patterns)", func(t *testing.T) {
		dir := t.TempDir()
		ai, err := LoadArfniIgnore(dir)
		if err != nil {
			t.Fatalf("LoadArfniIgnore: %v", err)
		}
		if !ai.ShouldIgnore(filepath.Join(dir, ".arfni")) {
			t.Fatal(".arfni should be ignored by default patterns")
		}
	})

	t.Run("with a user .arfniignore that does not list .arfni", func(t *testing.T) {
		dir := t.TempDir()
		content := "# user file\nnode_modules/\n"
		if err := os.WriteFile(filepath.Join(dir, ".arfniignore"), []byte(content), 0o644); err != nil {
			t.Fatal(err)
		}
		ai, err := LoadArfniIgnore(dir)
		if err != nil {
			t.Fatalf("LoadArfniIgnore: %v", err)
		}
		if !ai.ShouldIgnore(filepath.Join(dir, ".arfni")) {
			t.Fatal(".arfni must be ignored even when the user's .arfniignore omits it")
		}
		if !ai.ShouldIgnore(filepath.Join(dir, "node_modules")) {
			t.Fatal("user patterns must still apply")
		}
		if ai.ShouldIgnore(filepath.Join(dir, "app")) {
			t.Fatal("unrelated directories must not be ignored")
		}
	})
}
