import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, Terminal, Play, Square, Trash2, RotateCw, MoreVertical, RefreshCw } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useState, useEffect, useRef } from 'react';
import { useSelector } from 'react-redux';
import { selectCurrentProject } from '@features/project/model/projectSlice';
import { ec2ServerCommands, EC2Server, Project } from '@shared/api/tauri/commands';

// 로그 라인에 색상 적용하는 헬퍼 함수
function getLogLineStyle(line: string): string {
  if (line.startsWith('✅')) return 'text-green-400';
  if (line.startsWith('❌')) return 'text-red-400';
  if (line.startsWith('>')) return 'text-blue-400 font-semibold';
  if (line.includes('[stderr]')) return 'text-red-300';
  if (line.includes('[Session closed')) return 'text-yellow-400';
  if (line.includes('SSH connected')) return 'text-green-300';
  return 'text-gray-300';
}

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
    command?: string;
    created?: string;
    ports?: string;
  }
  const [containers, setContainers] = useState<Container[]>([]);
  const [expandedContainerIds, setExpandedContainerIds] = useState<Set<string>>(new Set());
  const [selectedContainerIds, setSelectedContainerIds] = useState<Set<string>>(new Set());
  const [loadingContainers, setLoadingContainers] = useState(false);
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
  const [openHeaderDropdown, setOpenHeaderDropdown] = useState(false);

  // 사이드바 리사이저 상태
  const [sidebarWidth, setSidebarWidth] = useState(320); // 기본 320px (w-80)
  const [isResizing, setIsResizing] = useState(false);

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

  // 컨테이너 시작
  const startContainer = async (containerId: string, containerName: string) => {
    if (!ec2Server) return;
    try {
      await invoke('ssh_exec_system', {
        params: {
          host: ec2Server.host,
          user: ec2Server.user,
          pem_path: ec2Server.pem_path,
          cmd: `docker start ${containerId}`
        }
      });
      setTerminalLogs((prev) => [...prev, `✅ Container '${containerName}' started`]);
      fetchContainersQuietly(); // 목록 새로고침 (로딩 표시 없이)
    } catch (err: any) {
      setTerminalLogs((prev) => [...prev, `❌ Failed to start container: ${String(err)}`]);
    }
  };

  // 컨테이너 중지
  const stopContainer = async (containerId: string, containerName: string) => {
    if (!ec2Server) return;
    try {
      await invoke('ssh_exec_system', {
        params: {
          host: ec2Server.host,
          user: ec2Server.user,
          pem_path: ec2Server.pem_path,
          cmd: `docker stop ${containerId}`
        }
      });
      setTerminalLogs((prev) => [...prev, `✅ Container '${containerName}' stopped`]);
      fetchContainersQuietly(); // 목록 새로고침 (로딩 표시 없이)
    } catch (err: any) {
      setTerminalLogs((prev) => [...prev, `❌ Failed to stop container: ${String(err)}`]);
    }
  };

  // 컨테이너 삭제
  const removeContainer = async (containerId: string, containerName: string) => {
    if (!ec2Server) return;
    if (!confirm(`Are you sure you want to remove container '${containerName}'?`)) return;
    try {
      await invoke('ssh_exec_system', {
        params: {
          host: ec2Server.host,
          user: ec2Server.user,
          pem_path: ec2Server.pem_path,
          cmd: `docker rm -f ${containerId}`
        }
      });
      setTerminalLogs((prev) => [...prev, `✅ Container '${containerName}' removed`]);
      fetchContainersQuietly(); // 목록 새로고침 (로딩 표시 없이)
    } catch (err: any) {
      setTerminalLogs((prev) => [...prev, `❌ Failed to remove container: ${String(err)}`]);
    }
  };

  // 컨테이너 재시작
  const restartContainer = async (containerId: string, containerName: string) => {
    if (!ec2Server) return;
    try {
      await invoke('ssh_exec_system', {
        params: {
          host: ec2Server.host,
          user: ec2Server.user,
          pem_path: ec2Server.pem_path,
          cmd: `docker restart ${containerId}`
        }
      });
      setTerminalLogs((prev) => [...prev, `✅ Container '${containerName}' restarted`]);
      fetchContainersQuietly(); // 목록 새로고침 (로딩 표시 없이)
    } catch (err: any) {
      setTerminalLogs((prev) => [...prev, `❌ Failed to restart container: ${String(err)}`]);
    }
  };

  // 선택된 컨테이너 시작
  const startSelectedContainers = async () => {
    if (!ec2Server || selectedContainerIds.size === 0) return;
    try {
      const containerIds = Array.from(selectedContainerIds).join(' ');
      await invoke('ssh_exec_system', {
        params: {
          host: ec2Server.host,
          user: ec2Server.user,
          pem_path: ec2Server.pem_path,
          cmd: `docker start ${containerIds}`
        }
      });
      setTerminalLogs((prev) => [...prev, `✅ ${selectedContainerIds.size} selected containers started`]);
      fetchContainersQuietly();
    } catch (err: any) {
      setTerminalLogs((prev) => [...prev, `❌ Failed to start selected containers: ${String(err)}`]);
    }
  };

  // 선택된 컨테이너 중지
  const stopSelectedContainers = async () => {
    if (!ec2Server || selectedContainerIds.size === 0) return;
    if (!confirm(`Are you sure you want to stop ${selectedContainerIds.size} selected container(s)?`)) return;
    try {
      const containerIds = Array.from(selectedContainerIds).join(' ');
      await invoke('ssh_exec_system', {
        params: {
          host: ec2Server.host,
          user: ec2Server.user,
          pem_path: ec2Server.pem_path,
          cmd: `docker stop ${containerIds}`
        }
      });
      setTerminalLogs((prev) => [...prev, `✅ ${selectedContainerIds.size} selected containers stopped`]);
      fetchContainersQuietly();
    } catch (err: any) {
      setTerminalLogs((prev) => [...prev, `❌ Failed to stop selected containers: ${String(err)}`]);
    }
  };

  // 모든 컨테이너 시작
  const startAllContainers = async () => {
    if (!ec2Server || containers.length === 0) return;
    try {
      await invoke('ssh_exec_system', {
        params: {
          host: ec2Server.host,
          user: ec2Server.user,
          pem_path: ec2Server.pem_path,
          cmd: 'docker start $(docker ps -aq)'
        }
      });
      setTerminalLogs((prev) => [...prev, `✅ All containers started`]);
      fetchContainersQuietly();
    } catch (err: any) {
      setTerminalLogs((prev) => [...prev, `❌ Failed to start all containers: ${String(err)}`]);
    }
  };

  // 모든 컨테이너 중지
  const stopAllContainers = async () => {
    if (!ec2Server || containers.length === 0) return;
    if (!confirm('Are you sure you want to stop all containers?')) return;
    try {
      await invoke('ssh_exec_system', {
        params: {
          host: ec2Server.host,
          user: ec2Server.user,
          pem_path: ec2Server.pem_path,
          cmd: 'docker stop $(docker ps -q)'
        }
      });
      setTerminalLogs((prev) => [...prev, `✅ All containers stopped`]);
      fetchContainersQuietly();
    } catch (err: any) {
      setTerminalLogs((prev) => [...prev, `❌ Failed to stop all containers: ${String(err)}`]);
    }
  };

  // 컨테이너 목록 가져오기 (로딩 표시 없이)
  const fetchContainersQuietly = async () => {
    if (!ec2Server) return;

    try {
      // docker ps -a --format 명령을 사용해서 모든 컨테이너 정보를 파싱하기 쉬운 형태로 출력
      const result = await invoke<string>('ssh_exec_system', {
        params: {
          host: ec2Server.host,
          user: ec2Server.user,
          pem_path: ec2Server.pem_path,
          cmd: 'docker ps -a --format "{{.ID}}|{{.Names}}|{{.Image}}|{{.Status}}|{{.Command}}|{{.CreatedAt}}|{{.Ports}}"'
        }
      });

      if (result) {
        const lines = result.trim().split('\n').filter(line => line.trim());
        const parsedContainers: Container[] = lines.map(line => {
          const [id, name, image, status, command, created, ports] = line.split('|');
          return { id, name, image, status, command, created, ports };
        });
        setContainers(parsedContainers);
      } else {
        setContainers([]);
      }
    } catch (error) {
      console.error('Failed to fetch containers:', error);
    }
  };

  // 컨테이너 목록 가져오기 (로딩 표시 포함)
  const fetchContainers = async () => {
    if (!ec2Server) return;

    setLoadingContainers(true);
    try {
      await fetchContainersQuietly();
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
      setExpandedContainerIds(new Set());
      setSelectedContainerIds(new Set());
    }
  }, [connected, ec2Server]);

  // 드롭다운 외부 클릭 시 닫기
  useEffect(() => {
    const handleClickOutside = () => {
      if (openDropdownId) {
        setOpenDropdownId(null);
      }
      if (openHeaderDropdown) {
        setOpenHeaderDropdown(false);
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, [openDropdownId, openHeaderDropdown]);

  // 사이드바 리사이저 핸들러
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;

      // 우측에서부터의 거리를 계산
      const newWidth = window.innerWidth - e.clientX;

      // 최소 250px, 최대 600px로 제한
      const clampedWidth = Math.min(Math.max(newWidth, 250), 600);
      setSidebarWidth(clampedWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    if (isResizing) {
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  return (
    <div className="h-screen w-screen flex flex-col bg-gray-50 overflow-hidden" style={{ margin: 0, padding: 0, position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}>
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

      <main className="flex-1 flex overflow-hidden" style={{ margin: 0, padding: 0 }}>

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
              className="flex-1 bg-gray-950 font-mono text-sm p-4 overflow-y-auto"
              style={{
                scrollbarWidth: 'thin',
                scrollbarColor: '#374151 #1f2937'
              }}
            >
              {terminalLogs.length === 0 ? (
                <div className="text-gray-400">No output yet. Connect and run commands.</div>
              ) : (
                terminalLogs.map((line, i) => (
                  <div key={i} className={getLogLineStyle(line)}>
                    {line}
                  </div>
                ))
              )}
              <div className="mt-2 text-gray-500">
                <span className="animate-pulse">_</span>
              </div>
            </div>

            {/* Command Input */}
            <div className="bg-gray-900 p-3 flex gap-2 flex-shrink-0">
              <input
                className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white font-mono text-sm"
                placeholder="Enter Command ..."
                value={cmd}
                onChange={(e) => setCmd(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && sendSshCmd()}
                disabled={!connected}
              />
              <button
                onClick={sendSshCmd}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Enter
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
          <>
            {/* Resizer Handle */}
            <div
              className="w-1 bg-gray-200 hover:bg-blue-400 cursor-col-resize transition-colors flex-shrink-0"
              onMouseDown={() => setIsResizing(true)}
              style={{ cursor: 'col-resize' }}
            />

            <aside
              className="bg-gray-50 flex-shrink-0 overflow-y-auto flex flex-col"
              style={{ width: `${sidebarWidth}px` }}
            >
            {/* Container Information */}
            <div className="bg-white p-5 border-b border-gray-200 flex-1 overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Containers</h3>
                <div className="flex gap-1">
                  <button
                    onClick={startSelectedContainers}
                    disabled={!ec2Server || selectedContainerIds.size === 0}
                    className="p-1.5 text-green-600 hover:bg-green-50 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Start Selected"
                  >
                    <Play className="w-4 h-4" fill="currentColor" />
                  </button>
                  <button
                    onClick={stopSelectedContainers}
                    disabled={!ec2Server || selectedContainerIds.size === 0}
                    className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Stop Selected"
                  >
                    <Square className="w-4 h-4" fill="currentColor" />
                  </button>
                  <button
                    onClick={fetchContainers}
                    disabled={!ec2Server || loadingContainers}
                    className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Refresh"
                  >
                    <RefreshCw className={`w-4 h-4 ${loadingContainers ? 'animate-spin' : ''}`} />
                  </button>

                  {/* 헤더 삼점 메뉴 */}
                  <div className="relative">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenHeaderDropdown(!openHeaderDropdown);
                      }}
                      className="p-1.5 text-gray-600 hover:bg-gray-100 rounded transition-colors"
                      title="More"
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>

                    {/* 헤더 드롭다운 메뉴 */}
                    {openHeaderDropdown && (
                      <div
                        className="absolute right-0 mt-1 w-40 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-10"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          onClick={() => {
                            startAllContainers();
                            setOpenHeaderDropdown(false);
                          }}
                          disabled={!ec2Server || containers.length === 0}
                          className="w-full px-3 py-2 text-left text-sm text-green-600 hover:bg-green-50 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <Play className="w-4 h-4" fill="currentColor" />
                          Start All
                        </button>
                        <button
                          onClick={() => {
                            stopAllContainers();
                            setOpenHeaderDropdown(false);
                          }}
                          disabled={!ec2Server || containers.length === 0}
                          className="w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <Square className="w-4 h-4" fill="currentColor" />
                          Stop All
                        </button>
                        <div className="border-t border-gray-200 my-1"></div>
                        <button
                          onClick={() => {
                            setSelectedContainerIds(new Set(containers.map(c => c.id)));
                            setOpenHeaderDropdown(false);
                          }}
                          className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                        >
                          Select All
                        </button>
                        <button
                          onClick={() => {
                            setSelectedContainerIds(new Set());
                            setOpenHeaderDropdown(false);
                          }}
                          className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                        >
                          Deselect All
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {loadingContainers ? (
                <div className="text-sm text-gray-500">Loading containers...</div>
              ) : containers.length === 0 ? (
                <div className="text-sm text-gray-500">No containers found</div>
              ) : (
                <div className="space-y-2">
                  {containers.map((container) => {
                    const isRunning = container.status.toLowerCase().includes('up');
                    const isDropdownOpen = openDropdownId === container.id;
                    const isExpanded = expandedContainerIds.has(container.id);
                    const isSelected = selectedContainerIds.has(container.id);

                    const toggleExpand = () => {
                      setExpandedContainerIds(prev => {
                        const newSet = new Set(prev);
                        if (newSet.has(container.id)) {
                          newSet.delete(container.id);
                        } else {
                          newSet.add(container.id);
                        }
                        return newSet;
                      });
                    };

                    const toggleSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
                      e.stopPropagation();
                      setSelectedContainerIds(prev => {
                        const newSet = new Set(prev);
                        if (newSet.has(container.id)) {
                          newSet.delete(container.id);
                        } else {
                          newSet.add(container.id);
                        }
                        return newSet;
                      });
                    };

                    return (
                      <div
                        key={container.id}
                        className="p-3 rounded-lg border border-gray-200 bg-white transition-all cursor-pointer hover:border-gray-300"
                        onClick={toggleExpand}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-start gap-2 flex-1 min-w-0">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={toggleSelect}
                              onClick={(e) => e.stopPropagation()}
                              className="mt-0.5 w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500 cursor-pointer"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-semibold text-gray-900 truncate">
                                {container.name}
                              </div>
                              <div className="text-xs text-gray-500 mt-1 truncate">
                                {container.image}
                              </div>
                              <div className={`text-xs mt-1 ${isRunning ? 'text-green-600' : 'text-gray-400'}`}>
                                {container.status}
                              </div>
                            </div>
                          </div>
                          <div className="flex gap-1 items-start" onClick={(e) => e.stopPropagation()}>
                            {/* 더보기 버튼 & 드롭다운 */}
                            <div className="relative">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setOpenDropdownId(isDropdownOpen ? null : container.id);
                                }}
                                className="p-1.5 text-gray-600 hover:bg-gray-100 rounded transition-colors"
                                title="More"
                              >
                                <MoreVertical className="w-4 h-4" />
                              </button>

                              {/* 드롭다운 메뉴 */}
                              {isDropdownOpen && (
                                <div
                                  className="absolute right-0 mt-1 w-36 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-10"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {isRunning ? (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        stopContainer(container.id, container.name);
                                        setOpenDropdownId(null);
                                      }}
                                      className="w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                                    >
                                      <Square className="w-4 h-4" fill="currentColor" />
                                      Stop
                                    </button>
                                  ) : (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        startContainer(container.id, container.name);
                                        setOpenDropdownId(null);
                                      }}
                                      className="w-full px-3 py-2 text-left text-sm text-green-600 hover:bg-green-50 flex items-center gap-2"
                                    >
                                      <Play className="w-4 h-4" fill="currentColor" />
                                      Start
                                    </button>
                                  )}
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      restartContainer(container.id, container.name);
                                      setOpenDropdownId(null);
                                    }}
                                    className="w-full px-3 py-2 text-left text-sm text-blue-600 hover:bg-blue-50 flex items-center gap-2"
                                  >
                                    <RotateCw className="w-4 h-4" />
                                    Restart
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      removeContainer(container.id, container.name);
                                      setOpenDropdownId(null);
                                    }}
                                    className="w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                    Delete
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* 상세 정보 (펼쳤을 때만 표시) */}
                        {isExpanded && (
                          <div className="mt-3 ml-6 pt-3 border-t border-gray-100 space-y-1.5">
                            <div className="text-xs">
                              <span className="text-gray-500 font-medium">Container ID:</span>{' '}
                              <span className="text-gray-700 font-mono">{container.id}</span>
                            </div>
                            {container.command && (
                              <div className="text-xs">
                                <span className="text-gray-500 font-medium">Command:</span>{' '}
                                <span className="text-gray-700 font-mono break-all">{container.command}</span>
                              </div>
                            )}
                            {container.created && (
                              <div className="text-xs">
                                <span className="text-gray-500 font-medium">Created:</span>{' '}
                                <span className="text-gray-700">{container.created}</span>
                              </div>
                            )}
                            {container.ports && (
                              <div className="text-xs">
                                <span className="text-gray-500 font-medium">Ports:</span>{' '}
                                <span className="text-gray-700 font-mono">{container.ports || 'None'}</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>


            {/* Monitoring Button */}
            <div className="bg-white p-5 border-t border-gray-200">
              <button
                disabled
                className="w-full px-4 py-3 text-white rounded-lg font-medium opacity-50 cursor-not-allowed"
                style={{ backgroundColor: '#4C65E2' }}
              >
                Monitoring Logs
              </button>
            </div>
          </aside>
          </>
        )}
      </main>
    </div>
  );
}
