import { invoke } from "@tauri-apps/api/core";
import { useCallback } from "react";

export default function PortTest() {
  const checkPorts = useCallback(async () => {
    try {
      const result = await invoke<string>("list_open_ports");
      console.log(result);
    } catch (err) {
      console.error("Invoke 실패:", err);
    }

  }, []);

    const checkPorts2 = useCallback(async () => {
    try {
      const result = await invoke<string>("list_listening_ports");
      console.log(result);
    } catch (err) {
      console.error("Invoke 실패:", err);
    }

  }, []);

  


  return (
    <div>
        <button onClick={checkPorts} className="px-3 py-2 border rounded">
        포트 확인
        </button>

        <button onClick={checkPorts2} className="px-3 py-2 border rounded">
        포트 확인
        </button>
    </div>
  );
}
