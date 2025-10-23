import { CheckCircle, Loader, XCircle } from 'lucide-react';

interface ValidationStepProps {
  validationType: 'docker' | 'ec2';
  isValidating: boolean;
  validationSuccess: boolean;
  validationFailed: boolean;
  validationError: string;
  ec2Address?: string;
  onStartProject: () => void;
  onBack: () => void;
  onClose: () => void;
}

export function ValidationStep({
  validationType,
  isValidating,
  validationSuccess,
  validationFailed,
  validationError,
  ec2Address,
  onStartProject,
  onBack,
  onClose,
}: ValidationStepProps) {
  const isDocker = validationType === 'docker';
  const title = isDocker ? 'Docker 연결 검증' : 'EC2 연결 검증';
  const loadingText = isDocker ? 'Docker 연결을 확인하는 중...' : 'EC2 서버에 연결하는 중...';
  const successText = isDocker
    ? 'Docker가 정상적으로 연결되었습니다'
    : 'EC2 서버가 정상적으로 연결되었습니다';
  const iconColor = isDocker ? 'text-blue-600' : 'text-green-600';

  return (
    <>
      <h3 className="text-2xl font-bold mb-6">{title}</h3>

      <div className="py-12">
        {isValidating ? (
          <div className="flex flex-col items-center justify-center">
            <Loader className={`w-16 h-16 ${iconColor} animate-spin mb-4`} />
            <p className="text-lg text-gray-700 mb-2">{loadingText}</p>
            <p className="text-sm text-gray-500">잠시만 기다려주세요</p>
          </div>
        ) : validationSuccess ? (
          <div className="flex flex-col items-center justify-center">
            <CheckCircle className={`w-16 h-16 ${iconColor} mb-4`} />
            <p className="text-lg font-semibold text-gray-900 mb-2">연결 성공!</p>
            <p className="text-sm text-gray-600 mb-1">{successText}</p>
            {!isDocker && ec2Address && (
              <p className="text-xs text-gray-500">{ec2Address}</p>
            )}
          </div>
        ) : validationFailed ? (
          <div className="flex flex-col items-center justify-center">
            <XCircle className="w-16 h-16 text-red-600 mb-4" />
            <p className="text-lg font-semibold text-gray-900 mb-2">연결 실패</p>
            <p className="text-sm text-gray-600 mb-4">
              {isDocker ? 'Docker' : 'EC2 서버'} 연결에 실패했습니다
            </p>
            <div className="w-full max-w-md bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-xs font-semibold text-red-800 mb-2">실패 이유:</p>
              <p className="text-xs text-red-700 font-mono break-all">{validationError}</p>
            </div>
          </div>
        ) : null}
      </div>

      {validationSuccess && (
        <div className="flex justify-end gap-3">
          <button
            onClick={onBack}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            이전
          </button>
          <button
            onClick={onStartProject}
            className="px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800"
          >
            시작하기
          </button>
        </div>
      )}

      {validationFailed && (
        <div className="flex justify-end gap-3">
          <button
            onClick={onBack}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            이전
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800"
          >
            취소
          </button>
        </div>
      )}
    </>
  );
}
