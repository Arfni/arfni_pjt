interface DeployEnvironmentStepProps {
  deployEnvironment: 'local' | 'remote' | null;
  onSelectLocal: () => void;
  onSelectRemote: () => void;
  onNext: () => void;
  onBack: () => void;
}

export function DeployEnvironmentStep({
  deployEnvironment,
  onSelectLocal,
  onSelectRemote,
  onNext,
  onBack,
}: DeployEnvironmentStepProps) {
  return (
    <>
      <h3 className="text-2xl font-bold mb-6">프로젝트 배포 환경 선택</h3>
      {/* 중앙 버튼들 */}
      <div className="flex justify-center gap-6 mb-16">
        <button
          onClick={onSelectLocal}
          className={`flex flex-col items-center justify-center w-48 h-48 bg-white border-2 rounded-lg transition-all ${
            deployEnvironment === 'local'
              ? 'border-blue-600 bg-blue-50'
              : 'border-gray-300 hover:border-black hover:bg-gray-50'
          }`}
        >
          <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-4">
            <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
            </svg>
          </div>
          <h4 className="text-lg font-semibold text-gray-900 mb-2">로컬에서 시작</h4>
          <p className="text-sm text-gray-600 text-center px-4">
            로컬 환경에서<br />프로젝트 시작
          </p>
        </button>

        <button
          onClick={onSelectRemote}
          className={`flex flex-col items-center justify-center w-48 h-48 bg-white border-2 rounded-lg transition-all ${
            deployEnvironment === 'remote'
              ? 'border-green-600 bg-green-50'
              : 'border-gray-300 hover:border-black hover:bg-gray-50'
          }`}
        >
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
            <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h4 className="text-lg font-semibold text-gray-900 mb-2">원격에서 시작</h4>
          <p className="text-sm text-gray-600 text-center px-4">
            원격 서버에서<br />프로젝트 시작
          </p>
        </button>
      </div>

      {/* 우측 하단 버튼들 */}
      <div className="flex justify-end gap-3">
        <button
          onClick={onBack}
          className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          이전
        </button>
        <button
          onClick={onNext}
          disabled={!deployEnvironment}
          className={`px-4 py-2 rounded-lg ${
            deployEnvironment
              ? 'bg-black text-white hover:bg-gray-800'
              : 'bg-gray-300 text-gray-500 cursor-not-allowed'
          }`}
        >
          다음
        </button>
      </div>
    </>
  );
}
