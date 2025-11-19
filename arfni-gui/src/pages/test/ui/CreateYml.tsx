import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ArrowLeft, Check, Copy } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface TemplateVar {
  key: string;
  label: string;
  default: string;
  type: string;
}

interface TemplateMeta {
  template: string;
  name: string;
  description: string;
  vars: TemplateVar[];
}

export default function CreateYml() {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<TemplateMeta[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [yamlText, setYamlText] = useState("");
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 1️⃣ ymlgen 플러그인에서 템플릿 목록 가져오기
  useEffect(() => {
    invoke<string>("run_plugin_with_mode", {
      plugin: "플러그인 이름",
      params: { mode: "stdin", json: {} },
    })
      .then((res) => {
        const list: TemplateMeta[] = JSON.parse(res);
        setTemplates(list);
        if (list.length > 0) setSelected(list[0].template);
      })
      .catch((err) => {
        console.error(err);
        setError("템플릿 목록을 불러오지 못했습니다.");
      });
  }, []);

  const current = templates.find((t) => t.template === selected);

  // 2️⃣ 입력값 변경
  const updateValue = (key: string, value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  };

  // 3️⃣ YAML 생성 요청
  const generateYaml = async () => {
    if (!current) return;
    setLoading(true);
    setError(null);
    setYamlText("");

    const vars: Record<string, string> = {};
    current.vars.forEach((v) => {
      vars[v.key] = values[v.key] ?? v.default ?? "";
    });

    const payload = {
      mode: "stdin",
      template: current.template,
      output: "",
      vars,
    };

    try {
      const result = await invoke<string>("run_plugin_with_mode", {
        plugin: "ymlgen",
        params: { mode: "stdin", json: payload },
      });
      setYamlText(result);
    } catch (err: any) {
      console.error(err);
      setError("YML 생성 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async () => {
    if (!yamlText) return;
    try {
      await navigator.clipboard.writeText(yamlText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="h-full w-full bg-gray-50 flex flex-col">
      {/* HEADER */}
      <header className="flex items-center justify-between px-6 py-4 bg-white border-b">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="p-2 rounded hover:bg-gray-100"
            title="뒤로"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-xl font-semibold">YML 생성기</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={copyToClipboard}
            disabled={!yamlText}
            className="px-3 py-2 border rounded-lg text-sm hover:bg-gray-50 flex items-center gap-2 disabled:opacity-60"
          >
            {copied ? (
              <Check className="w-4 h-4 text-emerald-600" />
            ) : (
              <Copy className="w-4 h-4" />
            )}
            {copied ? "복사됨" : "YML 복사"}
          </button>
        </div>
      </header>

      {/* MAIN */}
      <main className="flex-1 p-6 overflow-auto">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-7xl mx-auto">
          {/* 왼쪽: 설정 */}
          <section className="bg-white border rounded-lg p-4">
            <h2 className="font-semibold mb-3">설정</h2>

            {error && (
              <div className="p-3 mb-3 text-sm text-red-700 bg-red-100 border border-red-300 rounded">
                {error}
              </div>
            )}

            {/* 템플릿 선택 */}
            <div className="mb-4">
              <label className="block text-sm text-gray-600 mb-1">템플릿</label>
              <select
                className="w-full border rounded px-3 py-2"
                value={selected}
                onChange={(e) => setSelected(e.target.value)}
              >
                {templates.map((t) => (
                  <option key={t.template} value={t.template}>
                    {t.name}
                  </option>
                ))}
              </select>
              {current && (
                <p className="text-xs text-gray-500 mt-1">{current.description}</p>
              )}
            </div>

            {/* 동적 변수 입력 */}
            {current &&
              current.vars.map((v) => (
                <div key={v.key} className="mb-3">
                  <label className="block text-sm text-gray-600 mb-1">
                    {v.label}
                  </label>
                  <input
                    type="text"
                    className="w-full border rounded px-3 py-2"
                    value={values[v.key] ?? v.default ?? ""}
                    onChange={(e) => updateValue(v.key, e.target.value)}
                  />
                </div>
              ))}

            <button
              onClick={generateYaml}
              disabled={loading || !current}
              className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-60"
            >
              {loading ? "생성 중..." : "YML 생성"}
            </button>
          </section>

          {/* 오른쪽: 미리보기 */}
          <section className="bg-white border rounded-lg p-4 flex flex-col">
            <h2 className="font-semibold mb-3">미리보기</h2>
            <textarea
              readOnly
              value={yamlText}
              className="flex-1 font-mono text-sm border rounded p-3 whitespace-pre overflow-auto"
              placeholder="YML 생성 버튼을 눌러 생성하세요."
              spellCheck={false}
            />
          </section>
        </div>
      </main>
    </div>
  );
}
