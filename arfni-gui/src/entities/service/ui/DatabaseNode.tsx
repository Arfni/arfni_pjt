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

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    dispatch(deleteNode(id));
  };
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

  return (
    <div
      className={`relative rounded-xl min-w-[140px] transition-all shadow-[0_6px_18px_rgba(0,0,0,0.12)] 
        ${selected ? 'bg-[#2563EB]' : 'bg-white border border-gray-200'}
      `}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="w-3 h-3 !bg-gray-400 border-2 border-white"
      />

      {/* 닫기 버튼 */}
      <button
        onClick={handleDelete}
        className={`absolute top-2 right-2 w-4 h-4 rounded-full flex items-center justify-center transition-all hover:bg-red-500/20
        ${selected ? 'bg-transparent' : 'bg-transparent'}
      `}
        title="Delete node"
      >
        <X className={`w-3 h-3 ${selected ? 'text-white/80 hover:text-red-300' : 'text-[#1E3A8A] hover:text-red-600'}`} />
      </button>

      <div
        className={`p-4 flex flex-col items-center text-center transition-all ${
          selected ? 'text-white' : 'text-gray-800'
        }`}
      >
        <div className="bg-white rounded-lg p-2 mb-3 shadow-sm">
          <img
            src={getIcon()}
            alt={data.type}
            className="w-12 h-12"
          />
        </div>
        <div className="w-full">
          <div
            className={`text-lg font-bold mb-1 ${
              selected ? 'text-white' : 'text-[#1E3A8A]'
            }`}
          >
            {data.name}
          </div>
          <div
            className={`text-sm mb-2 ${
              selected ? 'text-white/90' : 'text-gray-500'
            }`}
          >
            {data.type}-main
          </div>
          {data.ports && data.ports.length > 0 && (
            <div
              className={`text-sm flex items-center justify-center gap-4 ${
                selected ? 'text-white/90' : 'text-gray-500'
              }`}
            >
              <span>Port: {data.ports[0].split(':')[1]}</span>
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
