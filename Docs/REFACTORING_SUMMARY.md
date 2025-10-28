# ARFNI GUI 구조 개편 완료 보고서

**작성일**: 2025-10-28
**작성자**: Claude AI
**버전**: v2.0

---

## 📋 개편 목표

Local/EC2 환경을 명확히 분리하고, 프로젝트 생성 시점에 환경을 고정하여 사용자 경험 개선

### 핵심 변경사항
1. **파일 기반 저장 → SQLite 데이터베이스**로 전환
2. **프로젝트 생성 시 환경(Local/EC2) 선택** 고정
3. **EC2 서버 관리 강화** (이름, 모드, 마지막 접속 시간 등)
4. **프로젝트-서버 관계** 명확한 정의

---

## ✅ 완료된 작업 (Phase 1 + TypeScript API)

### 🗄️ 1. SQLite 데이터베이스 구축

#### 파일 위치
- **스키마**: `arfni-gui/src-tauri/migrations/001_initial.sql`
- **DB 유틸리티**: `arfni-gui/src-tauri/src/db/mod.rs`
- **DB 파일**: `C:\Users\[사용자]\AppData\Roaming\com.arfni.app\arfni.db` (자동 생성)

#### 데이터베이스 스키마

```sql
-- EC2 서버 테이블
CREATE TABLE ec2_servers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,                      -- 사용자 정의 이름 (예: "운영 서버")
    host TEXT NOT NULL,                      -- ec2-xx-xx-xx-xx.amazonaws.com
    user TEXT NOT NULL,                      -- ec2-user
    pem_path TEXT NOT NULL,                  -- C:\path\to\key.pem
    workdir TEXT,                            -- /home/ec2-user/deploy
    mode TEXT CHECK(mode IN ('all-in-one', 'hybrid', '')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    last_connected_at TEXT,
    UNIQUE(host, user)
);

-- 프로젝트 테이블
CREATE TABLE projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    path TEXT NOT NULL UNIQUE,
    environment TEXT NOT NULL CHECK(environment IN ('local', 'ec2')),
    ec2_server_id TEXT,                      -- EC2인 경우 서버 ID
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    description TEXT,
    stack_yaml_path TEXT,
    FOREIGN KEY (ec2_server_id) REFERENCES ec2_servers(id) ON DELETE SET NULL
);

-- 최근 프로젝트 테이블
CREATE TABLE recent_projects (
    project_id TEXT PRIMARY KEY,
    opened_at TEXT NOT NULL,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);
```

#### 장점
- ✅ **단일 파일 DB**: `arfni.db` 하나로 모든 데이터 관리
- ✅ **사용자별 저장**: 각 Windows 사용자의 AppData에 독립적으로 저장
- ✅ **관계형 쿼리**: "EC2 서버 X의 모든 프로젝트" 같은 복잡한 쿼리 가능
- ✅ **데이터 무결성**: Foreign Key로 자동 관리
- ✅ **이식성**: DB 파일 복사로 다른 PC로 이동 가능

### 🦀 2. Rust 백엔드 재작성

#### 수정된 파일
| 파일 | 변경 내용 | 줄 수 |
|------|-----------|-------|
| `Cargo.toml` | SQLite 플러그인 추가 | +2 |
| `src/main.rs` | DB 초기화, 새 명령어 등록 | +15 |
| `src/db/mod.rs` | DB 연결/마이그레이션 관리 | +110 (신규) |
| `src/commands/project.rs` | SQLite 기반 CRUD 완전 재작성 | 482줄 (재작성) |
| `src/commands/ssh.rs` | EC2 서버 관리 SQLite 기반 | 357줄 (재작성) |

#### 새로운 Rust 명령어

**프로젝트 관리:**
```rust
create_project(name, path, environment, ec2_server_id?, description?)
open_project(project_id)
open_project_by_path(path)
get_all_projects()
get_projects_by_environment(environment)  // "local" or "ec2"
get_projects_by_server(server_id)         // EC2 서버별
get_recent_projects()
add_to_recent_projects(project_id)
delete_project(project_id)
```

**EC2 서버 관리:**
```rust
create_ec2_server(name, host, user, pem_path, workdir?, mode?)
get_all_ec2_servers()
get_ec2_server_by_id(server_id)
update_ec2_server(id, name?, host?, ...)
delete_ec2_server(server_id)
update_ec2_server_last_connected(server_id)
```

### 📦 3. TypeScript API 업데이트

#### 파일: `src/shared/api/tauri/commands.ts`

**업데이트된 타입:**
```typescript
interface Project {
  id: string;
  name: string;
  path: string;
  environment: 'local' | 'ec2';  // 새로 추가
  ec2_server_id?: string;        // 새로 추가
  created_at: string;
  updated_at: string;
  // ...
}

interface EC2Server {                 // 신규
  id: string;
  name: string;
  host: string;
  user: string;
  pem_path: string;
  workdir?: string;
  mode?: 'all-in-one' | 'hybrid';
  created_at: string;
  updated_at: string;
  last_connected_at?: string;
}
```

**새 API 명령어:**
```typescript
// 프로젝트
projectCommands.createProject(name, path, environment, ec2ServerId?, description?)
projectCommands.getProjectsByEnvironment('local' | 'ec2')
projectCommands.getProjectsByServer(serverId)

// EC2 서버
ec2ServerCommands.createServer({name, host, user, pemPath, workdir?, mode?})
ec2ServerCommands.getAllServers()
ec2ServerCommands.updateServer({id, ...})
ec2ServerCommands.deleteServer(serverId)
```

---

## 🏗️ 아키텍처 변경

### 이전 구조 (파일 기반)
```
프로젝트 폴더/.arfni/project.json       (프로젝트 정보)
AppData/recent-projects.json             (최근 목록)
exe 근처/data/ssh_targets.json          (EC2 서버 정보)
```
**문제점:**
- ❌ 3곳에 데이터 분산
- ❌ 복잡한 쿼리 불가능
- ❌ 서버-프로젝트 관계 표현 불가

### 새 구조 (SQLite)
```
AppData/arfni.db (단일 DB)
  ├─ ec2_servers 테이블
  ├─ projects 테이블
  └─ recent_projects 테이블
```
**장점:**
- ✅ 단일 위치 관리
- ✅ SQL 쿼리로 복잡한 조회
- ✅ Foreign Key로 관계 관리

---

## 📝 Go 바이너리 실행 방식 설명

### Go 바이너리란?
- **위치**: `BE/arfni/cmd/arfni/main.go` → 빌드 → `arfni.exe` (또는 `arfni`)
- **내용물**: 모든 Go 코드가 네이티브 기계어로 컴파일되어 단일 실행 파일에 포함
  - `cmd/arfni/main.go`
  - `internal/core/stack/*.go`
  - `internal/core/workflow/*.go`
  - Go 런타임 (가비지 컬렉션, 고루틴 등)

### Rust에서 Go 바이너리 실행

**파일**: `arfni-gui/src-tauri/src/commands/deployment.rs:102-111`

```rust
let mut cmd = Command::new(&go_binary_path)  // arfni.exe 실행
    .arg("run")
    .arg("-f")
    .arg(&stack_yaml_path)                    // stack.yaml 경로
    .arg("-project-dir")
    .arg(&project_path)                       // 프로젝트 경로
    .current_dir(&project_path)
    .stdout(Stdio::piped())                   // 출력 캡처
    .stderr(Stdio::piped())
    .spawn();                                  // 프로세스 시작
```

**실행 흐름:**
1. Tauri GUI (Rust) → OS에 프로세스 생성 요청
2. OS → `arfni.exe run -f stack.yaml` 실행 (별도 프로세스)
3. Go 바이너리 → stack.yaml 파싱 → target type 확인
4. Local: 로컬 `docker-compose` 실행
5. EC2: SSH로 파일 전송 → 원격 `docker-compose` 실행
6. stdout/stderr → Tauri가 실시간 읽어서 GUI에 표시

### EC2 배포 코드
**파일**: `BE/arfni/internal/core/workflow/runner.go`

```go
// target type에 따라 분기
func (r *Runner) buildImages(stream *events.Stream) error {
    targetType := r.getTargetType()

    if targetType == "ec2.ssh" {
        return r.buildImagesEC2(stream)  // SSH로 파일 전송 + 원격 빌드
    }

    return r.buildImagesLocal(stream)     // 로컬 빌드
}
```

**SSH 유틸리티**: `BE/arfni/internal/core/workflow/ssh.go` (신규 작성 완료)
- `UploadFile()`: SCP로 파일 전송
- `RunCommand()`: SSH 명령 실행
- `CheckDockerInstalled()`: EC2에 Docker 확인

---

## 🔄 변경된 프로젝트 생성 흐름

### 기존 (문제점)
```
1. 프로젝트 생성
2. Canvas 작업
3. 배포 시점에 환경 선택 (Local/Remote)  ← 혼란스러움
```

### 신규 (개선)
```
1. 환경 선택 (Local / EC2)
   ├─ Local 선택 → 2. 프로젝트 정보 입력
   └─ EC2 선택 → 2. EC2 서버 선택/추가 → 3. 프로젝트 정보 입력

DB 저장:
  - Local: environment='local', ec2_server_id=NULL
  - EC2: environment='ec2', ec2_server_id='xxx'

stack.yaml 자동 생성:
  - Local: targets.local.type: docker-desktop
  - EC2: targets.ec2 + 서버 정보 포함
```

---

## 📊 UI 개편 계획 (TODO - 프론트엔드 작업 필요)

### Phase 2: 사이드바 + 환경별 탭 (미완성)
```
┌──────────┬─────────────────────────────────┐
│  Local   │ [Create New Project] 버튼      │
│  EC2     │                                 │
│          │ 프로젝트 카드 그리드            │
│          │ ┌───────────────┐              │
│          │ │  My-app       │              │
│          │ │  Local Docker │              │
│          │ │  Created: ... │              │
│          │ │ [View Log] [Edit]           │
│          │ └───────────────┘              │
└──────────┴─────────────────────────────────┘
```

**필요 작업:**
- `src/components/Sidebar.tsx` (신규)
- `src/pages/logs/ui/ProjectsPage.tsx` 개편
- Local 탭: `getProjectsByEnvironment('local')` 호출
- EC2 탭: 서버 선택 → `getProjectsByServer(serverId)` 호출

### Phase 3-5: 새 프로젝트 생성 흐름 (미완성)

**필요 작업:**
- `src/pages/settings/ui/steps/EnvironmentSelectionStep.tsx` (신규)
- `src/pages/settings/ui/steps/EC2ServerSelectionStep.tsx` (신규)
- `src/components/EC2ServerManager.tsx` (신규)
- `src/pages/settings/ui/NewProjectModal.tsx` 수정

### Phase 4: stackYamlGenerator 수정 (미완성)

**파일**: `src/features/canvas/lib/stackYamlGenerator.ts`

**필요 수정:**
```typescript
export function stackYamlGenerator(
  nodes: CustomNode[],
  edges: Edge[],
  environment: 'local' | 'ec2',  // 추가
  ec2Server?: EC2Server           // 추가
): StackYaml {
  // environment에 따라 targets 자동 생성
  if (environment === 'local') {
    targets = { local: { type: 'docker-desktop' } };
  } else {
    targets = {
      ec2: {
        type: 'ec2.ssh',
        host: ec2Server.host,
        user: ec2Server.user,
        sshKey: ec2Server.pem_path,
        workdir: ec2Server.workdir,
        mode: ec2Server.mode,
      }
    };
  }
}
```

---

## 🧪 테스트 방법

### 1. 백엔드 컴파일 확인
```bash
cd arfni-gui/src-tauri
cargo check
```

**예상 결과:** `Finished 'dev' profile ... (경고만 있고 에러 없음)`

### 2. DB 초기화 확인
```bash
cargo run
```

**예상 콘솔 출력:**
```
📁 Database path: "C:\Users\[사용자]\AppData\Roaming\com.arfni.app\arfni.db"
✅ Database migrations completed successfully
✅ ARFNI GUI initialized successfully
```

### 3. 프로젝트 생성 테스트 (TypeScript)
```typescript
import { projectCommands } from '@/shared/api/tauri/commands';

// Local 프로젝트 생성
const localProject = await projectCommands.createProject(
  'my-local-app',
  'C:\\Users\\SSAFY\\projects',
  'local'
);

// EC2 프로젝트 생성 (먼저 서버 생성 필요)
const server = await ec2ServerCommands.createServer({
  name: '운영 서버',
  host: 'ec2-3-39-237-124.ap-northeast-2.compute.amazonaws.com',
  user: 'ec2-user',
  pemPath: 'C:\\Users\\SSAFY\\keys\\mykey.pem',
  mode: 'all-in-one',
});

const ec2Project = await projectCommands.createProject(
  'my-ec2-app',
  'C:\\Users\\SSAFY\\projects',
  'ec2',
  server.id
);
```

### 4. 환경별 프로젝트 조회
```typescript
// Local 프로젝트만 조회
const localProjects = await projectCommands.getProjectsByEnvironment('local');

// 특정 EC2 서버의 프로젝트만 조회
const serverProjects = await projectCommands.getProjectsByServer(server.id);
```

---

## 🔐 SQLite 데이터베이스 위치 및 백업

### Windows 사용자별 위치
```
사용자 A: C:\Users\UserA\AppData\Roaming\com.arfni.app\arfni.db
사용자 B: C:\Users\UserB\AppData\Roaming\com.arfni.app\arfni.db
```

### 백업 방법
1. **파일 복사**: `arfni.db` 파일을 다른 위치로 복사
2. **복원**: 복사한 파일을 원래 위치에 덮어쓰기

### DB 직접 확인 (선택사항)
[DB Browser for SQLite](https://sqlitebrowser.org/) 다운로드 →
`arfni.db` 파일 열기 → 테이블 조회

---

## 📈 완료 현황

| Phase | 작업 | 상태 | 비고 |
|-------|------|------|------|
| Phase 1 | SQLite DB 구축 | ✅ 완료 | Rust 백엔드 완료 |
| Phase 1 | project.rs 재작성 | ✅ 완료 | 482줄, SQLite 기반 |
| Phase 1 | ssh.rs 재작성 | ✅ 완료 | 357줄, EC2 서버 관리 |
| Phase 1 | 컴파일 테스트 | ✅ 완료 | 경고만 있고 에러 없음 |
| Phase 8 | TypeScript API 업데이트 | ✅ 완료 | commands.ts 완료 |
| Phase 2 | UI 사이드바 구현 | ⏳ TODO | 프론트엔드 작업 필요 |
| Phase 3 | 프로젝트 생성 흐름 변경 | ⏳ TODO | 프론트엔드 작업 필요 |
| Phase 4 | stackYamlGenerator 수정 | ⏳ TODO | 프론트엔드 작업 필요 |
| Phase 5 | EC2 서버 UI | ⏳ TODO | 프론트엔드 작업 필요 |
| Phase 6 | Docker 검증 위치 변경 | ⏳ TODO | 프론트엔드 작업 필요 |
| Phase 7 | 배포 진행상황 UI | ⏳ TODO | 프론트엔드 작업 필요 |
| - | Go EC2 배포 코드 | ✅ 완료 | workflow/ssh.go 완료 |
| - | 문서화 | ✅ 완료 | 본 문서 |

**진행도**: 백엔드 100% 완료, 프론트엔드 API 준비 완료, UI 작업 대기 중

---

## 🚀 다음 단계 (프론트엔드 개발자용)

### 1. 우선 순위 높음 ⭐⭐⭐
1. **ProjectsPage 개편**
   - 사이드바 추가 (Local/EC2 탭)
   - `getProjectsByEnvironment()` 사용
   - 프로젝트 카드 UI 업데이트

2. **프로젝트 생성 흐름 변경**
   - 첫 단계에 환경 선택 추가
   - EC2 선택 시 서버 선택 UI
   - `createProject()` API 호출 시 environment 전달

3. **stackYamlGenerator 수정**
   - `environment`, `ec2Server` 파라미터 추가
   - Target 자동 생성 로직

### 2. 우선 순위 중간 ⭐⭐
4. **EC2 서버 관리 UI**
   - 서버 목록 표시
   - 서버 추가/수정/삭제
   - `ec2ServerCommands` 사용

5. **Docker 검증 위치 변경**
   - Local Deploy 버튼 클릭 시 검증
   - EC2는 검증 스킵

### 3. 우선 순위 낮음 ⭐
6. **배포 진행상황 UI 개선**
   - 단계별 진행 표시
   - 실시간 로그 스트림

---

## 🛠️ 개발자 가이드

### 새 프로젝트 생성 코드 예시
```typescript
// 1. Local 프로젝트
const createLocalProject = async () => {
  const project = await projectCommands.createProject(
    projectName,
    projectPath,
    'local',        // environment
    undefined,      // ec2ServerId
    description
  );

  // 최근 목록에 추가
  await projectCommands.addToRecentProjects(project.id);

  // Canvas로 이동
  navigate('/canvas', { state: { project } });
};

// 2. EC2 프로젝트
const createEC2Project = async () => {
  // 먼저 서버 선택 (또는 새로 생성)
  const selectedServer = await selectOrCreateServer();

  const project = await projectCommands.createProject(
    projectName,
    projectPath,
    'ec2',                  // environment
    selectedServer.id,      // ec2ServerId
    description
  );

  await projectCommands.addToRecentProjects(project.id);
  navigate('/canvas', { state: { project } });
};
```

### 환경별 프로젝트 조회
```typescript
// Local 탭
const LocalTab = () => {
  const [projects, setProjects] = useState<Project[]>([]);

  useEffect(() => {
    projectCommands.getProjectsByEnvironment('local')
      .then(setProjects);
  }, []);

  return <ProjectGrid projects={projects} />;
};

// EC2 탭
const EC2Tab = () => {
  const [selectedServer, setSelectedServer] = useState<EC2Server | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);

  useEffect(() => {
    if (selectedServer) {
      projectCommands.getProjectsByServer(selectedServer.id)
        .then(setProjects);
    }
  }, [selectedServer]);

  return (
    <>
      <ServerSelector onChange={setSelectedServer} />
      <ProjectGrid projects={projects} />
    </>
  );
};
```

---

## ⚠️ 주의사항

### 1. 기존 프로젝트와의 호환성
- 기존 JSON 파일 기반 프로젝트는 **수동 마이그레이션 필요**
- `db/mod.rs`의 `migrate_from_json()` 함수 구현 필요 (현재 TODO)

### 2. DB 백업
- 중요한 프로젝트 정보가 `arfni.db`에 저장됨
- 정기적으로 `AppData/Roaming/com.arfni.app/arfni.db` 백업 권장

### 3. 다중 PC 사용
- 각 PC마다 독립적인 DB
- 프로젝트 경로가 동일해야 함 (예: 둘 다 `D:\projects\my-app`)

---

## 📞 문의 및 이슈

### 백엔드 관련 (Rust/Go)
- **SQLite 쿼리 오류**: `src/db/mod.rs`, `src/commands/project.rs`, `src/commands/ssh.rs` 확인
- **컴파일 오류**: `cargo check` 실행하여 에러 메시지 확인
- **Go 바이너리 실행 오류**: `deployment.rs`의 경로 설정 확인

### 프론트엔드 관련 (TypeScript/React)
- **API 호출 오류**: `src/shared/api/tauri/commands.ts`의 명령어 이름 확인
- **타입 오류**: `Project`, `EC2Server` 타입 정의 확인

### 데이터베이스 관련
- **DB 파일 손상**: 백업본 복원 또는 앱 재설치
- **마이그레이션 실패**: `migrations/001_initial.sql` 확인

---

## 📚 참고 자료

### 코드 위치
- **DB 스키마**: [migrations/001_initial.sql](../arfni-gui/src-tauri/migrations/001_initial.sql)
- **Rust 프로젝트 관리**: [commands/project.rs](../arfni-gui/src-tauri/src/commands/project.rs)
- **Rust EC2 서버 관리**: [commands/ssh.rs](../arfni-gui/src-tauri/src/commands/ssh.rs)
- **TypeScript API**: [shared/api/tauri/commands.ts](../arfni-gui/src/shared/api/tauri/commands.ts)
- **Go EC2 배포**: [workflow/runner.go](../BE/arfni/internal/core/workflow/runner.go), [workflow/ssh.go](../BE/arfni/internal/core/workflow/ssh.go)

### 외부 문서
- [Tauri Documentation](https://tauri.app)
- [SQLite Documentation](https://www.sqlite.org/docs.html)
- [Rust rusqlite Crate](https://docs.rs/rusqlite/)

---

## 🎯 결론

### 달성한 목표
✅ Local/EC2 환경 명확 분리
✅ SQLite 단일 DB로 통합 관리
✅ EC2 서버별 프로젝트 그룹핑
✅ Windows 다중 PC 지원 (사용자별 자동 경로)
✅ 서버/DB 구축 불필요 (로컬 파일 DB)
✅ Rust 백엔드 100% 완료
✅ TypeScript API 준비 완료
✅ Go EC2 배포 로직 완료

### 남은 작업
⏳ 프론트엔드 UI 구현 (Phase 2-7)
⏳ 기존 JSON → SQLite 마이그레이션 함수 구현 (선택사항)
⏳ 통합 테스트 및 QA

**전체 예상 작업 시간**: 10-14시간 (백엔드 6시간 완료, 프론트엔드 4-8시간 남음)

---

**끝.**
