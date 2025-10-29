import { Handle, Position, NodeProps } from 'reactflow';
import { X } from 'lucide-react';
import { ServiceNodeData } from '@shared/config/nodeTypes';

import reactImg from '../../../assets/react.png';
import springbootImg from '../../../assets/springboot.png';
import nodejsImg from '../../../assets/nodejs.png';
import nextjsImg from '../../../assets/nextjs.png';
import pythonImg from '../../../assets/python.png';

export function ServiceNode({ data, selected }: NodeProps<ServiceNodeData>) {
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
          <img src={getIcon()} alt={data.serviceType} className="w-8 h-8 bg-white rounded p-1" />
          <div className="flex-1">
            <div className="text-sm font-semibold">{data.name}</div>
            <div className="text-xs opacity-90">postgres-main</div>
          </div>
        </div>
        {data.ports && data.ports.length > 0 && (
          <div className="text-xs opacity-90 mt-1">
            Port: {data.ports[0].split(':')[1]} <span className="ml-2">v16</span>
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