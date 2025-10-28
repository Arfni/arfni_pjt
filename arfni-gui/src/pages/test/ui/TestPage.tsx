import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ChevronDown, ChevronRight, Bug } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
// ✅ Tauri v2: dialog/confirm 모두 plugin에서 import
import { open, confirm } from "@tauri-apps/plugin-dialog";

type TargetEntry = {
  file_name: string;
  target_name: string;
  size: number;
  path: string;
};

type Ec2Entry = {
  host: string;
  user: string;
  pem_path: string;
};

function Section({
  title,
  open: opened,
  onToggle,
  children,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-white rounded-lg shadow border">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 rounded-t-lg"
      >
        <span className="font-semibold">{title}</span>
        {opened ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
      </button>
      {opened && <div className="p-4 border-t">{children}</div>}
    </section>
  );
}

export default function TestPage() {
  const navigate = useNavigate();

  const [items, setItems] = useState<TargetEntry[]>([]);
  const [items2, setItems2] = useState<TargetEntry[]>([]);
  const [loading, setLoading] = useState(false);

  // Accordion states
  const [openFiles, setOpenFiles] = useState(true);
  const [openAdd, setOpenAdd] = useState(true);
  const [openSaved, setOpenSaved] = useState(true);
  const [openExec, setOpenExec] = useState(true);

  // === EC2 저장 폼 상태 ===
  const [host, setHost] = useState("");
  const [user, setUser] = useState("ec2-user");
  const [pemPath, setPemPath] = useState("");
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  // === EC2 목록 ===
  const [ec2List, setEc2List] = useState<Ec2Entry[]>([]);
  const [ec2Loading, setEc2Loading] = useState(false);

  // === SSH 실행 ===
  const [execHost, setExecHost] = useState("");
  const [execUser, setExecUser] = useState("ec2-user");
  const [execPemPath, setExecPemPath] = useState("");
  const [execCmd, setExecCmd] = useState("uname -a");
  const [execOut, setExecOut] = useState<string>("");

  // 삭제 진행 표시용
  const [delBusyKey, setDelBusyKey] = useState<string | null>(null);

  // 플러그인 목록 미리 로드
  useEffect(() => {
    async function fetchPlugins() {
      try {
        const list2 = await invoke<TargetEntry[]>("read_plugins");
        setItems2(list2);
      } catch (err) {
        console.error("Failed to read plugins:", err);
      }
    }
    fetchPlugins();
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const list = await invoke<TargetEntry[]>("list_targets");
      const list2 = await invoke<TargetEntry[]>("read_plugins");
      setItems(list);
      setItems2(list2);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  // === EC2 추가 ===
  const pickPemFile = useCallback(async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: "PEM Files", extensions: ["pem"] }],
        title: "PEM 파일 선택",
      });
      console.log("dialog open() result:", selected);
      if (selected === null) return;
      if (Array.isArray(selected)) setPemPath(selected[0] ?? "");
      else if (typeof selected === "string") setPemPath(selected);
    } catch (e) {
      console.error("open() failed:", e);
      setSaveStatus("❌ 파일 선택 실패: " + String(e));
    }
  }, []);

  const addEc2Entry = useCallback(async () => {
    setSaveStatus(null);
    if (!host || !user || !pemPath) {
      setSaveStatus("⚠️ host/user/pem_path를 모두 입력해주세요.");
      return;
    }
    try {
      await invoke("ec2_add_entry", {
        params: { host, user, pem_path: pemPath },
      });
      setSaveStatus("✅ 저장 완료");
      await loadEc2List();
    } catch (err) {
      console.error(err);
      setSaveStatus("❌ 저장 실패: " + String(err));
    }
  }, [host, user, pemPath]);

  // === EC2 목록 불러오기 ===
  const loadEc2List = useCallback(async () => {
    setEc2Loading(true);
    try {
      const list = await invoke<Ec2Entry[]>("ec2_read_entry");
      setEc2List(list);
    } catch (err) {
      console.error(err);
    } finally {
      setEc2Loading(false);
    }
  }, []);

  useEffect(() => {
    loadEc2List();
  }, [loadEc2List]);

  // === 삭제 ===
  const deleteEntry = useCallback(
    async (host: string, user: string) => {
      // 이미 삭제 진행 중이면 무시
      if (delBusyKey) return;

      // 1) 먼저 확인 모달(비동기)
      const ok = await confirm(`삭제하시겠습니까?\n${user}@${host}`, {
        title: "삭제 확인",
        kind: "warning",
        okLabel: "삭제",
        cancelLabel: "취소",
      });
      if (!ok) return;

      // 2) 확인 후에만 실제 삭제 실행
      const key = `${host}__${user}`;
      setDelBusyKey(key);
      try {
        // 백엔드가 host/user만 받도록 바뀌었다면 아래 그대로.
        // (아직 SshValue면 params에 pem_path: ""를 추가하세요)
        const removed = await invoke<boolean>("ec2_delete_entry", {
          params: { host, user },
        });
        if (removed) {
          setEc2List((prev) => prev.filter((e) => !(e.host === host && e.user === user)));
        } else {
          alert("삭제 대상이 없습니다.");
        }
      } catch (e) {
        console.error(e);
        alert("삭제 실패: " + String(e));
      } finally {
        setDelBusyKey(null);
      }
    },
    [delBusyKey]
  );

  // === SSH 단일 커맨드 실행 ===
  const runSSH = useCallback(async () => {
    setExecOut("");
    if (!execHost || !execUser || !execPemPath || !execCmd) {
      setExecOut("⚠️ 실행에 필요한 값이 비었습니다.");
      return;
    }
    try {
      const out = await invoke<string>("ssh_exec_system", {
        params: {
          host: execHost,
          user: execUser,
          pem_path: execPemPath,
          cmd: execCmd,
        },
      });
      setExecOut(out ?? "");
    } catch (err) {
      console.error(err);
      setExecOut("❌ 실행 실패: " + String(err));
    }
  }, [execHost, execUser, execPemPath, execCmd]);

  const hasItems = useMemo(() => items.length > 0, [items]);
  const hasPlugins = useMemo(() => items2.length > 0, [items2]);

  // === Dialog 플러그인 동작 확인용 디버그 버튼 ===
  const testDialog = useCallback(async () => {
    try {
      const res = await open({ directory: true, title: "Dialog 플러그인 동작 테스트" });
      console.log("Dialog test:", res);
      alert(`Dialog result: ${res}`);
    } catch (e) {
      console.error("Dialog test error:", e);
      alert("Dialog error: " + String(e));
    }
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/")}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-xl font-semibold">테스트 페이지</h1>

          <button
              onClick={() => navigate("/test2")}
              className="ml-auto px-3 py-1 border rounded hover:bg-gray-100 text-sm"
              title="PluginRunner 페이지로 이동">
              Plugin Runner
          </button>

          <button
              onClick={() => navigate("/test3")}
              className="ml-auto px-3 py-1 border rounded hover:bg-gray-100 text-sm"
              title="ssh 페이지로 이동">
              ssh test
          </button>
          <button
            onClick={testDialog}
            className="ml-auto flex items-center gap-1 px-2 py-1 border rounded hover:bg-gray-100 text-sm"
            title="Dialog 플러그인 동작 확인"
          >
            <Bug className="w-4 h-4" />
            Dialog Test
          </button>
        </div>
      </header>

      {/* 본문 */}
      <main className="p-6 max-w-5xl mx-auto space-y-6">
        <Section
          title="파일/플러그인 목록 테스트"
          open={openFiles}
          onToggle={() => setOpenFiles((v) => !v)}
        >
          <div className="flex items-center gap-3">
            <button
              onClick={refresh}
              className="px-3 py-1 border rounded bg-white hover:bg-gray-100"
            >
              파일 목록 불러오기
            </button>
            {loading && <span className="text-gray-500">로딩 중...</span>}
          </div>

          {hasItems && (
            <div className="mt-4">
              <h3 className="font-semibold mb-2">파일 목록</h3>
              <ul className="list-disc list-inside bg-white rounded-lg border p-4">
                {items.map((item) => (
                  <li key={item.file_name}>
                    {item.target_name} ({item.size} bytes)
                  </li>
                ))}
              </ul>
            </div>
          )}

          {hasPlugins && (
            <div className="mt-6">
              <h3 className="font-semibold mb-2">플러그인 목록</h3>
              <ul className="list-disc list-inside bg-white rounded-lg border p-4">
                {items2.map((item) => (
                  <li key={item.file_name}>
                    {item.target_name} ({item.size} bytes)
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Section>

        <Section title="EC2 SSH 항목 추가" open={openAdd} onToggle={() => setOpenAdd((v) => !v)}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-gray-600">Host</label>
              <input
                className="w-full border rounded px-2 py-1"
                value={host}
                onChange={(e) => setHost(e.target.value)}
                placeholder="ec2-13-xx-xx-xx.ap-northeast-2.compute.amazonaws.com"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-600">User</label>
              <input
                className="w-full border rounded px-2 py-1"
                value={user}
                onChange={(e) => setUser(e.target.value)}
                placeholder="ec2-user"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm text-gray-600">PEM Path</label>
              <div className="flex gap-2">
                <input
                  className="flex-1 border rounded px-2 py-1"
                  value={pemPath}
                  onChange={(e) => setPemPath(e.target.value)}
                  placeholder="C:\\Users\\me\\my-key.pem"
                />
                <button
                  onClick={pickPemFile}
                  className="px-3 py-1 border rounded bg-white hover:bg-gray-100"
                >
                  파일 선택
                </button>
              </div>
            </div>
          </div>

          <div className="pt-2">
            <button
              onClick={addEc2Entry}
              className="px-3 py-1 border rounded bg-white hover:bg-gray-100"
            >
              저장
            </button>
            {saveStatus && <span className="ml-3 text-sm">{saveStatus}</span>}
          </div>
        </Section>

        <Section title="저장된 EC2 목록" open={openSaved} onToggle={() => setOpenSaved((v) => !v)}>
          <div className="flex items-center gap-3">
            <button
              onClick={loadEc2List}
              className="px-3 py-1 border rounded bg-white hover:bg-gray-100"
            >
              새로고침
            </button>
            {ec2Loading && <span className="text-gray-500">로딩 중...</span>}
          </div>

          <div className="mt-3 grid gap-2">
            {ec2List.length === 0 && (
              <div className="text-gray-500 text-sm">저장된 항목이 없습니다.</div>
            )}
            {ec2List.map((e) => {
              const busy = delBusyKey === `${e.host}__${e.user}`;
              return (
                <div
                  key={`${e.host}-${e.user}`}
                  className="flex items-center justify-between border rounded p-2"
                >
                  <div>
                    <div className="font-mono text-sm">
                      {e.user}@{e.host}
                    </div>
                    <div className="text-gray-600 text-xs">{e.pem_path}</div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      className="px-2 py-1 border rounded hover:bg-gray-100 text-sm"
                      onClick={() => {
                        setExecHost(e.host);
                        setExecUser(e.user);
                        setExecPemPath(e.pem_path);
                        setOpenExec(true);
                      }}
                    >
                      실행에 사용
                    </button>
                    <button
                      className="px-2 py-1 border rounded hover:bg-red-50 text-sm text-red-600 disabled:opacity-50"
                      onClick={(evt) => {
                        evt.preventDefault(); // 폼 submit 등 기본 동작 방지
                        evt.stopPropagation(); // 상위 버튼/섹션 클릭으로 버블링 방지
                        deleteEntry(e.host, e.user);
                      }}
                      disabled={busy}
                      title="이 항목 삭제"
                    >
                      {busy ? "삭제 중..." : "삭제"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </Section>

        <Section title="SSH 단일 커맨드 실행" open={openExec} onToggle={() => setOpenExec((v) => !v)}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-gray-600">Host</label>
              <input
                className="w-full border rounded px-2 py-1"
                value={execHost}
                onChange={(e) => setExecHost(e.target.value)}
                placeholder="ec2-13-xx-xx-xx.ap-northeast-2.compute.amazonaws.com"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600">User</label>
              <input
                className="w-full border rounded px-2 py-1"
                value={execUser}
                onChange={(e) => setExecUser(e.target.value)}
                placeholder="ec2-user"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm text-gray-600">PEM Path</label>
              <input
                className="w-full border rounded px-2 py-1"
                value={execPemPath}
                onChange={(e) => setExecPemPath(e.target.value)}
                placeholder="C:\\Users\\me\\my-key.pem"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm text-gray-600">Command</label>
              <input
                className="w-full border rounded px-2 py-1 font-mono"
                value={execCmd}
                onChange={(e) => setExecCmd(e.target.value)}
                placeholder="uname -a"
              />
            </div>
          </div>

          <div className="mt-2">
            <button
              onClick={runSSH}
              className="px-3 py-1 border rounded bg-white hover:bg-gray-100"
            >
              실행
            </button>
          </div>

          {execOut && (
            <pre className="mt-3 bg-gray-900 text-gray-100 p-3 rounded text-sm overflow-x-auto">
{execOut}
            </pre>
          )}
        </Section>
      </main>
    </div>
  );
}
