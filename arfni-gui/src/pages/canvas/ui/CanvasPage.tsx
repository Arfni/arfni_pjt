import { CanvasEditor } from '@widgets/canvas-editor';
import { LogViewer } from '@widgets/log-viewer';
import { Toolbar } from '@widgets/toolbar';
import { NodePalette } from '@widgets/node-palette';
import { YamlEditor } from '@widgets/yaml-editor';
import { PropertyPanel } from '@widgets/property-panel';

export function CanvasPage() {
  return (
    <div className="h-full flex flex-col">
      <Toolbar />
      <div className="flex-1 flex overflow-hidden">
        {/* 왼쪽: 노드 팔레트 */}
        <NodePalette />

        {/* 중앙: Canvas */}
        <div className="flex-1" style={{ pointerEvents: 'auto' }}>
          <CanvasEditor />
        </div>

        {/* 오른쪽: Property Panel + YAML 미리보기 + 로그 */}
        <div className="w-96 border-l border-gray-200 flex flex-col overflow-hidden">
          {/* 상단: Property Panel - 속성 입력 */}
          <div className="flex-1 border-b border-gray-200 overflow-auto">
            <PropertyPanel />
          </div>

          {/* 중단: YAML 미리보기 - 읽기 전용 */}
          <div className="h-64 border-b border-gray-200 overflow-hidden">
            <YamlEditor />
          </div>

          {/* 하단: 로그 뷰어 */}
          <div className="h-48 overflow-hidden">
            <LogViewer />
          </div>
        </div>
      </div>
    </div>
  );
}