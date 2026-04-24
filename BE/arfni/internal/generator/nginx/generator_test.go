package nginx

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/arfni/arfni/internal/core/stack"
)

// ── 목 데이터 헬퍼 ────────────────────────────────────────────────────────────

func mockStack(cfg *stack.NginxConfig) *stack.Stack {
	return &stack.Stack{
		APIVersion: "v0.1",
		Name:       "test-app",
		Targets: map[string]stack.Target{
			"local": {Type: "docker-desktop"},
		},
		Services: map[string]stack.Service{
			"nginx": {
				Kind:   "proxy.nginx",
				Target: "local",
				Spec: stack.ServiceSpec{
					Image: "nginx:alpine",
					Ports: []string{"80:80"},
					Nginx: cfg,
				},
			},
			"fastapi": {
				Kind:   "app.fastapi",
				Target: "local",
				Spec:   stack.ServiceSpec{Image: "tiangolo/uvicorn-gunicorn-fastapi:python3.11"},
			},
			"react": {
				Kind:   "app.react",
				Target: "local",
				Spec:   stack.ServiceSpec{Image: "nginx:alpine"},
			},
		},
	}
}

// 도메인 테스트용 풀 설정 (ssafymarket1415.duckdns.org)
func mockFullConfig() *stack.NginxConfig {
	return &stack.NginxConfig{
		ListenPort: 80,
		ServerName: "ssafymarket1415.duckdns.org",
		Upstreams: []stack.NginxUpstream{
			{Name: "api", Service: "fastapi", Port: 8000, Route: "/api/"},
			{Name: "frontend", Service: "react", Port: 3000, Route: "/"},
		},
		RateLimit:     &stack.NginxRateLimit{Enabled: true, Rate: "10r/s", Burst: 20},
		SSL:           &stack.NginxSSL{Enabled: false},
		CORS:          &stack.NginxCORS{Enabled: true, Origin: "*"},
		Gzip:          &stack.NginxGzip{Enabled: true},
		Cache:         &stack.NginxCache{Enabled: true, MaxAge: 3600},
		Keepalive:     32,
		LoadBalancing: &stack.NginxLoadBalance{Method: "round_robin"},
	}
}

// ── 테스트 케이스 ─────────────────────────────────────────────────────────────

// 기본 설정만으로 생성되는지 확인
func TestGenerateNginxConfig_Basic(t *testing.T) {
	cfg := &stack.NginxConfig{
		ListenPort: 80,
		ServerName: "_",
		Upstreams: []stack.NginxUpstream{
			{Name: "backend", Service: "fastapi", Port: 8000, Route: "/"},
		},
	}

	out, err := GenerateNginxConfig(mockStack(cfg))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	mustContain(t, out, "listen 80;")
	mustContain(t, out, "server_name _;")
	mustContain(t, out, "upstream backend {")
	mustContain(t, out, "server fastapi:8000;")
	mustContain(t, out, "location / {")
	mustContain(t, out, "proxy_pass http://backend/;")
}

// 도메인 + 풀 기능 테스트 (ssafymarket1415.duckdns.org)
func TestGenerateNginxConfig_FullWithDomain(t *testing.T) {
	out, err := GenerateNginxConfig(mockStack(mockFullConfig()))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	mustContain(t, out, "ssafymarket1415.duckdns.org")
	mustContain(t, out, "upstream api {")
	mustContain(t, out, "upstream frontend {")
	mustContain(t, out, "server fastapi:8000;")
	mustContain(t, out, "server react:3000;")
	mustContain(t, out, "location /api/ {")
	mustContain(t, out, "location / {")
}

// Rate Limiting 설정 확인
func TestGenerateNginxConfig_RateLimit(t *testing.T) {
	cfg := &stack.NginxConfig{
		Upstreams: []stack.NginxUpstream{
			{Name: "api", Service: "fastapi", Port: 8000, Route: "/api/"},
		},
		RateLimit: &stack.NginxRateLimit{Enabled: true, Rate: "5r/s", Burst: 10},
	}

	out, err := GenerateNginxConfig(mockStack(cfg))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	mustContain(t, out, "limit_req_zone")
	mustContain(t, out, "rate=5r/s")
	mustContain(t, out, "limit_req zone=arfni_limit burst=10 nodelay;")
}

// Rate Limiting 비활성화 시 지시어가 없어야 함
func TestGenerateNginxConfig_RateLimitDisabled(t *testing.T) {
	cfg := &stack.NginxConfig{
		Upstreams: []stack.NginxUpstream{
			{Name: "api", Service: "fastapi", Port: 8000, Route: "/api/"},
		},
		RateLimit: &stack.NginxRateLimit{Enabled: false},
	}

	out, err := GenerateNginxConfig(mockStack(cfg))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	mustNotContain(t, out, "limit_req_zone")
	mustNotContain(t, out, "limit_req zone=")
}

// CORS 헤더 확인
func TestGenerateNginxConfig_CORS(t *testing.T) {
	cfg := &stack.NginxConfig{
		Upstreams: []stack.NginxUpstream{
			{Name: "api", Service: "fastapi", Port: 8000, Route: "/api/"},
		},
		CORS: &stack.NginxCORS{Enabled: true, Origin: "https://ssafymarket1415.duckdns.org"},
	}

	out, err := GenerateNginxConfig(mockStack(cfg))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	mustContain(t, out, "Access-Control-Allow-Origin 'https://ssafymarket1415.duckdns.org'")
	mustContain(t, out, "Access-Control-Allow-Methods")
	mustContain(t, out, "Access-Control-Allow-Headers")
}

// Gzip 활성화 확인
func TestGenerateNginxConfig_Gzip(t *testing.T) {
	cfg := &stack.NginxConfig{
		Upstreams: []stack.NginxUpstream{
			{Name: "frontend", Service: "react", Port: 3000, Route: "/"},
		},
		Gzip: &stack.NginxGzip{Enabled: true},
	}

	out, err := GenerateNginxConfig(mockStack(cfg))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	mustContain(t, out, "gzip on;")
	mustContain(t, out, "gzip_types")
}

// Cache-Control 헤더 확인
func TestGenerateNginxConfig_Cache(t *testing.T) {
	cfg := &stack.NginxConfig{
		Upstreams: []stack.NginxUpstream{
			{Name: "frontend", Service: "react", Port: 3000, Route: "/"},
		},
		Cache: &stack.NginxCache{Enabled: true, MaxAge: 7200},
	}

	out, err := GenerateNginxConfig(mockStack(cfg))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	mustContain(t, out, "Cache-Control 'public, max-age=7200'")
}

// SSL 설정 확인
func TestGenerateNginxConfig_SSL(t *testing.T) {
	cfg := &stack.NginxConfig{
		ListenPort: 443,
		ServerName: "ssafymarket1415.duckdns.org",
		Upstreams: []stack.NginxUpstream{
			{Name: "api", Service: "fastapi", Port: 8000, Route: "/api/"},
		},
		SSL: &stack.NginxSSL{
			Enabled:  true,
			CertPath: "/etc/nginx/certs/cert.pem",
			KeyPath:  "/etc/nginx/certs/key.pem",
		},
	}

	out, err := GenerateNginxConfig(mockStack(cfg))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	mustContain(t, out, "listen 443 ssl;")
	mustContain(t, out, "ssl_certificate /etc/nginx/certs/cert.pem;")
	mustContain(t, out, "ssl_certificate_key /etc/nginx/certs/key.pem;")
}

// 로드밸런싱 - least_conn 확인
func TestGenerateNginxConfig_LoadBalance_LeastConn(t *testing.T) {
	cfg := &stack.NginxConfig{
		Upstreams: []stack.NginxUpstream{
			{Name: "api", Service: "fastapi", Port: 8000, Route: "/api/"},
		},
		LoadBalancing: &stack.NginxLoadBalance{Method: "least_conn"},
	}

	out, err := GenerateNginxConfig(mockStack(cfg))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	mustContain(t, out, "least_conn;")
}

// 로드밸런싱 - ip_hash 확인
func TestGenerateNginxConfig_LoadBalance_IPHash(t *testing.T) {
	cfg := &stack.NginxConfig{
		Upstreams: []stack.NginxUpstream{
			{Name: "api", Service: "fastapi", Port: 8000, Route: "/api/"},
		},
		LoadBalancing: &stack.NginxLoadBalance{Method: "ip_hash"},
	}

	out, err := GenerateNginxConfig(mockStack(cfg))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	mustContain(t, out, "ip_hash;")
}

// proxy.nginx 서비스가 없을 때 에러 반환 확인
func TestGenerateNginxConfig_NoNginxService(t *testing.T) {
	s := &stack.Stack{
		Services: map[string]stack.Service{
			"fastapi": {Kind: "app.fastapi", Target: "local"},
		},
	}

	_, err := GenerateNginxConfig(s)
	if err == nil {
		t.Fatal("expected error for missing proxy.nginx service, got nil")
	}
}

// HasNginxService 확인
func TestHasNginxService(t *testing.T) {
	withNginx := mockStack(mockFullConfig())
	if !HasNginxService(withNginx) {
		t.Error("expected HasNginxService=true")
	}

	withoutNginx := &stack.Stack{
		Services: map[string]stack.Service{
			"fastapi": {Kind: "app.fastapi", Target: "local"},
		},
	}
	if HasNginxService(withoutNginx) {
		t.Error("expected HasNginxService=false")
	}
}

// WriteNginxConfig 파일 쓰기 확인
func TestWriteNginxConfig(t *testing.T) {
	dir := t.TempDir()

	err := WriteNginxConfig(mockStack(mockFullConfig()), dir)
	if err != nil {
		t.Fatalf("WriteNginxConfig failed: %v", err)
	}

	data, err := os.ReadFile(filepath.Join(dir, "nginx.conf"))
	if err != nil {
		t.Fatalf("nginx.conf not written: %v", err)
	}

	content := string(data)
	mustContain(t, content, "ssafymarket1415.duckdns.org")
	mustContain(t, content, "upstream api {")
	mustContain(t, content, "upstream frontend {")
}

// keepalive 기본값(32) 적용 확인
func TestGenerateNginxConfig_KeepaliveDefault(t *testing.T) {
	cfg := &stack.NginxConfig{
		Upstreams: []stack.NginxUpstream{
			{Name: "api", Service: "fastapi", Port: 8000, Route: "/api/"},
		},
		// Keepalive: 0 → 기본값 32 적용
	}

	out, err := GenerateNginxConfig(mockStack(cfg))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	mustContain(t, out, "keepalive 32;")
}

// ── 어서션 헬퍼 ───────────────────────────────────────────────────────────────

func mustContain(t *testing.T, content, substr string) {
	t.Helper()
	if !strings.Contains(content, substr) {
		t.Errorf("expected nginx.conf to contain %q\n\n--- generated ---\n%s", substr, content)
	}
}

func mustNotContain(t *testing.T, content, substr string) {
	t.Helper()
	if strings.Contains(content, substr) {
		t.Errorf("expected nginx.conf NOT to contain %q\n\n--- generated ---\n%s", substr, content)
	}
}
