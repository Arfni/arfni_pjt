import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useNavigate } from "react-router-dom";

export default function HealthWatcher() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<string>("Unknown");
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [intervalMs] = useState<number>(5000); // 주기 (ms)

  // ✅ 헬스체크 함수
  const checkHealth = async () => {
    const url = "http://localhost:8080/actuator/health"; // EC2 FastAPI or Spring endpoint
    try {
      const isUp = await invoke<boolean>("check_health", { url });
      setStatus(isUp ? "🟢 UP" : "🔴 DOWN");
    } catch (e) {
      console.error("Health check failed:", e);
      setStatus("⚠️ Error");
    }
  };

  // 🕒 주기적 실행 (isRunning=true일 때만)
  useEffect(() => {
    if (!isRunning) return;

    // 즉시 1회 실행
    checkHealth();

    // 주기적 실행
    const interval = setInterval(checkHealth, intervalMs);

    // 컴포넌트 언마운트 또는 isRunning=false 시 정리
    return () => clearInterval(interval);
  }, [isRunning, intervalMs]);

  return (
    <div className="flex flex-col items-center space-y-4 p-4 border rounded-lg shadow bg-white">
      {/* 이동 버튼 */}
      <button
        onClick={() => navigate("/test")}
        className="ml-auto px-3 py-1 border rounded hover:bg-gray-100 text-sm self-end"
        title="test 페이지로 이동"
      >
        test
      </button>

      {/* 상태 표시 */}
      <p className="text-lg font-semibold">
        Status:{" "}
        <span
          className={
            status.includes("UP")
              ? "text-green-600"
              : status.includes("DOWN")
              ? "text-red-600"
              : "text-yellow-600"
          }
        >
          {status}
        </span>
      </p>

      {/* 제어 버튼 */}
      <div className="flex space-x-3">
        <button
          onClick={() => setIsRunning(true)}
          disabled={isRunning}
          className={`px-4 py-2 rounded text-white ${
            isRunning
              ? "bg-gray-400 cursor-not-allowed"
              : "bg-green-600 hover:bg-green-700"
          }`}
        >
          ▶ Start Watch
        </button>
        <button
          onClick={() => setIsRunning(false)}
          disabled={!isRunning}
          className={`px-4 py-2 rounded text-white ${
            !isRunning
              ? "bg-gray-400 cursor-not-allowed"
              : "bg-red-600 hover:bg-red-700"
          }`}
        >
          ⏸ Stop
        </button>
      </div>
    </div>
  );
}
