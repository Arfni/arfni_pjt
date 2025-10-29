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
  DeploymentStage,
} from '@features/deployment/model/deploymentSlice';
import { selectCurrentProject } from '@features/project/model/projectSlice';
import { eventListeners, deploymentCommands } from '@shared/api/tauri/commands';
import { Check, Loader2, AlertCircle, Clock, ExternalLink } from 'lucide-react';

const STAGES: { id: DeploymentStage; label: string; description: string }[] = [
  { id: 'prepare', label: '준비', description: '배포 환경을 준비하고 있습니다...' },
  { id: 'generate', label: '생성', description: 'Docker 파일을 생성하고 있습니다...' },
  { id: 'build', label: '빌드', description: '서비스 이미지를 빌드하고 있습니다...' },
  { id: 'start', label: '시작', description: '컨테이너를 시작하고 있습니다...' },
  { id: 'post-process', label: '후처리', description: '후처리 작업을 수행하고 있습니다...' },
  { id: 'health-check', label: '상태확인', description: '서비스 상태를 확인하고 있습니다...' },
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

  const [activeTab, setActiveTab] = useState<'log' | 'canvas'>('log');
  const logEndRef = useRef<HTMLDivElement>(null);

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

    return () => {
      unsubscribeLog.then((unsub) => unsub());
      unsubscribeSuccess.then((unsub) => unsub());
      unsubscribeFailed.then((unsub) => unsub());
    };
  }, [dispatch]);

  // 로그 자동 스크롤
  useEffect(() => {
    if (activeTab === 'log') {
      logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, activeTab]);

  const handleStopDeployment = async () => {
    try {
      await deploymentCommands.stopDeployment();
    } catch (err) {
      console.error('Failed to stop deployment:', err);
    }
  };

  const handleBackToCanvas = () => {
    navigate('/canvas');
  };

  const handleConfirm = () => {
    if (currentProject?.environment === 'local') {
      navigate('/projects');
    } else {
      // EC2는 다른 동작 (향후 정의)
      navigate('/canvas');
    }
  };

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

  const getCurrentStageMessage = () => {
    if (!currentStage) return '';
    const stage = STAGES.find((s) => s.id === currentStage);
    return stage?.description || '';
  };

  const formatDuration = (seconds: number | null) => {
    if (seconds === null) return '--';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}분 ${secs}초`;
  };

  // 배포 진행 중 UI
  if (status === 'deploying') {
    return (
      <div className="h-screen flex flex-col bg-gray-900">
        {/* 헤더 */}
        <div className="bg-gray-800 border-b border-gray-700 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-white">ARFNI</h1>
              <span className="text-gray-400">/ 배포 진행 중</span>
            </div>
            <button
              onClick={handleStopDeployment}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded transition-colors"
            >
              중지
            </button>
          </div>
        </div>

        {/* 탭 */}
        <div className="bg-gray-800 border-b border-gray-700">
          <div className="flex">
            <button
              onClick={() => setActiveTab('log')}
              className={`px-6 py-3 font-semibold transition-colors ${
                activeTab === 'log'
                  ? 'text-blue-500 border-b-2 border-blue-500'
                  : 'text-gray-400 hover:text-gray-300'
              }`}
            >
              Log
            </button>
            <button
              onClick={() => setActiveTab('canvas')}
              className={`px-6 py-3 font-semibold transition-colors ${
                activeTab === 'canvas'
                  ? 'text-blue-500 border-b-2 border-blue-500'
                  : 'text-gray-400 hover:text-gray-300'
              }`}
            >
              Canvas
            </button>
          </div>
        </div>

        {/* 컨텐츠 */}
        <div className="flex-1 p-6 overflow-auto">
          {activeTab === 'log' ? (
            <div className="max-w-6xl mx-auto">
              {/* 진행 단계 표시 */}
              <div className="mb-8">
                <div className="flex items-center justify-between mb-4">
                  {STAGES.map((stage, index) => {
                    const isCompleted = completedStages.includes(stage.id);
                    const isCurrent = currentStage === stage.id;

                    return (
                      <div key={stage.id} className="flex items-center flex-1">
                        {/* 단계 원 */}
                        <div className="flex flex-col items-center">
                          <div
                            className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${
                              isCompleted
                                ? 'bg-blue-600 text-white'
                                : isCurrent
                                ? 'bg-blue-500 text-white'
                                : 'bg-gray-700 text-gray-400'
                            }`}
                          >
                            {isCompleted ? (
                              <Check className="w-6 h-6" />
                            ) : isCurrent ? (
                              <Loader2 className="w-6 h-6 animate-spin" />
                            ) : (
                              <div className="w-3 h-3 rounded-full bg-gray-500" />
                            )}
                          </div>
                          <span
                            className={`mt-2 text-sm font-medium ${
                              isCompleted || isCurrent ? 'text-white' : 'text-gray-500'
                            }`}
                          >
                            {stage.label}
                          </span>
                        </div>

                        {/* 연결선 */}
                        {index < STAGES.length - 1 && (
                          <div
                            className={`flex-1 h-1 mx-2 transition-colors ${
                              completedStages.includes(STAGES[index + 1].id)
                                ? 'bg-blue-600'
                                : 'bg-gray-700'
                            }`}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* 현재 단계 메시지 */}
                {currentStage && (
                  <div className="flex items-center gap-2 text-blue-400 bg-blue-950 bg-opacity-30 p-3 rounded">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>{getCurrentStageMessage()}</span>
                  </div>
                )}
              </div>

              {/* 로그 표시 */}
              <div className="bg-black rounded-lg p-4 font-mono text-sm h-96 overflow-y-auto">
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
            </div>
          ) : (
            <div className="text-gray-400 text-center mt-20">
              Canvas 뷰는 개발 예정입니다.
            </div>
          )}
        </div>
      </div>
    );
  }

  // 배포 성공 UI
  if (status === 'success') {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-gray-900">
        <div className="max-w-2xl w-full bg-gray-800 rounded-lg p-8 shadow-xl">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 bg-green-600 rounded-full flex items-center justify-center">
              <Check className="w-7 h-7 text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white">배포 완료</h2>
              <p className="text-gray-400">배포가 성공적으로 완료되었습니다.</p>
            </div>
          </div>

          {/* 배포 통계 */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="bg-gray-700 rounded p-4">
              <div className="flex items-center gap-2 text-gray-400 mb-1">
                <Clock className="w-4 h-4" />
                <span className="text-sm">소요 시간</span>
              </div>
              <div className="text-2xl font-bold text-white">{formatDuration(duration)}</div>
            </div>
            <div className="bg-gray-700 rounded p-4">
              <div className="text-gray-400 text-sm mb-1">서비스 개수</div>
              <div className="text-2xl font-bold text-white">{stats.serviceCount}개</div>
            </div>
          </div>

          {/* 엔드포인트 */}
          {endpoints.length > 0 && (
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-white mb-3">서비스 엔드포인트</h3>
              <div className="space-y-2">
                {endpoints.map((endpoint, index) => (
                  <div key={index} className="bg-gray-700 rounded p-3 flex items-center justify-between">
                    <div>
                      <div className="text-white font-medium">{endpoint.name}</div>
                      <div className="text-gray-400 text-sm">{endpoint.type}</div>
                    </div>
                    <a
                      href={endpoint.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-400 hover:text-blue-300 flex items-center gap-1"
                    >
                      {endpoint.url}
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 확인 버튼 */}
          <button
            onClick={handleConfirm}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded font-semibold transition-colors"
          >
            확인
          </button>
        </div>
      </div>
    );
  }

  // 배포 실패 UI
  if (status === 'failed') {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-gray-900">
        <div className="max-w-2xl w-full bg-gray-800 rounded-lg p-8 shadow-xl">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 bg-red-600 rounded-full flex items-center justify-center">
              <AlertCircle className="w-7 h-7 text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white">배포 실패</h2>
              <p className="text-gray-400">배포 중 오류가 발생했습니다.</p>
            </div>
          </div>

          {/* 에러 메시지 */}
          <div className="bg-red-950 bg-opacity-30 border border-red-800 rounded p-4 mb-6">
            <div className="text-red-400 font-mono text-sm whitespace-pre-wrap">{error}</div>
          </div>

          {/* 로그 표시 (마지막 20줄) */}
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-white mb-3">최근 로그</h3>
            <div className="bg-black rounded p-3 font-mono text-xs h-48 overflow-y-auto">
              {logs.slice(-20).map((log, index) => (
                <div key={index} className={getLogColor(log.level)}>
                  <span className="text-gray-500">[{log.timestamp}]</span> {log.message}
                </div>
              ))}
            </div>
          </div>

          {/* 버튼 */}
          <button
            onClick={handleBackToCanvas}
            className="w-full py-3 bg-gray-700 hover:bg-gray-600 text-white rounded font-semibold transition-colors"
          >
            Canvas로 돌아가기
          </button>
        </div>
      </div>
    );
  }

  // idle 상태 (배포 전)
  return (
    <div className="h-screen flex items-center justify-center bg-gray-900">
      <div className="text-gray-400 text-center">
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
