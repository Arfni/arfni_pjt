import { useState, useRef, useCallback, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { CanvasEditor } from '@widgets/canvas-editor';
import { LogViewer } from '@widgets/log-viewer';
import { Toolbar } from '@widgets/toolbar';
import { NodePalette } from '@widgets/node-palette';
import { YamlEditor } from '@widgets/yaml-editor';
import { PropertyPanel } from '@widgets/property-panel';

export function CanvasPage() {
  const [showLeftSidebar, setShowLeftSidebar] = useState(true);
  const [showRightSidebar, setShowRightSidebar] = useState(true);
  const [yamlHeight, setYamlHeight] = useState(256); // 초기 높이 256px (h-64)
  const [isResizing, setIsResizing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isResizing || !containerRef.current) return;

      const containerRect = containerRef.current.getBoundingClientRect();
      const containerHeight = containerRect.height;
      const mouseY = e.clientY - containerRect.top;

      // 새로운 YAML 높이 계산 (컨테이너 하단에서부터의 높이)
      const newHeight = containerHeight - mouseY;

      // 최소 높이 150px, 최대 높이 컨테이너의 70%
      const minHeight = 150;
      const maxHeight = containerHeight * 0.7;

      if (newHeight >= minHeight && newHeight <= maxHeight) {
        setYamlHeight(newHeight);
      }
    },
    [isResizing]
  );

  const handleMouseUp = useCallback(() => {
    setIsResizing(false);
  }, []);

  // 마우스 이벤트 리스너 등록
  useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'ns-resize';
      document.body.style.userSelect = 'none';
    } else {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing, handleMouseMove, handleMouseUp]);

  return (
    <div className="h-full flex flex-col bg-gray-50">
      <Toolbar />
      <div ref={containerRef} className="flex-1 flex overflow-hidden relative">
        {/* 왼쪽: Blocks 팔레트 */}
        <div className={`transition-all duration-300 ease-in-out ${showLeftSidebar ? 'w-52' : 'w-0'} overflow-hidden`}>
          <NodePalette />
        </div>

        {/* 왼쪽 토글 버튼 */}
        <button
          onClick={() => setShowLeftSidebar(!showLeftSidebar)}
          className="absolute left-0 top-1/2 -translate-y-1/2 z-20 bg-white border border-gray-200 rounded-r-lg shadow-md p-1.5 hover:bg-gray-50 transition-colors"
          style={{ left: showLeftSidebar ? '13rem' : '0' }}
          title={showLeftSidebar ? 'Hide Blocks' : 'Show Blocks'}
        >
          {showLeftSidebar ? (
            <ChevronLeft className="w-4 h-4 text-gray-600" />
          ) : (
            <ChevronRight className="w-4 h-4 text-gray-600" />
          )}
        </button>

        {/* 중앙: Canvas + 하단 YAML */}
        <div className="flex-1 flex flex-col" style={{ pointerEvents: 'auto' }}>
          {/* Canvas 영역 */}
          <div className="flex-1 bg-white" style={{ height: `calc(100% - ${yamlHeight}px)` }}>
            <CanvasEditor />
          </div>

          {/* 리사이저 핸들 */}
          <div
            onMouseDown={handleMouseDown}
            className={`h-1 bg-gray-200 hover:bg-blue-400 cursor-ns-resize relative group transition-colors ${
              isResizing ? 'bg-blue-500' : ''
            }`}
          >
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-12 h-1 bg-gray-400 rounded-full group-hover:bg-blue-500 transition-colors"></div>
            </div>
          </div>

          {/* 하단: Stack.yaml */}
          <div className="border-t border-gray-200 bg-white" style={{ height: `${yamlHeight}px` }}>
            <YamlEditor />
          </div>
        </div>

        {/* 오른쪽 토글 버튼 */}
        <button
          onClick={() => setShowRightSidebar(!showRightSidebar)}
          className="absolute right-0 top-1/2 -translate-y-1/2 z-20 bg-white border border-gray-200 rounded-l-lg shadow-md p-1.5 hover:bg-gray-50 transition-colors"
          style={{ right: showRightSidebar ? '20rem' : '0' }}
          title={showRightSidebar ? 'Hide Properties' : 'Show Properties'}
        >
          {showRightSidebar ? (
            <ChevronRight className="w-4 h-4 text-gray-600" />
          ) : (
            <ChevronLeft className="w-4 h-4 text-gray-600" />
          )}
        </button>

        {/* 오른쪽: Properties */}
        <div className={`transition-all duration-300 ease-in-out ${showRightSidebar ? 'w-80' : 'w-0'} overflow-hidden border-l border-gray-200 bg-white`}>
          <PropertyPanel />
        </div>
      </div>
    </div>
  );
}