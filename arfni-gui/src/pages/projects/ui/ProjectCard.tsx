import { useNavigate } from 'react-router-dom';
import { Calendar, Server, Loader2, Trash2, Laptop } from 'lucide-react';
import { Project, CanvasNode, CanvasEdge } from '@shared/api/tauri/commands';
import { CanvasPreview } from './CanvasPreview';

interface ProjectCardProps {
  project: Project;
  canvasPreview?: { nodes: CanvasNode[], edges: CanvasEdge[] };
  isDeleting: boolean;
  onDelete: (project: Project, e: React.MouseEvent) => Promise<void>;
}

export function ProjectCard({ project, canvasPreview, isDeleting, onDelete }: ProjectCardProps) {
  const navigate = useNavigate();

  const handleDeleteClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await onDelete(project, e);
  };

  return (
    <div
      className="bg-white rounded-lg border border-gray-200 hover:shadow-lg transition-shadow cursor-pointer overflow-hidden"
      onClick={() => !isDeleting && navigate('/canvas', { state: { project } })}
    >
      {/* Canvas Thumbnail Preview */}
      <div className="h-32 bg-gray-100 relative overflow-hidden">
        {canvasPreview && canvasPreview.nodes.length > 0 ? (
          <CanvasPreview nodes={canvasPreview.nodes} edges={canvasPreview.edges} />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-gray-400 text-sm">Empty Canvas</p>
          </div>
        )}
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
                navigate('/logs', { state: { project } });
              }}
              disabled={isDeleting}
              className="flex-1 px-4 py-2.5 text-sm bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-50 font-medium transition-colors"
              style={{ borderRadius: '10px' }}
            >
              View Log
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              navigate('/canvas', { state: { project } });
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
