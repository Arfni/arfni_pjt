import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import {
  selectDeploymentStatus,
  selectCurrentStage,
  selectCompletedStages,
  selectDeploymentLogs,
  selectDeploymentError,
  selectDeploymentDuration,
  selectDeploymentEndpoints,
  selectDeploymentStats,
  addLog,
  deploymentSuccess,
  deploymentFailed,
  deploymentStopped,
  DeploymentStage,
  startDeployment,
  resetDeployment,
} from '@features/deployment/model/deploymentSlice';
import { selectCurrentProject } from '@features/project/model/projectSlice';
import { eventListeners, deploymentCommands, ec2ServerCommands, EC2Server } from '@shared/api/tauri/commands';
import { SuccessModal } from './SuccessModal';
import { FailedModal } from './FailedModal';
import { LogsView } from './LogsView';
import { ContainersView } from './ContainersView';
import { ProgressBar } from './ProgressBar';

const STAGES: { id: DeploymentStage; label: string; description: string }[] = [
  { id: 'prepare', label: 'Preflight', description: 'Preflight checks...' },
  { id: 'generate', label: 'Generate', description: 'Generating Docker files...' },
  { id: 'build', label: 'Build', description: 'Building images...' },
  { id: 'start', label: 'Deploy', description: 'Deploying containers...' },
  { id: 'post-process', label: 'Health', description: 'Health checks...' },
];

export function DeploymentPage() {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const currentProject = useSelector(selectCurrentProject);
  const status = useSelector(selectDeploymentStatus);
  const currentStage = useSelector(selectCurrentStage);
  const completedStages = useSelector(selectCompletedStages);
  const logs = useSelector(selectDeploymentLogs);
  const error = useSelector(selectDeploymentError);
  const duration = useSelector(selectDeploymentDuration);
  const endpoints = useSelector(selectDeploymentEndpoints);
  const stats = useSelector(selectDeploymentStats);

  const [activeTab] = useState<'log' | 'canvas'>('log');
  const [activeLogTab, setActiveLogTab] = useState<'containers' | 'logs'>('logs');
  const logEndRef = useRef<HTMLDivElement>(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showFailedModal, setShowFailedModal] = useState(false);
  const [ec2Server, setEc2Server] = useState<EC2Server | null>(null);
  const [isStopping, setIsStopping] = useState(false);

  // 배포 이벤트 구독
  useEffect(() => {
    const unsubscribeLog = eventListeners.onDeploymentLog((log) => {
      dispatch(addLog(log));
    });

    const unsubscribeSuccess = eventListeners.onDeploymentCompleted((result) => {
      // DeploymentStatus의 outputs 파싱
      const outputs = result.outputs || {};

      // 엔드포인트 파싱
      const endpointsArray = Array.isArray(outputs.endpoints) ? outputs.endpoints : [];
      const parsedEndpoints = endpointsArray.map((ep: any) => ({
        name: ep.name || '',
        url: ep.url || '',
        type: (ep.type || 'service') as 'service' | 'health-check' | 'monitoring',
        status: ep.status as 'ready' | 'pending' | undefined,
        note: ep.note as string | undefined,
      }));

      dispatch(deploymentSuccess({
        serviceCount: typeof outputs.service_count === 'number' ? outputs.service_count : 0,
        containerCount: typeof outputs.container_count === 'number' ? outputs.container_count : 0,
        composeDir: typeof outputs.compose_dir === 'string' ? outputs.compose_dir : null,
        endpoints: parsedEndpoints,
      }));
    });

    const unsubscribeFailed = eventListeners.onDeploymentFailed((result) => {
      const errorMsg = result.message || '알 수 없는 오류가 발생했습니다';
      dispatch(deploymentFailed(errorMsg));
    });

    const unsubscribeStopped = eventListeners.onDeploymentStopped(() => {
      // Add delay to show "Stopping..." state for better UX
      setTimeout(() => {
        setIsStopping(false); // Reset flag
        dispatch(deploymentStopped());
      }, 3000); // 3 second delay
    });

    return () => {
      unsubscribeLog.then((unsub) => unsub());
      unsubscribeSuccess.then((unsub) => unsub());
      unsubscribeFailed.then((unsub) => unsub());
      unsubscribeStopped.then((unsub) => unsub());
    };
  }, [dispatch]);

  // 로그 자동 스크롤
  useEffect(() => {
    if (activeTab === 'log') {
      logEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [logs, activeTab]);

  // 배포 성공 시 모달 열기
  useEffect(() => {
    if (status === 'success') {
      setShowSuccessModal(true);
    }
  }, [status]);

  // 배포 실패 시 모달 열기
  useEffect(() => {
    if (status === 'failed') {
      setShowFailedModal(true);
    }
  }, [status]);

  // EC2 서버 정보 로드
  useEffect(() => {
    const loadEc2Server = async () => {
      if (currentProject?.environment === 'ec2' && currentProject?.ec2_server_id) {
        try {
          const server = await ec2ServerCommands.getServerById(currentProject.ec2_server_id);
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
  }, [currentProject]);

  const handleStopDeployment = async () => {
    setIsStopping(true); // Immediate UI feedback
    try {
      await deploymentCommands.stopDeployment();
    } catch (err) {
      console.error('Failed to stop deployment:', err);
      setIsStopping(false); // Reset on error
    }
  };

  const handleRestartDeployment = async () => {
    if (!currentProject) {
      console.error('No current project');
      return;
    }

    try {
      // Reset deployment state
      dispatch(resetDeployment());

      // Start new deployment
      dispatch(startDeployment());

      // Call backend to start deployment
      const stackYamlPath = `${currentProject.path}/stack.yaml`;
      await deploymentCommands.deployStack(currentProject.path, stackYamlPath, currentProject.id);
    } catch (err) {
      console.error('Failed to restart deployment:', err);
      dispatch(deploymentFailed(String(err)));
    }
  };

  const handleBackToCanvas = () => {
    navigate('/canvas');
  };

  const handleNavigateToStatus = () => {
    if (currentProject?.environment === 'ec2') {
      navigate('/logs', { state: { project: currentProject, ec2Server } });
    } else {
      navigate('/projects');
    }
  };

  const handleConfirm = () => {
    setShowSuccessModal(false);
  };

  const handleConfirmFailed = () => {
    setShowFailedModal(false);
  };

  const getCurrentStageMessage = () => {
    if (!currentStage) return '';
    const stage = STAGES.find((s) => s.id === currentStage);
    return stage?.description || '';
  };

  const getDeploymentTitle = () => {
    switch (status) {
      case 'deploying':
        return 'Deployment in Progress...';
      case 'success':
        return 'Deployment Complete';
      case 'failed':
        return 'Deployment Failed';
      case 'stopped':
        return 'Deployment Stopped';
      default:
        return 'Deployment';
    }
  };

  // 배포 진행 중 UI
  if (status === 'deploying' || status === 'success' || status === 'failed' || status === 'stopped') {
    return (
      <div className="h-screen flex flex-col bg-white relative">
        {/* 컨텐츠 */}
        <div className="flex-1 p-6 overflow-auto">
          {activeTab === 'log' ? (
            <div className="max-w-6xl mx-auto">
              {/* 제목 */}
              <h1 className="text-3xl font-bold text-gray-900 mt-4 mb-8">{getDeploymentTitle()}</h1>

              {/* 진행 단계 표시 */}
              <ProgressBar
                status={status}
                currentStage={currentStage}
                completedStages={completedStages}
                isStopping={isStopping}
                getCurrentStageMessage={getCurrentStageMessage}
                stages={STAGES}
              />

              {/* Containers/Logs 탭 */}
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="flex items-center justify-between border-b border-gray-200 bg-white">
                  <div className="flex">
                    <button
                      onClick={() => setActiveLogTab('containers')}
                      className={`px-6 py-3 font-semibold transition-colors ${
                        activeLogTab === 'containers'
                          ? 'text-blue-600 border-b-2 border-blue-600'
                          : 'text-gray-600 hover:text-gray-900'
                      }`}
                    >
                      Containers
                    </button>
                    <button
                      onClick={() => setActiveLogTab('logs')}
                      className={`px-6 py-3 font-semibold transition-colors ${
                        activeLogTab === 'logs'
                          ? 'text-blue-600 border-b-2 border-blue-600'
                          : 'text-gray-600 hover:text-gray-900'
                      }`}
                    >
                      Logs
                    </button>
                  </div>
                  {status === 'deploying' ? (
                    <button
                      onClick={handleStopDeployment}
                      disabled={isStopping}
                      className={`px-4 py-2 rounded transition-colors mr-2 ${
                        isStopping
                          ? 'bg-red-300 text-white cursor-default'
                          : 'bg-red-600 hover:bg-red-700 text-white'
                      }`}
                    >
                      Stop Deployment
                    </button>
                  ) : (status === 'success' || status === 'failed' || status === 'stopped') ? (
                    <button
                      onClick={handleRestartDeployment}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors mr-2"
                    >
                      Restart Deployment
                    </button>
                  ) : null}
                </div>

                {/* 탭 컨텐츠 */}
                {activeLogTab === 'containers' ? (
                  <ContainersView
                    currentStage={currentStage}
                    serviceCount={stats.serviceCount}
                    containerCount={stats.containerCount}
                    endpoints={endpoints}
                  />
                ) : (
                  <LogsView logs={logs} logEndRef={logEndRef} />
                )}
              </div>

              {/* 하단 네비게이션 버튼 */}
              <div className="flex justify-end gap-3 mt-6">
                <button
                  onClick={handleBackToCanvas}
                  className="px-6 py-3 bg-white hover:bg-gray-50 text-gray-900 border border-gray-300 rounded-lg font-semibold shadow-lg transition-colors"
                >
                  Back to Canvas
                </button>
                <button
                  onClick={handleNavigateToStatus}
                  disabled={currentProject?.environment === 'ec2' && status !== 'success'}
                  className={`px-6 py-3 rounded-lg font-semibold shadow-lg transition-colors ${
                    currentProject?.environment === 'ec2' && status !== 'success'
                      ? 'bg-gray-300 text-gray-500'
                      : 'bg-blue-600 enabled:hover:bg-blue-700 text-white'
                  }`}
                >
                  {currentProject?.environment === 'ec2' ? 'Server Status' : 'Project Home'}
                </button>
              </div>
            </div>
          ) : (
            <div className="text-gray-600 text-center mt-20">
              Canvas 뷰는 개발 예정입니다.
            </div>
          )}
        </div>

        {/* 배포 성공 모달 */}
        <SuccessModal
          isOpen={showSuccessModal}
          onClose={handleConfirm}
          duration={duration}
          stats={stats}
          endpoints={endpoints}
          isEC2Deployment={currentProject?.environment === 'ec2'}
          ec2Server={ec2Server || undefined}
          projectName={currentProject?.name}
        />

        {/* 배포 실패 모달 */}
        <FailedModal
          isOpen={showFailedModal}
          onClose={handleConfirmFailed}
          error={error}
          logs={logs}
        />
      </div>
    );
  }

  // idle 상태 (배포 전)
  return (
    <div className="h-screen flex items-center justify-center bg-gray-50">
      <div className="text-gray-600 text-center">
        <p>배포를 시작하려면 Canvas에서 Deploy 버튼을 클릭하세요.</p>
        <button
          onClick={() => navigate('/canvas')}
          className="mt-4 px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
        >
          Canvas로 이동
        </button>
      </div>
    </div>
  );
}
