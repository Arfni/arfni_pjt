import React, { useRef, useEffect } from 'react';
import { Terminal } from 'lucide-react';
import { Project, EC2Server } from '@shared/api/tauri/commands';

interface TerminalViewProps {
  project: Project | null;
  ec2Server: EC2Server | null;
  connected: boolean;
  terminalLogs: string[];
  cmd: string;
  tunnelOpen: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  onTunnelOpen: () => void;
  onTunnelClose: () => void;
  onClearLogs: () => void;
  onCmdChange: (value: string) => void;
  onSendCmd: () => void;
}

// 로그 라인에 색상 적용하는 헬퍼 함수
function getLogLineStyle(line: string): string {
  if (line.startsWith('✅')) return 'text-green-600';
  if (line.startsWith('❌')) return 'text-red-600';
  if (line.startsWith('>')) return 'text-blue-600 font-semibold';
  if (line.includes('[stderr]')) return 'text-red-500';
  if (line.includes('[Session closed')) return 'text-yellow-600';
  if (line.includes('SSH connected')) return 'text-green-500';
  return 'text-gray-700';
}

export function TerminalView({
  project,
  ec2Server,
  connected,
  terminalLogs,
  cmd,
  tunnelOpen,
  onConnect,
  onDisconnect,
  onTunnelOpen,
  onTunnelClose,
  onClearLogs,
  onCmdChange,
  onSendCmd
}: TerminalViewProps) {
  const terminalLogRef = useRef<HTMLDivElement>(null);

  // 터미널 로그 자동 스크롤
  useEffect(() => {
    if (terminalLogRef.current) {
      terminalLogRef.current.scrollTop = terminalLogRef.current.scrollHeight;
    }
  }, [terminalLogs]);

  // EC2 환경이 아닌 경우
  if (project?.environment !== 'ec2') {
    return (
      <div className="flex-1 flex items-center justify-center bg-white">
        <div className="text-center text-gray-500">
          <Terminal className="w-12 h-12 mx-auto mb-4 text-gray-400" />
          <p className="text-lg font-semibold mb-2">SSH Terminal</p>
          <p className="text-sm">EC2 프로젝트를 선택하면 SSH 터미널을 사용할 수 있습니다.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 bg-white overflow-hidden flex flex-col">
      {/* Terminal Controls */}
      <div className="bg-gray-50 text-gray-900 px-4 py-3 flex items-center justify-between flex-shrink-0 border-b border-gray-200">
        {/* Left: Project Info */}
        <div className="flex items-center gap-3">
          <div className="flex flex-col gap-1">
            <span className="font-semibold text-sm">{project.name}</span>
            {ec2Server && (
              <span className="font-mono text-xs text-gray-600">
                {ec2Server.user}@{ec2Server.host}
              </span>
            )}
          </div>
        </div>

        {/* Right: Control Buttons */}
        <div className="flex gap-2">
          {!connected ? (
            <button
              onClick={onConnect}
              disabled={!ec2Server}
              className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Connect
            </button>
          ) : (
            <button
              onClick={onDisconnect}
              className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-xs"
            >
              Disconnect
            </button>
          )}
          {!tunnelOpen ? (
            <button
              onClick={onTunnelOpen}
              disabled={!ec2Server}
              className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white rounded text-xs disabled:opacity-50 disabled:cursor-not-allowed"
              title="Open SSH tunnel for Prometheus (9091:9090)"
            >
              Open Tunnel
            </button>
          ) : (
            <button
              onClick={onTunnelClose}
              className="px-3 py-1 bg-orange-600 hover:bg-orange-700 text-white rounded text-xs"
              title="Close Prometheus tunnel"
            >
              Close Tunnel
            </button>
          )}
          <button
            onClick={onClearLogs}
            className="px-3 py-1 bg-gray-200 hover:bg-gray-300 text-gray-900 rounded text-xs"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Terminal Output */}
      <div
        ref={terminalLogRef}
        className="flex-1 bg-white font-mono text-sm p-4 overflow-y-auto"
        style={{
          scrollbarWidth: 'thin',
          scrollbarColor: '#d1d5db #f3f4f6'
        }}
      >
        {terminalLogs.length === 0 ? (
          <div className="text-gray-500">No output yet. Connect and run commands.</div>
        ) : (
          terminalLogs.map((line, i) => (
            <div key={i} className={getLogLineStyle(line)}>
              {line}
            </div>
          ))
        )}
        <div className="mt-2 text-gray-400">
          <span className="animate-pulse">_</span>
        </div>
      </div>

      {/* Command Input */}
      <div className="bg-gray-50 p-3 flex gap-2 flex-shrink-0 border-t border-gray-200">
        <input
          className="flex-1 bg-white border border-gray-300 rounded px-3 py-2 text-gray-900 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Enter Command ..."
          value={cmd}
          onChange={(e) => onCmdChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onSendCmd()}
          disabled={!connected}
        />
        <button
          onClick={onSendCmd}
          disabled={!connected}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Enter
        </button>
      </div>
    </div>
  );
}
