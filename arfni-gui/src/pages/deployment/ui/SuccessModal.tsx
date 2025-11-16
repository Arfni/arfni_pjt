import { Check, Clock } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface SuccessModalProps {
  isOpen: boolean;
  onClose: () => void;
  duration: number | null;
  stats: {
    serviceCount: number;
    containerCount: number;
  };
  endpoints: Array<{
    name: string;
    url: string;
    type: string;
    status?: 'ready' | 'pending';
    note?: string;
  }>;
}

const formatDuration = (seconds: number | null) => {
  if (seconds === null) return '--';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs}s`;
};

export function SuccessModal({ isOpen, onClose, duration, stats, endpoints }: SuccessModalProps) {
  const { t } = useTranslation('deployment');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="max-w-2xl w-full bg-white rounded-lg shadow-xl border border-gray-200 max-h-[80vh] flex flex-col">
        {/* Header - Fixed */}
        <div className="p-8 pb-4 flex-shrink-0">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 bg-green-600 rounded-full flex items-center justify-center">
              <Check className="w-7 h-7 text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900">{t('success.completedTitle')}</h2>
              <p className="text-gray-600">{t('success.completedMessage')}</p>
            </div>
          </div>

          {/* 배포 통계 */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gray-100 rounded p-4">
              <div className="flex items-center gap-2 text-gray-600 mb-1">
                <Clock className="w-4 h-4" />
                <span className="text-sm">{t('success.duration')}</span>
              </div>
              <div className="text-2xl font-bold text-gray-900">{formatDuration(duration)}</div>
            </div>
            <div className="bg-gray-100 rounded p-4">
              <div className="text-gray-600 text-sm mb-1">{t('success.services')}</div>
              <div className="text-2xl font-bold text-gray-900">{stats.serviceCount}</div>
            </div>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-8" style={{ scrollbarWidth: 'thin', scrollbarColor: '#d1d5db #f3f4f6' }}>
          {/* 엔드포인트 */}
          {endpoints.length > 0 && (
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-3">{t('success.endpoints')}</h3>
              <div className="space-y-3">
                {endpoints.map((endpoint, index) => (
                  <div key={index} className="bg-gray-100 rounded p-4 border border-gray-200">
                    <div className="space-y-2">
                      <div className="text-gray-900 font-semibold text-base">{endpoint.name}</div>
                      <div className="text-gray-600 text-sm">
                        <span className="font-medium">Type:</span> {endpoint.type}
                      </div>
                      <div className="text-gray-700 text-sm">
                        <span className="font-medium">URL:</span>{' '}
                        <span className="font-mono text-gray-900 select-all">
                          {endpoint.url}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer - Fixed */}
        <div className="p-8 pt-4 flex-shrink-0">
          <button
            onClick={onClose}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded font-semibold transition-colors"
          >
            {t('success.confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}
