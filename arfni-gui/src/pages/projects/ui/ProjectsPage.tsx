import { useNavigate, useLocation } from 'react-router-dom';
import { useEffect, useState, useCallback } from 'react';
import { Server, Loader2, AlertCircle, FolderOpen } from 'lucide-react';
import { projectCommands, Project, ec2ServerCommands, EC2Server, CanvasNode, CanvasEdge } from '@shared/api/tauri/commands';
import { confirm, open } from '@tauri-apps/plugin-dialog';
import { ServerSelectionModal } from './ServerSelectionModal';
import { AddServerModal } from './AddServerModal';
import { ProjectsHeader } from './ProjectsHeader';
import { ProjectsSidebar } from './ProjectsSidebar';
import { ProjectCard } from './ProjectCard';
import { CreateProjectModal } from './CreateProjectModal';
import { useAppDispatch } from '@app/hooks';
import { addNode } from '@features/canvas/model/canvasSlice';

export default function ProjectsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const dispatch = useAppDispatch();

  // localStorage에서 저장된 탭 상태 복원
  const [selectedTab, setSelectedTab] = useState<'local' | 'ec2'>(() => {
    const savedTab = localStorage.getItem('projectsSelectedTab');
    return (savedTab === 'local' || savedTab === 'ec2') ? savedTab : 'local';
  });

  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingProjectPath, setDeletingProjectPath] = useState<string | null>(null);

  // 프로젝트 생성 모달 상태
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectPath, setNewProjectPath] = useState('');
  const [creating, setCreating] = useState(false);

  // EC2 서버 관련
  const [ec2Servers, setEc2Servers] = useState<EC2Server[]>([]);
  const [selectedEC2ServerId, setSelectedEC2ServerId] = useState<string>('');
  const [showServerModal, setShowServerModal] = useState(false);
  const [showAddServerModal, setShowAddServerModal] = useState(false);

  // Canvas 미리보기 데이터
  const [canvasPreviews, setCanvasPreviews] = useState<Record<string, { nodes: CanvasNode[], edges: CanvasEdge[] }>>({});

  // 환경별 프로젝트 목록 로드 함수
  const loadProjects = useCallback(async (environment: 'local' | 'ec2') => {
    setLoading(true);
    setError(null);
    try {
      const projectList = await projectCommands.getProjectsByEnvironment(environment);
      setProjects(projectList);
      console.log(`${environment} 프로젝트 목록 로드 완료:`, projectList);

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
      setError('프로젝트 목록을 불러오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  // 프로젝트 삭제
  const handleDeleteProject = useCallback(async (project: Project, e: React.MouseEvent) => {
    if (deletingProjectPath) return;
    e.stopPropagation();

    // 삭제 방식 선택
    const deleteCompletely = await confirm(
      `"${project.name}" 프로젝트를 삭제하시겠습니까?`,
      {
        title: '프로젝트 삭제',
        kind: 'warning',
        okLabel: '프로젝트 파일 영구 삭제',
        cancelLabel: '목록에서만 삭제',
      }
    );

    if (deleteCompletely) {
      // 완전 삭제 선택 - 확인 다이얼로그
      const finalConfirm = await confirm(
        `"${project.name}" 프로젝트의 모든 파일이 영구적으로 삭제됩니다.\n\n경로: ${project.path}\n\n이 작업은 되돌릴 수 없습니다. 정말 삭제하시겠습니까?`,
        {
          title: '프로젝트 삭제',
          kind: 'warning',
          okLabel: '삭제',
          cancelLabel: '취소',
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
        alert(`프로젝트 삭제에 실패했습니다: ${err}`);
      } finally {
        setDeletingProjectPath(null);
      }
    } else {
      // 목록에서만 삭제 선택 - 확인 다이얼로그
      const confirmRemove = await confirm(
        `"${project.name}" 프로젝트를 최근 목록에서 제거하시겠습니까?\n\n※ 프로젝트 파일은 삭제되지 않습니다.`,
        {
          title: '프로젝트 목록 제거',
          kind: 'info',
          okLabel: '제거',
          cancelLabel: '취소',
        }
      );

      if (!confirmRemove) {
        return;
      }

      // 목록에서만 제거 실행
      setDeletingProjectPath(project.path);
      try {
        await projectCommands.removeFromRecentProjects(project.id);
        console.log('프로젝트 목록에서 제거 완료:', project.id);
        setProjects((prev) => prev.filter((p) => p.id !== project.id));
      } catch (err) {
        console.error('프로젝트 제거 실패:', err);
        alert(`프로젝트 제거에 실패했습니다: ${err}`);
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
      title: '프로젝트 폴더 선택',
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
        if (servers.length > 0) {
          setSelectedEC2ServerId(servers[0].id);
        }
      } catch (err) {
        console.error('EC2 서버 목록 로드 실패:', err);
      }
    };
    loadEC2Servers();
  }, []);

  // 프로젝트 생성 핸들러
  const handleCreateProject = useCallback(async () => {
    if (!newProjectName.trim()) {
      alert('프로젝트 이름을 입력하세요.');
      return;
    }
    if (!newProjectPath.trim()) {
      alert('프로젝트 경로를 선택하세요.');
      return;
    }
    if (selectedTab === 'ec2' && !selectedEC2ServerId) {
      alert('EC2 서버를 선택하세요.');
      return;
    }

    setCreating(true);
    try {
      const project = await projectCommands.createProject(
        newProjectName.trim(),
        newProjectPath.trim(),
        selectedTab, // 현재 선택된 탭 (local or ec2)
        selectedTab === 'ec2' ? selectedEC2ServerId : undefined
      );
      console.log('프로젝트 생성 완료:', project);

      // 모달 닫기 및 초기화
      setShowCreateModal(false);
      setNewProjectName('');
      setNewProjectPath('');

      // 프로젝트 목록 새로고침
      loadProjects(selectedTab);

      // 빈 캔버스로 이동 (프로젝트 정보 전달)
      navigate('/canvas', { state: { project } });
    } catch (err) {
      console.error('프로젝트 생성 실패:', err);
      alert(`프로젝트 생성에 실패했습니다: ${err}`);
    } finally {
      setCreating(false);
    }
  }, [newProjectName, newProjectPath, selectedTab, selectedEC2ServerId, navigate, loadProjects, ec2Servers, dispatch]);

  // 탭 상태를 localStorage에 저장
  useEffect(() => {
    localStorage.setItem('projectsSelectedTab', selectedTab);
  }, [selectedTab]);

  // 탭 변경 시 프로젝트 목록 로드
  useEffect(() => {
    loadProjects(selectedTab);
  }, [selectedTab, loadProjects, location.key]);

  return (
    <div className="h-full flex flex-col bg-gray-50 overflow-hidden">
      <ProjectsHeader
        loading={loading}
        onRefresh={() => loadProjects(selectedTab)}
      />

      <div className="flex-1 flex overflow-hidden">
        <ProjectsSidebar
          selectedTab={selectedTab}
          onTabChange={setSelectedTab}
        />

        {/* Main Content */}
        <main className="flex-1 flex flex-col px-6 py-3 overflow-hidden min-h-0">
        <div className="mb-3 flex items-center justify-between flex-shrink-0">
          <h2 className="text-2xl font-semibold text-gray-900">
            {selectedTab === 'local' ? 'Local' : 'EC2'} Projects
          </h2>

          <div className="flex items-center gap-3">
            {/* EC2 Server Selection */}
            {selectedTab === 'ec2' && (
              <button
                onClick={() => setShowServerModal(true)}
                className="px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2 font-medium"
              >
                <Server className="w-4 h-4" />
                <span>
                  {selectedEC2ServerId && ec2Servers.find(s => s.id === selectedEC2ServerId)
                    ? ec2Servers.find(s => s.id === selectedEC2ServerId)!.name
                    : 'Select Server'}
                </span>
                <span className="text-gray-400">▼</span>
              </button>
            )}

            {/* Create Project Button */}
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-5 py-2 text-white rounded-lg text-sm font-medium transition-colors"
              style={{ backgroundColor: '#4C65E2' }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#3B52C9'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#4C65E2'}
            >
              Create New Project
            </button>
          </div>
        </div>

        {/* 로딩 상태 */}
        {loading && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <Loader2 className="w-8 h-8 animate-spin text-gray-400 mx-auto mb-2" />
              <p className="text-gray-500">프로젝트 목록을 불러오는 중...</p>
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
                다시 시도
              </button>
            </div>
          </div>
        )}

        {/* 빈 목록 상태 */}
        {!loading && !error && projects.length === 0 && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <FolderOpen className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-700 mb-2">No Projects Existing</h3>
              <p className="text-gray-500 mb-6">Create a new project to get started</p>
            </div>
          </div>
        )}

        {/* 프로젝트 목록 */}
        {!loading && !error && projects.length > 0 && (
          <div className="flex-1 overflow-y-auto min-h-0">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pb-3">
              {projects.map((project) => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  canvasPreview={canvasPreviews[project.id]}
                  isDeleting={deletingProjectPath === project.path}
                  onDelete={handleDeleteProject}
                />
              ))}
            </div>
          </div>
        )}
        </main>
      </div>

      <CreateProjectModal
        isOpen={showCreateModal}
        selectedTab={selectedTab}
        newProjectName={newProjectName}
        newProjectPath={newProjectPath}
        creating={creating}
        selectedEC2ServerId={selectedEC2ServerId}
        ec2Servers={ec2Servers}
        onClose={() => {
          setShowCreateModal(false);
          setNewProjectName('');
          setNewProjectPath('');
        }}
        onNameChange={setNewProjectName}
        onSelectFolder={handleSelectFolder}
        onCreate={handleCreateProject}
      />

      {/* Server Selection Modal */}
      <ServerSelectionModal
        isOpen={showServerModal}
        onClose={() => setShowServerModal(false)}
        servers={ec2Servers}
        selectedServerId={selectedEC2ServerId}
        onSelectServer={(serverId) => {
          setSelectedEC2ServerId(serverId);
          loadProjects('ec2'); // 서버 변경 시 해당 서버의 프로젝트 목록 새로고침
        }}
        onAddNewServer={() => {
          setShowServerModal(false);
          setShowAddServerModal(true);
        }}
        onServerDeleted={async () => {
          // 서버 목록 새로고침
          const servers = await ec2ServerCommands.getAllServers();
          setEc2Servers(servers);
          // 선택된 서버가 삭제되었으면 첫 번째 서버로 변경
          if (servers.length > 0 && !servers.find(s => s.id === selectedEC2ServerId)) {
            setSelectedEC2ServerId(servers[0].id);
          }
        }}
      />

      {/* Add Server Modal */}
      <AddServerModal
        isOpen={showAddServerModal}
        onClose={() => setShowAddServerModal(false)}
        onServerAdded={async () => {
          // 서버 목록 새로고침
          const servers = await ec2ServerCommands.getAllServers();
          setEc2Servers(servers);
        }}
      />
    </div>
  );
}
