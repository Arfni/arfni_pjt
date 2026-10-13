import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, Activity, ExternalLink } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { openUrl } from '@tauri-apps/plugin-opener';
import { useState, useEffect, useRef } from 'react';
import { Project, EC2Server } from '@shared/api/tauri/commands';
import { useTranslation } from 'react-i18next';

interface MonitoringConfig {
  mode: string;
  prometheus_url: string;
  grafana_url: string;
  prometheus_port: number;
  grafana_port: number;
  dashboard_uid?: string;
}

export default function MonitoringPage() {
  const { t } = useTranslation('logs');
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
  const [retry, setRetry] = useState(0);
  const startup = useRef<Promise<void>>(Promise.resolve());
  const cancelStartup = useRef(() => {});
  const leaving = useRef(false);
  const [isStopping, setIsStopping] = useState(false);
  const [stopError, setStopError] = useState<string | null>(null);

  const leaveMonitoring = async () => {
    if (leaving.current) return;
    leaving.current = true;
    setIsStopping(true);
    setStopError(null);
    cancelStartup.current();
    try {
      // A pending start must finish before stop, otherwise it can reopen the ports after leaving.
      await startup.current;
      if (project?.path) {
        await invoke('stop_monitoring_stack', { projectPath: project.path });
      }
      navigate('/logs', { state: { project, selectedView: 'monitor' } });
    } catch (err) {
      setStopError(String(err));
    } finally {
      leaving.current = false;
      setIsStopping(false);
    }
  };

  // Load the monitoring config and start it automatically
  useEffect(() => {
    let cancelled = false;
    cancelStartup.current = () => { cancelled = true; };
    const loadConfig = async () => {
      if (!project?.path) {
        setError(t('monitoring.projectMissing'));
        setLoading(false);
        return;
      }

      try {
        // 1. load the monitoring config
        setLoading(true);
        setError(null);
        setIsStarting(true);
        setStartupMessage(t('monitoring.loadingConfig', { percentage: 5 }));

        const monitoringConfig = await invoke<MonitoringConfig>('get_monitoring_config', {
          projectPath: project.path
        });
        if (cancelled) return;
        setConfig(monitoringConfig);
        setStartupMessage(t('monitoring.loadingConfig', { percentage: 10 }));

        // A healthy localhost URL may belong to a different server or a manual tunnel.
        // Let the backend establish or reuse this project's own tunnels first.
        if (monitoringConfig.mode === 'all-in-one') {
          await invoke('start_monitoring_stack', { projectPath: project.path });
          if (cancelled) return;
        }

        // 2. check whether Grafana is running
        setStartupMessage(t('monitoring.checkingStatus', { percentage: 15 }));
        const isRunning = await invoke<boolean>('check_monitoring_running', {
          grafanaUrl: monitoringConfig.grafana_url
        });
        if (cancelled) return;
        setStartupMessage(t('monitoring.checkingStatus', { percentage: 20 }));

        if (!isRunning) {
          // 3. start it automatically when it is not
          setStartupMessage(t('monitoring.startingStack', { percentage: 30 }));

          if (monitoringConfig.mode !== 'all-in-one') {
            await invoke('start_monitoring_stack', { projectPath: project.path });
            if (cancelled) return;
          }
          setStartupMessage(t('monitoring.startingStack', { percentage: 40 }));

          // 4. wait for Grafana to become ready, up to 30 seconds
          let attempts = 0;
          const maxAttempts = 30; // 30초
          while (attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 1000)); // 1초 대기
            if (cancelled) return;

            const ready = await invoke<boolean>('check_monitoring_running', {
              grafanaUrl: monitoringConfig.grafana_url
            });
            if (cancelled) return;

            if (ready) {
              setIsStarting(false);
              setStartupMessage('');
              break;
            }

            attempts++;
            // from 40% up to 100%, a 60% span
            const percentage = 40 + Math.round((attempts / maxAttempts) * 60);
            setStartupMessage(t('monitoring.preparingGrafana', { percentage }));
          }

          if (attempts >= maxAttempts) {
            // Returning matters: the setError(null) below runs in the same tick and would
            // wipe this, leaving the page to render an iframe against a Grafana that never
            // came up.
            setError(t('monitoring.timeoutError'));
            setIsStarting(false);
            return;
          }
        }

        setError(null);
      } catch (err) {
        if (cancelled) return;
        console.error('Failed to load monitoring config:', err);
        setError(`${err}`);
        setIsStarting(false);
      } finally {
        if (!cancelled) {
          setIsStarting(false);
          setLoading(false);
        }
      }
    };

    startup.current = loadConfig();
    return () => { cancelled = true; };
  }, [project?.path, retry]);

  if (isStopping || stopError) {
    return (
      <main className="h-screen flex flex-col items-center justify-center bg-gray-50 gap-4 p-6" aria-busy={isStopping}>
        <h1 className="text-xl font-semibold">{t('monitoring.title')}</h1>
        {isStopping ? <p role="status">{t('monitoring.stopping')}</p> : (
          <div role="alert" className="text-red-700 text-center">
            <p>{t('monitoring.stopFailed')}</p>
            <p className="text-sm whitespace-pre-line">{stopError}</p>
          </div>
        )}
        <button onClick={leaveMonitoring} disabled={isStopping} className="px-4 py-2 bg-blue-600 text-white rounded-lg disabled:opacity-50">
          {t('monitoring.retryStop')}
        </button>
        {stopError && !isStopping && (
          <>
            <p className="text-sm text-gray-600">{t('monitoring.cleanupIncomplete')}</p>
            <button
              onClick={() => navigate('/logs', { state: { project, selectedView: 'monitor' } })}
              className="px-4 py-2 border border-gray-300 rounded-lg"
            >
              {t('monitoring.leaveWithoutCleanup')}
            </button>
          </>
        )}
      </main>
    );
  }

  if (loading || isStarting) {
    return (
      <div className="h-screen w-screen flex flex-col bg-gray-50">
        <header className="bg-white border-b border-gray-200 px-6 py-4 flex-shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={leaveMonitoring}
              aria-label={t('monitoring.back')}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <Activity className="w-6 h-6 text-blue-500" />
            <h1 className="text-xl font-semibold">{t('monitoring.title')}</h1>
          </div>
        </header>

        <main className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <Activity className="w-12 h-12 mx-auto mb-4 text-blue-500 animate-pulse" />
            <p className="text-lg text-gray-600 mb-2">
              {isStarting ? startupMessage : t('monitoring.loading')}
            </p>
            {isStarting && (
              <p className="text-sm text-gray-500">{t('monitoring.startingContainers')}</p>
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
              onClick={leaveMonitoring}
              aria-label={t('monitoring.back')}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <Activity className="w-6 h-6 text-red-600" />
            <h1 className="text-xl font-semibold">{t('monitoring.title')}</h1>
          </div>
        </header>

        <main className="flex-1 flex items-center justify-center p-6">
          <div className="max-w-2xl w-full bg-red-50 border border-red-200 rounded-lg p-6">
            <Activity className="w-12 h-12 mx-auto mb-4 text-red-400" />
            <h3 className="text-lg font-semibold text-red-900 mb-2 text-center">{t('monitoring.connectionFailed')}</h3>
            <p className="text-sm text-red-700 mb-4 text-center whitespace-pre-line">{error}</p>

            <div className="mt-6 space-y-3 text-left bg-white p-4 rounded border border-red-100">
              <p className="text-sm font-semibold text-gray-700">{t('monitoring.troubleshooting')}</p>
              <ol className="text-sm text-gray-600 list-decimal list-inside space-y-2 ml-2">
                {/* All-in-one runs Prometheus and Grafana on the server and reaches them
                    over an SSH tunnel; local Docker is never involved, so telling the user
                    to check Docker Desktop sends them the wrong way. */}
                {config?.mode === 'all-in-one' ? (
                  <li>
                    <strong>{t('monitoring.checkTunnel')}</strong>
                    <p className="ml-6 mt-1 text-xs text-gray-500">{t('monitoring.tunnelNote')}</p>
                  </li>
                ) : (
                  <li>
                    <strong>{t('monitoring.checkDocker')}</strong>
                    <p className="ml-6 mt-1 text-xs text-gray-500">{t('monitoring.dockerNote')}</p>
                  </li>
                )}
                <li>
                  <strong>{t('monitoring.checkStackFile')}</strong>
                  <p className="ml-6 mt-1 text-xs text-gray-500">
                    {t('monitoring.stackFilePath')} <code className="bg-gray-100 px-1 py-0.5 rounded font-mono">{project?.path}\stack.yaml</code>
                  </p>
                </li>
                <li>
                  <strong>{t('monitoring.startStack')}</strong>
                  <div className="ml-6 mt-1 space-y-1">
                    <p className="text-xs text-gray-500">{t('monitoring.startCommand1')}</p>
                    <code className="block bg-gray-100 px-2 py-1 rounded font-mono text-xs">
                      start-monitoring-v2.exe {project?.path}\stack.yaml
                    </code>
                    <p className="text-xs text-gray-500 mt-2">{t('monitoring.startCommand2')}</p>
                    <code className="block bg-gray-100 px-2 py-1 rounded font-mono text-xs">
                      arfni-go.exe monitor -f {project?.path}\stack.yaml
                    </code>
                  </div>
                </li>
              </ol>
            </div>

            <div className="mt-4 flex justify-center">
              <button
                onClick={() => setRetry(value => value + 1)}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm"
              >
                {t('monitoring.retry')}
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
          <p className="text-lg">{t('monitoring.configNotFound')}</p>
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
              onClick={leaveMonitoring}
              aria-label={t('monitoring.back')}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <Activity className="w-6 h-6 text-blue-600" />
            <div>
              <h1 className="text-xl font-semibold">{t('monitoring.title')}</h1>
              {ec2Server && (
                <p className="text-sm text-gray-500">{ec2Server.user}@{ec2Server.host}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* open Grafana in a new tab */}
            <button
              onClick={async () => {
                try {
                  const url = config.dashboard_uid
                    ? `${config.grafana_url}/d/${config.dashboard_uid}`
                    : config.grafana_url;
                  await openUrl(url);
                } catch (err) {
                  console.error('Failed to open URL:', err);
                }
              }}
              className="px-3 py-2 text-white rounded-lg text-sm flex items-center gap-2 hover:opacity-90 transition-opacity"
              style={{ backgroundColor: '#4C65E2' }}
            >
              <ExternalLink className="w-4 h-4" />
              {t('monitoring.openInNewTab')}
            </button>
          </div>
        </div>
      </header>

      {/* Grafana iframe */}
      <main className="flex-1 overflow-hidden" style={{ margin: 0, padding: 0 }}>
        <iframe
          src={
            config.dashboard_uid
              ? `${config.grafana_url}/d/${config.dashboard_uid}`
              : `${config.grafana_url}/dashboards`
          }
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
