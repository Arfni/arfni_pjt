import { useState, useEffect } from 'react';
import { useAppDispatch, useAppSelector } from '@app/hooks';
import {
  GitBranch,
  Github,
  Key,
  Shield,
  Check,
  X,
  Loader2,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';
import {
  setPlatform,
  setAuthMethod,
  setAccessToken,
  setSelectedRepository,
  setConfiguration,
  authenticateGitHub,
  fetchRepositories,
  setupCICD,
  setupCompleteCICD,
  resetCICD,
  nextStep,
  previousStep,
  clearError,
  selectSetupStep,
  selectCICDPlatform,
  selectAuthMethod,
  selectIsAuthenticated,
  selectAccessToken,
  selectUserName,
  selectRepositories,
  selectIsLoadingRepos,
  selectSelectedRepository,
  selectIsSettingUp,
  selectCICDError,
  selectCICDConfiguration,
  type CICDPlatform,
  type AuthMethod,
  type CICDConfiguration,
} from '@features/cicd/model/cicdSlice';

import type { Project } from '@shared/api/tauri/commands';

interface CICDSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  ec2Host: string;
  ec2User: string;
  ec2SshKey: string;
  projectName?: string;
  project?: Project; // Add full project object
  repoSelectionOnly?: boolean;
  onRepoSelected?: (repoUrl: string, repoName: string, branch: string, accessToken: string) => void;
}

export function CICDSetupModal({
  isOpen,
  onClose,
  ec2Host,
  ec2User,
  ec2SshKey,
  projectName,
  project,
  repoSelectionOnly = false,
  onRepoSelected,
}: CICDSetupModalProps) {
  const dispatch = useAppDispatch();
  const setupStep = useAppSelector(selectSetupStep);
  const platform = useAppSelector(selectCICDPlatform);
  const authMethod = useAppSelector(selectAuthMethod);
  const isAuthenticated = useAppSelector(selectIsAuthenticated);
  const accessToken = useAppSelector(selectAccessToken);
  const userName = useAppSelector(selectUserName);
  const repositories = useAppSelector(selectRepositories);
  const isLoadingRepos = useAppSelector(selectIsLoadingRepos);
  const selectedRepo = useAppSelector(selectSelectedRepository);
  const isSettingUp = useAppSelector(selectIsSettingUp);
  const error = useAppSelector(selectCICDError);
  const configuration = useAppSelector(selectCICDConfiguration);

  const [personalToken, setPersonalToken] = useState('');
  const [manualRepoUrl, setManualRepoUrl] = useState('');
  const [branch, setBranch] = useState('main');
  const [framework, setFramework] = useState('springboot');
  const [javaVersion, setJavaVersion] = useState('17');
  const [nodeVersion, setNodeVersion] = useState('20');
  const [pythonVersion, setPythonVersion] = useState('3.11');
  const [deployRoot, setDeployRoot] = useState('/home/ubuntu/arfni-deploy');
  const [dockerService, setDockerService] = useState('spring');

  useEffect(() => {
    if (!isOpen) {
      dispatch(resetCICD());
      setPersonalToken('');
      setManualRepoUrl('');
    }
  }, [isOpen, dispatch]);

  useEffect(() => {
    // Auto-detect framework from project name or default to springboot
    if (projectName) {
      if (projectName.toLowerCase().includes('react')) {
        setFramework('react');
        setDockerService('frontend');
      } else if (projectName.toLowerCase().includes('next')) {
        setFramework('nextjs');
        setDockerService('nextjs');
      } else if (projectName.toLowerCase().includes('node')) {
        setFramework('nodejs');
        setDockerService('nodejs');
      } else if (projectName.toLowerCase().includes('python') || projectName.toLowerCase().includes('fastapi')) {
        setFramework('python');
        setDockerService('python');
      }
    }
  }, [projectName]);

  const handlePlatformSelect = (selectedPlatform: CICDPlatform) => {
    dispatch(setPlatform(selectedPlatform));
  };

  const handleAuthMethodSelect = (method: AuthMethod) => {
    dispatch(setAuthMethod(method));
  };

  const handleAuthenticate = async () => {
    if (authMethod === 'oauth') {
      await dispatch(authenticateGitHub('oauth'));
    } else {
      if (!personalToken.trim()) {
        return;
      }
      dispatch(setAccessToken(personalToken));
    }
  };

  const handleFetchRepositories = async () => {
    if (platform && isAuthenticated) {
      await dispatch(fetchRepositories(platform));
    }
  };

  const handleRepositorySelect = (repoUrl: string) => {
    dispatch(setSelectedRepository(repoUrl));
    const selectedRepoData = repositories.find(r => r.url === repoUrl);
    if (selectedRepoData) {
      setBranch(selectedRepoData.defaultBranch || 'main');
    }
  };

  const handleContinueToConfig = () => {
    if (selectedRepo || manualRepoUrl) {
      // If repo selection only mode, call the callback and close
      if (repoSelectionOnly && onRepoSelected && accessToken) {
        const repoUrl = selectedRepo || manualRepoUrl;
        const repoName = repositories.find(r => r.url === repoUrl)?.name || repoUrl.split('/').pop() || 'repository';
        onRepoSelected(repoUrl, repoName, branch, accessToken);
        return;
      }
      dispatch(nextStep());
    }
  };

  const handleContinueToReview = () => {
    const config: Partial<CICDConfiguration> = {
      platform,
      repositoryUrl: selectedRepo || manualRepoUrl,
      branch,
      framework,
      ec2Host,
      ec2User,
      deployRoot,
      dockerService,
    };

    if (framework === 'springboot') {
      config.javaVersion = javaVersion;
    } else if (framework === 'nodejs' || framework === 'react' || framework === 'nextjs') {
      config.nodeVersion = nodeVersion;
    } else if (framework === 'python' || framework === 'fastapi' || framework === 'flask') {
      config.pythonVersion = pythonVersion;
    }

    dispatch(setConfiguration(config));
    dispatch(nextStep());
  };

  const handleSetup = async () => {
    if (!configuration) return;

    try {
      // Check if this is an EC2 project
      if (project?.id && project?.environment === 'ec2' && project?.ec2_server_id) {
        // Use the new complete setup flow
        console.log('[CICD] Using complete CI/CD setup flow (Clone → stack.yaml → Workflow → Secrets)');
        await dispatch(setupCompleteCICD({
          config: configuration,
          sshKey: ec2SshKey,
          projectId: project.id,
          ec2ServerId: project.ec2_server_id
        })).unwrap();
      } else {
        // Fallback to old flow for local projects or when project info is missing
        console.log('[CICD] Using basic setup flow (no EC2 clone)');
        console.log(`[CICD] Project: ${project?.id}, Environment: ${project?.environment}, EC2 Server: ${project?.ec2_server_id}`);
        await dispatch(setupCICD({ config: configuration, sshKey: ec2SshKey })).unwrap();
      }

      onClose();
    } catch (err) {
      // Error is handled by the slice
      console.error('[CICD] Setup failed:', err);
    }
  };

  const getStepTitle = () => {
    switch (setupStep) {
      case 1:
        return 'Select Platform';
      case 2:
        return 'Authentication';
      case 3:
        return 'Select Repository';
      case 4:
        return 'Configure Settings';
      case 5:
        return 'Review & Confirm';
      default:
        return '';
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="max-w-3xl w-full bg-white rounded-lg p-8 shadow-xl border border-gray-200 mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Setup CI/CD Pipeline</h2>
            <p className="text-gray-600 text-sm mt-1">Automate deployments from your Git repository</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Progress Steps */}
        <div className="flex items-center justify-between mb-8">
          {[1, 2, 3, 4, 5].map((step, index) => (
            <div key={step} className="flex items-center flex-1">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold transition-all ${
                  step < setupStep
                    ? 'bg-green-600 text-white'
                    : step === setupStep
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 text-gray-600'
                }`}
              >
                {step < setupStep ? <Check className="w-5 h-5" /> : step}
              </div>
              {index < 4 && (
                <div
                  className={`h-1 flex-1 mx-2 transition-all ${
                    step < setupStep ? 'bg-green-600' : 'bg-gray-200'
                  }`}
                />
              )}
            </div>
          ))}
        </div>

        {/* Step Title */}
        <h3 className="text-lg font-semibold mb-4">{getStepTitle()}</h3>

        {/* Error Display */}
        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-red-700 text-sm">{error}</p>
              <button
                onClick={() => dispatch(clearError())}
                className="text-red-600 hover:text-red-800 text-sm font-medium mt-1"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* Step Content */}
        <div className="mb-6">
          {/* Step 1: Platform Selection */}
          {setupStep === 1 && (
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => handlePlatformSelect('github')}
                className="p-6 border-2 border-gray-300 rounded-lg hover:border-blue-600 hover:bg-blue-50 transition-all group"
              >
                <Github className="w-12 h-12 mx-auto mb-3 text-gray-900 group-hover:text-blue-600" />
                <div className="text-lg font-semibold">GitHub Actions</div>
                <div className="text-sm text-gray-600 mt-1">Most popular CI/CD platform</div>
              </button>
              <button
                onClick={() => handlePlatformSelect('gitlab')}
                className="p-6 border-2 border-gray-300 rounded-lg opacity-50 cursor-not-allowed"
                disabled
              >
                <svg className="w-12 h-12 mx-auto mb-3 text-orange-600" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M23.6 9.593l-.033-.086L20.3.98a.851.851 0 00-.336-.405.875.875 0 00-1.0 .054.851.851 0 00-.32.472l-2.325 7.143H7.68l-2.325-7.143a.849.849 0 00-.32-.472.875.875 0 00-1.0-.054.851.851 0 00-.336.405L.433 9.507l-.033.086a6.03 6.03 0 002.008 6.962l.01.008.03.022 5.03 3.764 2.487 1.883 1.514 1.145a1.008 1.008 0 001.223 0l1.514-1.145 2.487-1.883 5.06-3.786.01-.008a6.03 6.03 0 002.008-6.962z"/>
                </svg>
                <div className="text-lg font-semibold">GitLab CI</div>
                <div className="text-sm text-gray-600 mt-1">Coming soon</div>
              </button>
            </div>
          )}

          {/* Step 2: Authentication */}
          {setupStep === 2 && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Authentication Method
                </label>
                <div className="grid grid-cols-2 gap-4">
                  <button
                    onClick={() => handleAuthMethodSelect('oauth')}
                    className={`p-4 border-2 rounded-lg transition-all ${
                      authMethod === 'oauth'
                        ? 'border-blue-600 bg-blue-50'
                        : 'border-gray-300 hover:border-blue-400'
                    }`}
                  >
                    <Shield className="w-8 h-8 mx-auto mb-2 text-blue-600" />
                    <div className="font-semibold">OAuth 2.0</div>
                    <div className="text-xs text-gray-600 mt-1">Recommended</div>
                  </button>
                  <button
                    onClick={() => handleAuthMethodSelect('token')}
                    className={`p-4 border-2 rounded-lg transition-all ${
                      authMethod === 'token'
                        ? 'border-blue-600 bg-blue-50'
                        : 'border-gray-300 hover:border-blue-400'
                    }`}
                  >
                    <Key className="w-8 h-8 mx-auto mb-2 text-gray-600" />
                    <div className="font-semibold">Personal Token</div>
                    <div className="text-xs text-gray-600 mt-1">Manual setup</div>
                  </button>
                </div>
              </div>

              {authMethod === 'token' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Personal Access Token
                  </label>
                  <input
                    type="password"
                    value={personalToken}
                    onChange={(e) => setPersonalToken(e.target.value)}
                    placeholder="ghp_xxxxxxxxxxxx"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                  />
                  <div className="flex items-start gap-2 mt-2">
                    <AlertCircle className="w-4 h-4 text-gray-500 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-gray-600">
                      Create a token at: Settings → Developer settings → Personal access tokens → Tokens (classic)
                      <br />
                      Required scopes: <code className="bg-gray-100 px-1 rounded">repo</code>, <code className="bg-gray-100 px-1 rounded">workflow</code>
                    </p>
                  </div>
                </div>
              )}

              {authMethod && !isAuthenticated && (
                <button
                  onClick={handleAuthenticate}
                  className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition-colors flex items-center justify-center gap-2"
                >
                  {authMethod === 'oauth' ? (
                    <>
                      <Shield className="w-5 h-5" />
                      Authorize with GitHub
                    </>
                  ) : (
                    <>
                      <Key className="w-5 h-5" />
                      Verify Token
                    </>
                  )}
                </button>
              )}

              {isAuthenticated && (
                <div className="p-4 bg-green-50 border border-green-200 rounded-lg flex items-center gap-3">
                  <Check className="w-5 h-5 text-green-600" />
                  <div>
                    <p className="text-green-800 font-medium">Authentication successful!</p>
                    {userName && <p className="text-green-700 text-sm">Logged in as {userName}</p>}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 3: Repository Selection */}
          {setupStep === 3 && (
            <div className="space-y-4">
              {!repositories.length && !isLoadingRepos && (
                <button
                  onClick={handleFetchRepositories}
                  className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition-colors flex items-center justify-center gap-2"
                >
                  <Github className="w-5 h-5" />
                  Load My Repositories
                </button>
              )}

              {isLoadingRepos && (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
                  <span className="ml-3 text-gray-600">Loading repositories...</span>
                </div>
              )}

              {repositories.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Your Repositories
                  </label>
                  <select
                    value={selectedRepo || ''}
                    onChange={(e) => handleRepositorySelect(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                  >
                    <option value="">Select a repository...</option>
                    {repositories.map((repo) => (
                      <option key={repo.id} value={repo.url}>
                        {repo.fullName}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="text-center text-gray-500 text-sm">or</div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Manual Repository URL
                </label>
                <input
                  type="text"
                  value={manualRepoUrl}
                  onChange={(e) => setManualRepoUrl(e.target.value)}
                  placeholder="https://github.com/username/repository"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                />
              </div>

              {(selectedRepo || manualRepoUrl) && (
                <button
                  onClick={handleContinueToConfig}
                  className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition-colors"
                >
                  Continue to Configuration
                </button>
              )}
            </div>
          )}

          {/* Step 4: Configuration */}
          {setupStep === 4 && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Deploy Branch
                  </label>
                  <input
                    type="text"
                    value={branch}
                    onChange={(e) => setBranch(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Framework
                  </label>
                  <select
                    value={framework}
                    onChange={(e) => {
                      setFramework(e.target.value);
                      // Auto-update docker service based on framework
                      const serviceMap: Record<string, string> = {
                        springboot: 'spring',
                        nodejs: 'nodejs',
                        react: 'frontend',
                        nextjs: 'nextjs',
                        python: 'python',
                        fastapi: 'fastapi',
                        flask: 'flask',
                      };
                      setDockerService(serviceMap[e.target.value] || e.target.value);
                    }}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                  >
                    <option value="springboot">Spring Boot</option>
                    <option value="nodejs">Node.js</option>
                    <option value="react">React</option>
                    <option value="nextjs">Next.js</option>
                    <option value="python">Python</option>
                    <option value="fastapi">FastAPI</option>
                    <option value="flask">Flask</option>
                  </select>
                </div>
              </div>

              {framework === 'springboot' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Java Version
                  </label>
                  <select
                    value={javaVersion}
                    onChange={(e) => setJavaVersion(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                  >
                    <option value="11">Java 11</option>
                    <option value="17">Java 17</option>
                    <option value="21">Java 21</option>
                  </select>
                </div>
              )}

              {(framework === 'nodejs' || framework === 'react' || framework === 'nextjs') && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Node.js Version
                  </label>
                  <select
                    value={nodeVersion}
                    onChange={(e) => setNodeVersion(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                  >
                    <option value="16">Node.js 16</option>
                    <option value="18">Node.js 18</option>
                    <option value="20">Node.js 20</option>
                  </select>
                </div>
              )}

              {(framework === 'python' || framework === 'fastapi' || framework === 'flask') && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Python Version
                  </label>
                  <select
                    value={pythonVersion}
                    onChange={(e) => setPythonVersion(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                  >
                    <option value="3.9">Python 3.9</option>
                    <option value="3.10">Python 3.10</option>
                    <option value="3.11">Python 3.11</option>
                    <option value="3.12">Python 3.12</option>
                  </select>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Deployment Path on EC2
                </label>
                <input
                  type="text"
                  value={deployRoot}
                  onChange={(e) => setDeployRoot(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Docker Service Name
                </label>
                <input
                  type="text"
                  value={dockerService}
                  onChange={(e) => setDockerService(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                />
              </div>

              <button
                onClick={handleContinueToReview}
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition-colors"
              >
                Continue to Review
              </button>
            </div>
          )}

          {/* Step 5: Review & Confirm */}
          {setupStep === 5 && configuration && (
            <div className="space-y-4">
              <div className="bg-gray-50 rounded-lg p-6 space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-gray-600 text-sm">Platform:</span>
                  <span className="font-semibold">{platform?.toUpperCase()}</span>
                </div>
                <div className="flex justify-between items-start">
                  <span className="text-gray-600 text-sm">Repository:</span>
                  <span className="font-semibold text-right max-w-md truncate">
                    {configuration.repositoryUrl}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600 text-sm">Branch:</span>
                  <span className="font-semibold flex items-center gap-1">
                    <GitBranch className="w-4 h-4" />
                    {configuration.branch}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600 text-sm">Framework:</span>
                  <span className="font-semibold">{configuration.framework}</span>
                </div>
                {configuration.javaVersion && (
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600 text-sm">Java Version:</span>
                    <span className="font-semibold">{configuration.javaVersion}</span>
                  </div>
                )}
                {configuration.nodeVersion && (
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600 text-sm">Node.js Version:</span>
                    <span className="font-semibold">{configuration.nodeVersion}</span>
                  </div>
                )}
                {configuration.pythonVersion && (
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600 text-sm">Python Version:</span>
                    <span className="font-semibold">{configuration.pythonVersion}</span>
                  </div>
                )}
                <div className="flex justify-between items-center">
                  <span className="text-gray-600 text-sm">EC2 Host:</span>
                  <span className="font-semibold">{configuration.ec2Host}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600 text-sm">Deploy Path:</span>
                  <span className="font-semibold font-mono text-sm">{configuration.deployRoot}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600 text-sm">Docker Service:</span>
                  <span className="font-semibold">{configuration.dockerService}</span>
                </div>
              </div>

              <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-yellow-800">
                    <p className="font-medium mb-1">This will:</p>
                    <ul className="list-disc list-inside space-y-1">
                      <li>Create <code className="bg-yellow-100 px-1 rounded">.github/workflows/deploy.yml</code> in your repository</li>
                      <li>Configure GitHub Secrets: EC2_HOST, EC2_USER, EC2_SSH_KEY</li>
                      <li>Enable automatic deployments on push to {configuration.branch}</li>
                    </ul>
                  </div>
                </div>
              </div>

              <button
                onClick={handleSetup}
                disabled={isSettingUp}
                className="w-full py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isSettingUp ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Setting up CI/CD...
                  </>
                ) : (
                  <>
                    <Check className="w-5 h-5" />
                    Complete Setup
                  </>
                )}
              </button>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex justify-between items-center pt-4 border-t border-gray-200">
          <button
            onClick={() => {
              if (setupStep > 1) {
                dispatch(previousStep());
              } else {
                onClose();
              }
            }}
            className="px-6 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            disabled={isSettingUp}
          >
            {setupStep === 1 ? 'Cancel' : 'Back'}
          </button>

          <div className="text-gray-500 text-sm">
            Step {setupStep} of 5
          </div>
        </div>
      </div>
    </div>
  );
}
