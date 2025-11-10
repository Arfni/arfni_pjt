import { CanvasNode, CanvasEdge } from '@shared/api/tauri/commands';

interface CanvasPreviewProps {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
}

// 기술 스택별 아이콘 경로를 반환하는 함수
const getIconPath = (tech: string): string | null => {
  const iconMap: Record<string, string> = {
    // Frameworks
    react: '/plugins/bundled/framework/react/icon.png',
    spring: '/plugins/bundled/framework/springboot/icon.png',
    springboot: '/plugins/bundled/framework/springboot/icon.png',
    fastapi: '/plugins/bundled/framework/fastapi/icon.png',
    flask: '/plugins/bundled/framework/flask/icon.png',
    nodejs: '/plugins/bundled/framework/nodejs/icon.png',
    nextjs: '/plugins/bundled/framework/nextjs/icon.png',

    // Databases
    postgres: '/plugins/bundled/database/postgresql/icon.png',
    postgresql: '/plugins/bundled/database/postgresql/icon.png',
    mysql: '/plugins/bundled/database/mysql/icon.png',
    mongodb: '/plugins/bundled/database/mongodb/icon.png',

    // Cache
    redis: '/plugins/bundled/cache/redis/icon.png',
  };

  const normalizedTech = tech?.toLowerCase();
  return iconMap[normalizedTech] || null;
};

export function CanvasPreview({ nodes, edges }: CanvasPreviewProps) {
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
        }

        const iconPath = techStack ? getIconPath(techStack) : null;

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
            {iconPath && (
              <image
                href={iconPath}
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
