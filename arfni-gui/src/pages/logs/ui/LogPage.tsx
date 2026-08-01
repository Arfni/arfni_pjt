import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { useSshTabs } from '../model/sshTabs';
import { tunnelCommands } from '@shared/api/tauri/tunnel';
import { dockerCommands } from '@shared/api/tauri/dockerRemote';
import { listen } from '@tauri-apps/api/event';
import { confirm } from '@tauri-apps/plugin-dialog';
import { useState, useEffect, useRef } from 'react';
import { useSelector } from 'react-redux';
import { selectCurrentProject } from '@features/project/model/projectSlice';
import { ec2ServerCommands, EC2Server, Project } from '@shared/api/tauri/commands';
import { AnalyzeView } from './AnalyzeView';
import { MonitoringView } from './MonitoringView';
import { Sidebar } from './Sidebar';
import { TerminalWorkspace } from './TerminalWorkspace';
import { ContainersView } from './ContainersView';
import { useTranslation } from 'react-i18next';

export default function LogPage() {
  const { t } = useTranslation('logs');
  const navigate = useNavigate();
  const projectFromStore = useSelector(selectCurrentProject);
  const location = useLocation();
  const locationState = location.state as { project?: Project; selectedView?: 'containers' | 'terminal' | 'monitor' | 'analyze' } | undefined;
  const project = locationState?.project ?? projectFromStore;
  const [ec2Server, setEc2Server] = useState<EC2Server | null>(null);

  // SSH 터미널 탭. 세션은 Rust 쪽에 살아 있고 탭 목록은 모듈 스토어가 들고 있다.
  const {
    tabs,
    activeTabId,
    openTab,
    setActiveTab,
    closeTab,
    connectTab,
    disconnectTab,
    clearNotices,
    noticeActiveTab,
    isServerConnected,
  } = useSshTabs();

  const connected = isServerConnected(ec2Server?.id);

  // Tunnel 상태. LogPage가 직접 관리하는 건 모니터링용 Prometheus 터널 하나뿐이고,
  // 사용자가 TunnelPanel에서 연 터널들은 백엔드 맵이 진짜 소유자다.
  const [tunnelId, setTunnelId] = useState<string | null>(null);
  const [tunnelOpen, setTunnelOpen] = useState(false);
  const tunnelIdRef = useRef<string | null>(null);
  useEffect(() => {
    tunnelIdRef.current = tunnelId;
  }, [tunnelId]);

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
  const [selectedView, setSelectedView] = useState<'containers' | 'terminal' | 'monitor' | 'analyze'>(
    locationState?.selectedView ?? 'terminal'
  );

  // 터널 이벤트 → 현재 보고 있는 탭의 알림으로
  useEffect(() => {
    const unlistenTunnelOpen = listen('tunnel:opened', (e) => {
      const payload = e.payload as { id: string; chunk: string };
      noticeActiveTab(`🚇 ${payload.chunk}`);
    });

    const unlistenTunnelErr = listen('tunnel:stderr', (e) => {
      const payload = e.payload as { id: string; chunk: string };
      noticeActiveTab(`[tunnel error] ${payload.chunk}`);
    });

    const unlistenTunnelClose = listen('tunnel:closed', (e) => {
      const payload = e.payload as { id: string; chunk: string };
      noticeActiveTab(`🚇 ${payload.chunk}`);
      // 남의 터널이 닫힌 걸로 모니터링 터널 상태를 뒤집으면 안 된다.
      if (payload.id !== tunnelIdRef.current) return;
      setTunnelOpen(false);
      setTunnelId(null);
    });

    return () => {
      unlistenTunnelOpen.then((f) => f());
      unlistenTunnelErr.then((f) => f());
      unlistenTunnelClose.then((f) => f());
    };
  }, [noticeActiveTab]);

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
          noticeActiveTab(`❌ EC2 서버 정보를 불러오지 못했습니다: ${error instanceof Error ? error.message : String(error)}`);
        }
      } else {
        setEc2Server(null);
      }
    };
    loadEc2Server();
  }, [project]);

  // 터널 열기 (Prometheus: localhost:9091 -> remote:9090)
  const openTunnel = async () => {
    if (!ec2Server) {
      noticeActiveTab('❌ EC2 서버 정보가 없습니다.');
      return;
    }

    try {
      const id = await tunnelCommands.open(
        {
          host: ec2Server.host,
          user: ec2Server.user,
          pem_path: ec2Server.pem_path,
        },
        {
          kind: 'local',
          bind_port: 9091,
          target_port: 9090,
          label: 'Prometheus',
        }
      );
      setTunnelId(id);
      setTunnelOpen(true);
      noticeActiveTab(`✅ Tunnel opened [${id}] - Use http://localhost:9091 for Prometheus`);
    } catch (err: any) {
      noticeActiveTab(`❌ Tunnel failed: ${String(err)}`);
    }
  };

  // 터널 닫기
  const closeTunnel = async () => {
    if (!tunnelId) return;
    try {
      await tunnelCommands.close(tunnelId);
    } finally {
      setTunnelOpen(false);
      setTunnelId(null);
    }
  };

  // 컨테이너 시작
  const startContainer = async (containerId: string, containerName: string) => {
    if (!ec2Server) return;
    try {
      await dockerCommands.containerAction(ec2Server, 'start', containerId);
      noticeActiveTab(`✅ Container '${containerName}' started`);
      fetchContainersQuietly(); // 목록 새로고침 (로딩 표시 없이)
    } catch (err: any) {
      noticeActiveTab(`❌ Failed to start container: ${String(err)}`);
    }
  };

  // 컨테이너 중지
  const stopContainer = async (containerId: string, containerName: string) => {
    if (!ec2Server) return;
    try {
      await dockerCommands.containerAction(ec2Server, 'stop', containerId);
      noticeActiveTab(`✅ Container '${containerName}' stopped`);
      fetchContainersQuietly(); // 목록 새로고침 (로딩 표시 없이)
    } catch (err: any) {
      noticeActiveTab(`❌ Failed to stop container: ${String(err)}`);
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
      await dockerCommands.containerAction(ec2Server, 'remove', containerId);
      console.log('[REMOVE_CONTAINER] Docker rm succeeded, updating logs...');
      noticeActiveTab(`✅ ${t('containers.removed', { containerName })}`);
      console.log('[REMOVE_CONTAINER] Fetching updated container list...');
      await fetchContainersQuietly(); // 목록 새로고침 (로딩 표시 없이)
      console.log('[REMOVE_CONTAINER] Container list updated');
    } catch (err: any) {
      console.log('[REMOVE_CONTAINER] Error:', err);
      noticeActiveTab(`❌ ${t('containers.removeFailed')}: ${String(err)}`);
    } finally {
      console.log('[REMOVE_CONTAINER] Clearing deleting state');
      setDeletingContainerId(null);
    }
  };

  // 컨테이너 재시작
  const restartContainer = async (containerId: string, containerName: string) => {
    if (!ec2Server) return;
    try {
      await dockerCommands.containerAction(ec2Server, 'restart', containerId);
      noticeActiveTab(`✅ Container '${containerName}' restarted`);
      fetchContainersQuietly(); // 목록 새로고침 (로딩 표시 없이)
    } catch (err: any) {
      noticeActiveTab(`❌ Failed to restart container: ${String(err)}`);
    }
  };

  // 모든 컨테이너 시작
  const startAllContainers = async () => {
    if (!ec2Server || containers.length === 0) return;
    try {
      await dockerCommands.allContainers(ec2Server, true);
      noticeActiveTab(`✅ ${t('containers.allStarted')}`);
      fetchContainersQuietly();
    } catch (err: any) {
      noticeActiveTab(`❌ ${t('containers.allStartFailed', { error: String(err) })}`);
    }
  };

  // 모든 컨테이너 중지
  const stopAllContainers = async () => {
    if (!ec2Server || containers.length === 0) return;
    if (!await confirm(t('containers.confirmStopAll'))) return;
    try {
      await dockerCommands.allContainers(ec2Server, false);
      noticeActiveTab(`✅ ${t('containers.allStopped')}`);
      fetchContainersQuietly();
    } catch (err: any) {
      noticeActiveTab(`❌ ${t('containers.allStopFailed', { error: String(err) })}`);
    }
  };

  // 컨테이너 목록 가져오기 (로딩 표시 없이)
  const fetchContainersQuietly = async () => {
    if (!ec2Server) return;

    try {
      const result = await dockerCommands.ps(ec2Server);

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

        {/* Terminal View
            뷰를 바꿔도 언마운트하지 않는다. 언마운트하면 xterm 스크롤백과
            SFTP 세션이 매번 날아간다. 숨기기만 하고 상태는 유지한다. */}
        <TerminalWorkspace
          project={project}
          defaultServer={ec2Server}
          tabs={tabs}
          activeTabId={activeTabId}
          hidden={selectedView !== 'terminal'}
          onOpenTab={openTab}
          onSelectTab={setActiveTab}
          onCloseTab={closeTab}
          onConnectTab={connectTab}
          onDisconnectTab={disconnectTab}
          onClearNotices={clearNotices}
        />

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

        {/* Analyze View - Only show when analyze is selected */}
        {selectedView === 'analyze' && (
          <AnalyzeView
            prometheusUrl={tunnelOpen ? 'http://localhost:9091' : 'http://localhost:9090'}
          />
        )}
      </main>
      </div>
    </div>
  );
}
