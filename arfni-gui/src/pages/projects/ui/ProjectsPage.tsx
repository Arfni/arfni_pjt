import { useNavigate, useLocation } from 'react-router-dom';
import { useEffect, useState, useCallback } from 'react';
import { Server, Loader2, AlertCircle, FolderOpen } from 'lucide-react';
import { projectCommands, Project, ec2ServerCommands, EC2Server, CanvasNode, CanvasEdge } from '@shared/api/tauri/commands';
import { confirm, open } from '@tauri-apps/plugin-dialog';
import { ServerSelectionModal } from './ServerSelectionModal';
import { AddServerModal } from './AddServerModal';
import { ProjectsSidebar } from './ProjectsSidebar';
import { ProjectCard } from './ProjectCard';
import { CreateProjectModal } from './CreateProjectModal';
import { PluginManager } from './PluginManager';
import { TutorialSlide } from './TutorialSlide';
import { useAppDispatch } from '@app/hooks';
import { addNode } from '@features/canvas/model/canvasSlice';
import { useTranslation } from 'react-i18next';

export default function ProjectsPage() {
  const { t } = useTranslation('projects');
  const navigate = useNavigate();
  const location = useLocation();
  const dispatch = useAppDispatch();

  // sessionStorage에서 현재 세션의 선택 상태 복원 (앱 재시작 시 초기화됨)
  const [selectedTab, setSelectedTab] = useState<'local' | 'ec2' | 'plugins'>(() => {
    const savedTab = sessionStorage.getItem('projectsSelectedTab');
    return (savedTab === 'local' || savedTab === 'ec2' || savedTab === 'plugins') ? savedTab : 'local';
  });

  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingProjectPath, setDeletingProjectPath] = useState<string | null>(null);

  // Pin 상태 관리 (localStorage에 저장)
  const [pinnedProjects, setPinnedProjects] = useState<Set<string>>(() => {
    const saved = localStorage.getItem('pinnedProjects');
    return saved ? new Set(JSON.parse(saved)) : new Set();
  });

  // Pin 토글 함수
  const togglePin = useCallback((projectId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setPinnedProjects((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(projectId)) {
        newSet.delete(projectId);
      } else {
        newSet.add(projectId);
      }
      // localStorage에 저장
      localStorage.setItem('pinnedProjects', JSON.stringify(Array.from(newSet)));
      return newSet;
    });
  }, []);

  // 프로젝트 생성 모달 상태
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectPath, setNewProjectPath] = useState('');
  const [newProjectWorkdir, setNewProjectWorkdir] = useState('arfni-deploy');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // EC2 서버 관련
  const [ec2Servers, setEc2Servers] = useState<EC2Server[]>([]);
  const [selectedEC2ServerId, setSelectedEC2ServerId] = useState<string>(() => {
    // sessionStorage에서 복원 (앱 재시작 시 빈 상태로 시작)
    return sessionStorage.getItem('projectsSelectedEC2ServerId') || '';
  });
  const [showServerModal, setShowServerModal] = useState(false);
  const [showAddServerModal, setShowAddServerModal] = useState(false);
  const [editingServer, setEditingServer] = useState<EC2Server | null>(null);

  // Canvas 미리보기 데이터
  const [canvasPreviews, setCanvasPreviews] = useState<Record<string, { nodes: CanvasNode[], edges: CanvasEdge[] }>>({});

  // 튜토리얼 상태 관리
  const [showTutorial, setShowTutorial] = useState<boolean>(false);

  // 환경별 프로젝트 목록 로드 함수
  const loadProjects = useCallback(async (environment: 'local' | 'ec2', serverId?: string) => {
    setLoading(true);
    setError(null);
    try {
      let projectList: Project[];

      // EC2 환경이고 서버 ID가 있으면 해당 서버의 프로젝트만 로드
      if (environment === 'ec2' && serverId) {
        projectList = await projectCommands.getProjectsByServer(serverId);
        console.log(`EC2 서버 (${serverId}) 프로젝트 목록 로드 완료:`, projectList);
      } else if (environment === 'ec2' && !serverId) {
        // EC2 환경인데 서버가 선택되지 않았으면 빈 목록 표시
        // 최소 300ms 대기하여 사용자가 새로고침을 인지할 수 있도록 함
        await new Promise(resolve => setTimeout(resolve, 200));
        projectList = [];
        console.log('EC2 환경: 서버가 선택되지 않아 빈 목록 표시');
      } else {
        projectList = await projectCommands.getProjectsByEnvironment(environment);
        console.log(`${environment} 프로젝트 목록 로드 완료:`, projectList);
      }

      setProjects(projectList);

      // 각 프로젝트의 canvas 데이터 로드
      const previews: Record<string, { nodes: CanvasNode[], edges: CanvasEdge[] }> = {};
      for (const project of projectList) {
        try {
          const canvasData = await projectCommands.loadCanvasState(project.path);
          previews[project.id] = {
            nodes: canvasData.nodes,
            edges: canvasData.edges,
          };
        } catch (err) {
          console.log(`Canvas 데이터 로드 실패 (${project.name}):`, err);
          // 실패해도 계속 진행
        }
      }
      setCanvasPreviews(previews);
    } catch (err) {
      console.error('프로젝트 목록 불러오기 실패:', err);
      setError(t('messages.loadError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  // 프로젝트 삭제
  const handleDeleteProject = useCallback(async (project: Project, e: React.MouseEvent) => {
    if (deletingProjectPath) return;
    e.stopPropagation();

    // 삭제 방식 선택
    const deleteCompletely = await confirm(
      t('delete.confirmMessage', { projectName: project.name }),
      {
        title: t('delete.confirmTitle'),
        kind: 'warning',
        okLabel: t('delete.permanentDelete'),
        cancelLabel: t('delete.removeFromListOnly'),
      }
    );

    if (deleteCompletely) {
      // 완전 삭제 선택 - 확인 다이얼로그
      const finalConfirm = await confirm(
        t('delete.finalConfirmMessage', { projectName: project.name, projectPath: project.path }),
        {
          title: t('delete.finalConfirmTitle'),
          kind: 'warning',
          okLabel: t('delete.confirmOkLabel'),
          cancelLabel: t('delete.confirmCancelLabel'),
        }
      );

      if (!finalConfirm) {
        return;
      }

      // 완전 삭제 실행
      setDeletingProjectPath(project.path);
      try {
        await projectCommands.deleteProject(project.id);
        console.log('프로젝트 완전 삭제 완료:', project.id);
        setProjects((prev) => prev.filter((p) => p.id !== project.id));
      } catch (err) {
        console.error('프로젝트 삭제 실패:', err);
        alert(t('messages.deleteProjectFailed', { error: String(err) }));
      } finally {
        setDeletingProjectPath(null);
      }
    } else {
      // 목록에서만 삭제 선택 - 확인 다이얼로그
      const confirmRemove = await confirm(
        t('delete.removeConfirmMessage', { projectName: project.name }),
        {
          title: t('delete.removeConfirmTitle'),
          kind: 'info',
          okLabel: t('delete.removeOkLabel'),
          cancelLabel: t('delete.confirmCancelLabel'),
        }
      );

      if (!confirmRemove) {
        return;
      }

      // DB에서만 제거 실행 (파일은 유지)
      setDeletingProjectPath(project.path);
      try {
        await projectCommands.deleteProjectFromDbOnly(project.id);
        console.log('프로젝트 DB에서 제거 완료:', project.id);
        setProjects((prev) => prev.filter((p) => p.id !== project.id));
      } catch (err) {
        console.error('프로젝트 제거 실패:', err);
        alert(t('messages.removeProjectFailed', { error: String(err) }));
      } finally {
        setDeletingProjectPath(null);
      }
    }
  }, [deletingProjectPath]);

  // 폴더 선택 핸들러
  const handleSelectFolder = useCallback(async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: t('messages.selectFolderTitle'),
    });

    if (selected && typeof selected === 'string') {
      setNewProjectPath(selected);
    }
  }, []);

  // EC2 서버 목록 로드 (페이지 로드 시)
  useEffect(() => {
    const loadEC2Servers = async () => {
      try {
        const servers = await ec2ServerCommands.getAllServers();
        setEc2Servers(servers);

        // sessionStorage에서 복원한 서버 ID가 유효한지 확인
        const savedServerId = sessionStorage.getItem('projectsSelectedEC2ServerId');
        if (savedServerId && servers.some(s => s.id === savedServerId)) {
          // 저장된 서버 ID가 유효하면 그대로 사용 (이미 state에 설정되어 있음)
          console.log('현재 세션의 선택 서버 복원:', savedServerId);
        }
        // 주의: 서버가 선택되지 않은 상태로 시작 (자동 선택 제거)
        // 사용자가 명시적으로 서버를 선택해야 프로젝트 목록이 로드됨
      } catch (err) {
        console.error('EC2 서버 목록 로드 실패:', err);
      }
    };
    loadEC2Servers();
  }, []);

  // 프로젝트 생성 핸들러
  const handleCreateProject = useCallback(async () => {
    setCreateError(null);

    // 필수 필드 검증
    if (!newProjectName.trim()) {
      setCreateError(t('messages.enterProjectName'));
      return;
    }
    if (!newProjectPath.trim()) {
      setCreateError(t('messages.selectProjectPath'));
      return;
    }
    if (selectedTab === 'ec2' && !selectedEC2ServerId) {
      setCreateError(t('messages.selectEC2Server'));
      return;
    }
    if (selectedTab === 'ec2' && !newProjectWorkdir.trim()) {
      setCreateError(t('messages.enterWorkdir'));
      return;
    }

    setCreating(true);
    try {
      const environment: 'local' | 'ec2' = selectedTab === 'plugins' ? 'local' : selectedTab;
      const project = await projectCommands.createProject(
        newProjectName.trim(),
        newProjectPath.trim(),
        environment, // 현재 선택된 탭 (local or ec2)
        environment === 'ec2' ? selectedEC2ServerId : undefined,
        undefined, // description
        undefined, // githubRepoUrl
        undefined, // githubBranch
        undefined, // githubAccessToken
        environment === 'ec2' ? newProjectWorkdir.trim() : undefined // workdir (9번째 파라미터)
      );
      console.log('프로젝트 생성 완료:', project);

      // 모달 닫기 및 초기화
      setShowCreateModal(false);
      setNewProjectName('');
      setNewProjectPath('');
      setNewProjectWorkdir('arfni-deploy');
      setCreateError(null);

      // 프로젝트 목록 새로고침
      if (selectedTab === 'plugins') {
        // plugins 탭에서는 목록을 새로고침하지 않음
      } else if (selectedTab === 'ec2') {
        loadProjects(selectedTab, selectedEC2ServerId);
      } else {
        loadProjects(selectedTab);
      }

      // 빈 캔버스로 이동 (프로젝트 정보 전달)
      navigate('/canvas', { state: { project } });
    } catch (err) {
      console.error('프로젝트 생성 실패:', err);
      setCreateError(t('messages.createProjectFailed', { error: String(err) }));
    } finally {
      setCreating(false);
    }
  }, [newProjectName, newProjectPath, newProjectWorkdir, selectedTab, selectedEC2ServerId, navigate, loadProjects, ec2Servers, dispatch, t]);

  // GitHub 프로젝트 생성 핸들러
  const handleCreateFromGitHub = useCallback(async (
    repoUrl: string,
    repoName: string,
    branch: string,
    accessToken: string,
    workdir: string
  ) => {
    setCreateError(null);

    // EC2 서버 선택 검증
    if (!selectedEC2ServerId) {
      setCreateError(t('messages.selectEC2Server'));
      return;
    }

    setCreating(true);
    try {
      console.log('[GitHub Project] Creating project with workdir:', workdir);

      // GitHub 프로젝트는 임시 디렉토리에 메타데이터만 저장
      const { invoke } = await import('@tauri-apps/api/core');
      const tempDir = await invoke<string>('get_temp_dir');
      const projectName = newProjectName.trim() || repoName;
      const githubProjectPath = `${tempDir}\\arfni\\github-projects`;

      // 1. GitHub 프로젝트 생성 (DB에 저장)
      const project = await projectCommands.createProject(
        projectName, // 프로젝트 이름
        githubProjectPath, // 임시 경로 (여기에 .arfni 폴더만 생성됨)
        'ec2', // GitHub 프로젝트는 항상 EC2
        selectedEC2ServerId,
        undefined, // description
        repoUrl,
        branch,
        accessToken,
        workdir // workdir 전달
      );

      console.log('[GitHub Project] 프로젝트 생성 완료:', project);

      // 2. EC2 서버 정보 가져오기
      const ec2Server = ec2Servers.find(s => s.id === selectedEC2ServerId);
      if (!ec2Server) {
        throw new Error('EC2 서버 정보를 찾을 수 없습니다');
      }

      // 3. 기본 stack.yaml 생성 및 DB에 저장
      const initialStackYaml = `apiVersion: v1
name: ${repoName}
targets:
  ec2:
    type: ec2.ssh
    host: ${ec2Server.host}
    user: ${ec2Server.user}
services: {}`;

      await projectCommands.saveStackYaml(
        project.path,
        initialStackYaml,
        {
          nodes: [],
          edges: [],
          project_name: repoName,
          secrets: []
        }
      );

      console.log('[GitHub Project] stack.yaml 저장 완료');

      // 4. CI/CD 환경 설정 (EC2 클론, GitHub Secrets, Workflow 생성)
      try {
        const { invoke } = await import('@tauri-apps/api/core');

        // SSH 키 파일 읽기 (Tauri command 사용)
        const sshKey = await invoke<string>('read_file_content', {
          path: ec2Server.pem_path
        });

        const config = {
          platform: 'github',
          repository_url: repoUrl,
          branch: branch,
          framework: 'springboot', // TODO: 자동 감지 필요
          ec2_host: ec2Server.host,
          ec2_user: ec2Server.user,
          deploy_root: `/home/${ec2Server.user}/${workdir}`,
          docker_service: 'spring',
        };

        console.log('[GitHub Project] CI/CD 설정 시작:', config);

        await invoke('setup_complete_cicd', {
          config,
          sshKey,
          projectId: project.id,
          ec2ServerId: selectedEC2ServerId,
          accessToken,
          stackYamlContent: initialStackYaml,
        });

        console.log('[GitHub Project] CI/CD 설정 완료');
      } catch (cicdErr) {
        // CI/CD 설정 실패는 경고로 표시하고 계속 진행
        console.warn('[GitHub Project] CI/CD 설정 실패 (나중에 Deploy 시 자동 설정됨):', cicdErr);
        // 사용자에게 경고 메시지 표시 (선택적)
        // toast.warning('CI/CD 설정이 지연되었습니다. 첫 배포 시 자동으로 설정됩니다.');
      }

      // 모달 닫기 및 초기화
      setShowCreateModal(false);
      setNewProjectName('');
      setNewProjectPath('');
      setNewProjectWorkdir('arfni-deploy');
      setCreateError(null);

      // 프로젝트 목록 새로고침
      loadProjects('ec2', selectedEC2ServerId);

      // 빈 캔버스로 이동
      navigate('/canvas', { state: { project } });
    } catch (err) {
      console.error('[GitHub Project] 생성 실패:', err);
      setCreateError(t('messages.createProjectFailed', { error: String(err) }));
    } finally {
      setCreating(false);
    }
  }, [newProjectName, newProjectPath, newProjectWorkdir, selectedEC2ServerId, navigate, loadProjects, t, ec2Servers]);

  // 탭 상태를 sessionStorage에 저장
  useEffect(() => {
    sessionStorage.setItem('projectsSelectedTab', selectedTab);
  }, [selectedTab]);

  // 탭 변경 또는 서버 선택 변경 시 프로젝트 목록 로드
  useEffect(() => {
    if (selectedTab === 'plugins') {
      // Plugins 탭에서는 프로젝트를 로드하지 않음
      setLoading(false);
      setProjects([]);
    } else if (selectedTab === 'ec2') {
      // EC2 탭일 때는 서버가 선택된 경우에만 프로젝트 로드
      if (selectedEC2ServerId) {
        loadProjects('ec2', selectedEC2ServerId);
      } else {
        // 서버가 선택되지 않았으면 로딩 상태 해제하고 빈 목록 표시
        setLoading(false);
        setProjects([]);
      }
    } else {
      // Local 탭은 항상 프로젝트 로드
      loadProjects('local');
    }
  }, [selectedTab, selectedEC2ServerId, loadProjects, location.key]);

  return (
    <div className="h-full flex bg-white overflow-hidden">
      <ProjectsSidebar
        selectedTab={selectedTab}
        onTabChange={setSelectedTab}
        onHelpClick={() => setShowTutorial(true)}
      />

      {/* Main Content */}
      <main className="flex-1 flex flex-col pt-6 pb-0 overflow-hidden min-h-0">
        {selectedTab === 'plugins' ? (
          <PluginManager className="flex-1" />
        ) : (
          <>
        <div className="mt-2 mb-6 flex-shrink-0">
          <div className="px-6 flex items-center justify-between">
            <h2 className="text-3xl font-semibold text-gray-900">
              {selectedTab === 'local' ? t('title.local') : t('title.ec2')}
            </h2>

            <div className="flex items-center gap-3">
            {/* EC2 Server Selection - Always render to prevent layout shift */}
            <button
              onClick={() => setShowServerModal(true)}
              className="px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2 font-medium"
              style={{ visibility: selectedTab === 'ec2' ? 'visible' : 'hidden' }}
            >
              <Server className="w-4 h-4" />
              <span>
                {selectedEC2ServerId && ec2Servers.find(s => s.id === selectedEC2ServerId)
                  ? ec2Servers.find(s => s.id === selectedEC2ServerId)!.name
                  : t('buttons.selectServer')}
              </span>
              <span className="text-gray-400">▼</span>
            </button>

            {/* Create Project Button */}
            <button
              onClick={() => {
                // Early return when disabled condition
                if (selectedTab === 'ec2' && !selectedEC2ServerId) return;
                setShowCreateModal(true);
              }}
              className={`px-5 py-2 text-white rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                selectedTab === 'ec2' && !selectedEC2ServerId ? 'opacity-50' : ''
              }`}
              style={{
                backgroundColor: selectedTab === 'ec2' && !selectedEC2ServerId ? '#9CA3AF' : '#4C65E2'
              }}
              onMouseEnter={(e) => {
                if (!(selectedTab === 'ec2' && !selectedEC2ServerId)) {
                  e.currentTarget.style.backgroundColor = '#3B52C9';
                }
              }}
              onMouseLeave={(e) => {
                if (!(selectedTab === 'ec2' && !selectedEC2ServerId)) {
                  e.currentTarget.style.backgroundColor = '#4C65E2';
                }
              }}
            >
              {t('buttons.createProject')}
            </button>
            </div>
          </div>
        </div>

        {/* Divider */}
        <div className="border-b border-gray-200"></div>

        {/* 로딩 상태 */}
        {loading && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <Loader2 className="w-8 h-8 animate-spin text-gray-400 mx-auto mb-2" />
              <p className="text-gray-500">{t('messages.loading')}</p>
            </div>
          </div>
        )}

        {/* 에러 상태 */}
        {!loading && error && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <AlertCircle className="w-8 h-8 text-red-400 mx-auto mb-2" />
              <p className="text-red-600 mb-4">{error}</p>
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
              >
                {t('messages.retry')}
              </button>
            </div>
          </div>
        )}

        {/* EC2 탭 - 서버 미선택 상태 */}
        {!loading && !error && selectedTab === 'ec2' && !selectedEC2ServerId && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <Server className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-700 mb-2">{t('messages.selectServerTitle')}</h3>
              <p className="text-gray-500 mb-6">{t('messages.selectServerPrompt')}</p>
              <button
                onClick={() => setShowServerModal(true)}
                className="px-4 py-2 text-white rounded-lg hover:opacity-90 transition-colors"
                style={{ backgroundColor: '#4C65E2' }}
              >
                {t('buttons.selectServer')}
              </button>
            </div>
          </div>
        )}

        {/* 빈 목록 상태 */}
        {!loading && !error && projects.length === 0 && !(selectedTab === 'ec2' && !selectedEC2ServerId) && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <FolderOpen className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-700 mb-2">{t('messages.noProjects')}</h3>
              <p className="text-gray-500 mb-6">{t('messages.createFirst')}</p>
            </div>
          </div>
        )}

        {/* 프로젝트 목록 */}
        {!loading && !error && projects.length > 0 && (
          <div className="flex-1 overflow-y-auto min-h-0 pt-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pb-3 px-6">
              {projects
                .sort((a, b) => {
                  // 핀된 프로젝트를 먼저 표시
                  const aIsPinned = pinnedProjects.has(a.id);
                  const bIsPinned = pinnedProjects.has(b.id);
                  if (aIsPinned && !bIsPinned) return -1;
                  if (!aIsPinned && bIsPinned) return 1;
                  // 같은 pin 상태면 생성일 기준으로 정렬
                  return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
                })
                .map((project) => (
                  <ProjectCard
                    key={project.id}
                    project={project}
                    canvasPreview={canvasPreviews[project.id]}
                    isDeleting={deletingProjectPath === project.path}
                    isPinned={pinnedProjects.has(project.id)}
                    onDelete={handleDeleteProject}
                    onTogglePin={togglePin}
                  />
                ))}
            </div>
          </div>
        )}
          </>
        )}
      </main>

      <CreateProjectModal
        isOpen={showCreateModal}
        selectedTab={selectedTab}
        newProjectName={newProjectName}
        newProjectPath={newProjectPath}
        newProjectWorkdir={newProjectWorkdir}
        creating={creating}
        selectedEC2ServerId={selectedEC2ServerId}
        ec2Servers={ec2Servers}
        error={createError}
        onClose={() => {
          setShowCreateModal(false);
          setNewProjectName('');
          setNewProjectPath('');
          setNewProjectWorkdir('arfni-deploy');
          setCreateError(null);
        }}
        onNameChange={setNewProjectName}
        onWorkdirChange={setNewProjectWorkdir}
        onSelectFolder={handleSelectFolder}
        onCreate={handleCreateProject}
        onCreateFromGitHub={handleCreateFromGitHub}
      />

      {/* Server Selection Modal */}
      <ServerSelectionModal
        isOpen={showServerModal}
        onClose={() => setShowServerModal(false)}
        servers={ec2Servers}
        selectedServerId={selectedEC2ServerId}
        onSelectServer={(serverId) => {
          setSelectedEC2ServerId(serverId);
          sessionStorage.setItem('projectsSelectedEC2ServerId', serverId);
          loadProjects('ec2', serverId); // 서버 변경 시 해당 서버의 프로젝트 목록 새로고침
        }}
        onAddNewServer={() => {
          setShowServerModal(false);
          setShowAddServerModal(true);
        }}
        onEditServer={(server) => {
          setEditingServer(server);
          setShowServerModal(false);
          setShowAddServerModal(true);
        }}
        onServerDeleted={async () => {
          // 서버 목록 새로고침
          const servers = await ec2ServerCommands.getAllServers();
          setEc2Servers(servers);
          // 선택된 서버가 삭제되었으면 선택 해제
          if (!servers.find(s => s.id === selectedEC2ServerId)) {
            setSelectedEC2ServerId('');
          }
        }}
      />

      {/* Add Server Modal */}
      <AddServerModal
        isOpen={showAddServerModal}
        onClose={() => {
          setShowAddServerModal(false);
          setEditingServer(null); // 수정 모드 초기화
          setShowServerModal(true); // 서버 선택 모달로 돌아가기
        }}
        onServerAdded={async () => {
          // 서버 목록 새로고침
          const servers = await ec2ServerCommands.getAllServers();
          setEc2Servers(servers);
          setEditingServer(null); // 수정 모드 초기화
        }}
        editServer={editingServer}
      />

      {/* Tutorial Modal */}
      {showTutorial && (
        <TutorialSlide
          type={selectedTab === 'local' ? 'local' : 'remote'}
          onClose={() => {
            setShowTutorial(false);
            localStorage.setItem('tutorialCompleted', 'true');
          }}
          onSkip={() => {
            setShowTutorial(false);
            localStorage.setItem('tutorialCompleted', 'true');
          }}
        />
      )}
    </div>
  );
}
