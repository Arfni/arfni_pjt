import { CanvasEditor } from '@widgets/canvas-editor';
import { PropertyPanel } from '@widgets/property-panel';
import { LogViewer } from '@widgets/log-viewer';
import { Toolbar } from '@widgets/toolbar';

export function CanvasPage() {
  return (
    <div className="h-full flex flex-col">
      <Toolbar />
      <div className="flex-1 flex">
        <div className="flex-1">
          <CanvasEditor />
        </div>
        <div className="w-80 border-l border-gray-200 flex flex-col">
          <div className="flex-1">
            <PropertyPanel />
          </div>
          <div className="h-64 border-t border-gray-200">
            <LogViewer />
          </div>
        </div>
      </div>
    </div>
  );
}