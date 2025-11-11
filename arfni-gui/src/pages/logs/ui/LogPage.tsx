import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useState, useEffect } from 'react';
import { useSelector } from 'react-redux';
import { selectCurrentProject } from '@features/project/model/projectSlice';
import { ec2ServerCommands, EC2Server, Project } from '@shared/api/tauri/commands';
import { OptimizeView } from './OptimizeView';
import { MonitoringView } from './MonitoringView';
import { Sidebar } from './Sidebar';
import { TerminalView } from './TerminalView';
import { ContainersView } from './ContainersView';
import { useTranslation } from 'react-i18next';

export default function LogPage() {
  const { t } = useTranslation('logs');
  const navigate = useNavigate();
  const projectFromStore = useSelector(selectCurrentProject);
  const location = useLocation();
  const locationState = location.state as { project?: Project; selectedView?: 'containers' | 'terminal' | 'monitor' | 'optimize' } | undefined;
  const project = locationState?.project ?? projectFromStore;
  const [ec2Server, setEc2Server] = useState<EC2Server | null>(null);

  // SSH Terminal 상태
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [terminalLogs, setTerminalLogs] = useState<string[]>([]);
  const [cmd, setCmd] = useState('');

  // Tunnel 상태
  const [tunnelId, setTunnelId] = useState<string | null>(null);
  const [tunnelOpen, setTunnelOpen] = useState(false);

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
  const [loadingContainers, setLoadingContainers] = useState(false);
  const [deletingContainerId, setDeletingContainerId] = useState<string | null>(null);

  // 좌측 사이드바 뷰 상태 (location state에서 selectedView가 있으면 사용, 없으면 기본값 'terminal')
  const [selectedView, setSelectedView] = useState<'containers' | 'terminal' | 'monitor' | 'optimize'>(
    locationState?.selectedView ?? 'terminal'
  );

  // SSH 이벤트 리스너
  useEffect(() => {
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

    const unlistenTunnelOpen = listen('tunnel:opened', (e) => {
      const payload = e.payload as { id: string; chunk: string };
      setTerminalLogs((prev) => [...prev, `🚇 ${payload.chunk}`]);
    });

    const unlistenTunnelErr = listen('tunnel:stderr', (e) => {
      const payload = e.payload as { id: string; chunk: string };
      setTerminalLogs((prev) => [...prev, `[tunnel error] ${payload.chunk}`]);
    });

    const unlistenTunnelClose = listen('tunnel:closed', (e) => {
      const payload = e.payload as { id: string; chunk: string };
      setTerminalLogs((prev) => [...prev, `🚇 ${payload.chunk}`]);
      setTunnelOpen(false);
      setTunnelId(null);
    });

    return () => {
      unlistenData.then((f) => f());
      unlistenErr.then((f) => f());
      unlistenClose.then((f) => f());
      unlistenTunnelOpen.then((f) => f());
      unlistenTunnelErr.then((f) => f());
      unlistenTunnelClose.then((f) => f());
    };
  }, []);

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
      setTerminalLogs((prev) => [...prev, `${t('log.commandPrefix')} ${cmd}`]);
      setCmd('');
    } catch (err: any) {
      setTerminalLogs((prev) => [...prev, `❌ ${t('log.sendFailed', { error: String(err) })}`]);
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

  // 터널 열기 (Prometheus: localhost:9091 -> remote:9090)
  const openTunnel = async () => {
    if (!ec2Server) {
      setTerminalLogs((prev) => [...prev, '❌ EC2 서버 정보가 없습니다.']);
      return;
    }

    try {
      const id = await invoke<string>('tunnel_open', {
        params: {
          host: ec2Server.host,
          user: ec2Server.user,
          pem_path: ec2Server.pem_path,
        },
        localPort: 9091,
        remotePort: 9090,
      });
      setTunnelId(id);
      setTunnelOpen(true);
      setTerminalLogs((prev) => [...prev, `✅ Tunnel opened [${id}] - Use http://localhost:9091 for Prometheus`]);
    } catch (err: any) {
      setTerminalLogs((prev) => [...prev, `❌ Tunnel failed: ${String(err)}`]);
    }
  };

  // 터널 닫기
  const closeTunnel = async () => {
    if (!tunnelId) return;
    try {
      await invoke('tunnel_close', { id: tunnelId });
    } finally {
      setTunnelOpen(false);
      setTunnelId(null);
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
    console.log('[REMOVE_CONTAINER] Called with:', containerId, containerName);
    if (!ec2Server) return;
    console.log('[REMOVE_CONTAINER] Setting deleting state...');
    setDeletingContainerId(containerId);
    try {
      console.log('[REMOVE_CONTAINER] Executing docker rm command...');
      await invoke('ssh_exec_system', {
        params: {
          host: ec2Server.host,
          user: ec2Server.user,
          pem_path: ec2Server.pem_path,
          cmd: `docker rm -f ${containerId}`
        }
      });
      console.log('[REMOVE_CONTAINER] Docker rm succeeded, updating logs...');
      setTerminalLogs((prev) => [...prev, `✅ ${t('containers.removed', { containerName })}`]);
      console.log('[REMOVE_CONTAINER] Fetching updated container list...');
      await fetchContainersQuietly(); // 목록 새로고침 (로딩 표시 없이)
      console.log('[REMOVE_CONTAINER] Container list updated');
    } catch (err: any) {
      console.log('[REMOVE_CONTAINER] Error:', err);
      setTerminalLogs((prev) => [...prev, `❌ ${t('containers.removeFailed')}: ${String(err)}`]);
    } finally {
      console.log('[REMOVE_CONTAINER] Clearing deleting state');
      setDeletingContainerId(null);
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
      setTerminalLogs((prev) => [...prev, `✅ ${t('containers.allStarted')}`]);
      fetchContainersQuietly();
    } catch (err: any) {
      setTerminalLogs((prev) => [...prev, `❌ ${t('containers.allStartFailed', { error: String(err) })}`]);
    }
  };

  // 모든 컨테이너 중지
  const stopAllContainers = async () => {
    if (!ec2Server || containers.length === 0) return;
    if (!confirm(t('containers.confirmStopAll'))) return;
    try {
      await invoke('ssh_exec_system', {
        params: {
          host: ec2Server.host,
          user: ec2Server.user,
          pem_path: ec2Server.pem_path,
          cmd: 'docker stop $(docker ps -q)'
        }
      });
      setTerminalLogs((prev) => [...prev, `✅ ${t('containers.allStopped')}`]);
      fetchContainersQuietly();
    } catch (err: any) {
      setTerminalLogs((prev) => [...prev, `❌ ${t('containers.allStopFailed', { error: String(err) })}`]);
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
    }
  }, [connected, ec2Server]);


  return (
    <div className="h-full flex flex-col bg-white overflow-hidden">
      {/* Top Header */}
      <header className="bg-gray-50 text-gray-900 px-6 py-4 flex items-center gap-4 border-b border-gray-200 flex-shrink-0">
        <button
          onClick={() => navigate('/projects')}
          className="p-1.5 hover:bg-gray-200 rounded transition-colors"
          title={t('page.backToProjects')}
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-xl font-semibold">{t('page.title')}</h1>
      </header>

      {/* Main Layout - Sidebar + Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar - Navigation */}
        <Sidebar
          selectedView={selectedView}
          onViewChange={setSelectedView}
          onContainersRefresh={fetchContainers}
          onTunnelOpen={openTunnel}
          onNavigateToMonitoring={() => navigate('/monitoring', { state: { project, ec2Server } })}
          project={project}
          ec2Server={ec2Server}
          tunnelOpen={tunnelOpen}
        />

      {/* Content Area */}
      <main className="flex-1 flex overflow-hidden">

        {/* Terminal View - Only show when terminal is selected */}
        {selectedView === 'terminal' && (
          <TerminalView
            project={project}
            ec2Server={ec2Server}
            connected={connected}
            terminalLogs={terminalLogs}
            cmd={cmd}
            tunnelOpen={tunnelOpen}
            onConnect={startSshSession}
            onDisconnect={closeSshSession}
            onTunnelOpen={openTunnel}
            onTunnelClose={closeTunnel}
            onClearLogs={() => setTerminalLogs([])}
            onCmdChange={setCmd}
            onSendCmd={sendSshCmd}
          />
        )}

        {/* Containers View - Only show when containers is selected */}
        {selectedView === 'containers' && project && (
          <ContainersView
            project={project}
            ec2Server={ec2Server}
            containers={containers}
            loadingContainers={loadingContainers}
            deletingContainerId={deletingContainerId}
            onRefresh={fetchContainers}
            onStartContainer={startContainer}
            onStopContainer={stopContainer}
            onRestartContainer={restartContainer}
            onRemoveContainer={removeContainer}
            onStartAll={startAllContainers}
            onStopAll={stopAllContainers}
          />
        )}

        {/* Monitor View - Only show when monitor is selected */}
        {selectedView === 'monitor' && (
          <MonitoringView
            project={project}
            ec2Server={ec2Server}
            onNavigateToMonitoring={() => navigate('/monitoring', { state: { project, ec2Server } })}
          />
        )}

        {/* Optimize View - Only show when optimize is selected */}
        {selectedView === 'optimize' && (
          <OptimizeView
            prometheusUrl={tunnelOpen ? 'http://localhost:9091' : 'http://localhost:9090'}
          />
        )}
      </main>
      </div>
    </div>
  );
}
