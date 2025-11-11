import { Loader2, Check, Square } from 'lucide-react';
import { DeploymentStatus, DeploymentStage } from '@features/deployment/model/deploymentSlice';
import { useTranslation } from 'react-i18next';

interface ProgressBarProps {
  status: DeploymentStatus;
  currentStage: DeploymentStage | null;
  completedStages: DeploymentStage[];
  isStopping: boolean;
  getCurrentStageMessage: () => string;
  stages: { id: DeploymentStage; label: string; description: string }[];
}

export function ProgressBar({
  status,
  currentStage,
  completedStages,
  isStopping,
  getCurrentStageMessage,
  stages,
}: ProgressBarProps) {
  const { t } = useTranslation('deployment');

  // currentStage를 기준으로 진행률 계산 (점의 실제 위치에 맞춤)
  let progress = 0;
  if (status === 'success') {
    progress = 100;
  } else if (currentStage) {
    const currentIndex = stages.findIndex(s => s.id === currentStage);
    if (currentIndex !== -1) {
      // 점이 위치한 실제 퍼센트 값으로 계산
      const margin = 2;
      const availableSpace = 100 - (margin * 2);
      progress = margin + (currentIndex / (stages.length - 1)) * availableSpace;
    }
  }

  return (
    <div className="mb-10">
      {/* 진행률과 현재 단계 */}
      <div className="flex items-center gap-3 mb-3">
        {status === 'deploying' && currentStage && (
          <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
        )}
        {status === 'success' && (
          <Check className="w-5 h-5 text-green-600" />
        )}
        {status === 'failed' && (
          <span className="text-xl">⚠️</span>
        )}
        {status === 'stopped' && (
          <Square className="w-5 h-5 text-red-600 fill-red-600" />
        )}
        <span className="text-lg font-semibold text-gray-900 whitespace-nowrap flex-shrink-0">
          {status === 'deploying' && isStopping && t('messages.stopping')}
          {status === 'deploying' && !isStopping && currentStage && getCurrentStageMessage()}
          {status === 'success' && t('messages.completedSuccessfully')}
          {status === 'failed' && t('messages.failedDuring', { stage: stages.find(s => s.id === currentStage)?.label || 'Unknown' })}
          {status === 'stopped' && currentStage && t('messages.stoppedDuring', { stage: stages.find(s => s.id === currentStage)?.label || 'Unknown' })}
          {status === 'stopped' && !currentStage && t('messages.deploymentStopped')}
        </span>
      </div>

      {/* 프로그레스 바 */}
      <div className="relative">
        {/* 프로그레스 바 */}
        <div className="relative w-full h-4 bg-gray-200 rounded-full overflow-hidden mb-2">
          {/* 진행 바 */}
          <div
            className={`h-full transition-all duration-1000 ease-in-out ${
              status === 'failed'
                ? 'bg-red-600'
                : status === 'success'
                ? 'bg-green-600'
                : status === 'stopped'
                ? 'bg-orange-500'
                : isStopping
                ? 'bg-orange-400'
                : 'bg-blue-600'
            } ${status === 'deploying' && !isStopping ? 'animate-pulse' : ''}`}
            style={{ width: `${progress}%` }}
          >
            {status === 'deploying' && (
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white to-transparent opacity-30 animate-shimmer" />
            )}
          </div>

          {/* 단계 점들 */}
          <div className="absolute inset-0 flex items-center">
            {stages.map((stage, index) => {
              // 첫 번째와 마지막 점은 표시하지 않음
              if (index === 0 || index === stages.length - 1) return null;

              const isCompleted = completedStages.includes(stage.id);
              const isCurrent = currentStage === stage.id;
              const isFailed = status === 'failed' && isCurrent;
              const isStopped = status === 'stopped' && isCurrent;
              const margin = 2;
              const availableSpace = 100 - (margin * 2);
              const position = margin + (index / (stages.length - 1)) * availableSpace;

              return (
                <div
                  key={stage.id}
                  className={`absolute w-2 h-2 rounded-full transition-all duration-300 z-10 ${
                    isFailed
                      ? 'bg-red-600 ring-2 ring-red-200'
                      : isStopped
                      ? 'bg-orange-500 ring-2 ring-orange-200 shadow-md'
                      : isCompleted
                      ? 'bg-white shadow-md'
                      : isCurrent
                      ? 'bg-white ring-2 ring-blue-300 shadow-md'
                      : 'bg-gray-400'
                  }`}
                  style={{
                    left: `${position}%`,
                    transform: 'translateX(-50%)'
                  }}
                />
              );
            })}
          </div>
        </div>

        {/* 단계 라벨들 */}
        <div className="relative">
          {stages.map((stage, index) => {
            const isCompleted = completedStages.includes(stage.id);
            const isCurrent = currentStage === stage.id;
            const isFailed = status === 'failed' && isCurrent;
            const isStopped = status === 'stopped' && isCurrent;
            const isFirst = index === 0;
            const isLast = index === stages.length - 1;

            // 양끝 라벨은 프로그레스바 양끝에, 중간 라벨들은 점 위치에 정렬
            let position;
            if (isFirst) {
              position = 0;
            } else if (isLast) {
              position = 100;
            } else {
              const margin = 2;
              const availableSpace = 100 - (margin * 2);
              position = margin + (index / (stages.length - 1)) * availableSpace;
            }

            return (
              <div
                key={stage.id}
                className={`absolute text-xs transition-colors whitespace-nowrap ${
                  isFailed
                    ? 'text-red-600 font-medium'
                    : isStopped
                    ? 'text-orange-600 font-medium'
                    : isCompleted || isCurrent
                    ? 'text-gray-900 font-medium'
                    : 'text-gray-400'
                }`}
                style={{
                  left: `${position}%`,
                  transform: isFirst ? 'translateX(0)' : isLast ? 'translateX(-100%)' : 'translateX(-50%)'
                }}
              >
                {stage.label}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
