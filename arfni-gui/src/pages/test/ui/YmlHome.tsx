import { useNavigate } from "react-router-dom";
import { ArrowLeft, Boxes, Cog, FileCode2 } from "lucide-react";

export default function YmlHome() {
  const navigate = useNavigate();

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
          <h1 className="text-xl font-semibold">YML 생성하기</h1>
        </div>
      </header>

      <main className="flex-1 p-6">
        <div className="max-w-4xl mx-auto">
          <p className="text-gray-600 mb-4">생성할 워크플로 YML 템플릿을 선택하세요.</p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Spring Boot */}
            <button
              onClick={() => navigate("/yml/create?type=spring")}
              className="group text-left bg-white border rounded-lg p-5 hover:border-indigo-400 hover:shadow transition flex items-start gap-4"
            >
              <div className="p-2 rounded bg-indigo-50 text-indigo-600">
                <Cog className="w-5 h-5" />
              </div>
              <div>
                <div className="font-semibold">Spring Boot</div>
                <div className="text-sm text-gray-500 mt-1">Gradle 빌드 → JAR 배포 → 서버에서 Docker 이미지 재빌드/재시작</div>
              </div>
            </button>

            {/* FastAPI (placeholder) */}
            <button
              onClick={() => navigate("/yml/create?type=fastapi")}
              className="group text-left bg-white border rounded-lg p-5 hover:border-emerald-400 hover:shadow transition flex items-start gap-4"
            >
              <div className="p-2 rounded bg-emerald-50 text-emerald-600">
                <Boxes className="w-5 h-5" />
              </div>
              <div>
                <div className="font-semibold">FastAPI</div>
                <div className="text-sm text-gray-500 mt-1">Docker 기반 배포 템플릿 (추가 예정)</div>
              </div>
            </button>
          </div>

          <div className="mt-6 text-sm text-gray-500 flex items-center gap-2">
            <FileCode2 className="w-4 h-4" />
            템플릿을 선택하면 복사 가능한 YML 내용이 생성됩니다.
          </div>
        </div>
      </main>
    </div>
  );
}

