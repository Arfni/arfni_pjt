import { Handle, Position, NodeProps } from 'reactflow';
import { X } from 'lucide-react';
import { ServiceNodeData } from '@shared/config/nodeTypes';
import { useAppDispatch } from '@app/hooks';
import { deleteNode } from '@features/canvas';

import reactImg from '../../../assets/react.png';
import springbootImg from '../../../assets/springboot.png';
import nodejsImg from '../../../assets/nodejs.png';
import nextjsImg from '../../../assets/nextjs.png';
import pythonImg from '../../../assets/python.png';

export function ServiceNode({ data, selected, id }: NodeProps<ServiceNodeData>) {
  const dispatch = useAppDispatch();
  const getIcon = () => {
    const serviceType = data.serviceType || 'custom';
    switch (serviceType) {
      case 'react':
        return reactImg;
      case 'nextjs':
        return nextjsImg;
      case 'spring':
        return springbootImg;
      case 'nodejs':
        return nodejsImg;
      case 'python':
        return pythonImg;
      case 'fastapi':
        return pythonImg;
      default:
        return reactImg;
    }
  };

  const getColor = () => {
    const serviceType = data.serviceType || 'custom';
    switch (serviceType) {
      case 'react':
        return 'bg-cyan-500';
      case 'nextjs':
        return 'bg-gray-800';
      case 'spring':
        return 'bg-green-600';
      case 'nodejs':
        return 'bg-green-700';
      case 'python':
        return 'bg-blue-600';
      case 'fastapi':
        return 'bg-teal-600';
      default:
        return 'bg-gray-500';
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
          <img src={getIcon()} alt={data.serviceType} className="w-20 h-20 mb-4 bg-white rounded-lg p-3 shadow-md" />
          <div className={`text-2xl font-bold mb-2 ${selected ? 'text-white' : 'text-blue-900'}`}>{data.serviceType || 'Service'}</div>
          <div className={`text-sm mb-3 ${selected ? 'text-white opacity-90' : 'text-blue-400'}`}>{data.name}</div>
          {data.ports && data.ports.length > 0 && (
            <div className={`text-sm flex items-center justify-between w-full ${selected ? 'text-white opacity-90' : 'text-blue-400'}`}>
              <span>Port: {data.ports[0].split(':')[1] || data.ports[0]}</span>
              <span>v16</span>
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