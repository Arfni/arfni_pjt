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

  // 노드 크기 설정 (세로가 더 길게)
  const nodeWidth = 150;
  const nodeHeight = 180;

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

        const x1 = sourceNode.position.x + nodeWidth / 2; // 노드 중심
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

      {/* 노드 렌더링 - 모두 연하늘색으로 통일 */}
      {nodes.map((node) => {
        // 더 연한 하늘색
        const skyBlue = '#FFFFFF'; // Tailwind의 sky-100 (더 연한 하늘색)

        // 기술 스택 추출 (serviceType 또는 type 또는 database type)
        let techStack = '';
        if (node.node_type === 'service' && node.data?.serviceType) {
          techStack = node.data.serviceType;
        } else if (node.node_type === 'database' && node.data?.type) {
          techStack = node.data.type;
        }

        const iconPath = techStack ? getIconPath(techStack) : null;

        return (
          <g key={node.id}>
            {/* 블록 배경 - 더 연한 하늘색, 세로가 더 길게 */}
            <rect
              x={node.position.x}
              y={node.position.y}
              width={nodeWidth}
              height={nodeHeight}
              fill={skyBlue}
              rx="8"
              opacity="0.95"
            />

            {/* 아이콘 이미지 렌더링 (중앙에 배치) */}
            {iconPath && (
              <image
                href={iconPath}
                x={node.position.x + (nodeWidth - 60) / 2}
                y={node.position.y + (nodeHeight - 60) / 2}
                width="60"
                height="60"
              />
            )}
          </g>
        );
      })}
    </svg>
  );
}
