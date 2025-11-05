import { Handle, Position, NodeProps } from 'reactflow';
import { TargetNodeData } from '@shared/config/nodeTypes';

export function TargetNode({ data, selected }: NodeProps<TargetNodeData>) {
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

  return (
    <div className={`border-2 rounded-lg p-4 min-w-32 shadow-lg ${
      selected ? 'border-blue-500' : getColor()
    }`}>
      {/* 상하좌우 핸들 - 각 방향마다 source와 target 모두 */}
      <Handle type="target" position={Position.Top} id="target-top" />
      <Handle type="source" position={Position.Top} id="source-top" />
      <Handle type="target" position={Position.Left} id="target-left" />
      <Handle type="source" position={Position.Left} id="source-left" />

      <div className="text-center">
        <div className="text-2xl mb-2">{getIcon()}</div>
        <div className="text-sm font-semibold text-gray-800">{data.name}</div>
        <div className="text-xs text-gray-500 mt-1">{data.type}</div>
        {data.host && (
          <div className="text-xs text-gray-600 mt-1 truncate" title={data.host}>
            {data.host}
          </div>
        )}
      </div>

      <Handle type="target" position={Position.Bottom} id="target-bottom" />
      <Handle type="source" position={Position.Bottom} id="source-bottom" />
      <Handle type="target" position={Position.Right} id="target-right" />
      <Handle type="source" position={Position.Right} id="source-right" />
    </div>
  );
}