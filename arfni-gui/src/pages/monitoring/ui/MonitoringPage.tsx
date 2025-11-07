import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, Activity, ExternalLink } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { useState, useEffect } from 'react';
import { Project, EC2Server } from '@shared/api/tauri/commands';

interface MonitoringConfig {
  mode: string;
  prometheus_url: string;
  grafana_url: string;
  prometheus_port: number;
  grafana_port: number;
}

export default function MonitoringPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { project, ec2Server } = location.state as {
    project?: Project;
    ec2Server?: EC2Server;
  } || {};

  const [config, setConfig] = useState<MonitoringConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [startupMessage, setStartupMessage] = useState<string>('');

  // 모니터링 설정 로드 및 자동 시작
  useEffect(() => {
    const loadConfig = async () => {
      if (!project?.path) {
        setError('프로젝트 정보가 없습니다.');
        setLoading(false);
        return;
      }

      try {
        // 1. 모니터링 설정 로드
        const monitoringConfig = await invoke<MonitoringConfig>('get_monitoring_config', {
          projectPath: project.path
        });
        setConfig(monitoringConfig);

        // 2. Grafana가 실행 중인지 확인
        const isRunning = await invoke<boolean>('check_monitoring_running', {
          grafanaUrl: monitoringConfig.grafana_url
        });

        if (!isRunning) {
          // 3. 실행 중이 아니면 자동으로 시작
          setIsStarting(true);
          setStartupMessage('모니터링 스택을 시작하는 중...');

          const startResult = await invoke<string>('start_monitoring_stack', {
            projectPath: project.path
          });

          console.log(startResult);
          setStartupMessage('모니터링 스택이 시작되었습니다. Grafana가 준비될 때까지 기다리는 중...');

          // 4. Grafana가 준비될 때까지 대기 (최대 30초)
          let attempts = 0;
          const maxAttempts = 30; // 30초
          while (attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 1000)); // 1초 대기

            const ready = await invoke<boolean>('check_monitoring_running', {
              grafanaUrl: monitoringConfig.grafana_url
            });

            if (ready) {
              setIsStarting(false);
              setStartupMessage('');
              break;
            }

            attempts++;
            setStartupMessage(`Grafana 준비 중... (${attempts}/${maxAttempts}초)`);
          }

          if (attempts >= maxAttempts) {
            setError('모니터링 스택이 시작되었지만 Grafana가 준비되지 않았습니다. 잠시 후 다시 시도해주세요.');
            setIsStarting(false);
          }
        }

        setError(null);
      } catch (err) {
        console.error('Failed to load monitoring config:', err);
        setError(`${err}`);
        setIsStarting(false);
      } finally {
        setLoading(false);
      }
    };

    loadConfig();
  }, [project]);

  if (loading || isStarting) {
    return (
      <div className="h-screen w-screen flex flex-col bg-gray-50">
        <header className="bg-white border-b border-gray-200 px-6 py-4 flex-shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={async () => {
                await invoke('stop_monitoring_stack').catch(console.error);
                navigate('/logs', { state: { project } });
              }}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <Activity className="w-6 h-6 text-blue-500" />
            <h1 className="text-xl font-semibold">Monitoring Dashboard</h1>
          </div>
        </header>

        <main className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <Activity className="w-12 h-12 mx-auto mb-4 text-blue-500 animate-pulse" />
            <p className="text-lg text-gray-600 mb-2">
              {isStarting ? startupMessage : '모니터링 설정을 불러오는 중...'}
            </p>
            {isStarting && (
              <p className="text-sm text-gray-500">Docker 컨테이너를 시작하고 있습니다...</p>
            )}
          </div>
        </main>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-screen w-screen flex flex-col bg-gray-50">
        <header className="bg-white border-b border-gray-200 px-6 py-4 flex-shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/logs', { state: { project } })}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <Activity className="w-6 h-6 text-red-600" />
            <h1 className="text-xl font-semibold">Monitoring Dashboard</h1>
          </div>
        </header>

        <main className="flex-1 flex items-center justify-center p-6">
          <div className="max-w-2xl w-full bg-red-50 border border-red-200 rounded-lg p-6">
            <Activity className="w-12 h-12 mx-auto mb-4 text-red-400" />
            <h3 className="text-lg font-semibold text-red-900 mb-2 text-center">모니터링 연결 실패</h3>
            <p className="text-sm text-red-700 mb-4 text-center whitespace-pre-line">{error}</p>

            <div className="mt-6 space-y-3 text-left bg-white p-4 rounded border border-red-100">
              <p className="text-sm font-semibold text-gray-700">해결 방법:</p>
              <ol className="text-sm text-gray-600 list-decimal list-inside space-y-2 ml-2">
                <li>
                  <strong>Docker Desktop 실행 확인</strong>
                  <p className="ml-6 mt-1 text-xs text-gray-500">모니터링 스택은 Docker 컨테이너로 실행됩니다.</p>
                </li>
                <li>
                  <strong>stack.yaml 파일 확인</strong>
                  <p className="ml-6 mt-1 text-xs text-gray-500">
                    경로: <code className="bg-gray-100 px-1 py-0.5 rounded font-mono">{project?.path}\stack.yaml</code>
                  </p>
                </li>
                <li>
                  <strong>모니터링 스택 시작</strong>
                  <div className="ml-6 mt-1 space-y-1">
                    <p className="text-xs text-gray-500">명령어 1:</p>
                    <code className="block bg-gray-100 px-2 py-1 rounded font-mono text-xs">
                      start-monitoring-v2.exe {project?.path}\stack.yaml
                    </code>
                    <p className="text-xs text-gray-500 mt-2">또는 명령어 2:</p>
                    <code className="block bg-gray-100 px-2 py-1 rounded font-mono text-xs">
                      arfni-go.exe monitor -f {project?.path}\stack.yaml
                    </code>
                  </div>
                </li>
              </ol>
            </div>

            <div className="mt-4 flex justify-center">
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm"
              >
                다시 시도
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-gray-50">
        <div className="text-center text-gray-500">
          <Activity className="w-12 h-12 mx-auto mb-4 text-gray-400" />
          <p className="text-lg">모니터링 설정을 찾을 수 없습니다.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen flex flex-col bg-gray-50" style={{ margin: 0, padding: 0 }}>
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={async () => {
                // Cleanup 후 navigate
                await invoke('stop_monitoring_stack').catch(console.error);
                navigate('/logs', { state: { project } });
              }}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <Activity className="w-6 h-6 text-blue-600" />
            <div>
              <h1 className="text-xl font-semibold">Monitoring Dashboard</h1>
              {project && (
                <p className="text-sm text-gray-500">{project.name}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Grafana 새 탭에서 열기 */}
            <button
              onClick={() => window.open(config.grafana_url, '_blank')}
              className="px-3 py-2 bg-gray-700 hover:bg-gray-800 text-white rounded-lg text-sm flex items-center gap-2"
            >
              <ExternalLink className="w-4 h-4" />
              Open in New Tab
            </button>
          </div>
        </div>

        {/* 모니터링 정보 표시 */}
        <div className="mt-2 flex items-center gap-4 text-xs text-gray-500">
          <span>Mode: <span className="font-semibold text-gray-700">{config.mode}</span></span>
          <span>Grafana: <span className="font-mono text-gray-700">{config.grafana_url}</span></span>
          {ec2Server && (
            <span>Server: <span className="font-mono text-gray-700">{ec2Server.user}@{ec2Server.host}</span></span>
          )}
        </div>
      </header>

      {/* Grafana iframe */}
      <main className="flex-1 overflow-hidden" style={{ margin: 0, padding: 0 }}>
        <iframe
          src={`${config.grafana_url}/dashboards`}
          className="w-full h-full border-0"
          title="Grafana Monitoring Dashboard"
          style={{ margin: 0, padding: 0 }}
          sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox"
          allow="fullscreen"
        />
      </main>
    </div>
  );
}
