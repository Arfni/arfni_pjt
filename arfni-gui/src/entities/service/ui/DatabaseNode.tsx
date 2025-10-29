import { Handle, Position, NodeProps } from 'reactflow';
import { X } from 'lucide-react';
import { DatabaseNodeData } from '@shared/config/nodeTypes';

import postgresqlImg from '../../../assets/postgresql.png';
import mysqlImg from '../../../assets/mysql.png';
import redisImg from '../../../assets/redis.png';
import mongodbImg from '../../../assets/mongodb.png';

export function DatabaseNode({ data, selected }: NodeProps<DatabaseNodeData>) {
  const getIcon = () => {
    switch (data.type) {
      case 'postgres':
        return postgresqlImg;
      case 'mysql':
        return mysqlImg;
      case 'redis':
        return redisImg;
      case 'mongodb':
        return mongodbImg;
      default:
        return '';
    }
  };

  const getColor = () => {
    return 'bg-blue-500';
  };

  return (
    <div className={`relative ${getColor()} rounded-lg shadow-lg min-w-[140px] ${
      selected ? 'ring-2 ring-blue-400 ring-offset-2' : ''
    }`}>
      <Handle
        type="target"
        position={Position.Left}
        className="w-3 h-3 !bg-gray-400 border-2 border-white"
      />

      {/* Close button */}
      <button className="absolute -top-2 -right-2 w-5 h-5 bg-white rounded-full shadow-md flex items-center justify-center hover:bg-red-50 transition-colors z-10">
        <X className="w-3 h-3 text-gray-600" />
      </button>

      <div className="p-3 text-white">
        <div className="flex items-center gap-2 mb-2">
          <img src={getIcon()} alt={data.type} className="w-8 h-8 bg-white rounded p-1" />
          <div className="flex-1">
            <div className="text-sm font-semibold">{data.name}</div>
            <div className="text-xs opacity-90">{data.type}-main</div>
          </div>
        </div>
        {data.ports && data.ports.length > 0 && (
          <div className="text-xs opacity-90 mt-1">
            Port: {data.ports[0].split(':')[1]} <span className="ml-2">v{data.version || '16'}</span>
          </div>
        )}
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className="w-3 h-3 !bg-gray-400 border-2 border-white"
      />
    </div>
  );
}