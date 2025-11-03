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

  // Container 상태
  interface Container {
    id: string;
    name: string;
    image: string;
    status: string;
  }
  const [containers, setContainers] = useState<Container[]>([]);
  const [selectedContainerId, setSelectedContainerId] = useState<string | null>(null);
  const [loadingContainers, setLoadingContainers] = useState(false);

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

  // Docker 명령 실행
  const executeDockerCommand = async (command: string) => {
    if (!sessionId) {
      setTerminalLogs((prev) => [...prev, '❌ SSH session not connected']);
      return;
    }
    try {
      await invoke('ssh_send', { id: sessionId, cmd: command });
      setTerminalLogs((prev) => [...prev, `> ${command}`]);
    } catch (err: any) {
      setTerminalLogs((prev) => [...prev, `❌ Command failed: ${String(err)}`]);
    }
  };

  // 컨테이너 목록 가져오기
  const fetchContainers = async () => {
    if (!ec2Server || !connected) return;

    setLoadingContainers(true);
    try {
      // docker ps --format 명령을 사용해서 파싱하기 쉬운 형태로 출력
      const result = await invoke<string>('ssh_exec_command', {
        host: ec2Server.host,
        user: ec2Server.user,
        pemPath: ec2Server.pem_path,
        command: 'docker ps --format "{{.ID}}|{{.Names}}|{{.Image}}|{{.Status}}"'
      });

      if (result) {
        const lines = result.trim().split('\n').filter(line => line.trim());
        const parsedContainers: Container[] = lines.map(line => {
          const [id, name, image, status] = line.split('|');
          return { id, name, image, status };
        });
        setContainers(parsedContainers);
      } else {
        setContainers([]);
      }
    } catch (error) {
      console.error('Failed to fetch containers:', error);
      setContainers([]);
    } finally {
      setLoadingContainers(false);
    }
  };

  // SSH 연결 성공 시 컨테이너 목록 자동 로드
  useEffect(() => {
    if (connected && ec2Server) {
      fetchContainers();
    } else {
      setContainers([]);
      setSelectedContainerId(null);
    }
  }, [connected, ec2Server]);

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

      <main className="flex-1 flex overflow-hidden">

        {/* Main Content - SSH Terminal */}
        {project?.environment === 'ec2' ? (
          <div className="flex-1 bg-white overflow-hidden flex flex-col">
            {/* Terminal Header */}
            <div className="bg-gray-900 text-white px-4 py-3 flex items-center justify-between flex-shrink-0">
              <div className="flex flex-col gap-1">
                <span className="font-semibold text-sm">{project.name}</span>
                {ec2Server && (
                  <span className="font-mono text-xs text-gray-400">
                    {ec2Server.user}@{ec2Server.host}
                  </span>
                )}
              </div>
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
              style={{
                scrollbarWidth: 'thin',
                scrollbarColor: '#374151 #1f2937'
              }}
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
          <div className="flex-1 flex items-center justify-center bg-white">
            <div className="text-center text-gray-500">
              <Terminal className="w-12 h-12 mx-auto mb-4 text-gray-400" />
              <p className="text-lg font-semibold mb-2">SSH Terminal</p>
              <p className="text-sm">EC2 프로젝트를 선택하면 SSH 터미널을 사용할 수 있습니다.</p>
            </div>
          </div>
        )}

        {/* Right Sidebar */}
        {project && (
          <aside className="w-80 bg-gray-50 flex-shrink-0 overflow-y-auto flex flex-col">
            {/* Container Information */}
            <div className="bg-white p-5 border-b border-gray-200 flex-1 overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Container Information</h3>
                <button
                  onClick={fetchContainers}
                  disabled={!connected || loadingContainers}
                  className="text-xs px-2 py-1 text-blue-600 hover:bg-blue-50 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loadingContainers ? 'Loading...' : 'Refresh'}
                </button>
              </div>

              {loadingContainers ? (
                <div className="text-sm text-gray-500">Loading containers...</div>
              ) : containers.length === 0 ? (
                <div className="text-sm text-gray-500">No containers running</div>
              ) : (
                <div className="space-y-2">
                  {containers.map((container) => (
                    <button
                      key={container.id}
                      onClick={() => setSelectedContainerId(container.id)}
                      className={`w-full text-left p-3 rounded-lg border transition-all ${
                        selectedContainerId === container.id
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300 bg-white'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold text-gray-900 truncate">
                            {container.name}
                          </div>
                          <div className="text-xs text-gray-500 mt-1 truncate">
                            {container.image}
                          </div>
                          <div className="text-xs text-gray-400 mt-1">
                            {container.status}
                          </div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Docker Command */}
            <div className="bg-white p-5">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Docker Command</h3>
              <div className="space-y-2">
                <button
                  onClick={() => {
                    executeDockerCommand('docker ps');
                    fetchContainers();
                  }}
                  disabled={!connected}
                  className="w-full px-3 py-2 text-sm bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors text-left font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Check Container Status
                </button>
                <button
                  className="w-full px-3 py-2 text-sm bg-green-50 text-green-700 rounded-lg hover:bg-green-100 transition-colors text-left font-medium"
                >
                  Start All Containers
                </button>
                <button
                  className="w-full px-3 py-2 text-sm bg-green-50 text-green-700 rounded-lg hover:bg-green-100 transition-colors text-left font-medium"
                >
                  Start Container
                </button>
                <button
                  className="w-full px-3 py-2 text-sm bg-yellow-50 text-yellow-700 rounded-lg hover:bg-yellow-100 transition-colors text-left font-medium"
                >
                  Stop Container
                </button>
                <button
                  className="w-full px-3 py-2 text-sm bg-red-50 text-red-700 rounded-lg hover:bg-red-100 transition-colors text-left font-medium"
                >
                  Remove Container
                </button>
              </div>
            </div>

            {/* Monitoring Button */}
            <div className="bg-white p-5 border-t border-gray-200">
              <button
                disabled
                className="w-full px-4 py-3 text-white rounded-lg font-medium opacity-50 cursor-not-allowed"
                style={{ backgroundColor: '#4C65E2' }}
              >
                Go to Monitoring
              </button>
            </div>
          </aside>
        )}
      </main>
    </div>
  );
}
