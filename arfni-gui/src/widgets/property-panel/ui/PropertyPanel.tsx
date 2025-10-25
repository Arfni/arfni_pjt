import { useAppSelector } from '@app/hooks';
import { selectSelectedNode } from '@features/canvas/model/canvasSlice';
import { DynamicPropertyForm } from '@features/canvas/ui/DynamicPropertyForm';

export function PropertyPanel() {
  const selectedNode = useAppSelector(selectSelectedNode);

  console.log('PropertyPanel - selectedNode:', selectedNode);

  return (
    <div className="h-full bg-gray-50 flex flex-col">
      {selectedNode ? (
        <DynamicPropertyForm node={selectedNode} />
      ) : (
        <div className="flex-1 flex items-center justify-center p-4 text-gray-500">
          <div className="text-center">
            <p className="text-lg font-medium mb-2">No Node Selected</p>
            <p className="text-sm">Click on a node in the canvas to edit its properties</p>
          </div>
        </div>
      )}
    </div>
  );
}