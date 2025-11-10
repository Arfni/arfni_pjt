import { ExternalLink } from 'lucide-react';
import { DeploymentStage } from '@features/deployment/model/deploymentSlice';

interface Endpoint {
  name: string;
  url: string;
  type: string;
  status?: 'ready' | 'pending';
  note?: string;
}

interface ContainersViewProps {
  currentStage: DeploymentStage | null;
  serviceCount: number;
  containerCount: number;
  endpoints: Endpoint[];
}

export function ContainersView({
  currentStage,
  serviceCount,
  containerCount,
  endpoints
}: ContainersViewProps) {
  const getStageLabel = (stage: DeploymentStage | null) => {
    if (!stage) return '-';
    const labels: Record<DeploymentStage, string> = {
      'prepare': 'Preflight',
      'generate': 'Generate',
      'build': 'Build',
      'start': 'Deploy',
      'post-process': 'Health Check'
    };
    return labels[stage];
  };

  return (
    <div className="bg-gray-50 p-6 h-[24rem] overflow-y-auto">
      {/* 배포 통계 */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded p-4 border border-gray-200">
          <div className="text-gray-600 text-sm mb-1">Current Stage</div>
          <div className="text-2xl font-bold text-gray-900">{getStageLabel(currentStage)}</div>
        </div>
        <div className="bg-white rounded p-4 border border-gray-200">
          <div className="text-gray-600 text-sm mb-1">Services</div>
          <div className="text-2xl font-bold text-gray-900">{serviceCount}</div>
        </div>
        <div className="bg-white rounded p-4 border border-gray-200">
          <div className="text-gray-600 text-sm mb-1">Containers</div>
          <div className="text-2xl font-bold text-gray-900">{containerCount}</div>
        </div>
      </div>

      {/* 엔드포인트 목록 */}
      {endpoints.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-3">Service Endpoints</h3>
          <div className="space-y-2">
            {endpoints.map((endpoint, index) => (
              <div key={index} className="bg-white rounded p-3 border border-gray-200">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-gray-900 font-medium">{endpoint.name}</div>
                    <div className="text-gray-600 text-sm">{endpoint.type}</div>
                  </div>
                  <a
                    href={endpoint.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:text-blue-700 text-sm flex items-center gap-1"
                  >
                    Open
                    <ExternalLink className="w-3 h-3" />
                  </a>
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
    </div>
  );
}
