import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Terminal, Play, CheckCircle, Trash2, StopCircle, FolderOpen } from 'lucide-react';

export default function LogPage() {
  const navigate = useNavigate();

  return (
    <div className="h-screen flex flex-col bg-gray-50 overflow-hidden">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/projects')}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <Terminal className="w-6 h-6 text-gray-600" />
          <h1 className="text-xl font-semibold">Project Logs</h1>
        </div>
      </header>

      <main className="flex-1 flex flex-col max-w-7xl w-full mx-auto px-6 py-4 overflow-hidden">
        <div className="flex-1 bg-white rounded-lg border border-gray-200 overflow-hidden flex flex-col">
          <div className="bg-gray-900 text-white px-4 py-3 flex items-center justify-between flex-shrink-0">
            <span className="font-mono text-sm">Real-time Logs</span>
            <div className="flex gap-2">
              <button className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs">
                Pause
              </button>
              <button className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs">
                Clear
              </button>
            </div>
          </div>

          <div className="flex-1 bg-gray-950 text-green-400 font-mono text-sm p-4 overflow-y-auto">
            <div className="space-y-1">
              <div>[2024-10-21 14:35:12] Project initialization started...</div>
              <div>[2024-10-21 14:35:13] Docker connection verified</div>
              <div>[2024-10-21 14:35:14] Working directory created</div>
              <div>[2024-10-21 14:35:15] Creating project configuration files...</div>
              <div>[2024-10-21 14:35:16] stack.yaml created successfully</div>
              <div>[2024-10-21 14:35:17] Installing dependencies...</div>
              <div className="text-yellow-400">[2024-10-21 14:35:18] Downloading packages...</div>
              <div className="text-green-400">[2024-10-21 14:35:20] Project initialization complete!</div>
              <div className="mt-4 text-gray-500">
                <span className="animate-pulse">_</span>
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mt-4 flex-shrink-0">
          <button
            onClick={() => console.log('컨테이너 실행')}
            className="flex items-center justify-center gap-2 px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
          >
            <Play className="w-4 h-4" />
            실행
          </button>
          <button
            onClick={() => console.log('컨테이너 상태 확인')}
            className="flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <CheckCircle className="w-4 h-4" />
            상태 확인
          </button>
          <button
            onClick={() => console.log('컨테이너 삭제')}
            className="flex items-center justify-center gap-2 px-4 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            삭제
          </button>
          <button
            onClick={() => console.log('컨테이너 중지')}
            className="flex items-center justify-center gap-2 px-4 py-3 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors"
          >
            <StopCircle className="w-4 h-4" />
            중지
          </button>
          <button
            onClick={() => navigate('/projects')}
            className="flex items-center justify-center gap-2 px-4 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
          >
            <FolderOpen className="w-4 h-4" />
            프로젝트들 보기
          </button>
        </div>
      </main>
    </div>
  );
}
