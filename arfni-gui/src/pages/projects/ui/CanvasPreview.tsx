import { useState, useEffect } from 'react';
import { CanvasNode, CanvasEdge } from '@shared/api/tauri/commands';
import { pluginService } from '@services/pluginLoader';

interface CanvasPreviewProps {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
}

export function CanvasPreview({ nodes, edges }: CanvasPreviewProps) {
  const [iconUrls, setIconUrls] = useState<Record<string, string>>({});

  // Load icons for all nodes using pluginService
  useEffect(() => {
    const loadIcons = async () => {
      const { invoke } = await import('@tauri-apps/api/core');
      const urls: Record<string, string> = {};

      // Load plugins first
      await pluginService.loadPlugins();

      for (const node of nodes) {
        let techStack = '';
        if (node.node_type === 'service' && node.data?.serviceType) {
          techStack = node.data.serviceType;
        } else if (node.node_type === 'database' && node.data?.type) {
          techStack = node.data.type;
        } else if (node.node_type === 'nginx') {
          techStack = 'nginx';
        }

        if (techStack) {
          // nginx icon loaded directly from bundled gateway plugin
          if (techStack === 'nginx') {
            try {
              const iconBytes = await invoke<number[]>('read_plugin_icon', {
                pluginPath: 'gateway/nginx',
                isBundled: true,
              });
              const blob = new Blob([new Uint8Array(iconBytes)], { type: 'image/png' });
              urls['nginx'] = URL.createObjectURL(blob);
            } catch (error) {
              console.error('Failed to load nginx icon:', error);
            }
            continue;
          }

          // Get plugin from pluginService by nodeType
          const plugin = pluginService.getPluginByNodeType(techStack);

          if (plugin && plugin.iconPath) {
            try {
              // Extract category and plugin name from iconPath
              // e.g., "plugins/bundled/framework/springboot/icon.png" -> framework/springboot
              // e.g., "plugins/installed/framework/django/icon.png" -> framework/django
              const pathParts = plugin.iconPath.split('/');
              const category = pathParts[2];
              const pluginName = pathParts[3];

              const iconBytes = await invoke<number[]>('read_plugin_icon', {
                pluginPath: `${category}/${pluginName}`,
                isBundled: plugin.isBundled
              });
              const blob = new Blob([new Uint8Array(iconBytes)], { type: 'image/png' });
              urls[techStack] = URL.createObjectURL(blob);
            } catch (error) {
              console.error(`Failed to load icon for ${techStack}:`, error);
            }
          }
        }
      }

      setIconUrls(urls);
    };

    if (nodes && nodes.length > 0) {
      loadIcons();
    }

    // Cleanup blob URLs on unmount
    return () => {
      Object.values(iconUrls).forEach(url => URL.revokeObjectURL(url));
    };
  }, [nodes]);

  if (!nodes || nodes.length === 0) {
    return null;
  }

  // 노드 크기 설정 - ServiceNode와 동일한 크기
  const nodeWidth = 140;
  const nodeHeight = 140;

  // 노드 위치의 바운딩 박스 계산
  const positions = nodes.map(n => n.position);
  const minX = Math.min(...positions.map(p => p.x));
  const maxX = Math.max(...positions.map(p => p.x)) + nodeWidth;
  const minY = Math.min(...positions.map(p => p.y));
  const maxY = Math.max(...positions.map(p => p.y)) + nodeHeight;

  const width = maxX - minX;
  const height = maxY - minY;
  const viewBox = `${minX - 20} ${minY - 20} ${width + 40} ${height + 40}`;

  return (
    <svg className="w-full h-full" viewBox={viewBox} preserveAspectRatio="xMidYMid meet">
      {/* 엣지 렌더링 - 일반 선으로 변경 (화살표 제거) */}
      {edges.map((edge) => {
        const sourceNode = nodes.find(n => n.id === edge.source);
        const targetNode = nodes.find(n => n.id === edge.target);
        if (!sourceNode || !targetNode) return null;

        const x1 = sourceNode.position.x + nodeWidth / 2;
        const y1 = sourceNode.position.y + nodeHeight / 2;
        const x2 = targetNode.position.x + nodeWidth / 2;
        const y2 = targetNode.position.y + nodeHeight / 2;

        return (
          <line
            key={edge.id}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke="#9CA3AF"
            strokeWidth="2"
          />
        );
      })}

      {/* 노드 렌더링 - ServiceNode/DatabaseNode 디자인 적용 */}
      {nodes.map((node) => {
        // 기술 스택 추출
        let techStack = '';
        if (node.node_type === 'service' && node.data?.serviceType) {
          techStack = node.data.serviceType;
        } else if (node.node_type === 'database' && node.data?.type) {
          techStack = node.data.type;
        } else if (node.node_type === 'nginx') {
          techStack = 'nginx';
        }

        const iconUrl = techStack ? iconUrls[techStack] : null;

        return (
          <g key={node.id}>
            {/* 메인 노드 배경 - 흰색 배경에 그림자 효과 */}
            <defs>
              <filter id={`shadow-${node.id}`} x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur in="SourceAlpha" stdDeviation="3" />
                <feOffset dx="0" dy="3" result="offsetblur" />
                <feComponentTransfer>
                  <feFuncA type="linear" slope="0.15" />
                </feComponentTransfer>
                <feMerge>
                  <feMergeNode />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {/* 노드 배경 - 흰색, 테두리, 그림자 */}
            <rect
              x={node.position.x}
              y={node.position.y}
              width={nodeWidth}
              height={nodeHeight}
              fill="white"
              stroke="#E5E7EB"
              strokeWidth="1"
              rx="12"
              filter={`url(#shadow-${node.id})`}
            />

            {/* 아이콘 배경 (흰색 원형) - 중앙 정렬 */}
            <rect
              x={node.position.x + (nodeWidth - 56) / 2}
              y={node.position.y + (nodeHeight - 56 - 30) / 2}
              width="56"
              height="56"
              fill="white"
              rx="8"
            />

            {/* 아이콘 이미지 - 중앙 정렬 */}
            {iconUrl && (
              <image
                href={iconUrl}
                x={node.position.x + (nodeWidth - 48) / 2}
                y={node.position.y + (nodeHeight - 48 - 30) / 2 + 4}
                width="48"
                height="48"
              />
            )}

            {/* 노드 이름 - 중앙 정렬 */}
            <text
              x={node.position.x + nodeWidth / 2}
              y={node.position.y + nodeHeight / 2 + 40}
              textAnchor="middle"
              fill="#1E3A8A"
              fontSize="18"
              fontWeight="700"
            >
              {node.data?.name || 'Node'}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
