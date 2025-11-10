import { Handle, Position, NodeProps } from 'reactflow';
import { X } from 'lucide-react';
import { ServiceNodeData, DatabaseNodeData } from '@shared/config/nodeTypes';
import { useAppDispatch } from '@app/hooks';
import { deleteNode } from '@features/canvas';
import { useState, useEffect } from 'react';
import { convertFileSrc } from '@tauri-apps/api/core';
import { appDataDir, join } from '@tauri-apps/api/path';
import { pluginService } from '@services/pluginLoader';

type NodeData = ServiceNodeData | DatabaseNodeData;

export function ServiceNode({ data, selected, id }: NodeProps<NodeData>) {
  const dispatch = useAppDispatch();
  const [iconUrl, setIconUrl] = useState<string | null>(null);

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    dispatch(deleteNode(id));
  };

  // Get node type - handles both serviceType (ServiceNode) and type (DatabaseNode)
  const getNodeType = (): string => {
    if ('serviceType' in data && data.serviceType) {
      return data.serviceType;
    }
    if ('type' in data && data.type) {
      return data.type;
    }
    return 'custom';
  };

  const nodeType = getNodeType();

  // Load icon from plugin dynamically
  useEffect(() => {
    const loadIcon = async () => {
      try {
        // Ensure plugins are loaded first
        await pluginService.loadPlugins();

        // Try to get plugin by node type
        const plugin = pluginService.getPluginByNodeType(nodeType);

        if (plugin) {
          const { invoke } = await import('@tauri-apps/api/core');
          const pathParts = plugin.iconPath.split('/');

          // Extract category and plugin name from path
          // Bundled: plugins/bundled/framework/springboot -> framework/springboot
          // Installed: plugins/installed/framework/django -> framework/django
          const category = pathParts[2];
          const pluginName = pathParts[3];
          const pluginPath = `${category}/${pluginName}`;

          const iconBytes = await invoke<number[]>('read_plugin_icon', {
            pluginPath,
            isBundled: plugin.isBundled
          });

          const blob = new Blob([new Uint8Array(iconBytes)], { type: 'image/png' });
          setIconUrl(URL.createObjectURL(blob));
        }
      } catch (error) {
        setIconUrl(null);
      }
    };

    loadIcon();
  }, [nodeType]);

  return (
    <div
      className={`relative rounded-xl min-w-[140px] transition-all shadow-[0_6px_18px_rgba(0,0,0,0.12)]
        ${selected ? 'bg-[#2563EB]' : 'bg-white border border-gray-200'}
      `}
    >
      {/* 상하좌우 핸들 - 각 방향마다 source와 target 모두 */}
      <Handle
        type="target"
        position={Position.Left}
        id="target-left"
        className="w-3 h-3 !bg-gray-400 border-2 border-white"
      />
      <Handle
        type="source"
        position={Position.Left}
        id="source-left"
        className="w-3 h-3 !bg-gray-400 border-2 border-white"
      />
      <Handle
        type="target"
        position={Position.Top}
        id="target-top"
        className="w-3 h-3 !bg-gray-400 border-2 border-white"
      />
      <Handle
        type="source"
        position={Position.Top}
        id="source-top"
        className="w-3 h-3 !bg-gray-400 border-2 border-white"
      />

      {/* Delete button */}
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
        {/* Icon */}
        <div className="bg-white rounded-lg p-2 mb-3 shadow-sm">
          {iconUrl ? (
            <img
              src={iconUrl}
              alt={nodeType}
              className="w-12 h-12"
            />
          ) : (
            <div className="w-12 h-12 bg-gray-200 rounded flex items-center justify-center text-gray-500 text-xs">
              {nodeType.slice(0, 2).toUpperCase()}
            </div>
          )}
        </div>

        {/* Content */}
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
            {nodeType}-main
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
        type="target"
        position={Position.Right}
        id="target-right"
        className="w-3 h-3 !bg-gray-400 border-2 border-white"
      />
      <Handle
        type="source"
        position={Position.Right}
        id="source-right"
        className="w-3 h-3 !bg-gray-400 border-2 border-white"
      />
      <Handle
        type="target"
        position={Position.Bottom}
        id="target-bottom"
        className="w-3 h-3 !bg-gray-400 border-2 border-white"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="source-bottom"
        className="w-3 h-3 !bg-gray-400 border-2 border-white"
      />
    </div>
  );
}
