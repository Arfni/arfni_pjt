# Arfni v1.0.4 Release Notes

## 2026-10-13 follow-up (after the existing 1.0.4 tag)

- Separate application deployment results from Grafana dashboard verification. Show unverified monitoring in both the result page and completion dialog.
- Open monitoring for inspection without redeploying applications. A service without a public endpoint is no longer marked failed for that reason alone.
- Accept `/tcp` port mappings and configured HTTP/HTTPS and subpaths. Distinguish authentication, redirects and missing dashboards without injecting credentials or disabling TLS verification.
- Bound dashboard-verification SSH calls, Docker readiness checks and cleanup commands. Show cleanup progress and let users retry failed cleanup.
- Use account-specific fallback provisioning paths on hosts without sudo. Do not automatically delete previous paths or data.
- Keep default ports. Do not guess or automatically migrate legacy local data volumes; see the [monitoring operations guide](Docs/MONITORING_INTEGRATION.md) for identification steps.

The existing `1.0.4` tag is not moved. Test counts below describe the tagged revision, not this follow-up.

Follow-up verification: 152 frontend tests, 60 Rust unit tests and 3 PTY integration tests, all Go tests and vet, and the frontend production build passed. Two Rust entries are ignored in the ordinary run: a subprocess test fixture and the live SSH test. Rebuilt Go executables match their bundled copies. Docker was offline, so live containers and volume migration were not tested; Unix termination and live SSH/Grafana integration were not exercised.

---

**Version alignment and fixes:** 2026-10-12

The app version and Git tag are aligned at `1.0.4`. This includes the SSH features below, subsequent develop Nginx changes, and these fixes:

### Grafana connection and deployment fixes

- Reuse only monitoring tunnels belonging to the same project and SSH identity; serialize duplicate starts.
- Check tunnel readiness and roll back a newly created first tunnel if the second fails.
- Fix indefinite loading when Grafana is already healthy and preserve startup timeout errors.
- Retry without restarting the app. When leaving, wait for pending startup before closing that project's tunnels.
- Leaving the monitoring page cleans up only that project's owned tunnels, local process and Compose stack, preserving manual forwards and unrelated containers.
- Improve provisioning paths, permissions, and post-deployment dashboard verification.
- Restrict generated Compose permissions and warn about literal secrets and overwriting Git-tracked Compose files.
- Include Nginx upload limits, read timeout and SSE settings, plus the earlier Spring Boot CI/CD and SFTP recovery fixes.

v1.0.4 improves the remote development experience with persistent SSH sessions, automatic reconnection, real PTY terminal handling, terminal-aware SFTP navigation, and more reliable Docker deployments.

---

## New Features

### Persistent SSH Sessions

- Added an optional per-server persistent session setting
- Wraps remote shells with tmux when enabled
- Reconnects to the existing tmux session after an SSH connection loss
- Keeps remote work running while the local network or SSH connection is temporarily unavailable
- Falls back to a regular login shell when tmux is not installed

### Automatic SSH Reconnection

- Detects unexpected SSH connection losses
- Retries only remote connection failures
- Uses exponential backoff from 3 to 60 seconds
- Limits automatic reconnection attempts to six
- Does not reopen sessions closed intentionally by the user
- Restores the last known terminal size after reconnection
- Displays reconnecting, retry, and give-up status messages in the terminal

### Improved SSH Terminal

- Rebuilt the terminal around a real PTY
- Preserves interactive terminal behavior for Codex, vim, htop, and other TUI applications
- Preserves Ctrl+C, Tab completion, escape sequences, and paste behavior
- Resets stale terminal screen modes after reconnection
- Supports tmux scrollback without taking mouse control away from xterm.js
- Keeps terminal sessions alive across route changes and tab switches

### Terminal-Aware SFTP Navigation

- Automatically follows the current working directory of each SSH terminal tab
- Reads paths from terminal titles and shell prompt lines
- Supports tmux sessions where terminal title events are not forwarded
- Preserves the last known directory while Codex or another TUI is running
- Makes the follow state visible in the SFTP panel
- Enables terminal directory following by default for each SFTP panel session

---

## Improvements

### Server Configuration

- Added a persistent-session option to the server configuration UI
- Persisted the setting through database migration 007
- Kept the default value disabled for existing servers

### SFTP User Experience

- Added a visible terminal path indicator
- Added an explicit follow/pause toggle
- Removed persistent localStorage state for the follow setting
- Re-enabling follow immediately navigates to the current terminal directory
- Added Korean and English translations for the new controls and status messages

### Deployment Reliability

- Added Docker builder cache cleanup before image builds
- Added Docker version fallback handling for cache cleanup options
- Added dangling image cleanup after successful container startup
- Added disk usage logging before and after cleanup
- Preserved running-container images and named volumes during cleanup

---

## Security and Reliability

- Sanitized tab-derived tmux session names before inserting them into remote shell commands
- Preserved SSH host key verification using `StrictHostKeyChecking=accept-new`
- Removed unsafe SSH file-reading paths from deployment command code
- Added explicit handling for clean exits and SSH link failures
- Added tests for session-key sanitization, reconnect policies, timers, prompt parsing, and scrollback-aware terminal paths

---

## Bug Fixes

- Fixed Codex and full-screen terminal applications not rendering correctly in the SSH terminal
- Fixed terminal input handling for Ctrl+C, Tab completion, escape sequences, and paste
- Fixed SFTP paths not following `cd` commands
- Fixed SFTP paths being shared incorrectly between terminal tabs
- Fixed SFTP follow state becoming permanently disabled through localStorage
- Fixed terminal directory detection after scrollback had accumulated
- Fixed terminal state not being restored correctly after reconnection

---

## Known Limitations

- Persistent sessions require tmux on the remote server; without tmux, the application falls back to a normal login shell
- Automatic reconnection depends on the SSH server becoming reachable again
- The current working directory is detected from shell prompt or terminal title formats supported by the parser
- Full end-to-end validation against every remote shell configuration is still recommended

---

## Upgrade Guide

When upgrading to v1.0.4:

- Existing server records receive the new persistent-session setting with its default value disabled
- Users can enable persistent sessions per server from the server configuration screen
- No manual database migration is required; migration 007 runs automatically
- SFTP terminal-following is enabled by default for each newly opened panel
- Existing SSH connections should be closed and reopened to use the new PTY and reconnection behavior

---

## Technical Changes

### Backend (Rust / Tauri)

- Added persistent-session database migration and SSH command parameters
- Added tmux session wrapping and reconnect-aware SSH close events
- Added per-session key sanitization and PTY lifecycle handling

### Frontend (TypeScript / React)

- Added reconnect policy and scheduler modules with tests
- Added per-tab session state and terminal-size restoration
- Added prompt-based working-directory detection and per-tab SFTP following
- Added Korean and English localization for SSH and SFTP status messages

---

## Verification

- TypeScript compilation passed
- 141 frontend tests passed
- Production frontend build passed
- 56 Rust unit tests and 3 PTY integration tests passed; 1 live-SSH test ignored
- Full Go suite and `go vet ./...` passed
- Rebuilt all three Go executables and verified their bundled copies match

---

Live remote-network interruption E2E tests and replacement of the installed app were not performed.
