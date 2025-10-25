import { useEffect, useState, useRef } from 'react';
import { eventListeners, DeploymentLog } from '@shared/api/tauri/commands';
import { Trash2 } from 'lucide-react';

export function LogViewer() {
  const [logs, setLogs] = useState<DeploymentLog[]>([]);
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // 배포 로그 이벤트 구독
    const unsubscribe = eventListeners.onDeploymentLog((log) => {
      setLogs((prev) => [...prev, log]);
    });

    return () => {
      unsubscribe.then((unsub) => unsub());
    };
  }, []);

  // 새 로그가 추가되면 자동 스크롤
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const handleClearLogs = () => {
    setLogs([]);
  };

  const getLogColor = (level: DeploymentLog['level']) => {
    switch (level) {
      case 'info':
        return 'text-blue-400';
      case 'warning':
        return 'text-yellow-400';
      case 'error':
        return 'text-red-400';
      case 'success':
        return 'text-green-400';
      default:
        return 'text-gray-400';
    }
  };

  return (
    <div className="h-full flex flex-col bg-gray-900 font-mono text-sm">
      <div className="flex items-center justify-between p-2 border-b border-gray-700 bg-gray-800">
        <h3 className="text-white font-semibold">Deployment Logs</h3>
        <button
          onClick={handleClearLogs}
          className="p-1 hover:bg-gray-700 rounded transition-colors"
          title="Clear logs"
        >
          <Trash2 className="w-4 h-4 text-gray-400" />
        </button>
      </div>
      <div className="flex-1 p-2 overflow-y-auto">
        {logs.length === 0 ? (
          <div className="text-gray-500 text-center mt-4">
            No logs yet. Click Deploy to start.
          </div>
        ) : (
          <div className="space-y-1">
            {logs.map((log, index) => (
              <div key={index} className={getLogColor(log.level)}>
                <span className="text-gray-500">[{log.timestamp}]</span>{' '}
                <span className="font-bold">[{log.level.toUpperCase()}]</span>{' '}
                {log.message}
              </div>
            ))}
            <div ref={logEndRef} />
          </div>
        )}
      </div>
    </div>
  );
}