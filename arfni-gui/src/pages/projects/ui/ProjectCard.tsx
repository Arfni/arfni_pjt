import { useNavigate } from 'react-router-dom';
import { Calendar, Server, Loader2, Trash2, Laptop } from 'lucide-react';
import { Project, CanvasNode, projectCommands } from '@shared/api/tauri/commands';
import { CanvasPreview } from './CanvasPreview';
import { useAppDispatch } from '@app/hooks';
import { openProject, clearError } from '@features/project';
import { confirm } from '@tauri-apps/plugin-dialog';

// Star Icon Component
const StarIcon = ({ filled, onClick, className }: { filled: boolean; onClick?: (e: React.MouseEvent) => void; className?: string }) => (
  <svg
    width="24"
    height="24"
    viewBox="0 0 24 24"
    className={className}
    onClick={onClick}
    style={{ cursor: 'pointer' }}
  >
    <path
      d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"
      fill={filled ? '#FFD700' : 'none'}
      stroke="#D1D5DB"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

interface ProjectCardProps {
  project: Project;
  canvasPreview?: { nodes: CanvasNode[] };
  isDeleting: boolean;
  isPinned: boolean;
  onDelete: (project: Project, e: React.MouseEvent) => Promise<void>;
  onTogglePin: (projectId: string, e: React.MouseEvent) => void;
}

export function ProjectCard({ project, canvasPreview, isDeleting, isPinned, onDelete, onTogglePin }: ProjectCardProps) {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();

  const handleDeleteClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await onDelete(project, e);
  };

  const handleOpenProject = async (destination: 'canvas' | 'logs') => {
    if (isDeleting) return;

    // Clear any previous errors
    dispatch(clearError());

    // EC2 projects don't need local path validation - skip openProject thunk
    if (project.environment === 'ec2') {
      if (destination === 'canvas') {
        navigate('/canvas', { state: { project } });
      } else {
        navigate('/logs', { state: { project } });
      }
      return;
    }

    // Local projects - validate path before navigation
    try {
      // Dispatch openProject thunk and wait for result
      await dispatch(openProject(project.path)).unwrap();

      // Success - navigate to the destination
      if (destination === 'canvas') {
        navigate('/canvas', { state: { project } });
      } else {
        navigate('/logs', { state: { project } });
      }
    } catch (error: any) {
      // Check if it's a PROJECT_FOLDER_NOT_FOUND error
      const errorMsg = error?.toString() || String(error);
      if (errorMsg.includes('PROJECT_FOLDER_NOT_FOUND') || error?.type === 'PROJECT_FOLDER_NOT_FOUND') {
        // Show error dialog
        const shouldDelete = await confirm(
          `프로젝트 폴더를 찾을 수 없습니다:\n\n${project.path}\n\n폴더가 삭제되었거나 이동된 것 같습니다.\n\n목록에서 프로젝트를 제거하시겠습니까?`,
          {
            title: '프로젝트 폴더를 찾을 수 없음',
            kind: 'warning',
            okLabel: '프로젝트 제거',
            cancelLabel: '취소',
          }
        );

        if (shouldDelete) {
          try {
            await projectCommands.deleteProjectFromDbOnly(project.id);
            console.log('프로젝트 DB에서 제거 완료:', project.id);
            // Trigger a refresh by reloading the page or calling a refresh function
            window.location.reload();
          } catch (err) {
            console.error('프로젝트 제거 실패:', err);
          }
        }
      } else {
        // Other errors
        console.error('프로젝트 열기 실패:', error);
      }

      // Clear error after handling
      dispatch(clearError());
    }
  };

  return (
    <div
      className="bg-white rounded-lg border border-gray-200 hover:shadow-lg transition-shadow cursor-pointer overflow-hidden"
      onClick={() => !isDeleting && handleOpenProject('canvas')}
    >
      {/* Canvas Thumbnail Preview */}
      <div className="h-64 bg-gray-100 relative overflow-hidden">
        {canvasPreview && canvasPreview.nodes.length > 0 ? (
          <CanvasPreview nodes={canvasPreview.nodes} projectPath={project.path} />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-gray-400 text-sm">Empty Canvas</p>
          </div>
        )}
        {/* Star Pin Icon - 왼쪽 위 */}
        <div className="absolute top-2 left-2">
          <button
            onClick={(e) => onTogglePin(project.id, e)}
            className="p-1 transition-all hover:scale-110"
            title={isPinned ? "Unpin project" : "Pin project"}
          >
            <StarIcon filled={isPinned} />
          </button>
        </div>
        {/* Delete Button - 오른쪽 위 */}
        <div className="absolute top-2 right-2">
          <button
            onClick={handleDeleteClick}
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
          {project.environment === 'ec2' && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleOpenProject('logs');
              }}
              disabled={isDeleting}
              className="flex-1 px-4 py-2.5 text-sm bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-50 font-medium transition-colors"
              style={{ borderRadius: '10px' }}
            >
              Project Status
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleOpenProject('canvas');
            }}
            disabled={isDeleting}
            className={`${project.environment === 'local' ? 'w-full' : 'flex-1'} px-4 py-2.5 text-sm text-white disabled:opacity-50 transition-colors font-medium`}
            style={{ backgroundColor: '#4C65E2', borderRadius: '10px' }}
            onMouseEnter={(e) => !isDeleting && (e.currentTarget.style.backgroundColor = '#3B52C9')}
            onMouseLeave={(e) => !isDeleting && (e.currentTarget.style.backgroundColor = '#4C65E2')}
          >
            Edit In Canvas
          </button>
        </div>
      </div>
    </div>
  );
}
