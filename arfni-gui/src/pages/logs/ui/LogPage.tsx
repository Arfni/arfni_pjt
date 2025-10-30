import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, Terminal } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useState, useEffect, useRef } from 'react';
import { useSelector } from 'react-redux';
import { selectCurrentProject } from '@features/project/model/projectSlice';
import { ec2ServerCommands, EC2Server, Project } from '@shared/api/tauri/commands';

export default function LogPage() {
  const navigate = useNavigate();
  const projectFromStore = useSelector(selectCurrentProject);
  const location = useLocation();
  const locationState = location.state as { project?: Project } | undefined;
  const project = locationState?.project ?? projectFromStore;
  const [ec2Server, setEc2Server] = useState<EC2Server | null>(null);

  // SSH Terminal 상태
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [terminalLogs, setTerminalLogs] = useState<string[]>([]);
  const [cmd, setCmd] = useState('');

  // 자동 스크롤을 위한 ref
  const terminalLogRef = useRef<HTMLDivElement>(null);

  // 터미널 로그 자동 스크롤
  useEffect(() => {
    if (terminalLogRef.current) {
      terminalLogRef.current.scrollTop = terminalLogRef.current.scrollHeight;
    }
  }, [terminalLogs]);

  // SSH 이벤트 리스너
  useEffect(() => {
    if (!connected) return;

    const unlistenData = listen('ssh:data', (e) => {
      const payload = e.payload as { id: string; chunk: string };
      setTerminalLogs((prev) => [...prev, payload.chunk]);
    });

    const unlistenErr = listen('ssh:stderr', (e) => {
      const payload = e.payload as { id: string; chunk: string };
      setTerminalLogs((prev) => [...prev, `[stderr] ${payload.chunk}`]);
    });

    const unlistenClose = listen('ssh:closed', (e) => {
      const payload = e.payload as { id: string; chunk: string };
      setTerminalLogs((prev) => [...prev, `\n[Session closed: ${payload.id}]`]);
      setConnected(false);
      setSessionId(null);
    });

    return () => {
      unlistenData.then((f) => f());
      unlistenErr.then((f) => f());
      unlistenClose.then((f) => f());
    };
  }, [connected]);

  // EC2 서버 정보 로드
  useEffect(() => {
    const loadEc2Server = async () => {
      if (project?.environment === 'ec2' && project?.ec2_server_id) {
        try {
          const server = await ec2ServerCommands.getServerById(project.ec2_server_id);
          setEc2Server(server);
        } catch (error) {
          console.error('EC2 서버 정보 로드 실패:', error);
          setEc2Server(null);
        }
      } else {
        setEc2Server(null);
      }
    };
    loadEc2Server();
  }, [project]);


  // SSH 터미널 연결
  const startSshSession = async () => {
    if (!ec2Server) {
      setTerminalLogs((prev) => [...prev, '❌ EC2 서버 정보가 없습니다.']);
      return;
    }

    try {
      const id = await invoke<string>('ssh_start', {
        params: {
          host: ec2Server.host,
          user: ec2Server.user,
          pem_path: ec2Server.pem_path,
        },
      });
      setSessionId(id);
      setConnected(true);
      setTerminalLogs((prev) => [...prev, `✅ SSH connected [${id}]`]);
    } catch (err: any) {
      setTerminalLogs((prev) => [...prev, `❌ Connection failed: ${String(err)}`]);
    }
  };

  // 명령 전송
  const sendSshCmd = async () => {
    if (!sessionId || !cmd.trim()) return;
    try {
      await invoke('ssh_send', { id: sessionId, cmd });
      setTerminalLogs((prev) => [...prev, `> ${cmd}`]);
      setCmd('');
    } catch (err: any) {
      setTerminalLogs((prev) => [...prev, `❌ Send failed: ${String(err)}`]);
    }
  };

  // SSH 세션 종료
  const closeSshSession = async () => {
    if (!sessionId) return;
    try {
      await invoke('ssh_close', { id: sessionId });
    } finally {
      setConnected(false);
      setSessionId(null);
    }
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
        <div className="bg-white border border-gray-200 rounded-lg px-5 py-4 mb-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                {project ? project.name : 'No Project Selected'}
              </h2>
              <p className="text-sm text-gray-500">
                {project
                  ? project.environment === 'ec2'
                    ? 'EC2 Deployment Project'
                    : 'Local Docker Project'
                  : 'Select a project from the Projects page to view logs.'}
              </p>
            </div>
            {project && (
              <div className="text-sm text-gray-500">
                <span className="font-medium text-gray-700">Project Path:&nbsp;</span>
                <span className="font-mono break-all text-gray-600">{project.path}</span>
              </div>
            )}
          </div>

          {project?.environment === 'ec2' && (
            <dl className="grid grid-cols-1 gap-4 mt-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <dt className="text-xs uppercase tracking-wide text-gray-500">EC2 Host</dt>
                <dd className="text-sm font-mono text-gray-900">
                  {ec2Server ? ec2Server.host : 'Loading...'}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-gray-500">SSH User</dt>
                <dd className="text-sm font-mono text-gray-900">
                  {ec2Server ? ec2Server.user : 'Loading...'}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-gray-500">PEM Path</dt>
                <dd className="text-sm font-mono text-gray-900 break-all">
                  {ec2Server ? ec2Server.pem_path : 'Loading...'}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-gray-500">Last Connected</dt>
                <dd className="text-sm text-gray-900">
                  {ec2Server?.last_connected_at
                    ? new Date(ec2Server.last_connected_at).toLocaleString()
                    : 'N/A'}
                </dd>
              </div>
            </dl>
          )}
        </div>

        {/* SSH Terminal Section - 항상 표시 */}
        {project?.environment === 'ec2' ? (
          <div className="flex-1 bg-white rounded-lg border border-gray-200 overflow-hidden flex flex-col">
            {/* Terminal Header */}
            <div className="bg-gray-900 text-white px-4 py-3 flex items-center justify-between flex-shrink-0">
              <span className="font-mono text-sm">SSH Terminal</span>
              <div className="flex gap-2">
                {!connected ? (
                  <button
                    onClick={startSshSession}
                    disabled={!ec2Server}
                    className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Connect
                  </button>
                ) : (
                  <button
                    onClick={closeSshSession}
                    className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-xs"
                  >
                    Disconnect
                  </button>
                )}
                <button
                  onClick={() => setTerminalLogs([])}
                  className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-white rounded text-xs"
                >
                  Clear
                </button>
              </div>
            </div>

            {/* Terminal Output */}
            <div
              ref={terminalLogRef}
              className="flex-1 bg-gray-950 text-green-400 font-mono text-sm p-4 overflow-y-auto"
            >
              {terminalLogs.length === 0 ? (
                <div className="text-gray-400">No output yet. Connect and run commands.</div>
              ) : (
                terminalLogs.map((line, i) => <div key={i}>{line}</div>)
              )}
              <div className="mt-2 text-gray-500">
                <span className="animate-pulse">_</span>
              </div>
            </div>

            {/* Command Input */}
            <div className="bg-gray-900 p-3 flex gap-2 flex-shrink-0">
              <input
                className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white font-mono text-sm"
                placeholder="명령 입력 (예: ls -al, docker ps)"
                value={cmd}
                onChange={(e) => setCmd(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && sendSshCmd()}
                disabled={!connected}
              />
              <button
                onClick={sendSshCmd}
                disabled={!connected || !cmd.trim()}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Send
              </button>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center bg-white rounded-lg border border-gray-200">
            <div className="text-center text-gray-500">
              <Terminal className="w-12 h-12 mx-auto mb-4 text-gray-400" />
              <p className="text-lg font-semibold mb-2">SSH Terminal</p>
              <p className="text-sm">EC2 프로젝트를 선택하면 SSH 터미널을 사용할 수 있습니다.</p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
