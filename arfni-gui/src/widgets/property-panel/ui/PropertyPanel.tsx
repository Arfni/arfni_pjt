import { useAppDispatch, useAppSelector } from '@app/hooks';
import {
  selectSelectedNode,
  selectSelectedEdgeId,
  selectEdges,
  selectNodes,
  updateEdgeData,
} from '@features/canvas/model/canvasSlice';
import { DynamicPropertyForm } from '@features/canvas/ui/DynamicPropertyForm';
import { useTranslation } from 'react-i18next';

export function PropertyPanel() {
  const dispatch = useAppDispatch();
  const selectedNode = useAppSelector(selectSelectedNode);
  const selectedEdgeId = useAppSelector(selectSelectedEdgeId);
  const edges = useAppSelector(selectEdges);
  const nodes = useAppSelector(selectNodes);
  const { t } = useTranslation('canvas');

  // 선택된 엣지가 NGINX 노드와 연결된 경우 route 편집 UI 표시 (방향 무관)
  const selectedEdge = selectedEdgeId ? edges.find(e => e.id === selectedEdgeId) : null;
  const isNginxEdge = selectedEdge
    ? nodes.find(n => n.id === selectedEdge.target)?.type === 'nginx' ||
      nodes.find(n => n.id === selectedEdge.source)?.type === 'nginx'
    : false;

  return (
    <div className="h-full bg-white flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200">
        <h2 className="text-base font-semibold text-gray-800">{t('properties.title')}</h2>
        {selectedNode && (
          <p className="text-xs text-gray-500 mt-1">
            {selectedNode.data.name || 'Unnamed'} {t('properties.configuration')}
          </p>
        )}
        {isNginxEdge && (
          <p className="text-xs text-gray-500 mt-1">{t('nginxEdge.subtitle')}</p>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {selectedNode ? (
          <DynamicPropertyForm node={selectedNode} />
        ) : isNginxEdge && selectedEdge ? (
          <div className="p-4 space-y-3">
            <p className="text-xs text-gray-500">
              {t('nginxEdge.description')}
            </p>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                {t('nginxEdge.locationLabel')}
              </label>
              <input
                type="text"
                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                value={(selectedEdge.data as any)?.route ?? '/'}
                onChange={(e) =>
                  dispatch(updateEdgeData({ id: selectedEdge.id, data: { route: e.target.value } }))
                }
                placeholder={t('nginxEdge.locationPlaceholder')}
              />
              <p className="text-xs text-gray-400 mt-1">{t('nginxEdge.locationHint')}</p>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full p-4 text-gray-400">
            <div className="text-center">
              <p className="text-sm">{t('properties.selectNodePrompt')}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}