import { useAppSelector } from '@app/hooks';
import { selectSelectedNode } from '@features/canvas/model/canvasSlice';
import { DynamicPropertyForm } from '@features/canvas/ui/DynamicPropertyForm';

export function PropertyPanel() {
  const selectedNode = useAppSelector(selectSelectedNode);

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
      <div className="flex-1 overflow-y-auto">
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