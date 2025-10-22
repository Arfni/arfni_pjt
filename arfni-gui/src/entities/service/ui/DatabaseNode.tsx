import { Handle, Position, NodeProps } from 'reactflow';
import { DatabaseNodeData } from '@shared/config/nodeTypes';

export function DatabaseNode({ data, selected }: NodeProps<DatabaseNodeData>) {
  const getIcon = () => {
    switch (data.type) {
      case 'postgres':
        return '🐘';
      case 'mysql':
        return '🐬';
      case 'redis':
        return '🔴';
      case 'mongodb':
        return '🍃';
      default:
        return '🗃️';
    }
  };

  const getColor = () => {
    switch (data.type) {
      case 'postgres':
        return 'bg-blue-50 border-blue-300';
      case 'mysql':
        return 'bg-orange-50 border-orange-300';
      case 'redis':
        return 'bg-red-50 border-red-300';
      case 'mongodb':
        return 'bg-green-50 border-green-300';
      default:
        return 'bg-gray-50 border-gray-300';
    }
  };

  return (
    <div className={`border-2 rounded-lg p-4 min-w-32 shadow-lg ${
      selected ? 'border-blue-500' : getColor()
    }`}>
      <Handle type="target" position={Position.Top} />

      <div className="text-center">
        <div className="text-2xl mb-2">{getIcon()}</div>
        <div className="text-sm font-semibold text-gray-800">{data.name}</div>
        <div className="text-xs text-gray-500 mt-1">{data.type}</div>
        {data.version && (
          <div className="text-xs text-gray-600 mt-1">v{data.version}</div>
        )}
        {data.ports && data.ports.length > 0 && (
          <div className="text-xs text-green-600 mt-1">
            :{data.ports[0].split(':')[0]}
          </div>
        )}
      </div>

      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}