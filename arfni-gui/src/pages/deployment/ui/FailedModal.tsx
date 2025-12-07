import { AlertCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface FailedModalProps {
  isOpen: boolean;
  onClose: () => void;
  error: string | null;
  logs: Array<{
    timestamp: string;
    level: string;
    message: string;
  }>;
  onAnalyzeWithAI?: () => void;
  isAnalyzing?: boolean;
}

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

export function FailedModal({ isOpen, onClose, error, logs, onAnalyzeWithAI, isAnalyzing }: FailedModalProps) {
  const { t } = useTranslation('deployment');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="max-w-2xl w-full bg-white rounded-lg p-8 shadow-xl border border-gray-200 mx-4">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 bg-red-600 rounded-full flex items-center justify-center">
            <AlertCircle className="w-7 h-7 text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-gray-900">{t('failed.failedTitle')}</h2>
            <p className="text-gray-600">{t('failed.failedMessage')}</p>
          </div>
        </div>

        {/* 에러 메시지 */}
        <div className="bg-red-50 border border-red-300 rounded p-4 mb-6">
          <div className="text-red-700 font-mono text-sm whitespace-pre-wrap">{error}</div>
        </div>

        {/* 로그 표시 (마지막 20줄) */}
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-3">{t('failed.recentLogs')}</h3>
          <div className="bg-gray-50 rounded p-3 font-mono text-xs h-48 overflow-y-auto border border-gray-200">
            {logs.slice(-20).map((log, index) => (
              <div key={index} className={getLogColor(log.level)}>
                <span className="text-gray-500">[{log.timestamp}]</span> {log.message}
              </div>
            ))}
          </div>
        </div>

        {/* 버튼 그룹 */}
        <div className="flex gap-3">
          {onAnalyzeWithAI && (
            <button
              onClick={onAnalyzeWithAI}
              disabled={isAnalyzing}
              className={`flex-1 py-3 rounded font-semibold transition-colors ${
                isAnalyzing
                  ? 'bg-purple-300 text-white cursor-wait'
                  : 'bg-purple-600 hover:bg-purple-700 text-white'
              }`}
            >
              {isAnalyzing ? 'AI 분석 중...' : 'AI 분석 요청'}
            </button>
          )}
          <button
            onClick={onClose}
            className={`py-3 bg-blue-600 hover:bg-blue-700 text-white rounded font-semibold transition-colors ${
              onAnalyzeWithAI ? 'flex-1' : 'w-full'
            }`}
          >
            {t('failed.confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}
