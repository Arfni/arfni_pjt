# Development Guide

Developer and contributor guide for the Arfni project.

## Project Structure

```
arfni_pjt/
├── arfni-gui/                    # Tauri-based desktop application
│   ├── src/                      # React frontend (Feature-Sliced Design)
│   │   ├── app/                  # App initialization, global styles
│   │   ├── pages/                # Page components
│   │   │   ├── canvas/           # Visual project editor
│   │   │   ├── deployment/       # Deployment page
│   │   │   ├── logs/             # Logs and monitoring page
│   │   │   │   └── ui/
│   │   │   │       ├── LogPage.tsx
│   │   │   │       ├── MonitoringPage.tsx
│   │   │   │       ├── MonitoringView.tsx
│   │   │   │       ├── OptimizeView.tsx      # EC2 optimization and cost estimation
│   │   │   │       ├── ContainersView.tsx
│   │   │   │       └── TerminalView.tsx
│   │   │   ├── projects/         # Project list
│   │   │   ├── settings/         # Settings page
│   │   │   └── test/             # Test page
│   │   ├── features/             # Business logic features
│   │   │   ├── canvas/           # Canvas drag-and-drop logic
│   │   │   │   ├── hooks/        # Canvas hooks
│   │   │   │   ├── lib/          # yamlConverter, etc.
│   │   │   │   ├── model/        # Canvas state management
│   │   │   │   └── ui/           # Canvas UI components
│   │   │   ├── deployment/       # Deployment state management
│   │   │   │   └── model/
│   │   │   └── project/          # Project management logic
│   │   │       └── model/
│   │   ├── entities/             # Business entities
│   │   │   ├── service/          # Service nodes
│   │   │   │   └── ui/
│   │   │   └── target/           # Target nodes
│   │   │       └── ui/
│   │   ├── shared/               # Shared components/utilities
│   │   │   ├── api/tauri/        # Tauri IPC calls
│   │   │   ├── config/i18n/      # Internationalization config
│   │   │   └── ui/               # Common UI components
│   │   └── widgets/              # Composite UI widgets
│   │       ├── canvas-editor/    # Canvas editor
│   │       ├── log-viewer/       # Log viewer
│   │       ├── node-palette/     # Node palette
│   │       ├── property-panel/   # Property panel
│   │       ├── titlebar/         # Title bar
│   │       ├── toolbar/          # Toolbar
│   │       │   └── ui/dialogs/
│   │       │       └── OptimizeDialog.tsx    # Optimization dialog
│   │       └── yaml-editor/      # YAML editor
│   │
│   └── src-tauri/                # Rust backend (Tauri Commands)
│       ├── src/
│       │   ├── commands/         # Tauri command modules
│       │   │   ├── project.rs    # Project CRUD, stack.yaml generation
│       │   │   ├── deployment.rs # Deployment execution (Go binary invocation)
│       │   │   ├── monitoring.rs # Monitoring service control
│       │   │   ├── plugin.rs     # Plugin management
│       │   │   ├── ssh.rs        # SSH key management
│       │   │   ├── health.rs     # Container health check
│       │   │   └── pricing.rs    # EC2 price calculation
│       │   ├── db/               # SQLite database
│       │   │   ├── mod.rs        # DB initialization, migrations
│       │   │   └── api_key.rs    # API key storage
│       │   └── features/         # Feature modules
│       │       ├── health_check.rs  # Health check logic
│       │       └── ssh_rt.rs     # Real-time SSH terminal
│       │
│       └── resources/            # Resource files (bundled in binary)
│           ├── bin/              # Go binaries (arfni-go, ic, monitoring)
│           └── plugins/          # Bundled plugins
│               └── bundled/
│                   ├── framework/        # Framework plugins
│                   │   ├── react/
│                   │   ├── nextjs/
│                   │   ├── springboot/
│                   │   ├── fastapi/
│                   │   ├── flask/
│                   │   └── nodejs/
│                   ├── database/         # Database plugins
│                   │   ├── mysql/
│                   │   ├── postgresql/
│                   │   └── mongodb/
│                   ├── cache/            # Cache plugins
│                   │   └── redis/
│                   └── monitoring/       # Monitoring plugins
│                       ├── prometheus/
│                       ├── grafana/
│                       └── node-exporter/
│
├── BE/arfni/                     # Go backend engine
│   ├── cmd/                      # Entry points
│   │   ├── arfni-go/             # Unified CLI (run, status commands)
│   │   │   └── main.go
│   │   ├── ic/                   # IC engine (deployment pipeline execution)
│   │   │   └── main.go
│   │   └── arfni-monitoring/     # Monitoring service (Prometheus data collection)
│   │       └── main.go
│   │
│   ├── internal/                 # Internal logic (not exposed externally)
│   │   ├── core/                 # Core business logic
│   │   │   ├── workflow/         # Deployment workflow
│   │   │   │   ├── runner.go     # Deployment pipeline orchestration
│   │   │   │   ├── ssh.go        # EC2 SSH/SCP communication
│   │   │   │   ├── arfniignore.go # File exclusion pattern matching
│   │   │   │   ├── dockerfile.go # Dockerfile build type detection
│   │   │   │   └── dockerfile_writer.go # Dockerfile template generation
│   │   │   ├── stack/            # stack.yaml parsing/validation
│   │   │   ├── plugin/           # Plugin loader
│   │   │   ├── monitoring/       # Monitoring configuration generation
│   │   │   └── state/            # State storage
│   │   │
│   │   ├── generator/            # File generators
│   │   │   ├── compose/          # docker-compose.yml generation
│   │   │   │   └── generator.go
│   │   │   └── dockerfile/       # Dockerfile generation (template-based)
│   │   │       └── generator.go
│   │   │
│   │   ├── drivers/              # External drivers
│   │   │   └── ec2/              # AWS EC2 integration
│   │   │
│   │   ├── events/               # Event stream (log transmission)
│   │   │   └── stream.go
│   │   │
│   │   ├── pricing/              # EC2 price calculation logic
│   │   │   └── data/             # Price data
│   │   │
│   │   └── utils/                # Utilities
│   │       ├── logger/           # Logging
│   │       ├── config/           # Configuration management
│   │       ├── secrets/          # Secret information handling
│   │       └── version/          # Version management
│   │
│   ├── pkg/                      # Externally exposable packages
│   │   └── stackschema/          # stack.yaml JSON Schema
│   │
│   ├── bin/                      # Built binary output
│   ├── examples/                 # Example projects
│   └── scripts/                  # Build scripts
│
├── FE/                           # Landing page (separate React project)
├── Docs/                         # Documentation

```

---

## Development Environment Setup

### Required Tools

| Tool | Version | Evidence | Purpose |
| --- | --- | --- | --- |
| Node.js | 18+ | React 19.1.0 requirement | React frontend build |
| Rust | 1.70+ | Tauri 2.9 minimum requirement | Tauri backend build |
| Go | 1.25.2 | `BE/arfni/go.mod` | IC engine build |
| Docker Desktop | Latest | - | Local deployment testing |
| npm/pnpm | Latest | - | Package manager |

### Major Library Versions in Use

| Library | Version | File |
| --- | --- | --- |
| React | 19.1.0 | `arfni-gui/package.json` |
| TypeScript | 5.8.3 | `arfni-gui/package.json` |
| Tauri | 2.9 | `arfni-gui/src-tauri/Cargo.toml` |
| Vite | 7.0.4 | `arfni-gui/package.json` |

### Initial Setup

```bash
# 1. Clone repositorygit clone https://github.com/Arfni/arfni_pjt.git
cd arfni_pjt
# 2. Install GUI frontend dependenciescd arfni-gui
npm install
# 3. Install Go dependenciescd ../BE/arfni
go mod download
# 4. Run Tauri dev mode (auto-installs Rust dependencies on first run)cd ../../arfni-gui
npm run tauri dev
```

---

## Build Instructions

### GUI Application

```bash
cd arfni-gui
# Development mode (hot reload)npm run tauri dev
# Production buildnpm run tauri build
```

Output location: `arfni-gui/src-tauri/target/release/`

### Go Engine

```bash
cd BE/arfni
# arfni-go (unified CLI)go build -o bin/arfni-go.exe ./cmd/arfni-go
# ic (deployment engine)go build -o bin/ic.exe ./cmd/ic
# arfni-monitoring (monitoring service)go build -o bin/arfni-monitoring.exe ./cmd/arfni-monitoring
```

Output location: `BE/arfni/bin/`

---

## Key Features by File Location

### 1. Project Creation/Management

**File Location**
- **Rust**: `arfni-gui/src-tauri/src/commands/project.rs`
- **React**: `arfni-gui/src/features/project/`

**Key Functions**
- `create_project()`: Create project folder, initialize stack.yaml, generate .arfniignore
- `open_project()`: Open project, manage lock file
- `save_stack_yaml()`: Save stack.yaml + Canvas state (.arfni/canvas-state.json)
- `load_canvas_state()`: Restore Canvas state

**Auto-generated Files**

Created by `create_project()` function:
- `stack.yaml`: Initial project configuration (services, targets definition)
- `.arfniignore`: File patterns to exclude during deployment (node_modules, venv, etc.)
- `.arfni/` directory: Project metadata storage
- `.arfni/data/`: Docker volume data
- `.arfni/compose/`: Generated docker-compose.yml storage
- `.arfni/canvas-state.json`: Canvas editing state

**Modification Scenarios**
- Need additional files on project creation: Modify `create_project()` function
- stack.yaml schema changes: Simultaneously modify `BE/arfni/pkg/stackschema/`

---

### 2. Deployment

**File Location**
- **Go Engine**: `BE/arfni/internal/core/workflow/runner.go`
- **Rust Command**: `arfni-gui/src-tauri/src/commands/deployment.rs`
- **React UI**: `arfni-gui/src/pages/deployment/`

**Deployment Pipeline (5 Phases)**

Executed by `ExecuteWithPlugins()` function:

| Phase | Description | Called Function |
| --- | --- | --- |
| Phase 1/5 | Preflight checks (configuration validation) | - |
| Phase 2/5 | Generating Docker files | `generateFiles()` |
| Phase 3/5 | Building images | `buildImages()` |
| Phase 4/5 | Deploying containers | `deployContainers()` |
| Phase 5/5 | Health checks | `healthChecks()` |

**Key Functions**

**`generateFiles()`**
- Generate docker-compose.yml: Calls `GenerateDockerComposeWithTarget()`
- Generate Dockerfile:
- `DetectBuildType()`: Auto-detect framework (plugin.yaml-based)
- `WriteDockerfileWithBundled()`: Template-based Dockerfile generation
- Prepare Grafana provisioning (for All-in-one mode)

**`buildImages()`**
- Local/EC2 target branching:
- Local: `buildImagesLocal()` → Execute docker-compose build
- EC2: `buildImagesEC2()` → Remote build via SSH
- `CheckDockerInstalled()`: Check Docker installation/auto-install
- `PrepareWorkdir()`: Prepare working directory
- `UploadFile()`, `UploadDirectory()`: File transfer
- Execute docker compose build remotely

**`deployContainers()`**
- Local: `deployContainersLocal()` → docker compose up -d
- EC2: `deployContainersEC2()` → Remote docker compose up

**`healthChecks()`**
- Local: `healthChecksLocal()` → docker compose ps
- EC2: `healthChecksEC2()` → Remote status check via SSH

**Modification Scenarios**
- Add/modify deployment phases: `ExecuteWithPlugins()` function in `runner.go`
- Change EC2 deployment logic: `buildImagesEC2()`, `deployContainersEC2()` functions
- Change local deployment logic: `buildImagesLocal()`, `deployContainersLocal()` functions

---

### 3. Service Detection (Framework Detection)

**File Location**
- **Plugin Definition**: `arfni-gui/src-tauri/resources/plugins/bundled/framework/`
- **Go Detection Logic**: `BE/arfni/internal/core/workflow/dockerfile.go`
- **Dockerfile Generation**: `BE/arfni/internal/core/workflow/dockerfile_writer.go`

**Plugin Structure**

```
framework/springboot/
├── plugin.yaml           # Detection rules definition
└── templates/
    └── Dockerfile.tmpl   # Dockerfile template
```

**plugin.yaml Structure** (example: react/plugin.yaml)

```yaml
apiVersion: v0.1name: reactdisplayName: Reactversion: 1.1.0category: frameworkdetection:  enabled: true  priority: 10               # Higher value = higher priority  required_files:    - package.json  file_content_patterns:    package.json:      contains: ["\"react\""]provides:  service_kinds:    - app.react
```

**Detection Process**

1. Call `DetectBuildType()` function
2. Scan plugin directories (bundled and installed)
3. Check `required_files` existence
4. Match `file_content_patterns`
5. Sort by `priority` and return first match

**Adding New Framework**

1. Create `plugins/bundled/framework/[name]/` folder
2. Write `plugin.yaml`:
    - `detection`: Detection rules (required_files, file_content_patterns, priority)
    - `provides`: Provided service_kinds
3. Write `templates/Dockerfile.tmpl`
4. Validate with test project

---

### 4. SSH and File Upload

**File Location**
- **Go**: `BE/arfni/internal/core/workflow/ssh.go`
- **Rust**: `arfni-gui/src-tauri/src/commands/ssh.rs` (SSH key management)

**Key Functions**

- `NewSSHClient()`: Create SSH client, load .arfniignore
- `UploadFile()`: Single file SCP transfer
- `UploadDirectory()`: Recursive directory transfer, auto-apply .arfniignore patterns
- `RunCommand()`: Execute SSH command
- `RunCommandWithOutput()`: Execute SSH command and return output
- `CheckDockerInstalled()`: Check Docker installation, auto-install if missing
- `PrepareWorkdir()`: Prepare EC2 working directory

**File Upload Exclusion**

`.arfniignore` patterns auto-applied in `UploadDirectory()` function:

```go
if c.arfniIgnore != nil && c.arfniIgnore.ShouldIgnore(localPath) {    stream.Info(fmt.Sprintf("Skipping ignored item: %s", entry.Name()))    continue}
```

**Modification Scenarios**
- Optimize file transfer: Modify `UploadDirectory()` function
- Implement SSH connection pool: Extend `SSHClient` struct

---

### 5. arfniignore System

**File Location**
- **Go Parser**: `BE/arfni/internal/core/workflow/arfniignore.go`
- **Initial Creation**: `arfni-gui/src-tauri/src/commands/project.rs` (create_project function)
- **Application**: `ssh.go` (UploadDirectory function)

**How It Works**

1. Auto-generate `.arfniignore` file on project creation
2. Call `LoadArfniIgnore()` when creating SSH client
3. Pattern matching with `ShouldIgnore()` function during file upload
4. Exclude from upload if matched

**Key Functions**

- `LoadArfniIgnore()`: Parse .arfniignore file, use default patterns if missing
- `ShouldIgnore()`: Check if file path matches exclusion patterns
- `matchPattern()`: Pattern matching logic (wildcards, exact names, directories)
- `getDefaultIgnorePatterns()`: Return default exclusion patterns

**Supported Patterns**

```
node_modules/    # Exact name
*.log            # Wildcard
build/           # Directory
**/*.pyc         # Recursive pattern
# comment        # Comment
```

**Modification Scenarios**
- Change default patterns: Modify `getDefaultIgnorePatterns()` function
- Improve pattern matching logic: Modify `matchPattern()` function

---

### 6. Canvas (Visual Editor)

**File Location**
- **React Features**: `arfni-gui/src/features/canvas/`
- **React Pages**: `arfni-gui/src/pages/canvas/`
- **Widgets**: `arfni-gui/src/widgets/canvas-editor/`
- **Entities**: `arfni-gui/src/entities/`

**Key Files**
- `features/canvas/hooks/useCanvasNodes.ts`: Node state management
- `features/canvas/lib/yamlConverter.ts`: YAML ↔︎ Canvas conversion
- `entities/service/ui/ServiceNode.tsx`: Service node component
- `entities/target/ui/TargetNode.tsx`: Target node component

**Node Types**
- `service`: Application services (React, Spring Boot, etc.)
- `target`: Deployment targets (Local, EC2)
- `database`: Databases (MySQL, PostgreSQL, etc.)
- `monitoring`: Monitoring (Prometheus, Grafana)

**Modification Scenarios**
- Add new node type: Create new folder under `entities/`
- YAML conversion logic: Modify `features/canvas/lib/yamlConverter.ts`

---

### 7. Monitoring

**File Location**
- **Go**: `BE/arfni/cmd/arfni-monitoring/main.go`
- **Rust**: `arfni-gui/src-tauri/src/commands/monitoring.rs`
- **React**: `arfni-gui/src/pages/logs/ui/MonitoringView.tsx`

**Monitoring Modes**
- `all-in-one`: Prometheus + Grafana running locally
- `hybrid`: Prometheus local, Grafana remote
- `no-monitoring`: Monitoring disabled

**Prometheus Configuration Generation**
- `BE/arfni/internal/core/monitoring/prometheus.go`

**Modification Scenarios**
- Add monitoring metrics: Modify `prometheus.go`
- Grafana dashboards: Modify `plugins/bundled/monitoring/grafana/provisioning/`

---

### 8. EC2 Optimization and Cost Estimation

**File Location**
- **React UI**: `arfni-gui/src/pages/logs/ui/OptimizeView.tsx`
- **Dialog**: `arfni-gui/src/widgets/toolbar/ui/dialogs/OptimizeDialog.tsx`
- **Rust Command**: `arfni-gui/src-tauri/src/commands/pricing.rs`
- **Go Logic**: `BE/arfni/internal/pricing/`

**Features**
- EC2 instance type price lookup
- Service resource requirement analysis
- Optimal instance type recommendation
- Monthly cost estimation

**Modification Scenarios**
- Update price data: Modify `BE/arfni/internal/pricing/data/`
- Improve recommendation logic: Modify `pricing.rs`
- UI improvements: Modify `OptimizeView.tsx` or `OptimizeDialog.tsx`

---

### 9. Log System

**File Location**
- **Go Event Stream**: `BE/arfni/internal/events/stream.go`
- **Rust Log Reception**: `arfni-gui/src-tauri/src/commands/deployment.rs`
- **React Log Viewer**: `arfni-gui/src/pages/logs/ui/LogPage.tsx`
- **Widget**: `arfni-gui/src/widgets/log-viewer/`

**Log Levels**
- `INFO`: General information
- `SUCCESS`: Success message
- `WARNING`: Warning
- `ERROR`: Error

**Modification Scenarios**
- Change log format: Modify `stream.go`
- Log filtering: Modify `LogPage.tsx`

---

## Architecture

### Overall Data Flow

```
User (GUI)
    ↓ invoke()
Tauri Command (Rust)
    ↓ spawn Go binary
Go IC Engine
    ↓ SSH/Docker API
Docker / EC2
```

### Deployment Sequence

```
1. User clicks Deploy
2. React → invoke('deploy', projectPath)
3. Tauri deployment.rs → spawn arfni-go binary
4. Go IC Engine → ExecuteWithPlugins()
5. Execute Phases 1-5:
   - Phase 2: generateFiles() → Generate Dockerfile, docker-compose.yml
   - Phase 3: buildImages() → Build images
   - Phase 4: deployContainers() → Deploy containers
   - Phase 5: healthChecks() → Status check
6. Send logs via event stream (stream.Info, stream.Success, etc.)
7. Tauri → React log display
8. Completion notification
```

---

## Debugging

### Go Logs

```bash
# IC engine logs (during deployment)tail -f /path/to/project/.arfni/logs/ic.log
# Monitoring logstail -f monitoring.log
```

### Rust Debug Mode

```bash
cd arfni-gui
npm run tauri dev  # Chromium DevTools auto-opens
```

### React DevTools

Chromium DevTools available in Tauri dev mode
- Windows: `Ctrl+Shift+I`
- Mac: `Cmd+Option+I`

---

## Coding Conventions

### Go

- Formatter: `gofmt`
- Linter: `golangci-lint`
- File naming: `snake_case.go`
- Functions: `PascalCase` (public), `camelCase` (private)

### Rust

- Formatter: `cargo fmt`
- Linter: `cargo clippy`
- File naming: `snake_case.rs`
- Functions: `snake_case`

### TypeScript/React

- Formatter: `Prettier`
- Linter: `ESLint`
- File naming: `PascalCase.tsx` (components), `camelCase.ts` (utils)
- Components: `PascalCase`
- Functions: `camelCase`

---

## Testing

### Go Tests

```bash
cd BE/arfni
go test ./...
```

### Rust Tests

```bash
cd arfni-gui/src-tauri
cargo test
```

---

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/ArfniFeature`)
3. Commit your changes (`git commit -m 'Add some ArfniFeature'`)
4. Push to the branch (`git push origin feature/ArfniFeature`)
5. Open a Pull Request

---

## How to Report Issues

If you find a bug or want to suggest an improvement, please contact us by email.

**Contact: arfni201@googlegroups.com**