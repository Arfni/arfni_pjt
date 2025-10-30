import { CanvasNode, CanvasEdge } from '@shared/api/tauri/commands';

interface CanvasPreviewProps {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
}

export function CanvasPreview({ nodes, edges }: CanvasPreviewProps) {
  if (!nodes || nodes.length === 0) {
    return null;
  }

  // 노드 위치의 바운딩 박스 계산
  const positions = nodes.map(n => n.position);
  const minX = Math.min(...positions.map(p => p.x));
  const maxX = Math.max(...positions.map(p => p.x)) + 200; // 노드 너비 고려
  const minY = Math.min(...positions.map(p => p.y));
  const maxY = Math.max(...positions.map(p => p.y)) + 100; // 노드 높이 고려

  const width = maxX - minX;
  const height = maxY - minY;
  const viewBox = `${minX - 20} ${minY - 20} ${width + 40} ${height + 40}`;

  // 노드 타입별 색상
  const getNodeColor = (nodeType: string) => {
    switch (nodeType) {
      case 'service': return '#60A5FA'; // blue
      case 'database': return '#34D399'; // green
      case 'target': return '#F59E0B'; // orange
      default: return '#9CA3AF'; // gray
    }
  };

  return (
    <svg className="w-full h-full" viewBox={viewBox} preserveAspectRatio="xMidYMid meet">
      {/* 엣지 렌더링 */}
      {edges.map((edge) => {
        const sourceNode = nodes.find(n => n.id === edge.source);
        const targetNode = nodes.find(n => n.id === edge.target);
        if (!sourceNode || !targetNode) return null;

        const x1 = sourceNode.position.x + 100; // 노드 중심
        const y1 = sourceNode.position.y + 40;
        const x2 = targetNode.position.x;
        const y2 = targetNode.position.y + 40;

        return (
          <line
            key={edge.id}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke="#9CA3AF"
            strokeWidth="2"
            markerEnd="url(#arrowhead)"
          />
        );
      })}

      {/* 화살표 마커 정의 */}
      <defs>
        <marker
          id="arrowhead"
          markerWidth="10"
          markerHeight="10"
          refX="9"
          refY="3"
          orient="auto"
        >
          <polygon points="0 0, 10 3, 0 6" fill="#9CA3AF" />
        </marker>
      </defs>

      {/* 노드 렌더링 */}
      {nodes.map((node) => {
        const color = getNodeColor(node.node_type);
        return (
          <g key={node.id}>
            <rect
              x={node.position.x}
              y={node.position.y}
              width="200"
              height="80"
              fill={color}
              rx="6"
              opacity="0.9"
            />
            <text
              x={node.position.x + 100}
              y={node.position.y + 45}
              textAnchor="middle"
              fill="white"
              fontSize="14"
              fontWeight="600"
            >
              {node.data?.name || 'Node'}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
