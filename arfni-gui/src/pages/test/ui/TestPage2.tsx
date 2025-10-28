import { useCallback, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useNavigate } from "react-router-dom";

type Mode = "cli" | "config" | "stdin";
type ArgRow = { id: string; value: string };

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

/** 다양한 형태의 오류를 안전하게 문자열화 */
function asErrorString(e: unknown): string {
  if (e instanceof Error) return e.stack || e.message || String(e);
  if (typeof e === "object" && e !== null) {
    try {
      return JSON.stringify(e);
    } catch {
      return String(e);
    }
  }
  return String(e);
}

/** 러스트 spawn 에러 형식: "exit <code>: <stderr>" 를 파싱 */
function parseSpawnError(msg: string): { exitCode?: number; stderr?: string } {
  const m = msg.match(/^exit\s+(-?\d+)\s*:\s*([\s\S]*)$/);
  if (!m) return {};
  const exitCode = Number(m[1]);
  const stderr = m[2]?.trim();
  return { exitCode, stderr };
}

export default function TestPage2() {
  const navigate = useNavigate();

  const [plugin, setPlugin] = useState("test-dummy");
  const [mode, setMode] = useState<Mode>("cli");

  // CLI 모드 상태
  const [cliArgs, setCliArgs] = useState<ArgRow[]>([
    { id: uid(), value: "--host" },
    { id: uid(), value: "ec2-xxx.amazonaws.com" },
    { id: uid(), value: "--key" },
    { id: uid(), value: "C:\\\\path\\\\to\\\\key.pem" },
    { id: uid(), value: "--user" },
    { id: uid(), value: "ec2-user" },
    { id: uid(), value: "--output" },
    { id: uid(), value: "test_response.json" },
  ]);

  // CONFIG 모드 상태
  const [configPath, setConfigPath] = useState("config/ssh_config.json");
  const [configOutput, setConfigOutput] = useState("test_response.json");

  // STDIN(JSON) 모드 상태
  const [stdinJson, setStdinJson] = useState(
    JSON.stringify(
      {
        host: "ec2-xxx.amazonaws.com",
        user: "ec2-user",
        key: "C:\\\\path\\\\to\\\\key.pem",
        output: "test_response.json",
      },
      null,
      2
    )
  );

  // 실행 결과
  const [running, setRunning] = useState(false);
  const [stdoutText, setStdoutText] = useState("");
  const [errorText, setErrorText] = useState("");

  const cliArgsArray = useMemo(
    () => cliArgs.map((a) => a.value).filter((s) => s.trim().length > 0),
    [cliArgs]
  );

  const isJsonValid = useMemo(() => {
    try {
      JSON.parse(stdinJson);
      return true;
    } catch {
      return false;
    }
  }, [stdinJson]);

  const addArgRow = useCallback(() => {
    setCliArgs((prev) => [...prev, { id: uid(), value: "" }]);
  }, []);

  const removeArgRow = useCallback((id: string) => {
    setCliArgs((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const updateArgRow = useCallback((id: string, value: string) => {
    setCliArgs((prev) => prev.map((r) => (r.id === id ? { ...r, value } : r)));
  }, []);

  const run = useCallback(async () => {
    setRunning(true);
    setStdoutText("");
    setErrorText("");

    try {
      let result = "";
      if (mode === "cli") {
        result = await invoke<string>("run_plugin_with_mode", {
          plugin,
          params: { mode: "cli", args: cliArgsArray },
        });
      } else if (mode === "config") {
        result = await invoke<string>("run_plugin_with_mode", {
          plugin,
          params: {
            mode: "config",
            config_path: configPath,
            output: configOutput || undefined,
          },
        });
      } else {
        if (!isJsonValid) throw new Error("STDIN JSON이 유효하지 않습니다.");
        result = await invoke<string>("run_plugin_with_mode", {
          plugin,
          params: {
            mode: "stdin",
            json: JSON.parse(stdinJson),
          },
        });
      }

      setStdoutText(result ?? "");
      setErrorText("");
    } catch (e) {
      const raw = asErrorString(e);
      const { exitCode, stderr } = parseSpawnError(raw);
      const pretty =
        (typeof stderr === "string" && stderr.length > 0 ? stderr : raw)?.trim();
      setErrorText(exitCode !== undefined ? `[exit ${exitCode}] ${pretty}` : pretty);
    } finally {
      setRunning(false);
    }
  }, [mode, plugin, cliArgsArray, configPath, configOutput, stdinJson, isJsonValid]);

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Plugin Runner</h1>
        <span className="text-sm text-gray-500">Tauri invoke demo</span>

        <button
          onClick={() => navigate("/test")}
          className="ml-auto px-3 py-1 border rounded hover:bg-gray-100 text-sm"
          title="PluginRunner 페이지로 이동"
        >
          Plugin Runner
        </button>
      </header>

      <section className="bg-white rounded-2xl shadow p-5 space-y-4 border">
        <div className="grid gap-3 md:grid-cols-2">
          <div className="flex flex-col">
            <label className="text-sm font-medium mb-1">Plugin name</label>
            <input
              className="border rounded-lg px-3 py-2"
              placeholder="ex) test-dummy"
              value={plugin}
              onChange={(e) => setPlugin(e.target.value)}
            />
          </div>

          <div className="flex flex-col">
            <label className="text-sm font-medium mb-1">Mode</label>
            <div className="flex items-center gap-2">
              {(["cli", "config", "stdin"] as Mode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`px-3 py-2 rounded-lg border ${
                    mode === m ? "bg-black text-white" : "bg-white hover:bg-gray-50"
                  }`}
                >
                  {m.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* CLI MODE */}
        {mode === "cli" && (
          <div className="mt-2">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold">CLI Arguments</h3>
              <button
                className="px-3 py-2 rounded-lg border hover:bg-gray-50"
                onClick={addArgRow}
              >
                + Add
              </button>
            </div>

            <div className="grid gap-2">
              {cliArgs.map((row) => (
                <div key={row.id} className="flex gap-2">
                  <input
                    className="flex-1 border rounded-lg px-3 py-2"
                    value={row.value}
                    onChange={(e) => updateArgRow(row.id, e.target.value)}
                    placeholder="ex) --host or ec2-xxx.amazonaws.com"
                  />
                  <button
                    className="px-3 py-2 rounded-lg border hover:bg-gray-50"
                    onClick={() => removeArgRow(row.id)}
                    aria-label="remove argument"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>

            <div className="mt-3 text-sm text-gray-600">
              <div>실제 실행 예:</div>
              <code className="block bg-gray-50 border rounded-lg p-2 mt-1">
                {plugin} {cliArgsArray.join(" ")}
              </code>
            </div>
          </div>
        )}

        {/* CONFIG MODE */}
        {mode === "config" && (
          <div className="grid gap-3 md:grid-cols-2">
            <div className="flex flex-col">
              <label className="text-sm font-medium mb-1">--config</label>
              <input
                className="border rounded-lg px-3 py-2"
                value={configPath}
                onChange={(e) => setConfigPath(e.target.value)}
                placeholder="config/ssh_config.json"
              />
            </div>
            <div className="flex flex-col">
              <label className="text-sm font-medium mb-1">--output (optional)</label>
              <input
                className="border rounded-lg px-3 py-2"
                value={configOutput}
                onChange={(e) => setConfigOutput(e.target.value)}
                placeholder="test_response.json"
              />
            </div>
            <div className="md:col-span-2 text-sm text-gray-600">
              실행 예:
              <code className="block bg-gray-50 border rounded-lg p-2 mt-1">
                {plugin} --config {configPath}{" "}
                {configOutput ? `--output ${configOutput}` : ""}
              </code>
            </div>
          </div>
        )}

        {/* STDIN(JSON) MODE */}
        {mode === "stdin" && (
          <div className="flex flex-col">
            <label className="text-sm font-medium mb-1">STDIN JSON</label>
            <textarea
              className={`border rounded-lg px-3 py-2 min-h-[180px] font-mono ${
                isJsonValid ? "" : "border-red-500"
              }`}
              value={stdinJson}
              onChange={(e) => setStdinJson(e.target.value)}
            />
            <div className="text-xs mt-1">
              {isJsonValid ? (
                <span className="text-green-600">JSON valid ✓</span>
              ) : (
                <span className="text-red-600">Invalid JSON</span>
              )}
            </div>
          </div>
        )}
      </section>

      <section className="flex items-center gap-2">
        <button
          onClick={run}
          disabled={running || (mode === "stdin" && !isJsonValid)}
          className={`px-4 py-2 rounded-lg border shadow ${
            running ? "opacity-60 cursor-not-allowed" : "hover:bg-gray-50"
          }`}
        >
          {running ? "Running..." : "Run Plugin"}
        </button>

        {/* 참고: 구 API 버튼 (원하면 숨겨도 됨) */}
        {mode === "cli" && (
          <button
            onClick={async () => {
              setRunning(true);
              setStdoutText("");
              setErrorText("");
              try {
                const result = await invoke<string>("run_plugin_with_args", {
                  plugin,
                  args: cliArgsArray,
                });
                setStdoutText(result ?? "");
                setErrorText("");
              } catch (e) {
                const raw = asErrorString(e);
                const { exitCode, stderr } = parseSpawnError(raw);
                const pretty =
                  (typeof stderr === "string" && stderr.length > 0 ? stderr : raw)?.trim();
                setErrorText(
                  exitCode !== undefined ? `[exit ${exitCode}] ${pretty}` : pretty
                );
              } finally {
                setRunning(false);
              }
            }}
            className="px-4 py-2 rounded-lg border shadow hover:bg-gray-50"
          >
            Run (legacy API)
          </button>
        )}
      </section>

      <section className="grid md:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl shadow p-5 border">
          <h3 className="font-semibold mb-2">Stdout</h3>
          <pre className="text-sm whitespace-pre-wrap break-all">
            {stdoutText || "—"}
          </pre>
        </div>
        <div className="bg-white rounded-2xl shadow p-5 border">
          <h3 className="font-semibold mb-2">Error</h3>
          <pre className="text-sm text-red-600 whitespace-pre-wrap break-all">
            {errorText || "—"}
          </pre>
        </div>
      </section>
    </div>
  );
}
