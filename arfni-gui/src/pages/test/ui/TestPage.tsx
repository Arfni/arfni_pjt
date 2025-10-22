
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";

type TargetEntry = {
  file_name: string;
  target_name: string; // suffix 뗀 이름
  size: number;
  path: string;
};


export default function TestPage() {
  const navigate = useNavigate();

  const [items, setItems] = useState<TargetEntry[]>([]);
  const [items2, setItems2] = useState<TargetEntry[]>([]);
  const [loading, setLoading] = useState(false);

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
    setLoading(false);
    try {
      const list = await invoke<TargetEntry[]>("list_targets");
      const list2 = await invoke<TargetEntry[]>("read_plugins");
      setItems(list);
      setLoading(true);
      setItems2(list2);
    } catch (e) {
      console.error(e);
    } finally {
   
    }
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/")}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-xl font-semibold">테스트 페이지</h1>
        </div>
      </header>

      {/* 본문 */}
      <div className="p-6">
        <button
          onClick={refresh}
          className="px-3 py-1 border rounded bg-white hover:bg-gray-100"
        >
          파일 목록 불러오기
        </button>

        {/* 로딩 중 표시 */}
        {loading && (
          <div className="mt-4 text-gray-500">로딩 중...</div>
        )}

        {/* 로딩 중일 때 목록 표시 */}
        {loading && items.length > 0 && (
          <div className="mt-4">
            <h2 className="font-semibold mb-2">파일 목록</h2>
            <ul className="list-disc list-inside bg-white rounded-lg shadow p-4">
              {items.map((item) => (
                <li key={item.file_name}>
                  {item.target_name} ({item.size} bytes)
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
              {items2.map((item) => (
                <li key={item.file_name}>
                  {item.target_name} ({item.size} bytes)
                </li>
              ))}
    </div>
  );
}
