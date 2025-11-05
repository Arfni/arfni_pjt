import React, { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

type ApiKeyMetaDto = {
  id: string;
  provider: string;    // "openai" | "anthropic" | "google" | "etc"
  label: string;       // 표기용
  created_at: string;
  updated_at: string;
  last_used_at?: string | null;
  is_active: boolean;
};

type AddKeyParams = {
  provider: string;
  label: string;
  api_key: string;
  set_active: boolean;
};

const PROVIDERS = ["openai", "anthropic", "google", "etc"] as const;

export default function ApiKeysPage() {
  // 목록
  const [items, setItems] = useState<ApiKeyMetaDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null); // 버튼 로딩 제어

  // 추가 폼
  const [provider, setProvider] = useState<(typeof PROVIDERS)[number]>("openai");
  const [label, setLabel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [setActive, setSetActive] = useState(true);

  // 필터/정렬 (선택)
  const rows = useMemo(() => {
    const grouped = [...items].sort((a, b) =>
      a.provider === b.provider ? a.label.localeCompare(b.label) : a.provider.localeCompare(b.provider)
    );
    return grouped;
  }, [items]);

  async function fetchList() {
    setLoading(true);
    try {
      const data = await invoke<ApiKeyMetaDto[]>("list_api_keys");
      setItems(data);
    } catch (e: any) {
      console.error(e);
      alert(`불러오기 실패: ${e}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchList();
  }, []);

  async function onAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!label.trim() || !apiKey.trim()) {
      alert("label과 api_key는 필수입니다.");
      return;
    }
    setBusy("add");
    try {
      const params: AddKeyParams = { provider, label: label.trim(), api_key: apiKey.trim(), set_active: setActive };
      await invoke("add_api_key", { params });
      setLabel("");
      setApiKey("");
      setSetActive(true);
      await fetchList();
    } catch (e: any) {
      console.error(e);
      alert(`추가/업데이트 실패: ${e}`);
    } finally {
      setBusy(null);
    }
  }

  async function onDelete(id: string) {
    if (!confirm("정말 삭제할까요? 되돌릴 수 없습니다.")) return;
    setBusy(`del:${id}`);
    try {
      await invoke("delete_api_key", { id });
      await fetchList();
    } catch (e: any) {
      console.error(e);
      alert(`삭제 실패: ${e}`);
    } finally {
      setBusy(null);
    }
  }

  async function onSetActive(id: string) {
    setBusy(`active:${id}`);
    try {
      await invoke("set_active_api_key", { id });
      await fetchList();
    } catch (e: any) {
      console.error(e);
      alert(`활성화 실패: ${e}`);
    } finally {
      setBusy(null);
    }
  }

  async function onCopyActiveKey(provider: string) {
    try {
      const key = await invoke<string | null>("get_active_api_key", { provider });
      if (!key) {
        alert("활성화된 키가 없습니다.");
        return;
      }
      await navigator.clipboard.writeText(key);
      alert("활성 키가 클립보드에 복사되었습니다.");
    } catch (e: any) {
      console.error(e);
      alert(`키 가져오기 실패: ${e}`);
    }
  }

  const busyCheck = (token: string) => busy === token;

  return (
    <div className="mx-auto max-w-4xl p-6 space-y-10">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold">API Keys</h1>
        <p className="text-sm text-gray-500">
          Provider별로 여러 개의 키를 저장할 수 있습니다. 각 Provider에서는 <b>항상 하나만 활성화</b>됩니다.
        </p>
      </header>

      {/* 추가/업서트 폼 */}
      <section className="rounded-xl border p-4 space-y-4">
        <h2 className="font-semibold">Add / Update</h2>
        <form className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end" onSubmit={onAdd}>
          <div className="flex flex-col">
            <label className="text-xs mb-1">Provider</label>
            <select
              className="border rounded-md px-3 py-2"
              value={provider}
              onChange={(e) => setProvider(e.target.value as any)}
            >
              {PROVIDERS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col">
            <label className="text-xs mb-1">Label</label>
            <input
              className="border rounded-md px-3 py-2"
              placeholder="예: dev / prod / personal"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </div>

          <div className="flex flex-col md:col-span-2">
            <label className="text-xs mb-1">API Key</label>
            <input
              className="border rounded-md px-3 py-2"
              placeholder="sk-..."
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-3 md:col-span-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={setActive}
                onChange={(e) => setSetActive(e.target.checked)}
              />
              저장 후 활성화
            </label>
          </div>

          <div className="md:col-span-1 flex justify-end">
            <button
              type="submit"
              disabled={busyCheck("add")}
              className={`px-4 py-2 rounded-md text-white ${busyCheck("add") ? "bg-gray-400" : "bg-black"}`}
            >
              {busyCheck("add") ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
      </section>

      {/* 목록 / 그룹 */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Saved Keys</h2>
          <button
            onClick={fetchList}
            className="px-3 py-1 rounded-md border"
            disabled={loading}
          >
            {loading ? "Loading..." : "Refresh"}
          </button>
        </div>

        {rows.length === 0 && !loading && (
          <p className="text-sm text-gray-500">저장된 키가 없습니다.</p>
        )}

        <ul className="space-y-2">
          {rows.map((it) => (
            <li key={it.id} className="border rounded-lg p-3 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs px-2 py-0.5 rounded-full border">{it.provider}</span>
                  <span className="font-medium truncate">{it.label}</span>
                  {it.is_active && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-green-600/10 text-green-700">
                      Active
                    </span>
                  )}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  updated: {new Date(it.updated_at).toLocaleString()}
                  {it.last_used_at ? ` · last used: ${new Date(it.last_used_at).toLocaleString()}` : ""}
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  className="px-2 py-1 text-xs rounded-md border"
                  onClick={() => onCopyActiveKey(it.provider)}
                  title="활성 키 복사"
                >
                  Copy Active
                </button>

                {!it.is_active && (
                  <button
                    className="px-2 py-1 text-xs rounded-md border"
                    onClick={() => onSetActive(it.id)}
                    disabled={busyCheck(`active:${it.id}`)}
                  >
                    {busyCheck(`active:${it.id}`) ? "..." : "Set Active"}
                  </button>
                )}

                <button
                  className="px-2 py-1 text-xs rounded-md border text-red-600"
                  onClick={() => onDelete(it.id)}
                  disabled={busyCheck(`del:${it.id}`)}
                >
                  {busyCheck(`del:${it.id}`) ? "..." : "Delete"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
