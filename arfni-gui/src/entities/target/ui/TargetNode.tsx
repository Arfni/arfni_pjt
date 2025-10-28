import { Handle, Position, NodeProps } from 'reactflow';
import { X } from 'lucide-react';
import { TargetNodeData } from '@shared/config/nodeTypes';
import { useAppDispatch } from '@app/hooks';
import { deleteNode } from '@features/canvas';

export function TargetNode({ data, selected, id }: NodeProps<TargetNodeData>) {
  const dispatch = useAppDispatch();
  const getIcon = () => {
    switch (data.type) {
      case 'docker-desktop':
        return '🐋';
      case 'ec2.ssh':
        return '☁️';
      case 'k3s':
        return '⚙️';
      default:
        return '📦';
    }
  };

  const getColor = () => {
    switch (data.type) {
      case 'docker-desktop':
        return 'bg-blue-50 border-blue-300';
      case 'ec2.ssh':
        return 'bg-orange-50 border-orange-300';
      case 'k3s':
        return 'bg-purple-50 border-purple-300';
      default:
        return 'bg-gray-50 border-gray-300';
    }
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    dispatch(deleteNode(id));
  };

  return (
    <div className={`relative rounded-2xl shadow-lg min-w-[200px] transition-all ${
      selected
        ? 'bg-gradient-to-br from-blue-500 to-blue-600'
        : 'bg-gray-50 border-2 border-blue-200'
    }`}>
      <Handle type="target" position={Position.Top} className="w-3 h-3 !bg-gray-400 border-2 border-white" />

      {/* Close button */}
      <button
        onClick={handleDelete}
        className={`absolute top-4 right-4 w-6 h-6 flex items-center justify-center hover:opacity-80 transition-opacity z-10 ${
          selected ? 'text-white' : 'text-blue-900'
        }`}
      >
        <X className="w-5 h-5" />
      </button>

      <div className={`p-6 ${selected ? 'text-white' : 'text-gray-800'}`}>
        <div className="flex flex-col items-center text-center">
          <div className="text-6xl mb-4">{getIcon()}</div>
          <div className={`text-2xl font-bold mb-2 ${selected ? 'text-white' : 'text-blue-900'}`}>{data.name}</div>
          <div className={`text-sm mb-3 ${selected ? 'text-white opacity-90' : 'text-blue-400'}`}>{data.type}</div>
          {data.host && (
            <div className={`text-sm truncate max-w-full ${selected ? 'text-white opacity-90' : 'text-blue-400'}`} title={data.host}>
              {data.host}
            </div>
          )}
        </div>
      </div>

      <Handle type="source" position={Position.Bottom} className="w-3 h-3 !bg-gray-400 border-2 border-white" />
    </div>
  );
}