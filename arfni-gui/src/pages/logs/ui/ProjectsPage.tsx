import { useNavigate, useLocation } from 'react-router-dom';
import { useEffect, useState, useCallback } from 'react';
import { ArrowLeft, FolderOpen, Calendar, Server, Loader2, AlertCircle, RefreshCw, Trash2 } from 'lucide-react';
import { projectCommands, Project } from '@shared/api/tauri/commands';
import { confirm } from '@tauri-apps/plugin-dialog';

export default function ProjectsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingProjectPath, setDeletingProjectPath] = useState<string | null>(null);

  // 프로젝트 목록 로드 함수
  const loadProjects = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const projectList = await projectCommands.getRecentProjects();
      setProjects(projectList);
      console.log('프로젝트 목록 로드 완료:', projectList);
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

  // 페이지 마운트 및 location 변경 시마다 목록 로드
  useEffect(() => {
    loadProjects();
  }, [loadProjects, location.key]); // location.key가 변경되면 재로드

  return (
    <div className="h-full flex flex-col bg-gray-50 overflow-hidden">
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/')}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <FolderOpen className="w-6 h-6 text-gray-600" />
            <h1 className="text-xl font-semibold">Projects List</h1>
          </div>
          <button
            onClick={loadProjects}
            disabled={loading}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
            title="새로고침"
          >
            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </header>

      <main className="flex-1 flex flex-col max-w-7xl w-full mx-auto px-6 py-3 overflow-hidden min-h-0">
        <div className="mb-3 flex items-center justify-between flex-shrink-0">
          <p className="text-sm text-gray-600">Total {projects.length} projects</p>
          <button
            onClick={() => navigate('/canvas')}
            className="px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 text-sm"
          >
            Create New Project
          </button>
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
                    className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-lg transition-shadow cursor-pointer"
                    onClick={() => !isDeleting && navigate('/canvas', { state: { project } })}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                          <FolderOpen className="w-5 h-5 text-blue-600" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <h3 className="font-semibold text-gray-900 text-sm">{project.name}</h3>
                          <p className="text-xs text-gray-500 truncate">{project.path}</p>
                        </div>
                      </div>
                      <button
                        onClick={(e) => handleDeleteProject(project, e)}
                        disabled={isDeleting}
                        className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors disabled:opacity-50"
                        title="프로젝트 삭제"
                      >
                        {isDeleting ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Trash2 className="w-4 h-4" />
                        )}
                      </button>
                    </div>

                    <div className="space-y-1 text-xs text-gray-600">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-3 h-3" />
                        <span>Created: {new Date(project.created_at).toLocaleDateString()}</span>
                      </div>
                      {project.description && (
                        <p className="text-xs text-gray-500 mt-2">{project.description}</p>
                      )}
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
                        View Logs
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate('/canvas', { state: { project } });
                        }}
                        disabled={isDeleting}
                        className="flex-1 px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                      >
                        Edit In Canvas
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
