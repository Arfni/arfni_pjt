import { useAppSelector } from '@app/hooks';
import { selectSelectedNode } from '@features/canvas/model/canvasSlice';
import { DynamicPropertyForm } from '@features/canvas/ui/DynamicPropertyForm';
import { useRef, useLayoutEffect } from 'react';

export function PropertyPanel() {
  const selectedNode = useAppSelector(selectSelectedNode);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const scrollPositionRef = useRef(0);

  // 스크롤 위치 보존 로직 - useLayoutEffect로 동기 실행
  useLayoutEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    // 브라우저가 화면에 그리기 전에 스크롤 위치 복원
    container.scrollTop = scrollPositionRef.current;

    // 스크롤 이벤트 리스너 - 스크롤 위치 저장
    const handleScroll = () => {
      scrollPositionRef.current = container.scrollTop;
    };

    container.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      container.removeEventListener('scroll', handleScroll);
    };
  });

  return (
    <div className="h-full bg-white flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200">
        <h2 className="text-base font-semibold text-gray-800">Properties</h2>
        {selectedNode && (
          <p className="text-xs text-gray-500 mt-1">
            {selectedNode.data.name || 'Unnamed'} Configuration
          </p>
        )}
      </div>

      {/* Content */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto"
        style={{ overflowAnchor: 'auto' }}
      >
        {selectedNode ? (
          <DynamicPropertyForm node={selectedNode} />
        ) : (
          <div className="flex items-center justify-center h-full p-4 text-gray-400">
            <div className="text-center">
              <p className="text-sm">Select a node to edit properties</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}