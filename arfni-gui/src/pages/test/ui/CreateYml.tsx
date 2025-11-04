// src/pages/CreateYml.tsx
import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Check, Copy } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";

// ✅ UI에서 조절할 최소 환경 변수만 정의
type SpringEnv = {
  JAVA_VERSION: string;
  JAVA_DIST: string;        // ex) temurin
  DEPLOY_ROOT: string;      // ex) /home/ubuntu/arfni-deploy
  DOCKER_SERVICE: string;   // ex) spring
};

export default function CreateYml() {
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const tmplType = (search.get("type") || "spring").toLowerCase();

  const [branch, setBranch] = useState("main");
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [yamlText, setYamlText] = useState<string>(""); // ← 플러그인 결과 저장

  const [springEnv, setSpringEnv] = useState<SpringEnv>({
    JAVA_VERSION: "17",
    JAVA_DIST: "temurin",
    DEPLOY_ROOT: "/home/ubuntu/arfni-deploy",
    DOCKER_SERVICE: "spring",
  });

  const pageTitle = useMemo(
    () => `YML 생성기 ${tmplType === "spring" ? "(Spring Boot)" : "(FastAPI)"}`,
    [tmplType]
  );

  // 🧠 플러그인 호출: ymlgen.exe (stdin JSON)
  const generateYaml = async () => {
    setLoading(true);
    setError(null);
    setYamlText("");

    try {
      // 템플릿 키만 넘기면 ymlgen이 templates/<key>.yaml.tmpl 을 찾음
      const payload: any = {
        template: tmplType, // "spring" | "fastapi" ...
        output: "",
        vars: {
          BRANCH: branch,
          ...(tmplType === "spring"
            ? {
                JAVA_VERSION: springEnv.JAVA_VERSION,
                JAVA_DIST: springEnv.JAVA_DIST,
                DEPLOY_ROOT: springEnv.DEPLOY_ROOT,
                DOCKER_SERVICE: springEnv.DOCKER_SERVICE,
              }
            : {}),
        },
      };

      const result = await invoke<string>("run_plugin_with_mode", {
        plugin: "ymlgen",
        params: { mode: "stdin", json: payload },
      });

      setYamlText(result ?? "");
    } catch (e: any) {
      console.error(e);
      setError(e?.toString?.() || "플러그인 실행 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(yamlText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = yamlText;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <div className="h-full w-full bg-gray-50 flex flex-col">
      <header className="flex items-center justify-between px-6 py-4 bg-white border-b">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="p-2 rounded hover:bg-gray-100"
            title="뒤로"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-xl font-semibold">{pageTitle}</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={copyToClipboard}
            disabled={!yamlText}
            className="px-3 py-2 border rounded-lg text-sm hover:bg-gray-50 disabled:opacity-60 flex items-center gap-2"
            title={yamlText ? "클립보드로 복사" : "먼저 YML을 생성하세요"}
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

      <main className="flex-1 p-6 overflow-auto">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-7xl mx-auto">
          <section className="bg-white border rounded-lg p-4">
            <h2 className="font-semibold mb-3">설정</h2>

            <div className="mb-4">
              <label className="block text-sm text-gray-600 mb-1">템플릿</label>
              <select
                className="w-full border rounded px-3 py-2"
                value={tmplType}
                onChange={(e) => navigate(`/yml/create?type=${e.target.value}`)}
              >
                <option value="spring">Spring Boot</option>
                <option value="fastapi">FastAPI (추가 예정)</option>
              </select>
            </div>

            <div className="mb-4">
              <label className="block text-sm text-gray-600 mb-1">브랜치</label>
              <div className="flex items-center gap-2">
                <input
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                  placeholder="main"
                  className="flex-1 border rounded px-3 py-2"
                />
                {["main", "develop"].map((b) => (
                  <button
                    key={b}
                    onClick={() => setBranch(b)}
                    className={`px-3 py-2 border rounded ${
                      branch === b ? "bg-gray-100" : "hover:bg-gray-50"
                    }`}
                  >
                    {b}
                  </button>
                ))}
              </div>
            </div>

            {tmplType === "spring" && (
              <div className="space-y-3">
                {(Object.keys(springEnv) as (keyof SpringEnv)[]).map((key) => (
                  <div key={key}>
                    <label className="block text-sm text-gray-600 mb-1">
                      {key}
                    </label>
                    <input
                      value={springEnv[key]}
                      onChange={(e) =>
                        setSpringEnv((prev) => ({
                          ...prev,
                          [key]: e.target.value,
                        }))
                      }
                      className="w-full border rounded px-3 py-2"
                    />
                  </div>
                ))}
              </div>
            )}

            <button
              onClick={generateYaml}
              disabled={loading}
              className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-60"
            >
              {loading ? "생성 중..." : "YML 생성"}
            </button>

            {error && (
              <div className="mt-3 p-3 text-sm text-red-700 bg-red-100 border border-red-300 rounded">
                {error}
              </div>
            )}
          </section>

          <section className="bg-white border rounded-lg p-4 flex flex-col">
            <h2 className="font-semibold mb-3">미리보기</h2>
            <textarea
              readOnly
              value={yamlText}
              className="flex-1 font-mono text-sm border rounded p-3 whitespace-pre overflow-auto"
              spellCheck={false}
              placeholder="YML 생성 버튼을 눌러 생성하세요."
            />
          </section>
        </div>
      </main>
    </div>
  );
}
