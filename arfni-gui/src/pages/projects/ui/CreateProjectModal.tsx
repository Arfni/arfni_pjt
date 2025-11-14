import { useState, useEffect } from 'react';
import { X, FolderOpen, Github, Folder } from 'lucide-react';
import { EC2Server } from '@shared/api/tauri/commands';
import { CICDSetupModal } from '@pages/deployment/ui/CICDSetupModal';

type ProjectSource = 'local' | 'github';

interface CreateProjectModalProps {
  isOpen: boolean;
  selectedTab: 'local' | 'ec2' | 'plugins';
  newProjectName: string;
  newProjectPath: string;
  newProjectWorkdir: string;
  creating: boolean;
  selectedEC2ServerId: string;
  ec2Servers: EC2Server[];
  error: string | null;
  onClose: () => void;
  onNameChange: (name: string) => void;
  onWorkdirChange: (workdir: string) => void;
  onSelectFolder: () => void;
  onCreate: () => void;
  onCreateFromGitHub?: (repoUrl: string, repoName: string, branch: string, accessToken: string, workdir: string) => void;
}

export function CreateProjectModal({
  isOpen,
  selectedTab,
  newProjectName,
  newProjectPath,
  newProjectWorkdir,
  creating,
  selectedEC2ServerId,
  ec2Servers,
  error,
  onClose,
  onNameChange,
  onWorkdirChange,
  onSelectFolder,
  onCreate,
  onCreateFromGitHub,
}: CreateProjectModalProps) {
  const [projectSource, setProjectSource] = useState<ProjectSource>('local');
  const [showGitHubModal, setShowGitHubModal] = useState(false);

  // Reset state when modal is closed
  useEffect(() => {
    if (!isOpen) {
      setProjectSource('local');
      setShowGitHubModal(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // 프로젝트 이름에 특수문자가 있는지 검증 (영문, 숫자, 언더스코어, 하이픈만 허용)
  const hasSpecialCharacters = newProjectName && !/^[a-zA-Z0-9_-]*$/.test(newProjectName);

  const isEC2Project = selectedTab === 'ec2';

  const handleGitHubSetupComplete = (repoUrl: string, repoName: string, branch: string, accessToken: string) => {
    setShowGitHubModal(false);
    // onCreateFromGitHub will handle the loading state and close the modal when done
    if (onCreateFromGitHub) {
      // Pass the workdir value from the modal state
      onCreateFromGitHub(repoUrl, repoName, branch, accessToken, newProjectWorkdir || 'arfni-deploy');
    }
    // Don't call onClose() here - let the parent component close the modal after project creation completes
  };

  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 relative">
          {/* Loading Overlay */}
          {creating && (
            <div className="absolute inset-0 bg-white bg-opacity-90 flex items-center justify-center z-10 rounded-lg">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                <p className="text-gray-700 font-medium">Setting up project...</p>
                <p className="text-gray-500 text-sm mt-2">This may take a few moments</p>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between p-6 border-b border-gray-200">
            <h2 className="text-xl font-semibold">
              Create {selectedTab === 'local' ? 'Local' : 'EC2'} Project
            </h2>
            <button
              onClick={onClose}
              disabled={creating}
              className="p-1 hover:bg-gray-100 rounded transition-colors disabled:opacity-50"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-6 space-y-4">
            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
                {error}
              </div>
            )}

            {/* Project Source Selection (only for EC2) */}
            {isEC2Project && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Project Source
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setProjectSource('local')}
                    className={`p-4 border-2 rounded-lg transition-all ${
                      projectSource === 'local'
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-300 hover:border-gray-400'
                    }`}
                  >
                    <Folder className={`w-6 h-6 mx-auto mb-2 ${projectSource === 'local' ? 'text-blue-600' : 'text-gray-600'}`} />
                    <div className="text-sm font-medium">Local Folder</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setProjectSource('github')}
                    className={`p-4 border-2 rounded-lg transition-all ${
                      projectSource === 'github'
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-300 hover:border-gray-400'
                    }`}
                  >
                    <Github className={`w-6 h-6 mx-auto mb-2 ${projectSource === 'github' ? 'text-blue-600' : 'text-gray-600'}`} />
                    <div className="text-sm font-medium">GitHub Repository</div>
                  </button>
                </div>
              </div>
            )}

            {/* Local folder selection */}
            {(!isEC2Project || projectSource === 'local') && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Project Name
                  </label>
                  <input
                    type="text"
                    value={newProjectName}
                    onChange={(e) => onNameChange(e.target.value)}
                    placeholder="Enter project name"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    disabled={creating}
                    autoFocus
                  />
                  {hasSpecialCharacters && (
                    <p className="mt-1 text-sm text-red-600">
                      Project name cannot contain special characters
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Project Path
                  </label>
                  <div className="flex gap-3">
                    <input
                      type="text"
                      value={newProjectPath}
                      readOnly
                      placeholder="Select folder"
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 focus:outline-none"
                    />
                    <button
                      onClick={onSelectFolder}
                      disabled={creating}
                      className="w-10 h-10 flex items-center justify-center bg-white text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
                      title="Browse folder"
                    >
                      <FolderOpen className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </>
            )}

            {/* Working Directory (for EC2 projects) */}
            {isEC2Project && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Working Directory (on EC2)
                </label>
                <input
                  type="text"
                  value={newProjectWorkdir}
                  onChange={(e) => onWorkdirChange(e.target.value)}
                  placeholder="arfni-deploy"
                  disabled={creating}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Directory on EC2 where project will be deployed (e.g., arfni-deploy)
                </p>
              </div>
            )}

            {/* GitHub repository selection info */}
            {isEC2Project && projectSource === 'github' && (
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex items-start gap-3">
                  <Github className="w-5 h-5 text-blue-600 mt-0.5" />
                  <div className="text-sm text-blue-900">
                    <p className="font-medium mb-1">Clone from GitHub</p>
                    <p className="text-blue-700">
                      You'll be guided to authenticate with GitHub and select a repository to deploy.
                      CI/CD will be automatically configured.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Footer Buttons */}
          <div className="flex gap-3 p-6 border-t border-gray-200">
            <button
              onClick={onClose}
              disabled={creating}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                if (isEC2Project && projectSource === 'github') {
                  setShowGitHubModal(true);
                } else {
                  onCreate();
                }
              }}
              disabled={creating || (!isEC2Project && !!hasSpecialCharacters) || (projectSource === 'local' && !!hasSpecialCharacters)}
              className="flex-1 px-4 py-2 text-white rounded-lg disabled:opacity-50 transition-colors"
              style={{ backgroundColor: '#4C65E2' }}
              onMouseEnter={(e) => !creating && !hasSpecialCharacters && (e.currentTarget.style.backgroundColor = '#3B52C9')}
              onMouseLeave={(e) => !creating && !hasSpecialCharacters && (e.currentTarget.style.backgroundColor = '#4C65E2')}
            >
              {creating ? 'Creating...' : isEC2Project && projectSource === 'github' ? 'Continue' : 'Create'}
            </button>
          </div>
        </div>
      </div>

      {/* GitHub Setup Modal - only show repository selection steps */}
      {isEC2Project && showGitHubModal && (
        <CICDSetupModal
          isOpen={showGitHubModal}
          onClose={() => setShowGitHubModal(false)}
          ec2Host=""
          ec2User=""
          ec2SshKey=""
          projectName=""
          onRepoSelected={handleGitHubSetupComplete}
          repoSelectionOnly={true}
        />
      )}
    </>
  );
}
