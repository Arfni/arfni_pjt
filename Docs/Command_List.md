# Command List

## 1. 플러그인 체크

### **Command Name**

`list_targets`

### **Description**

- 프로그램 초기 실행 시 **적용된 플러그인 목록을 스캔**합니다.
- 플러그인 정보는 `plugins.json` 파일로 저장되며, React에서 이를 읽어 표시할 수 있습니다.

### **Parameters**

- 없음

### **Return**

- `Vec<PluginInfo>` 형태 (JSON 파일 생성 포함)

```json
[
  {
    "file_name": "deploy-ec2-x86_64-pc-windows-msvc.exe",
    "target_name": "deploy-ec2",
    "size": 2946560,
    "path": "C:\\Users\\SSAFY\\AppData\\Local\\arfni-gui\\plugins\\deploy-ec2-x86_64-pc-windows-msvc.exe"
  }
]

```

---

## 2. 플러그인 목록 불러오기

### **Command Name**

`read_plugins`

### **Description**

- `data/plugins.json` 파일을 읽어 **현재 저장된 플러그인 목록**을 반환합니다.

### **Parameters**

- 없음

### **Return**

- 플러그인 리스트(JSON 배열)

---

## 3. 단일 SSH 실행

### **Command Name**

`ssh_exec_system`

### **Description**

- EC2에 **1회 연결**하여 단일 명령을 실행하고 결과(stdout)를 문자열로 반환합니다.
- 실행 후 SSH 연결은 자동으로 종료됩니다.

### **Parameters**

```rust
#[derive(Deserialize)]
pub struct SshSimpleParams {
  pub host: String,     // "ec2-13-...amazonaws.com"
  pub user: String,     // "ec2-user"
  pub pem_path: String, // 키 파일 절대 경로
  pub cmd: String,      // "uname -a" 등
}

```

### **Return**

- `Ok(String)` : 원격 명령 실행 결과(stdout 전체)
- `Err(String)` : 실패 사유(종료 코드, stderr 포함)

### **내부 동작**

```rust
exec_once_via_system_ssh(host, user, pem_path, cmd)
// ssh -i <pem> -o StrictHostKeyChecking=accept-new <user@host> "<cmd>"

```

### **React 예시**

```tsx
const out = await invoke<string>("ssh_exec_system", {
  params: {
    host: "ec2-13-125-96-150.ap-northeast-2.compute.amazonaws.com",
    user: "ec2-user",
    pem_path: "C:\\Users\\SSAFY\\Downloads\\mytest.pem",
    cmd: "uname -a",
  },
});
console.log(out);

```

### **실패 예시**

```
"ssh exited with status Some(255): Permission denied (publickey)."

```

---

## 4. EC2 설정 추가/갱신

### **Command Name**

`ec2_add_entry`

### **Description**

- EC2 접속 설정을 **추가**하거나, 동일 `(host, user)`가 존재할 경우 **pem_path만 갱신**합니다.
- 변경 후 자동 정렬 및 JSON 저장이 수행됩니다.

### **Parameters**

```rust
#[derive(Deserialize)]
pub struct SshValue {
  pub host: String,
  pub user: String,
  pub pem_path: String,
}

```

### **Return**

- `Ok(())` : 성공
- `Err(String)` : 파일 입출력, 직렬화 실패 등

### **저장 정책**

- 중복 키 기준: `(host, user)`
- 정렬 기준: `(host, user)` 오름차순
- 저장 파일: `./data/ssh_targets.json`
- 원자적 저장: `json.tmp` 생성 후 rename 처리

---

## 5. EC2 설정 전체 조회

### **Command Name**

`ec2_read_entry`

### **Description**

- 저장된 EC2 설정을 **리스트 형태**로 반환합니다.
- 파일이 없거나 비어 있을 경우 빈 배열(`[]`)을 반환합니다.

### **Parameters**

- 없음

### **Return**

```rust
Vec<SshParams> // { host, user, pem_path }

```

### **비고**

- 내부적으로 `load_all()` 사용
- 파일 미존재/빈 파일 시 → `Ok([])`

---

## 6. EC2 설정 삭제

### **Command Name**

`ec2_delete_entry`

### **Description**

- `(host, user)` 일치 항목을 찾아 삭제한 후, 파일을 갱신합니다.

### **Parameters**

```rust
#[derive(Deserialize)]
pub struct DeletePayload {
  pub host: String,
  pub user: String,
}

```

### **Return**

- `Ok(true)` : 삭제 성공 (변경 발생)
- `Ok(false)` : 대상 항목 없음 (변경 없음)
- `Err(String)` : JSON 읽기/쓰기 실패

## 7. 플러그인 실행

### **Command Name**

`run_plugin`

### **Description**

- `plugins.json`에 등록된 **플러그인(target_name)** 을 찾아 exe를 실행합니다.
- 표준 출력(stdout)을 문자열로 반환합니다.

### **Parameters**

```rust
#[derive(Deserialize)]
pub struct PluginRunRequest {
  pub target_name: String,      // 예: "deploy-ec2"
  pub timeout_secs: Option<u64> // (선택) 실행 제한 시간(초). 미지정 시 기본값 사용
}

```

### **Return**

- `Ok(String)` : 플러그인이 출력한 stdout 전체
- `Err(String)` : 플러그인 미발견, 실행 실패, 타임아웃 등

### **실패 예시**

```
"plugin not found: deploy-ec2"
"process exited with code 1: <stderr 내용>"
"execution timed out after 120s"

```

## 8. 플러그인 실행(임의 JSON 파라미터 전달)

### **Command Name**

`run_plugin_with_params`

### **Description**

- 플러그인(target_name)을 찾아 실행하고, **임의 구조의 JSON 파라미터**를 전달합니다.
- 커맨드 시그니처에 고정 스키마가 없으며, 모든 파라미터를 `serde_json::Value`로 수신합니다.
- 플러그인은 표준입력(stdin)·명령행 인자(arg)·환경변수(env) 중 선택된 방식으로 JSON을 전달받습니다.
- 실행 결과의 **stdout 전체를 문자열**로 반환합니다.

### **Parameters**

```rust
#[derive(Deserialize)]
pub struct PluginRunWithParamsRequest {
  pub target_name: String,           // 예: "deploy-ec2"
  pub payload: serde_json::Value,    // 자유형 JSON (객체/배열/스칼라 모두 허용)
  pub pass_mode: Option<String>,     // (선택) "stdin" | "arg" | "env" (기본: "stdin")
  pub timeout_secs: Option<u64>      // (선택) 실행 제한 시간(초), 미지정 시 기본값 사용
}

```

- `target_name`: `plugins.json`에 등록된 플러그인 식별자
- `payload`: 플러그인에 그대로 전달할 임의 JSON
- `pass_mode`:
    - `"stdin"`: JSON을 표준입력으로 전달 (**권장**)
    - `"arg"`: `-json '<payload>'` 형태로 인자 전달
    - `"env"`: 환경변수 `ARFNI_PARAMS=<payload>`로 전달
- `timeout_secs`: 지정 시간 내 종료되지 않으면 타임아웃 처리

### **Return**

- `Ok(String)` : 플러그인이 출력한 stdout 전체
- `Err(String)` : 플러그인 미발견, 실행 실패, 파라미터 직렬화 실패, 타임아웃 등

### **실패 예시**

```
"plugin not found: deploy-ec2"
"failed to serialize payload to JSON"
"process exited with code 2: invalid json payload"
"execution timed out after 180s"

```