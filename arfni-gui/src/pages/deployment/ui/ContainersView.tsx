import { ExternalLink, Package } from 'lucide-react';
import { DeploymentStage, DeploymentContainer, DeploymentStatus } from '@features/deployment/model/deploymentSlice';
import { useTranslation } from 'react-i18next';

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
  containers: DeploymentContainer[];
  deploymentStatus: DeploymentStatus;
}

export function ContainersView({
  currentStage,
  serviceCount,
  containerCount,
  endpoints,
  containers,
  deploymentStatus
}: ContainersViewProps) {
  const { t } = useTranslation('deployment');

  const getStageLabel = (stage: DeploymentStage | null) => {
    if (!stage) return '-';
    const labels: Record<DeploymentStage, string> = {
      'prepare': t('stages.prepare'),
      'generate': t('stages.generate'),
      'build': t('stages.build'),
      'start': t('stages.start'),
      'post-process': t('stages.postProcess')
    };
    return labels[stage];
  };

  const getStatusLabel = (status: DeploymentContainer['status']) => {
    switch (status) {
      case 'success': return t('containerStatus.success');
      case 'running': return t('containerStatus.running');
      case 'failed': return t('containerStatus.failed');
      case 'stopped': return t('containerStatus.stopped');
      case 'building': return t('containerStatus.building');
      case 'pending': return t('containerStatus.pending');
      default: return t('containerStatus.unknown');
    }
  };

  const getStatusColor = (status: DeploymentContainer['status']) => {
    switch (status) {
      case 'success':
      case 'running':
        return 'bg-green-50 text-green-700 border-green-200';
      case 'failed':
      case 'stopped':
        return 'bg-red-50 text-red-700 border-red-200';
      case 'building':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'pending':
      default:
        return 'bg-gray-50 text-gray-700 border-gray-200';
    }
  };

  return (
    <div className="bg-gray-50 p-6 h-[24rem] overflow-y-auto">
      {/* 컨테이너 목록 */}
      {containers.length > 0 && (
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-3">{t('containers.title')}</h3>
          <div className="space-y-2">
            {containers.map((container, index) => (
              <div key={index} className={`bg-white rounded-lg p-4 border-2 transition-all ${getStatusColor(container.status)}`}>
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3 flex-1">
                    <Package className="w-5 h-5 text-gray-600 mt-0.5" />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-gray-900">{container.name}</span>
                      </div>
                      <div className="text-sm text-gray-600 space-y-1">
                        {container.image && (
                          <div className="flex items-center gap-1">
                            <span className="font-medium">{t('containers.image')}</span>
                            <span className="font-mono text-xs">{container.image}</span>
                          </div>
                        )}
                        {container.build && (
                          <div className="flex items-center gap-1">
                            <span className="font-medium">{t('containers.build')}</span>
                            <span className="font-mono text-xs">
                              {typeof container.build === 'string'
                                ? container.build
                                : `${container.build.context}${container.build.dockerfile ? `/${container.build.dockerfile}` : ''}`}
                            </span>
                          </div>
                        )}
                        {container.ports && container.ports.length > 0 && (
                          <div className="flex items-center gap-1">
                            <span className="font-medium">{t('containers.ports')}</span>
                            <span className="font-mono text-xs">{container.ports.join(', ')}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="ml-3">
                    <span className="px-2 py-1 text-xs font-medium rounded">
                      {getStatusLabel(container.status)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
