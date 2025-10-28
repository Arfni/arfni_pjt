import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useNavigate } from "react-router-dom";


type SshParams = {
  host: string;
  user: string;
  pem_path: string;
};

export default function SshTerminal() {
    const navigate = useNavigate();
    // 연결 파라미터(편집 가능)
    const [host, setHost] = useState("ec2-xx-xx-xx-xx.ap-northeast-2.compute.amazonaws.com");
    const [user, setUser] = useState("ec2-user");
    const [pemPath, setPemPath] = useState("C:\\Users\\SSAFY\\Downloads\\my.pem");

    // 세션/상태
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [connected, setConnected] = useState(false);

    // 로그 & 입력
    const [logs, setLogs] = useState<string[]>([]);
    const [cmd, setCmd] = useState("");

    // 자동 스크롤
    const logRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (logRef.current) {
        logRef.current.scrollTop = logRef.current.scrollHeight;
        }
    }, [logs]);

    // 이벤트 리스너
    useEffect(() => {
        if (!connected) return;

        const unlistenData = listen("ssh:data", (e) => {
        const payload = e.payload as { id: string; chunk: string };
        setLogs((prev) => [...prev, payload.chunk]);
        });

        const unlistenErr = listen("ssh:stderr", (e) => {
        const payload = e.payload as { id: string; chunk: string };
        setLogs((prev) => [...prev, `[stderr] ${payload.chunk}`]);
        });

        const unlistenClose = listen("ssh:closed", (e) => {
        const payload = e.payload as { id: string; chunk: string };
        setLogs((prev) => [...prev, `\n[Session closed: ${payload.id}]`]);
        setConnected(false);
        setSessionId(null);
        });

        return () => {
        unlistenData.then((f) => f());
        unlistenErr.then((f) => f());
        unlistenClose.then((f) => f());
        };
    }, [connected]);

    // 연결
    const startSession = async () => {
        const params: SshParams = { host, user, pem_path: pemPath };
        try {
        const id = await invoke<string>("ssh_start", { params });
        setSessionId(id);
        setConnected(true);
        setLogs((prev) => [...prev, `✅ SSH connected [${id}]`]);
        } catch (err: any) {
        setLogs((prev) => [...prev, `❌ Connection failed: ${String(err)}`]);
        }
    };

    // 명령 전송
    const sendCmd = async () => {
        if (!sessionId || !cmd.trim()) return;
        try {
        await invoke("ssh_send", { id: sessionId, cmd });
        setLogs((prev) => [...prev, `> ${cmd}`]);
        setCmd("");
        } catch (err: any) {
        setLogs((prev) => [...prev, `❌ Send failed: ${String(err)}`]);
        }
    };

    // 종료
    const closeSession = async () => {
        if (!sessionId) return;
        try {
        await invoke("ssh_close", { id: sessionId });
        } finally {
        setConnected(false);
        setSessionId(null);
        }
    };

  return (
    <div className="flex flex-col w-full h-full bg-black text-white rounded-lg border border-gray-700">
      {/* 헤더 */}
      <div className="p-3 flex items-center justify-between bg-gray-900">
        <div className="font-semibold">SSH Terminal</div>
        <div className="flex gap-2">
          {!connected ? (
            <button
              className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded"
              onClick={startSession}
            >
              Connect
            </button>
          ) : (
            <button
              className="bg-red-600 hover:bg-red-700 text-white px-3 py-2 rounded"
              onClick={closeSession}
            >
              Disconnect
            </button>
          )}
        </div>

        <button
              onClick={() => navigate("/test")}
              className="ml-auto px-3 py-1 border rounded hover:bg-gray-100 text-sm"
              title="test 페이지로 이동">
              test
          </button>
      </div>

      {/* 접속 파라미터 */}
      <div className="p-3 grid grid-cols-1 md:grid-cols-3 gap-2 bg-gray-800">
        <input
          className="bg-gray-900 border border-gray-700 rounded px-2 py-2 text-white"
          placeholder="Host (e.g., ec2-xx-xx-xx-xx.ap-northeast-2.compute.amazonaws.com)"
          value={host}
          onChange={(e) => setHost(e.target.value)}
          disabled={connected}
        />
        <input
          className="bg-gray-900 border border-gray-700 rounded px-2 py-2 text-white"
          placeholder="User (e.g., ec2-user)"
          value={user}
          onChange={(e) => setUser(e.target.value)}
          disabled={connected}
        />
        <input
          className="bg-gray-900 border border-gray-700 rounded px-2 py-2 text-white"
          placeholder="PEM path (e.g., C:\\Users\\SSAFY\\Downloads\\my.pem)"
          value={pemPath}
          onChange={(e) => setPemPath(e.target.value)}
          disabled={connected}
        />
      </div>

      {/* 로그 */}
      <div
        ref={logRef}
        className="flex-1 overflow-y-auto font-mono text-sm p-3 whitespace-pre-wrap"
      >
        {logs.length === 0 ? (
          <div className="text-gray-400">No output yet. Connect and run commands.</div>
        ) : (
          logs.map((line, i) => <div key={i}>{line}</div>)
        )}
      </div>

      {/* 입력창 */}
      <div className="p-3 flex gap-2 bg-gray-900">
        <input
          className="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-2 text-white"
          placeholder="명령 입력 (예: ls -al)"
          value={cmd}
          onChange={(e) => setCmd(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && sendCmd()}
          disabled={!connected}
        />
        <button
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded disabled:opacity-50"
          onClick={sendCmd}
          disabled={!connected || !cmd.trim()}
        >
          Send
        </button>
      </div>
    </div>
  );
}
