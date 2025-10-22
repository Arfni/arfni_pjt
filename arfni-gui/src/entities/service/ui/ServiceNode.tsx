import { Handle, Position, NodeProps } from 'reactflow';
import { ServiceNodeData } from '@shared/config/nodeTypes';

export function ServiceNode({ data, selected }: NodeProps<ServiceNodeData>) {
  return (
    <div className={`bg-white border-2 rounded-lg p-4 min-w-32 shadow-lg ${
      selected ? 'border-blue-500' : 'border-gray-300'
    }`}>
      <Handle type="target" position={Position.Top} />

      <div className="text-center">
        <div className="text-sm font-semibold text-gray-800">{data.name}</div>
        <div className="text-xs text-gray-500 mt-1">{data.kind}</div>
        {data.image && (
          <div className="text-xs text-blue-600 mt-1 truncate" title={data.image}>
            {data.image}
          </div>
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