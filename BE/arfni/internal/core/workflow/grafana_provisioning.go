package workflow

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"net"
	"net/url"
	"os"
	"path"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/arfni/arfni/internal/core/stack"
	"github.com/arfni/arfni/internal/events"
)

// grafanaProvisioningMount is the container path Grafana reads provisioning from.
const grafanaProvisioningMount = "/etc/grafana/provisioning"

// grafanaManagedRoot is where arfni puts provisioning files it owns.
//
// The files cannot live under the deploy user's home. Grafana's official image runs as
// uid 472 / gid 0, and modern Ubuntu and Oracle images ship homes at 0750, so uid 472
// cannot even traverse /home/<user> — provisioning fails with "permission denied" no
// matter how open the leaf directory is. Opening the home instead (chmod o+x) is the one
// fix that must not be automated: it exposes everything else under it, which is exactly
// how a deploy once leaked an API token to a container that mounts the host filesystem.
//
// /opt is 0755 root:root on every mainstream distribution, so the whole path is
// traversable and arfni can create the leaves with the modes it wants.
const grafanaManagedRoot = "/opt/arfni"

// The shared sticky parent is traversable by Grafana without opening the user's home.
const grafanaFallbackRoot = "/var/tmp/arfni"

func grafanaFallbackRootFor(user string) string {
	digest := sha256.Sum256([]byte(user))
	return fmt.Sprintf("%s-%x", grafanaFallbackRoot, digest[:16])
}

// grafanaDashboardTimeout bounds how long a deploy waits for Grafana to report the
// dashboards it was just given.
const grafanaDashboardTimeout = 20 * time.Second

// provisioningSubdirs are the directories Grafana opens under its provisioning path.
var provisioningSubdirs = []string{"datasources", "dashboards", "plugins", "alerting"}

// grafanaProvisioningLayout describes where provisioning lives on the deploy host and
// how it got there.
type grafanaProvisioningLayout struct {
	// Root is the per-project directory arfni owns, e.g. /opt/arfni/arfni-deploy.
	Root string
	// Dir is the provisioning directory mounted into Grafana.
	Dir string
	// Privileged is true when the layout was created with sudo and is readable only by
	// the deploy user and gid 0.
	Privileged bool
}

// deployProjectName derives a per-project directory name from the remote workdir.
//
// validateWorkdir has already rejected shell metacharacters and "..", so the base name is
// safe to interpolate into remote commands.
func deployProjectName(workdir string) string {
	base := path.Base(strings.TrimRight(path.Clean(workdir), "/"))
	if base == "" || base == "." || base == "/" {
		return "default"
	}
	return base
}

// grafanaProvisioningLayoutFor builds the layout for a project under the given root.
func grafanaProvisioningLayoutFor(root, workdir string, privileged bool) grafanaProvisioningLayout {
	// Different users can share the same default workdir basename.
	digest := sha256.Sum256([]byte(path.Clean(workdir)))
	projectRoot := fmt.Sprintf("%s/%s-%x", root, deployProjectName(workdir), digest[:8])
	return grafanaProvisioningLayout{
		Root:       projectRoot,
		Dir:        projectRoot + "/grafana/provisioning",
		Privileged: privileged,
	}
}

// redirectGrafanaProvisioningVolume repoints the Grafana provisioning mount at hostDir.
//
// The stack normally declares ./grafana/provisioning, which resolves under the workdir in
// the deploy user's home — unreadable to Grafana's uid. Rewriting the host side here, at
// generation time, keeps the compose file and the uploaded files in agreement; rewriting
// it anywhere later would produce a compose that points at a directory nothing fills.
//
// It reports whether a mount was actually rewritten.
func redirectGrafanaProvisioningVolume(s *stack.Stack, hostDir string) bool {
	if s == nil {
		return false
	}

	changed := false
	for name, service := range s.Services {
		for i, vol := range service.Spec.Volumes {
			if path.Clean(vol.Mount) != grafanaProvisioningMount {
				continue
			}
			if service.Spec.Volumes[i].Host == hostDir {
				continue
			}
			service.Spec.Volumes[i].Host = hostDir
			changed = true
		}
		s.Services[name] = service
	}
	return changed
}

// grafanaHTTPPort resolves the port used by a host-side health request.
//
// The published host port can differ from GF_SERVER_HTTP_PORT inside the container.
// An invalid port cannot be interpolated into a remote shell command.
func grafanaHTTPPort(s *stack.Stack) string {
	const defaultPort = "3000"
	if s == nil {
		return defaultPort
	}

	service, ok := s.Services["grafana"]
	if !ok {
		return defaultPort
	}
	containerPort := service.Spec.Env["GF_SERVER_HTTP_PORT"]
	if containerPort == "" {
		containerPort = defaultPort
	}
	if !validGrafanaPort(containerPort) {
		return ""
	}

	for _, mapping := range service.Spec.Ports {
		mapping = strings.TrimSuffix(mapping, "/tcp")
		parts := strings.Split(mapping, ":")
		if len(parts) < 2 {
			return "" // Docker chooses an unknown published port.
		}
		hostPort, mappedContainerPort := parts[len(parts)-2], parts[len(parts)-1]
		if len(parts) > 2 {
			host := strings.TrimSuffix(mapping, ":"+hostPort+":"+mappedContainerPort)
			address, _, err := net.SplitHostPort(host + ":1")
			if err != nil || net.ParseIP(address) == nil {
				return ""
			}
		}
		if !validGrafanaPort(hostPort) || !validGrafanaPort(mappedContainerPort) {
			return ""
		}
		if mappedContainerPort == containerPort {
			return hostPort
		}
	}

	if len(service.Spec.Ports) > 0 {
		return ""
	}
	return containerPort
}

func validGrafanaPort(port string) bool {
	n, err := strconv.Atoi(port)
	return err == nil && n >= 1 && n <= 65535 && strconv.Itoa(n) == port
}

// Only protocol, published port and a validated path enter the host-side request.
func grafanaSearchURL(s *stack.Stack) (string, error) {
	port := grafanaHTTPPort(s)
	if port == "" {
		return "", fmt.Errorf("Grafana has no valid published host port for dashboard verification")
	}
	var env map[string]string
	if s != nil {
		env = s.Services["grafana"].Spec.Env
	}
	protocol := env["GF_SERVER_PROTOCOL"]
	if protocol == "" {
		protocol = "http"
	}
	if protocol != "http" && protocol != "https" {
		return "", fmt.Errorf("Grafana protocol is unsupported for dashboard verification")
	}
	subpath := ""
	if env["GF_SERVER_SERVE_FROM_SUB_PATH"] == "true" {
		root := strings.NewReplacer("%(protocol)s", protocol, "%(domain)s", "localhost", "%(http_port)s", port).Replace(env["GF_SERVER_ROOT_URL"])
		parsed, err := url.Parse(root)
		if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.Host == "" || parsed.User != nil || parsed.RawQuery != "" || parsed.Fragment != "" {
			return "", fmt.Errorf("Grafana root URL cannot be used safely for subpath verification")
		}
		subpath = strings.TrimRight(parsed.EscapedPath(), "/")
	}
	return protocol + "://localhost:" + port + subpath + "/api/search?type=dash-db", nil
}

// parseDashboardUIDs extracts dashboard uids from a Grafana /api/search response.
//
// Anything that is not a JSON array of dashboards — an HTML error page, an auth
// redirect, a partial body — yields no uids, which the caller treats as "not ready yet".
func parseDashboardUIDs(body string) []string {
	var entries []struct {
		UID  string `json:"uid"`
		Type string `json:"type"`
	}

	trimmed := strings.TrimSpace(body)
	if !strings.HasPrefix(trimmed, "[") {
		return nil
	}
	if err := json.Unmarshal([]byte(trimmed), &entries); err != nil {
		return nil
	}

	var uids []string
	for _, e := range entries {
		if e.UID != "" {
			uids = append(uids, e.UID)
		}
	}
	return uids
}

func expectedGrafanaDashboardUIDs(dir string) ([]string, error) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, fmt.Errorf("failed to read generated Grafana dashboards: %w", err)
	}
	var uids []string
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".json") {
			continue
		}
		data, err := os.ReadFile(filepath.Join(dir, entry.Name()))
		if err != nil {
			return nil, fmt.Errorf("failed to read dashboard %s: %w", entry.Name(), err)
		}
		var dashboard struct {
			UID string `json:"uid"`
		}
		if err := json.Unmarshal(data, &dashboard); err != nil || dashboard.UID == "" {
			return nil, fmt.Errorf("dashboard %s has no valid uid", entry.Name())
		}
		uids = append(uids, dashboard.UID)
	}
	if len(uids) == 0 {
		return nil, fmt.Errorf("no generated Grafana dashboards found in %s", dir)
	}
	return uids, nil
}

func missingGrafanaDashboardUIDs(response string, expected []string) []string {
	seen := make(map[string]bool)
	for _, uid := range parseDashboardUIDs(response) {
		seen[uid] = true
	}
	var missing []string
	for _, uid := range expected {
		if !seen[uid] {
			missing = append(missing, uid)
		}
	}
	return missing
}

// remoteProvisioningSetupCmd returns the command that creates the provisioning directory
// before upload.
//
// plugins and alerting are created empty on purpose: Grafana logs a level=error line for
// every provisioning directory it cannot open, so leaving them out fills the log with
// failures that are not failures and buries the real ones.
func remoteProvisioningSetupCmd(layout grafanaProvisioningLayout, user string) string {
	var dirs []string
	for _, sub := range provisioningSubdirs {
		dirs = append(dirs, layout.Dir+"/"+sub)
	}
	mkdir := "mkdir -p " + strings.Join(dirs, " ")
	if !layout.Privileged {
		// /var/tmp is shared. A pre-created or symlinked root would let another
		// account replace files Grafana trusts after upload.
		return fmt.Sprintf("mkdir -p %s && test ! -L %s && test \"$(stat -c %%u %s)\" = \"$(id -u)\" && chmod 755 %s && %s",
			path.Dir(layout.Root), path.Dir(layout.Root), path.Dir(layout.Root), path.Dir(layout.Root), mkdir)
	}
	// Own the tree as the deploy user so scp can write into it without sudo.
	return fmt.Sprintf("sudo -n %s && sudo -n chown -R %s %s", mkdir, quoteRemoteShellArg(user), layout.Root)
}

func quoteRemoteShellArg(value string) string {
	return "'" + strings.ReplaceAll(value, "'", "'\"'\"'") + "'"
}

// remoteProvisioningHardenCmd returns the command that fixes ownership and modes after
// upload.
//
// Privileged layouts hand the tree to gid 0 and give the group read+traverse only:
// Grafana runs with gid 0, so it reads through the group bit while "other" gets nothing.
// Unprivileged layouts cannot set gid 0, so they fall back to world readable — the only
// way an unprivileged uid can expose files to another uid at all.
func remoteProvisioningHardenCmd(layout grafanaProvisioningLayout, user string) string {
	if layout.Privileged {
		return fmt.Sprintf("sudo -n chown -R %s %s && sudo -n chmod -R u=rwX,g=rX,o= %s",
			quoteRemoteShellArg(user+":0"), layout.Root, layout.Root)
	}
	return fmt.Sprintf("chmod -R u=rwX,go=rX %s", layout.Root)
}

// resolveGrafanaProvisioningLayout picks where provisioning will live on the deploy host
// and creates the directory.
func (r *Runner) resolveGrafanaProvisioningLayout(stream *events.Stream, sshClient *SSHClient, workdir, user string) (grafanaProvisioningLayout, error) {
	managed := grafanaProvisioningLayoutFor(grafanaManagedRoot, workdir, true)

	if err := sshClient.RunCommand(stream, "sudo -n true"); err == nil {
		if err := sshClient.RunCommand(stream, remoteProvisioningSetupCmd(managed, user)); err == nil {
			stream.Info(fmt.Sprintf("Grafana provisioning directory: %s (owner-and-root-group only)", managed.Dir))
			return managed, nil
		} else {
			stream.Warning(
				fmt.Sprintf("Could not create %s despite sudo being available: %v", managed.Root, err),
				map[string]interface{}{"grafana_provisioning": "fallback"},
			)
		}
	}

	fallback := grafanaProvisioningLayoutFor(grafanaFallbackRootFor(user), workdir, false)
	if err := sshClient.RunCommand(stream, remoteProvisioningSetupCmd(fallback, user)); err != nil {
		return grafanaProvisioningLayout{}, fmt.Errorf("failed to create Grafana provisioning directory %s: %w", fallback.Dir, err)
	}

	stream.Warning(
		fmt.Sprintf("Managed Grafana provisioning storage unavailable: falling back to %s, "+
			"where all provisioning files are world readable. Custom datasource or alerting files may contain secrets; "+
			"remove such secrets or configure restricted provisioning storage before deploying them.", fallback.Dir),
		map[string]interface{}{"grafana_provisioning": "world_readable"},
	)
	return fallback, nil
}

// Verification is advisory: monitoring visibility does not determine app deployment success.
func (r *Runner) verifyGrafanaDashboards(stream *events.Stream, sshClient *SSHClient) error {
	searchURL, err := grafanaSearchURL(r.stack)
	if err != nil {
		return err
	}
	expected, err := expectedGrafanaDashboardUIDs(filepath.Join(r.projectDir, "grafana", "provisioning", "dashboards"))
	if err != nil {
		return fmt.Errorf("generated Grafana dashboard UIDs could not be read")
	}
	searchCmd := "curl -s --max-time 5 --write-out '\n%{http_code}' " + quoteRemoteShellArg(searchURL)
	stream.Info("Verifying Grafana dashboards are provisioned...")
	ctx, cancel := context.WithTimeout(context.Background(), grafanaDashboardTimeout)
	defer cancel()
	return pollGrafanaDashboards(ctx, expected, func(ctx context.Context) (string, error) {
		return sshClient.RunCommandWithOutputContext(ctx, stream, searchCmd)
	})
}

func pollGrafanaDashboards(ctx context.Context, expected []string, request func(context.Context) (string, error)) error {
	lastStatus := "Grafana could not be reached; check SSH, its published port and TLS configuration"
	for {
		if ctx.Err() != nil {
			return fmt.Errorf("%s; verification deadline reached", lastStatus)
		}
		output, err := request(ctx)
		if err == nil && ctx.Err() == nil {
			// The body may span lines; curl appends the status after the final newline.
			output = strings.TrimRight(output, "\r\n")
			if i := strings.LastIndex(output, "\n"); i >= 0 {
				body, code := output[:i], strings.TrimSpace(output[i+1:])
				switch code {
				case "401", "403":
					return fmt.Errorf("Grafana login required (HTTP %s); verify provisioned dashboards after signing in", code)
				case "301", "302", "303", "307", "308":
					return fmt.Errorf("Grafana redirected the dashboard request; check login and server subpath configuration")
				case "200":
					if parseDashboardUIDs(body) == nil {
						lastStatus = "Grafana has not returned a valid dashboard search response"
						if strings.TrimSpace(body) == "[]" {
							lastStatus = "Grafana provisioned dashboard UIDs are still missing"
						}
					} else if missing := missingGrafanaDashboardUIDs(body, expected); len(missing) == 0 {
						return nil
					} else {
						lastStatus = "Grafana provisioned dashboard UIDs are still missing"
					}
				default:
					lastStatus = "Grafana is not ready to serve dashboard searches"
				}
			}
		}
		timer := time.NewTimer(2 * time.Second)
		select {
		case <-ctx.Done():
			timer.Stop()
			return fmt.Errorf("%s; verification deadline reached", lastStatus)
		case <-timer.C:
		}
	}
}

func reportGrafanaVerification(stream *events.Stream, err error) {
	if err != nil {
		stream.Warning("Application deployment completed; monitoring remains unverified: "+err.Error(), map[string]interface{}{"monitoring_verification": "unverified"})
		return
	}
	stream.Emit(events.TypeSuccess, "Grafana serves all provisioned dashboards", map[string]interface{}{"monitoring_verification": "verified"})
}
