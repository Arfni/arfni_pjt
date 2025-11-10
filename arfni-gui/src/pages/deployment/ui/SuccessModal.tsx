import { Check, Clock, ExternalLink } from 'lucide-react';

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
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="max-w-2xl w-full bg-white rounded-lg p-8 shadow-xl border border-gray-200 mx-4">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 bg-green-600 rounded-full flex items-center justify-center">
            <Check className="w-7 h-7 text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Deployment Completed</h2>
            <p className="text-gray-600">Deployment completed successfully.</p>
          </div>
        </div>

        {/* 배포 통계 */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="bg-gray-100 rounded p-4">
            <div className="flex items-center gap-2 text-gray-600 mb-1">
              <Clock className="w-4 h-4" />
              <span className="text-sm">Duration</span>
            </div>
            <div className="text-2xl font-bold text-gray-900">{formatDuration(duration)}</div>
          </div>
          <div className="bg-gray-100 rounded p-4">
            <div className="text-gray-600 text-sm mb-1">Services</div>
            <div className="text-2xl font-bold text-gray-900">{stats.serviceCount}</div>
          </div>
        </div>

        {/* 엔드포인트 */}
        {endpoints.length > 0 && (
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-3">Service Endpoints</h3>
            <div className="space-y-2">
              {endpoints.map((endpoint, index) => (
                <div key={index} className="bg-gray-100 rounded p-3 border border-gray-200">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-gray-900 font-medium">{endpoint.name}</div>
                      <div className="text-gray-600 text-sm">{endpoint.type}</div>
                    </div>
                    {endpoint.status === 'pending' ? (
                      <div className="text-gray-500 flex items-center gap-1">
                        {endpoint.url}
                      </div>
                    ) : (
                      <a
                        href={endpoint.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-700 flex items-center gap-1"
                      >
                        {endpoint.url}
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    )}
                  </div>
                  {endpoint.note && (
                    <div className="mt-2 text-yellow-600 text-sm">
                      ℹ️ {endpoint.note}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 확인 버튼 */}
        <button
          onClick={onClose}
          className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded font-semibold transition-colors"
        >
          OK
        </button>
      </div>
    </div>
  );
}
