import { invoke } from "@tauri-apps/api/core";
import { useCallback, useState } from "react";

type SshSimpleParams = {
  host: string;
  user: string;
  pem_path: string;
};

export default function PortTest() {
  const [localPorts, setLocalPorts] = useState<string>("");
  const [listeningPorts, setListeningPorts] = useState<number[]>([]);
  const [ec2Ports, setEc2Ports] = useState<number[]>([]);
  const [host, setHost] = useState("ec2-xx-xx-xx-xx.ap-northeast-2.compute.amazonaws.com");
  const [user, setUser] = useState("ubuntu");
  const [pemPath, setPemPath] = useState("C:\\Users\\me\\Downloads\\my-key.pem");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // 전체 포트 출력
  const checkPorts = useCallback(async () => {
    try {
      setError("");
      setLoading(true);
      const result = await invoke<string>("list_open_ports");
      console.log(result);
      setLocalPorts(result);
    } catch (err: any) {
      console.error("Invoke 실패:", err);
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  // LISTENING 포트만 출력
  const checkPorts2 = useCallback(async () => {
    try {
      setError("");
      setLoading(true);
      const result = await invoke<number[]>("list_listening_ports");
      console.log(result);
      setListeningPorts(result);
    } catch (err: any) {
      console.error("Invoke 실패:", err);
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  // EC2 포트 확인
  const checkEc2Ports = useCallback(async () => {
    try {
      setError("");
      setLoading(true);
      const params: SshSimpleParams = { host, user, pem_path: pemPath };
      const result = await invoke<number[]>("list_ec2_listening_ports", { params });
      console.log(result);
      setEc2Ports(result);
    } catch (err: any) {
      console.error("EC2 Invoke 실패:", err);
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [host, user, pemPath]);

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-xl font-bold">포트 확인 도구</h1>

      {error && (
        <div className="p-3 bg-red-50 border border-red-300 text-red-700 rounded">
          {error}
        </div>
      )}

      {/* 로컬 포트 검사 */}
      <section className="bg-white border rounded-lg p-4 space-y-3">
        <h2 className="text-lg font-semibold">로컬 포트</h2>
        <div className="flex gap-2">
          <button
            onClick={checkPorts}
            className="px-3 py-2 border rounded hover:bg-gray-50"
            disabled={loading}
          >
            전체 포트(netstat)
          </button>
          <button
            onClick={checkPorts2}
            className="px-3 py-2 border rounded hover:bg-gray-50"
            disabled={loading}
          >
            LISTENING 포트만
          </button>
        </div>

        <div>
          <h3 className="font-medium mb-1">LISTENING 포트 목록</h3>
          {listeningPorts.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {listeningPorts.map((p) => (
                <span key={p} className="px-2 py-1 border rounded text-sm bg-gray-100">
                  {p}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500">결과 없음</p>
          )}
        </div>

        <div>
          <h3 className="font-medium mb-1">전체 포트 출력</h3>
          <textarea
            readOnly
            value={localPorts}
            className="w-full h-48 font-mono text-xs border rounded p-2 whitespace-pre"
          />
        </div>
      </section>

      {/* EC2 포트 검사 */}
      <section className="bg-white border rounded-lg p-4 space-y-3">
        <h2 className="text-lg font-semibold">EC2 포트</h2>

        <div className="grid sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-sm text-gray-600 mb-1">Host</label>
            <input
              value={host}
              onChange={(e) => setHost(e.target.value)}
              className="w-full border rounded px-3 py-2"
              placeholder="ec2-xx-xx-xx-xx.ap-northeast-2.compute.amazonaws.com"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">User</label>
            <input
              value={user}
              onChange={(e) => setUser(e.target.value)}
              className="w-full border rounded px-3 py-2"
              placeholder="ubuntu"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">PEM 경로</label>
            <input
              value={pemPath}
              onChange={(e) => setPemPath(e.target.value)}
              className="w-full border rounded px-3 py-2"
              placeholder="C:\\Users\\me\\Downloads\\key.pem"
            />
          </div>
        </div>

        <button
          onClick={checkEc2Ports}
          className="px-3 py-2 border rounded hover:bg-gray-50"
          disabled={loading}
        >
          EC2 LISTENING 포트 확인
        </button>

        <div>
          <h3 className="font-medium mb-1">EC2 LISTENING 포트</h3>
          {ec2Ports.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {ec2Ports.map((p) => (
                <span key={p} className="px-2 py-1 border rounded text-sm bg-gray-100">
                  {p}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500">결과 없음</p>
          )}
        </div>
      </section>
    </div>
  );
}
