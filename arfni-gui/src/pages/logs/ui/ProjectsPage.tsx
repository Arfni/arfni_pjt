import { useNavigate, useLocation } from 'react-router-dom';
import { useEffect, useState, useCallback } from 'react';
import { ArrowLeft, FolderOpen, Calendar, Server, Loader2, AlertCircle, RefreshCw, Trash2, X, Monitor, Laptop } from 'lucide-react';
import { projectCommands, Project, ec2ServerCommands, EC2Server, CanvasNode, CanvasEdge } from '@shared/api/tauri/commands';
import { confirm, open } from '@tauri-apps/plugin-dialog';

// Canvas 미리보기 컴포넌트
function CanvasPreview({ nodes, edges }: { nodes: CanvasNode[], edges: CanvasEdge[] }) {
  if (!nodes || nodes.length === 0) {
    return null;
  }

  // 노드 위치의 바운딩 박스 계산
  const positions = nodes.map(n => n.position);
  const minX = Math.min(...positions.map(p => p.x));
  const maxX = Math.max(...positions.map(p => p.x)) + 200; // 노드 너비 고려
  const minY = Math.min(...positions.map(p => p.y));
  const maxY = Math.max(...positions.map(p => p.y)) + 100; // 노드 높이 고려

  const width = maxX - minX;
  const height = maxY - minY;
  const viewBox = `${minX - 20} ${minY - 20} ${width + 40} ${height + 40}`;

  // 노드 타입별 색상
  const getNodeColor = (nodeType: string) => {
    switch (nodeType) {
      case 'service': return '#60A5FA'; // blue
      case 'database': return '#34D399'; // green
      case 'target': return '#F59E0B'; // orange
      default: return '#9CA3AF'; // gray
    }
  };

  return (
    <svg className="w-full h-full" viewBox={viewBox} preserveAspectRatio="xMidYMid meet">
      {/* 엣지 렌더링 */}
      {edges.map((edge) => {
        const sourceNode = nodes.find(n => n.id === edge.source);
        const targetNode = nodes.find(n => n.id === edge.target);
        if (!sourceNode || !targetNode) return null;

        const x1 = sourceNode.position.x + 100; // 노드 중심
        const y1 = sourceNode.position.y + 40;
        const x2 = targetNode.position.x;
        const y2 = targetNode.position.y + 40;

        return (
          <line
            key={edge.id}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke="#9CA3AF"
            strokeWidth="2"
            markerEnd="url(#arrowhead)"
          />
        );
      })}

      {/* 화살표 마커 정의 */}
      <defs>
        <marker
          id="arrowhead"
          markerWidth="10"
          markerHeight="10"
          refX="9"
          refY="3"
          orient="auto"
        >
          <polygon points="0 0, 10 3, 0 6" fill="#9CA3AF" />
        </marker>
      </defs>

      {/* 노드 렌더링 */}
      {nodes.map((node) => {
        const color = getNodeColor(node.node_type);
        return (
          <g key={node.id}>
            <rect
              x={node.position.x}
              y={node.position.y}
              width="200"
              height="80"
              fill={color}
              rx="6"
              opacity="0.9"
            />
            <text
              x={node.position.x + 100}
              y={node.position.y + 45}
              textAnchor="middle"
              fill="white"
              fontSize="14"
              fontWeight="600"
            >
              {node.data?.name || 'Node'}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export default function ProjectsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [selectedTab, setSelectedTab] = useState<'local' | 'ec2'>('local');
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
        await projectCommands.deleteProject(project.path);
        console.log('프로젝트 완전 삭제 완료:', project.path);
        setProjects((prev) => prev.filter((p) => p.path !== project.path));
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
        await projectCommands.removeFromRecentProjects(project.path);
        console.log('프로젝트 목록에서 제거 완료:', project.path);
        setProjects((prev) => prev.filter((p) => p.path !== project.path));
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
  }, [newProjectName, newProjectPath, selectedTab, selectedEC2ServerId, navigate, loadProjects]);

  // 탭 변경 시 프로젝트 목록 로드
  useEffect(() => {
    loadProjects(selectedTab);
  }, [selectedTab, loadProjects, location.key]);

  return (
    <div className="h-full flex flex-col bg-gray-50 overflow-hidden">
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FolderOpen className="w-6 h-6 text-gray-600" />
            <h1 className="text-xl font-semibold">ARFNI Projects</h1>
          </div>
          <button
            onClick={() => loadProjects(selectedTab)}
            disabled={loading}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
            title="새로고침"
          >
            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <aside className="w-64 bg-white border-r border-gray-200 flex flex-col">
          <div className="p-4 flex-1 flex flex-col">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Environment</h2>
            <nav className="space-y-1 mb-4">
              <button
                onClick={() => setSelectedTab('local')}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                  selectedTab === 'local'
                    ? 'bg-blue-50 text-blue-700 font-medium'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                <Laptop className="w-5 h-5" />
                <span>Local</span>
              </button>
              <button
                onClick={() => setSelectedTab('ec2')}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                  selectedTab === 'ec2'
                    ? 'bg-blue-50 text-blue-700 font-medium'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                <Server className="w-5 h-5" />
                <span>EC2</span>
              </button>
            </nav>

            {/* EC2 Server Selection */}
            {selectedTab === 'ec2' && (
              <div className="mb-4">
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                  Select Server
                </label>
                {ec2Servers.length === 0 ? (
                  <p className="text-xs text-gray-500 px-3 py-2">No servers available</p>
                ) : (
                  <select
                    value={selectedEC2ServerId}
                    onChange={(e) => setSelectedEC2ServerId(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {ec2Servers.map((server) => (
                      <option key={server.id} value={server.id}>
                        {server.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}

            {/* Create Project Button */}
            <button
              onClick={() => setShowCreateModal(true)}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
            >
              Create New Project
            </button>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 flex flex-col px-6 py-3 overflow-hidden min-h-0">
        <div className="mb-3 flex items-center justify-between flex-shrink-0">
          <p className="text-sm text-gray-600">
            {selectedTab === 'local' ? 'Local' : 'EC2'} Projects ({projects.length})
          </p>
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
              <h3 className="text-lg font-semibold text-gray-700 mb-2">프로젝트가 없습니다</h3>
              <p className="text-gray-500 mb-6">새 프로젝트를 생성하여 시작하세요</p>
              <button
                onClick={() => navigate('/')}
                className="px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800"
              >
                새 프로젝트 만들기
              </button>
            </div>
          </div>
        )}

        {/* 프로젝트 목록 */}
        {!loading && !error && projects.length > 0 && (
          <div className="flex-1 overflow-y-auto min-h-0">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pb-3">
              {projects.map((project) => {
                const isDeleting = deletingProjectPath === project.path;
                return (
                  <div
                    key={project.id}
                    className="bg-white rounded-lg border border-gray-200 hover:shadow-lg transition-shadow cursor-pointer overflow-hidden"
                    onClick={() => !isDeleting && navigate('/canvas', { state: { project } })}
                  >
                    {/* Canvas Thumbnail Preview */}
                    <div className="h-32 bg-gray-100 relative overflow-hidden">
                      {canvasPreviews[project.id] && canvasPreviews[project.id].nodes.length > 0 ? (
                        <CanvasPreview nodes={canvasPreviews[project.id].nodes} edges={canvasPreviews[project.id].edges} />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <p className="text-gray-400 text-sm">빈 캔버스</p>
                        </div>
                      )}
                      <div className="absolute top-2 right-2">
                        <button
                          onClick={(e) => handleDeleteProject(project, e)}
                          disabled={isDeleting}
                          className="p-1.5 bg-white/90 backdrop-blur-sm text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors disabled:opacity-50 shadow-sm"
                          title="프로젝트 삭제"
                        >
                          {isDeleting ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Trash2 className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Project Info */}
                    <div className="p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                          {project.environment === 'ec2' ? (
                            <Server className="w-5 h-5 text-blue-600" />
                          ) : (
                            <Laptop className="w-5 h-5 text-blue-600" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <h3 className="font-semibold text-gray-900 text-sm">{project.name}</h3>
                          <p className="text-xs text-gray-500">{project.environment === 'ec2' ? 'EC2' : 'Local Docker'}</p>
                        </div>
                      </div>

                      <div className="space-y-1 text-xs text-gray-600 mt-2">
                        <div className="flex items-center gap-2">
                          <Calendar className="w-3 h-3" />
                          <span>Created: {new Date(project.created_at).toLocaleDateString()}</span>
                        </div>
                      </div>

                      <div className="mt-3 pt-3 border-t border-gray-200 flex gap-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate('/logs', { state: { project } });
                          }}
                          disabled={isDeleting}
                          className="flex-1 px-3 py-1.5 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200 disabled:opacity-50"
                        >
                          View Log
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate('/canvas', { state: { project } });
                          }}
                          disabled={isDeleting}
                          className="flex-1 px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                        >
                          Edit
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        </main>
      </div>

      {/* 프로젝트 생성 모달 - 간단한 버전 */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h2 className="text-xl font-semibold">
                Create {selectedTab === 'local' ? 'Local' : 'EC2'} Project
              </h2>
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setNewProjectName('');
                  setNewProjectPath('');
                }}
                className="p-1 hover:bg-gray-100 rounded transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  프로젝트 이름
                </label>
                <input
                  type="text"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  placeholder="프로젝트 이름을 입력하세요"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={creating}
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  프로젝트 경로
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newProjectPath}
                    readOnly
                    placeholder="폴더를 선택하세요"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 focus:outline-none"
                  />
                  <button
                    onClick={handleSelectFolder}
                    disabled={creating}
                    className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50"
                  >
                    찾아보기
                  </button>
                </div>
              </div>

              {selectedTab === 'ec2' && selectedEC2ServerId && (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-sm text-blue-900">
                    <span className="font-medium">Server:</span> {ec2Servers.find(s => s.id === selectedEC2ServerId)?.name}
                  </p>
                </div>
              )}
            </div>

            {/* Footer Buttons */}
            <div className="flex gap-3 p-6 border-t border-gray-200">
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setNewProjectName('');
                  setNewProjectPath('');
                }}
                disabled={creating}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50"
              >
                취소
              </button>
              <button
                onClick={handleCreateProject}
                disabled={creating || !newProjectName.trim() || !newProjectPath.trim()}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {creating ? '생성 중...' : '생성'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
