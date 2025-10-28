import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Terminal, Play, CheckCircle, Trash2, StopCircle, FolderOpen } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { useState } from 'react';
import { useSelector } from 'react-redux';
import { selectCurrentProject } from '@features/project/model/projectSlice';

interface LogEntry {
  timestamp: string;
  message: string;
  type?: 'info' | 'success' | 'error' | 'warning';
}

export default function LogPage() {
  const navigate = useNavigate();
  const currentProject = useSelector(selectCurrentProject);
  const [logs, setLogs] = useState<LogEntry[]>([
    { timestamp: '2024-10-21 14:35:12', message: 'Project initialization started...', type: 'info' },
    { timestamp: '2024-10-21 14:35:13', message: 'Docker connection verified', type: 'info' },
    { timestamp: '2024-10-21 14:35:14', message: 'Working directory created', type: 'info' },
    { timestamp: '2024-10-21 14:35:15', message: 'Creating project configuration files...', type: 'info' },
    { timestamp: '2024-10-21 14:35:16', message: 'stack.yaml created successfully', type: 'info' },
    { timestamp: '2024-10-21 14:35:17', message: 'Installing dependencies...', type: 'info' },
    { timestamp: '2024-10-21 14:35:18', message: 'Downloading packages...', type: 'warning' },
    { timestamp: '2024-10-21 14:35:20', message: 'Project initialization complete!', type: 'success' },
  ]);
  const [isLoading, setIsLoading] = useState(false);

  const addLog = (message: string, type: 'info' | 'success' | 'error' | 'warning' = 'info') => {
    const timestamp = new Date().toLocaleString('sv-SE', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }).replace(',', '');
    setLogs(prev => [...prev, { timestamp, message, type }]);
  };

  const handleCheckStatus = async () => {
    if (!currentProject) {
      addLog('프로젝트가 열려있지 않습니다.', 'error');
      return;
    }

    if (!currentProject.ssh_host || !currentProject.ssh_user || !currentProject.ssh_pem_path) {
      addLog('프로젝트에 SSH 설정이 없습니다. 로컬 Docker를 사용하는 프로젝트인 것 같습니다.', 'error');
      return;
    }

    setIsLoading(true);
    addLog('컨테이너 상태 확인 중...', 'info');

    try {
      const result = await invoke<string>('ssh_exec_system', {
        params: {
          host: currentProject.ssh_host,
          user: currentProject.ssh_user,
          pem_path: currentProject.ssh_pem_path,
          cmd: 'docker ps'
        }
      });

      addLog('=== Docker 컨테이너 상태 ===', 'success');
      result.split('\n').forEach(line => {
        if (line.trim()) {
          addLog(line, 'info');
        }
      });
      addLog('=== 상태 확인 완료 ===', 'success');
    } catch (error) {
      addLog(`상태 확인 실패: ${error}`, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearLogs = () => {
    setLogs([]);
    addLog('로그가 초기화되었습니다.', 'info');
  };

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
              <button
                onClick={handleClearLogs}
                className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs"
              >
                Clear
              </button>
            </div>
          </div>

          <div className="flex-1 bg-gray-950 text-green-400 font-mono text-sm p-4 overflow-y-auto">
            <div className="space-y-1">
              {logs.map((log, index) => {
                const colorClass =
                  log.type === 'error' ? 'text-red-400' :
                  log.type === 'warning' ? 'text-yellow-400' :
                  log.type === 'success' ? 'text-green-400' :
                  'text-gray-300';

                return (
                  <div key={index} className={colorClass}>
                    [{log.timestamp}] {log.message}
                  </div>
                );
              })}
              <div className="mt-4 text-gray-500">
                <span className="animate-pulse">_</span>
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mt-4 flex-shrink-0">
          <button
            onClick={handleCheckStatus}
            disabled={isLoading}
            className="flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <CheckCircle className="w-4 h-4" />
            {isLoading ? '확인 중...' : '상태 확인'}
          </button>
          <button
            onClick={() => console.log('컨테이너 실행')}
            className="flex items-center justify-center gap-2 px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
          >
            <Play className="w-4 h-4" />
            실행
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
