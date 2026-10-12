package workflow

import (
	"crypto/sha256"
	"encoding/json"
	"fmt"
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

// grafanaFallbackRoot is used when the deploy user has no passwordless sudo and
// therefore cannot create anything under /opt.
//
// /var/tmp is 1777, survives reboots on mainstream distributions, and is traversable by
// every uid, so Grafana can read from it without any privileged step. The cost is that
// the provisioning files end up world readable; they contain dashboard JSON and a
// datasource URL, never stack secrets, and the caller says so out loud.
const grafanaFallbackRoot = "/var/tmp/arfni"

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
		parts := strings.Split(mapping, ":")
		if len(parts) < 2 {
			return "" // Docker chooses an unknown published port.
		}
		hostPort, mappedContainerPort := parts[len(parts)-2], parts[len(parts)-1]
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
			grafanaFallbackRoot, grafanaFallbackRoot, grafanaFallbackRoot, grafanaFallbackRoot, mkdir)
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

	fallback := grafanaProvisioningLayoutFor(grafanaFallbackRoot, workdir, false)
	if err := sshClient.RunCommand(stream, remoteProvisioningSetupCmd(fallback, user)); err != nil {
		return grafanaProvisioningLayout{}, fmt.Errorf("failed to create Grafana provisioning directory %s: %w", fallback.Dir, err)
	}

	stream.Warning(
		fmt.Sprintf("No passwordless sudo on the deploy host: Grafana provisioning falls back to %s, "+
			"where the dashboard and datasource files are world readable. They carry no stack secrets, "+
			"but grant sudo to the deploy user if you want them restricted to Grafana.", fallback.Dir),
		map[string]interface{}{"grafana_provisioning": "world_readable"},
	)
	return fallback, nil
}

// verifyGrafanaDashboards fails the deploy unless Grafana actually serves the dashboards
// that were just provisioned.
//
// Checking the result rather than the cause is deliberate. Provisioning breaks from
// unreadable files, a missing mount, and malformed dashboard JSON alike, and every one of
// those used to end in a "deployment succeeded" message with an empty Grafana behind it.
func (r *Runner) verifyGrafanaDashboards(stream *events.Stream, sshClient *SSHClient, workdir string) error {
	port := grafanaHTTPPort(r.stack)
	if port == "" {
		return fmt.Errorf("Grafana has no valid published host port for dashboard verification")
	}
	expected, err := expectedGrafanaDashboardUIDs(filepath.Join(r.projectDir, "grafana", "provisioning", "dashboards"))
	if err != nil {
		return err
	}
	searchCmd := fmt.Sprintf("curl -s --max-time 5 'http://localhost:%s/api/search?type=dash-db'", port)

	stream.Info("Verifying Grafana dashboards are provisioned...")

	deadline := time.Now().Add(grafanaDashboardTimeout)
	var lastBody string
	for {
		output, err := sshClient.RunCommandWithOutput(stream, searchCmd)
		if err == nil {
			lastBody = output
			if len(missingGrafanaDashboardUIDs(output, expected)) == 0 {
				stream.Success(fmt.Sprintf("Grafana serves the %d provisioned dashboard(s): %s", len(expected), strings.Join(expected, ", ")))
				return nil
			}
		}

		if time.Now().After(deadline) {
			break
		}
		time.Sleep(2 * time.Second)
	}

	// The provisioning errors are the actionable part, so surface them instead of making
	// the operator go find them.
	logCmd := fmt.Sprintf("cd %s && docker compose -f docker-compose.yml logs --tail 200 grafana", workdir)
	if logs, logErr := sshClient.RunCommandWithOutput(stream, logCmd); logErr == nil {
		if relevant := filterProvisioningErrors(logs); relevant != "" {
			stream.Error(fmt.Sprintf("Grafana provisioning errors:\n%s", relevant), nil)
		}
	}

	return fmt.Errorf("Grafana did not serve provisioned dashboard UID(s) %v within %s (last response: %q)",
		missingGrafanaDashboardUIDs(lastBody, expected), grafanaDashboardTimeout, strings.TrimSpace(lastBody))
}

// filterProvisioningErrors keeps only the provisioning failures out of a Grafana log dump.
func filterProvisioningErrors(logs string) string {
	var kept []string
	for _, line := range strings.Split(logs, "\n") {
		lower := strings.ToLower(line)
		if !strings.Contains(lower, "provisioning") {
			continue
		}
		if !strings.Contains(lower, "level=error") && !strings.Contains(lower, "permission denied") {
			continue
		}
		kept = append(kept, strings.TrimSpace(line))
	}
	return strings.Join(kept, "\n")
}
