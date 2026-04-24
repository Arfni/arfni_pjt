import { memo } from 'react';
import { Handle, Position } from 'reactflow';

interface NginxNodeProps {
  data: {
    name: string;
    listenPort?: number;
    serverName?: string;
  };
  selected?: boolean;
}

export const NginxNode = memo(function NginxNode({ data, selected }: NginxNodeProps) {
  const port = data.listenPort ?? 80;

  return (
    <div
      className={`
        rounded-lg border-2 px-3 py-2 min-w-[120px] select-none
        ${selected
          ? 'border-green-500 bg-green-50 shadow-lg'
          : 'border-green-400 bg-white shadow-sm hover:shadow-md'
        }
        transition-all duration-150
      `}
    >
      {/* Handles — incoming services connect to the left */}
      <Handle type="target" position={Position.Left} className="w-2 h-2 !bg-green-400" />
      <Handle type="source" position={Position.Right} className="w-2 h-2 !bg-green-400" />
      <Handle type="target" position={Position.Top} className="w-2 h-2 !bg-green-400" />
      <Handle type="source" position={Position.Bottom} className="w-2 h-2 !bg-green-400" />

      <div className="flex items-center gap-2">
        {/* NGINX icon (text-based fallback) */}
        <div className="w-8 h-8 flex items-center justify-center rounded bg-green-500 text-white font-bold text-xs flex-shrink-0">
          N
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-gray-900 truncate">{data.name || 'NGINX'}</div>
          <div className="text-xs text-gray-500">:{port}</div>
        </div>
      </div>
    </div>
  );
});
