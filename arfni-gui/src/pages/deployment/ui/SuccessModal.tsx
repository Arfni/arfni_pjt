import React, { useState } from 'react';
import { Check, Clock, ExternalLink, Rocket } from 'lucide-react';
import { CICDSetupModal } from './CICDSetupModal';
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
  isEC2Deployment?: boolean;
  ec2Server?: {
    host: string;
    user: string;
    pemPath: string;
  };
  projectName?: string;
  projectPath?: string;
}

const formatDuration = (seconds: number | null) => {
  if (seconds === null) return '--';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs}s`;
};

export function SuccessModal({
  isOpen,
  onClose,
  duration,
  stats,
  endpoints,
  isEC2Deployment = false,
  ec2Server,
  projectName,
  projectPath,
}: SuccessModalProps) {
  const { t } = useTranslation('deployment');
  const [showCICDSetup, setShowCICDSetup] = useState(false);
  const [isGitProject, setIsGitProject] = useState(false);

  // Check if project is a Git repository
  React.useEffect(() => {
    const checkGitRepo = async () => {
      if (!projectPath) {
        console.log('[CICD] No project path provided');
        setIsGitProject(false);
        return;
      }

      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const gitPath = `${projectPath}/.git`;
        console.log('[CICD] Checking for .git folder at:', gitPath);

        // Use Tauri's fs exists command
        const hasGit = await invoke<boolean>('path_exists', { path: gitPath });
        console.log('[CICD] Has .git folder:', hasGit);
        setIsGitProject(hasGit);
      } catch (error) {
        console.error('[CICD] Failed to check git repository:', error);
        setIsGitProject(false);
      }
    };

    if (isOpen) {
      checkGitRepo();
    }
  }, [isOpen, projectPath]);

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="max-w-2xl w-full bg-white rounded-lg shadow-xl border border-gray-200 max-h-[80vh] flex flex-col">
          {/* 콘텐츠 영역 */}
          <div className="px-8 pt-8">
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
        <div className="grid grid-cols-2 gap-4 mb-6">
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

        {/* CI/CD Setup Prompt - Only show for EC2 deployments with Git repositories */}
        {isEC2Deployment && ec2Server && isGitProject && (
          <div className="mb-6 p-5 bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-lg">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-blue-600 rounded-full flex items-center justify-center flex-shrink-0">
                <Rocket className="w-6 h-6 text-white" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-blue-900 mb-2">{t('success.cicd.title')}</h3>
                <p className="text-sm text-blue-800 mb-3">
                  {t('success.cicd.description')}
                </p>
                <button
                  onClick={() => setShowCICDSetup(true)}
                  className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition-colors"
                >
                  {t('success.cicd.setupButton')}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 엔드포인트 */}
        {endpoints.length > 0 && (
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-3">{t('success.endpoints')}</h3>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {endpoints.map((endpoint, index) => (
                <div key={index} className="bg-gray-100 rounded p-3 border border-gray-200">
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-gray-900 font-medium">{endpoint.name}</span>
                      <span className="text-gray-600 text-sm">• {endpoint.type}</span>
                    </div>
                    <div>
                      {endpoint.status === 'pending' ? (
                        <div className="text-gray-500 text-sm break-all">
                          {endpoint.url}
                        </div>
                      ) : (
                        <a
                          href={endpoint.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:text-blue-700 text-sm inline-flex items-center gap-1 break-all"
                        >
                          <span className="break-all">{endpoint.url}</span>
                          <ExternalLink className="w-4 h-4 flex-shrink-0" />
                        </a>
                      )}
                    </div>
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

          {/* 확인 버튼 */}
          <div className="px-8 pb-8 pt-4">
          <button
            onClick={onClose}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded font-semibold transition-colors"
          >
            {t('success.confirm')}
          </button>
          </div>
        </div>
      </div>

      {/* CI/CD Setup Modal */}
      {ec2Server && (
        <CICDSetupModal
          isOpen={showCICDSetup}
          onClose={() => setShowCICDSetup(false)}
          ec2Host={ec2Server.host}
          ec2User={ec2Server.user}
          ec2SshKey={ec2Server.pemPath}
          projectName={projectName}
        />
      )}
    </>
  );
}
