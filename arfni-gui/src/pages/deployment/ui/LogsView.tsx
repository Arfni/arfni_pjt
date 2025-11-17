import { RefObject } from 'react';

interface LogsViewProps {
  logs: Array<{
    timestamp: string;
    level: string;
    message: string;
  }>;
  logEndRef: RefObject<HTMLDivElement | null>;
}

const getLogColor = (level: string) => {
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

export function LogsView({ logs, logEndRef }: LogsViewProps) {
  return (
    <div className="bg-gray-50 p-4 font-mono text-sm h-full">
      {logs.length === 0 ? (
        <div className="text-gray-500 text-center mt-4">로그를 기다리는 중...</div>
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
  );
}
