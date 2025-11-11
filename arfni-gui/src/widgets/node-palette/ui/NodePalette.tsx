import { useState, useEffect } from 'react';
import { Search } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '@app/hooks';
import { selectTemplate, selectSelectedTemplate } from '@features/canvas';
import { pluginService, type NodeTemplate } from '@services/pluginLoader';
import { convertFileSrc } from '@tauri-apps/api/core';
import { appDataDir, join } from '@tauri-apps/api/path';
import { useTranslation } from 'react-i18next';

// No more hardcoded icon imports!
// Icons are now loaded dynamically from plugin folders

type TabKey = 'DB' | 'Runtime' | 'Infra' | 'Monitor';

const tabCategories: Record<TabKey, 'database' | 'runtime' | 'infra' | 'monitor'> = {
  DB: 'database',
  Runtime: 'runtime',
  Infra: 'infra',
  Monitor: 'monitor',
};

export function NodePalette() {
  const { t } = useTranslation('canvas');
  const dispatch = useAppDispatch();
  const selectedTemplate = useAppSelector(selectSelectedTemplate);
  const [activeTab, setActiveTab] = useState<TabKey>('DB');
  const [searchQuery, setSearchQuery] = useState('');
  const [nodeTemplates, setNodeTemplates] = useState<NodeTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadPlugins();
  }, []);

  const loadPlugins = async () => {
    try {
      setIsLoading(true);
      await pluginService.loadPlugins();
      const templates = pluginService.getNodeTemplates();

      // Get app data directory for cross-platform path
      const dataDir = await appDataDir();

      // Map icon paths to actual URLs for both bundled and installed plugins
      const templatesWithIconsPromises = templates.map(async (template) => {
        if (!template.plugin) {
          return template;
        }

        try {
          let iconUrl: string;

          // Load all plugins via Tauri command and create blob URL
          const { invoke } = await import('@tauri-apps/api/core');
          const pathParts = template.plugin.iconPath.split('/');

          let pluginPath: string;
          if (template.plugin.isBundled) {
            // Bundled: plugins/bundled/framework/springboot -> framework/springboot
            const category = pathParts[2];
            const pluginName = pathParts[3];
            pluginPath = `${category}/${pluginName}`;
          } else {
            // Installed: plugins/installed/framework/django -> framework/django
            const category = pathParts[2];
            const pluginName = pathParts[3];
            pluginPath = `${category}/${pluginName}`;
          }

          const iconBytes = await invoke<number[]>('read_plugin_icon', {
            pluginPath,
            isBundled: template.plugin.isBundled
          });

          const blob = new Blob([new Uint8Array(iconBytes)], { type: 'image/png' });
          iconUrl = URL.createObjectURL(blob);

          return { ...template, icon: iconUrl };
        } catch (error) {
          console.error(`Failed to load icon for ${template.plugin?.manifest.name}:`, error);
          return template;
        }
      });

      const templatesWithIcons = await Promise.all(templatesWithIconsPromises);
      setNodeTemplates(templatesWithIcons);
    } catch (error) {
      console.error('Error loading plugins:', error);
      // Fallback to empty templates if plugin loading fails
      setNodeTemplates([]);
    } finally {
      setIsLoading(false);
    }
  };

  // 클릭 방식 제거 - 드래그 앤 드롭만 사용
  // const handleTemplateClick = (nodeType: string, category: 'runtime' | 'database' | 'infra' | 'monitor') => {
  //   // Map category to canvas category
  //   const canvasCategory = category === 'database' ? 'database' : category === 'runtime' ? 'service' : 'target';

  //   if (selectedTemplate?.type === nodeType) {
  //     dispatch(selectTemplate(null));
  //   } else {
  //     dispatch(selectTemplate({ type: nodeType, category: canvasCategory as any }));
  //   }
  // };

  const onDragStart = (event: React.DragEvent, nodeType: string, category: 'runtime' | 'database' | 'infra' | 'monitor') => {
    const canvasCategory = category === 'database' ? 'database' : category === 'runtime' ? 'service' : 'target';
    event.dataTransfer.setData('application/reactflow', JSON.stringify({ type: nodeType, category: canvasCategory }));
    event.dataTransfer.effectAllowed = 'move';
  };

  const filteredNodes = nodeTemplates
    .filter((node) => node.category === tabCategories[activeTab])
    .filter((node) =>
      node.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
      node.description.toLowerCase().includes(searchQuery.toLowerCase())
    );

  return (
    <div className="w-60 h-full bg-white border-r border-gray-200 flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200">
        <h2 className="text-base font-semibold text-gray-800">{t('blocks.title')}</h2>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        {(['DB', 'Runtime', 'Infra', 'Monitor'] as TabKey[]).map((tab) => {
          const tabTranslationKey = tab === 'DB' ? 'blocks.tabs.db'
            : tab === 'Runtime' ? 'blocks.tabs.runtime'
            : tab === 'Infra' ? 'blocks.tabs.infra'
            : 'blocks.tabs.monitor';

          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`
                flex-1 px-3 py-2 text-xs font-medium transition-colors
                whitespace-nowrap min-w-0
                flex items-center justify-center
                ${activeTab === tab
                  ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
                  : 'text-gray-600 hover:text-gray-800 hover:bg-gray-50'
                }
              `}
            >
              {t(tabTranslationKey)}
            </button>
          );
        })}
      </div>

      {/* Search */}
      <div className="px-3 py-2 border-b border-gray-200">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input
            type="text"
            placeholder={t('blocks.searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
      </div>

      {/* Block List */}
      <div className="flex-1 overflow-y-auto px-3 py-2">
        {isLoading ? (
          <div className="text-center py-8">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <div className="text-sm text-gray-500 mt-2">{t('blocks.loading')}</div>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredNodes.map((node) => {
              const isSelected = selectedTemplate?.type === node.type;
              return (
                <div
                  key={node.type}
                  draggable
                  onDragStart={(e) => onDragStart(e, node.type, node.category)}
                  className="bg-white border border-gray-200 rounded-lg p-2.5 cursor-grab active:cursor-grabbing hover:shadow-md hover:border-blue-300 transition-all"
                >
                  <div className="flex items-start gap-2">
                    <img src={node.icon} alt={node.label} className="w-8 h-8 flex-shrink-0 pointer-events-none" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-gray-900 truncate">
                        {node.label}
                      </div>
                      <div className="text-xs text-gray-500 truncate">
                        {node.description}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
            {filteredNodes.length === 0 && !isLoading && (
              <div className="text-center py-8 text-sm text-gray-500">
                {t('blocks.noBlocksFound')}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}