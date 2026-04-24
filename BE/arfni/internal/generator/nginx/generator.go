package nginx

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/arfni/arfni/internal/core/stack"
)

// GenerateNginxConfig generates nginx.conf content from a stack.
// It finds the first service with kind "proxy.nginx" and builds the config.
func GenerateNginxConfig(s *stack.Stack) (string, error) {
	var nginxSvc *stack.Service
	for _, svc := range s.Services {
		svc := svc
		if svc.Kind == "proxy.nginx" {
			nginxSvc = &svc
			break
		}
	}
	if nginxSvc == nil {
		return "", fmt.Errorf("no proxy.nginx service found in stack")
	}

	cfg := nginxSvc.Spec.Nginx
	if cfg == nil {
		cfg = &stack.NginxConfig{}
	}

	return buildConfig(cfg), nil
}

// WriteNginxConfig writes nginx.conf to projectDir/nginx.conf.
func WriteNginxConfig(s *stack.Stack, projectDir string) error {
	content, err := GenerateNginxConfig(s)
	if err != nil {
		return err
	}

	dest := filepath.Join(projectDir, "nginx.conf")
	if err := os.WriteFile(dest, []byte(content), 0644); err != nil {
		return fmt.Errorf("failed to write nginx.conf: %w", err)
	}

	return nil
}

// HasNginxService reports whether the stack contains a proxy.nginx service.
func HasNginxService(s *stack.Stack) bool {
	for _, svc := range s.Services {
		if svc.Kind == "proxy.nginx" {
			return true
		}
	}
	return false
}

// BuildConfigWithSSL generates nginx.conf with full HTTPS configuration.
// Call this after Let's Encrypt certificates have been successfully issued.
func BuildConfigWithSSL(cfg *stack.NginxConfig) string {
	var b strings.Builder

	serverName := cfg.ServerName
	if serverName == "" {
		serverName = "_"
	}
	listenPort := cfg.ListenPort
	if listenPort == 0 {
		listenPort = 80
	}
	keepalive := cfg.Keepalive
	if keepalive == 0 {
		keepalive = 32
	}

	b.WriteString("events {\n    worker_connections 1024;\n}\n\n")
	b.WriteString("http {\n")
	b.WriteString("    include       /etc/nginx/mime.types;\n")
	b.WriteString("    default_type  application/octet-stream;\n\n")

	if cfg.RateLimit != nil && cfg.RateLimit.Enabled {
		rate := cfg.RateLimit.Rate
		if rate == "" {
			rate = "10r/s"
		}
		fmt.Fprintf(&b, "    limit_req_zone $binary_remote_addr zone=arfni_limit:10m rate=%s;\n\n", rate)
	}

	for _, up := range cfg.Upstreams {
		fmt.Fprintf(&b, "    upstream %s {\n", up.Name)
		if cfg.LoadBalancing != nil {
			switch cfg.LoadBalancing.Method {
			case "least_conn":
				b.WriteString("        least_conn;\n")
			case "ip_hash":
				b.WriteString("        ip_hash;\n")
			}
		}
		port := up.Port
		if port == 0 {
			port = 80
		}
		fmt.Fprintf(&b, "        server %s:%d;\n", up.Service, port)
		fmt.Fprintf(&b, "        keepalive %d;\n", keepalive)
		b.WriteString("    }\n\n")
	}

	// HTTP server: ACME challenge + redirect to HTTPS
	b.WriteString("    server {\n")
	fmt.Fprintf(&b, "        listen %d;\n", listenPort)
	fmt.Fprintf(&b, "        server_name %s;\n\n", serverName)
	b.WriteString("        location /.well-known/acme-challenge/ {\n")
	b.WriteString("            root /var/www/certbot;\n")
	b.WriteString("        }\n\n")
	b.WriteString("        location / {\n")
	b.WriteString("            return 301 https://$host$request_uri;\n")
	b.WriteString("        }\n")
	b.WriteString("    }\n\n")

	// HTTPS server
	certPath := "/etc/letsencrypt/live/" + serverName + "/fullchain.pem"
	keyPath := "/etc/letsencrypt/live/" + serverName + "/privkey.pem"
	if cfg.SSL != nil && cfg.SSL.CertPath != "" {
		certPath = cfg.SSL.CertPath
	}
	if cfg.SSL != nil && cfg.SSL.KeyPath != "" {
		keyPath = cfg.SSL.KeyPath
	}

	b.WriteString("    server {\n")
	b.WriteString("        listen 443 ssl;\n")
	fmt.Fprintf(&b, "        server_name %s;\n\n", serverName)
	fmt.Fprintf(&b, "        ssl_certificate %s;\n", certPath)
	fmt.Fprintf(&b, "        ssl_certificate_key %s;\n\n", keyPath)

	if cfg.Gzip != nil && cfg.Gzip.Enabled {
		b.WriteString("        gzip on;\n")
		b.WriteString("        gzip_types text/plain text/css application/json application/javascript text/xml application/xml;\n\n")
	}

	for _, up := range cfg.Upstreams {
		route := up.Route
		if route == "" {
			route = "/"
		}
		fmt.Fprintf(&b, "        location %s {\n", route)

		if cfg.RateLimit != nil && cfg.RateLimit.Enabled {
			burst := cfg.RateLimit.Burst
			if burst == 0 {
				burst = 20
			}
			fmt.Fprintf(&b, "            limit_req zone=arfni_limit burst=%d nodelay;\n", burst)
		}

		if cfg.CORS != nil && cfg.CORS.Enabled {
			origin := cfg.CORS.Origin
			if origin == "" {
				origin = "*"
			}
			fmt.Fprintf(&b, "            add_header Access-Control-Allow-Origin '%s';\n", origin)
			b.WriteString("            add_header Access-Control-Allow-Methods 'GET, POST, PUT, DELETE, OPTIONS';\n")
			b.WriteString("            add_header Access-Control-Allow-Headers 'Content-Type, Authorization';\n")
		}

		if cfg.Cache != nil && cfg.Cache.Enabled {
			maxAge := cfg.Cache.MaxAge
			if maxAge == 0 {
				maxAge = 3600
			}
			fmt.Fprintf(&b, "            add_header Cache-Control 'public, max-age=%d';\n", maxAge)
		}

		fmt.Fprintf(&b, "            proxy_pass http://%s/;\n", up.Name)
		b.WriteString("            proxy_set_header Host $host;\n")
		b.WriteString("            proxy_set_header X-Real-IP $remote_addr;\n")
		b.WriteString("            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\n")
		b.WriteString("            proxy_set_header X-Forwarded-Proto $scheme;\n")
		b.WriteString("        }\n\n")
	}

	b.WriteString("    }\n")
	b.WriteString("}\n")
	return b.String()
}

func buildConfig(cfg *stack.NginxConfig) string {
	var b strings.Builder

	listenPort := cfg.ListenPort
	if listenPort == 0 {
		listenPort = 80
	}
	serverName := cfg.ServerName
	if serverName == "" {
		serverName = "_"
	}
	keepalive := cfg.Keepalive
	if keepalive == 0 {
		keepalive = 32
	}

	// ── top-level directives ─────────────────────────────────────────────────
	b.WriteString("events {\n    worker_connections 1024;\n}\n\n")
	b.WriteString("http {\n")
	b.WriteString("    include       /etc/nginx/mime.types;\n")
	b.WriteString("    default_type  application/octet-stream;\n\n")

	// ── global rate-limit zone ───────────────────────────────────────────────
	if cfg.RateLimit != nil && cfg.RateLimit.Enabled {
		rate := cfg.RateLimit.Rate
		if rate == "" {
			rate = "10r/s"
		}
		fmt.Fprintf(&b, "    limit_req_zone $binary_remote_addr zone=arfni_limit:10m rate=%s;\n\n", rate)
	}

	// ── upstream blocks ──────────────────────────────────────────────────────
	for _, up := range cfg.Upstreams {
		fmt.Fprintf(&b, "    upstream %s {\n", up.Name)

		if cfg.LoadBalancing != nil {
			switch cfg.LoadBalancing.Method {
			case "least_conn":
				b.WriteString("        least_conn;\n")
			case "ip_hash":
				b.WriteString("        ip_hash;\n")
			}
		}

		port := up.Port
		if port == 0 {
			port = 80
		}
		fmt.Fprintf(&b, "        server %s:%d;\n", up.Service, port)
		fmt.Fprintf(&b, "        keepalive %d;\n", keepalive)
		b.WriteString("    }\n\n")
	}

	// ── server block ─────────────────────────────────────────────────────────
	b.WriteString("    server {\n")
	fmt.Fprintf(&b, "        listen %d;\n", listenPort)
	fmt.Fprintf(&b, "        server_name %s;\n\n", serverName)

	// gzip
	if cfg.Gzip != nil && cfg.Gzip.Enabled {
		b.WriteString("        gzip on;\n")
		b.WriteString("        gzip_types text/plain text/css application/json application/javascript text/xml application/xml;\n\n")
	}

	// ssl - auto SSL은 certbot 인증 후 BuildConfigWithSSL로 처리하므로 여기선 스킵
	if cfg.SSL != nil && cfg.SSL.Enabled && !cfg.SSL.Auto {
		b.WriteString("        listen 443 ssl;\n")
		certPath := cfg.SSL.CertPath
		if certPath == "" {
			certPath = "/etc/nginx/certs/cert.pem"
		}
		keyPath := cfg.SSL.KeyPath
		if keyPath == "" {
			keyPath = "/etc/nginx/certs/key.pem"
		}
		fmt.Fprintf(&b, "        ssl_certificate %s;\n", certPath)
		fmt.Fprintf(&b, "        ssl_certificate_key %s;\n\n", keyPath)
	}

	// ACME challenge location for Let's Encrypt auto SSL
	if cfg.SSL != nil && cfg.SSL.Auto {
		b.WriteString("        location /.well-known/acme-challenge/ {\n")
		b.WriteString("            root /var/www/certbot;\n")
		b.WriteString("        }\n\n")
	}

	// location blocks
	for _, up := range cfg.Upstreams {
		route := up.Route
		if route == "" {
			route = "/"
		}
		fmt.Fprintf(&b, "        location %s {\n", route)

		// rate limiting
		if cfg.RateLimit != nil && cfg.RateLimit.Enabled {
			burst := cfg.RateLimit.Burst
			if burst == 0 {
				burst = 20
			}
			fmt.Fprintf(&b, "            limit_req zone=arfni_limit burst=%d nodelay;\n", burst)
		}

		// cors
		if cfg.CORS != nil && cfg.CORS.Enabled {
			origin := cfg.CORS.Origin
			if origin == "" {
				origin = "*"
			}
			fmt.Fprintf(&b, "            add_header Access-Control-Allow-Origin '%s';\n", origin)
			b.WriteString("            add_header Access-Control-Allow-Methods 'GET, POST, PUT, DELETE, OPTIONS';\n")
			b.WriteString("            add_header Access-Control-Allow-Headers 'Content-Type, Authorization';\n")
		}

		// cache
		if cfg.Cache != nil && cfg.Cache.Enabled {
			maxAge := cfg.Cache.MaxAge
			if maxAge == 0 {
				maxAge = 3600
			}
			fmt.Fprintf(&b, "            add_header Cache-Control 'public, max-age=%d';\n", maxAge)
		}

		fmt.Fprintf(&b, "            proxy_pass http://%s/;\n", up.Name)
		b.WriteString("            proxy_set_header Host $host;\n")
		b.WriteString("            proxy_set_header X-Real-IP $remote_addr;\n")
		b.WriteString("            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\n")
		b.WriteString("            proxy_set_header X-Forwarded-Proto $scheme;\n")
		b.WriteString("        }\n\n")
	}

	b.WriteString("    }\n")
	b.WriteString("}\n")
	return b.String()
}
