import { Handle, Position, NodeProps } from 'reactflow';
import { X } from 'lucide-react';
import { DatabaseNodeData } from '@shared/config/nodeTypes';
import { useAppDispatch } from '@app/hooks';
import { deleteNode } from '@features/canvas';

import postgresqlImg from '../../../assets/postgresql.png';
import mysqlImg from '../../../assets/mysql.png';
import redisImg from '../../../assets/redis.png';
import mongodbImg from '../../../assets/mongodb.png';

export function DatabaseNode({ data, selected, id }: NodeProps<DatabaseNodeData>) {
  const dispatch = useAppDispatch();
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
      <Handle
        type="target"
        position={Position.Left}
        className="w-3 h-3 !bg-gray-400 border-2 border-white"
      />

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
          <img src={getIcon()} alt={data.type} className="w-20 h-20 mb-4 bg-white rounded-lg p-3 shadow-md" />
          <div className={`text-2xl font-bold mb-2 ${selected ? 'text-white' : 'text-blue-900'}`}>{data.type.toUpperCase()}</div>
          <div className={`text-sm mb-3 ${selected ? 'text-white opacity-90' : 'text-blue-400'}`}>{data.name}</div>
          {data.ports && data.ports.length > 0 && (
            <div className={`text-sm flex items-center justify-between w-full ${selected ? 'text-white opacity-90' : 'text-blue-400'}`}>
              <span>Port: {data.ports[0].split(':')[1] || data.ports[0]}</span>
              <span>v{data.version || '16'}</span>
            </div>
          )}
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className="w-3 h-3 !bg-gray-400 border-2 border-white"
      />
    </div>
  );
}