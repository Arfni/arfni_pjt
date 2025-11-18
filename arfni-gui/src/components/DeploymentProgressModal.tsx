import React, { useEffect, useState } from 'react';
import { X, CheckCircle, AlertCircle, Loader2, Circle } from 'lucide-react';
import { listen } from '@tauri-apps/api/event';

interface DeploymentProgressModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectName: string;
}

interface DeploymentStage {
  id: string;
  name: string;
  status: 'pending' | 'in_progress' | 'completed' | 'error';
  message?: string;
  progress?: number;
}

interface DeploymentEvent {
  stage: string;
  message: string;
  progress?: number;
  status?: 'success' | 'error';
}

const DeploymentProgressModal: React.FC<DeploymentProgressModalProps> = ({
  isOpen,
  onClose,
  projectName
}) => {
  const [stages, setStages] = useState<DeploymentStage[]>([
    { id: 'check_cicd', name: 'CI/CD 상태 확인', status: 'pending' },
    { id: 'clone_repo', name: 'EC2에 레포지토리 클론', status: 'pending' },
    { id: 'commit_stack', name: 'stack.yaml 커밋', status: 'pending' },
    { id: 'generate_docker', name: 'Docker 파일 생성', status: 'pending' },
    { id: 'create_workflow', name: 'GitHub Actions 워크플로우 생성', status: 'pending' },
    { id: 'configure_secrets', name: 'GitHub Secrets 설정', status: 'pending' },
    { id: 'trigger_workflow', name: '워크플로우 트리거', status: 'pending' },
    { id: 'monitor_deployment', name: '배포 진행 중', status: 'pending' },
  ]);

  const [currentMessage, setCurrentMessage] = useState<string>('배포를 시작합니다...');
  const [overallProgress, setOverallProgress] = useState<number>(0);
  const [isCompleted, setIsCompleted] = useState<boolean>(false);
  const [hasError, setHasError] = useState<boolean>(false);

  useEffect(() => {
    if (!isOpen) {
      // 모달이 닫힐 때 상태 초기화
      setStages(prev => prev.map(stage => ({ ...stage, status: 'pending', message: undefined })));
      setCurrentMessage('배포를 시작합니다...');
      setOverallProgress(0);
      setIsCompleted(false);
      setHasError(false);
      return;
    }

    // Tauri 이벤트 리스너 설정
    const unlisten = listen<DeploymentEvent>('deployment-progress', (event) => {
      const { stage, message, progress, status } = event.payload;

      // 현재 메시지 업데이트
      setCurrentMessage(message);

      // 전체 진행률 업데이트
      if (progress !== undefined) {
        setOverallProgress(progress);
      }

      // 스테이지 상태 업데이트
      setStages(prev => {
        return prev.map(s => {
          if (s.id === stage) {
            if (status === 'error') {
              setHasError(true);
              return { ...s, status: 'error', message };
            }
            return { ...s, status: 'in_progress', message };
          }

          // 이전 스테이지는 완료 처리
          const currentIndex = prev.findIndex(item => item.id === stage);
          const itemIndex = prev.findIndex(item => item.id === s.id);
          if (itemIndex < currentIndex && s.status !== 'error') {
            return { ...s, status: 'completed' };
          }

          return s;
        });
      });

      // 배포 완료 체크
      if (stage === 'deployment_complete') {
        setIsCompleted(true);
        setStages(prev => prev.map(s =>
          s.status === 'error' ? s : { ...s, status: 'completed' }
        ));
      }
    });

    return () => {
      unlisten.then(fn => fn());
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const getStageIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'in_progress':
        return <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />;
      case 'error':
        return <AlertCircle className="w-5 h-5 text-red-500" />;
      default:
        return <Circle className="w-5 h-5 text-gray-300" />;
    }
  };

  const canClose = isCompleted || hasError;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-xl font-semibold">
            {projectName} 배포 진행 중
          </h2>
          <button
            onClick={onClose}
            disabled={!canClose}
            className={`p-1 rounded hover:bg-gray-100 transition-colors ${
              !canClose ? 'opacity-50 cursor-not-allowed' : ''
            }`}
            title={canClose ? '닫기' : '배포가 진행 중입니다'}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Progress Bar */}
        <div className="p-4 border-b">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">전체 진행률</span>
            <span className="text-sm font-medium text-gray-700">{overallProgress}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className={`h-2 rounded-full transition-all duration-300 ${
                hasError ? 'bg-red-500' : isCompleted ? 'bg-green-500' : 'bg-blue-500'
              }`}
              style={{ width: `${overallProgress}%` }}
            />
          </div>
        </div>

        {/* Stages List */}
        <div className="p-4 overflow-y-auto max-h-[400px]">
          <div className="space-y-3">
            {stages.map((stage) => (
              <div
                key={stage.id}
                className={`flex items-start space-x-3 p-3 rounded-lg transition-colors ${
                  stage.status === 'in_progress' ? 'bg-blue-50' :
                  stage.status === 'error' ? 'bg-red-50' :
                  stage.status === 'completed' ? 'bg-green-50' :
                  'bg-gray-50'
                }`}
              >
                <div className="flex-shrink-0 mt-0.5">
                  {getStageIcon(stage.status)}
                </div>
                <div className="flex-1">
                  <div className="font-medium text-gray-900">{stage.name}</div>
                  {stage.message && (
                    <div className="text-sm text-gray-600 mt-1">{stage.message}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Current Status Message */}
        <div className="p-4 border-t bg-gray-50">
          <div className="flex items-center space-x-2">
            {!isCompleted && !hasError && (
              <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
            )}
            {isCompleted && (
              <CheckCircle className="w-4 h-4 text-green-500" />
            )}
            {hasError && (
              <AlertCircle className="w-4 h-4 text-red-500" />
            )}
            <span className={`text-sm ${
              hasError ? 'text-red-600' :
              isCompleted ? 'text-green-600' :
              'text-gray-700'
            }`}>
              {currentMessage}
            </span>
          </div>
        </div>

        {/* Actions */}
        {(isCompleted || hasError) && (
          <div className="p-4 border-t flex justify-end">
            <button
              onClick={onClose}
              className={`px-4 py-2 rounded font-medium transition-colors ${
                hasError
                  ? 'bg-red-500 text-white hover:bg-red-600'
                  : 'bg-green-500 text-white hover:bg-green-600'
              }`}
            >
              {hasError ? '닫기' : '완료'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default DeploymentProgressModal;