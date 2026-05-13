import React, { useState, useEffect } from 'react';
import { Play, Square, Trash2, RotateCw, MoreVertical, RefreshCw } from 'lucide-react';
import { Project, EC2Server } from '@shared/api/tauri/commands';
import { useTranslation } from 'react-i18next';

interface Container {
  id: string;
  name: string;
  image: string;
  status: string;
  command?: string;
  created?: string;
  ports?: string;
}

interface ContainersViewProps {
  project: Project | null;
  ec2Server: EC2Server | null;
  containers: Container[];
  loadingContainers: boolean;
  deletingContainerId: string | null;
  onRefresh: () => void;
  onStartContainer: (id: string, name: string) => void;
  onStopContainer: (id: string, name: string) => void;
  onRestartContainer: (id: string, name: string) => void;
  onRemoveContainer: (id: string, name: string) => void;
  onStartAll: () => void;
  onStopAll: () => void;
}

export function ContainersView({
  project,
  ec2Server,
  containers,
  loadingContainers,
  deletingContainerId,
  onRefresh,
  onStartContainer,
  onStopContainer,
  onRestartContainer,
  onRemoveContainer,
  onStartAll,
  onStopAll
}: ContainersViewProps) {
  const { t } = useTranslation('logs');
  const [expandedContainerIds, setExpandedContainerIds] = useState<Set<string>>(new Set());
  const [openHeaderDropdown, setOpenHeaderDropdown] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // 드롭다운 외부 클릭 시 닫기
  useEffect(() => {
    const handleClickOutside = () => {
      if (openHeaderDropdown) {
        setOpenHeaderDropdown(false);
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, [openHeaderDropdown]);

  const toggleExpand = (containerId: string) => {
    setExpandedContainerIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(containerId)) {
        newSet.delete(containerId);
      } else {
        newSet.add(containerId);
      }
      return newSet;
    });
  };

  return (
    <div className="flex-1 bg-gray-50 overflow-y-auto flex flex-col">
      {/* Container Information */}
      <div className="bg-white p-5 border-b border-gray-200 flex-1 overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-semibold text-gray-900">{t('containers.title')}</h3>
          <div className="flex gap-1">
            <button
              onClick={onRefresh}
              disabled={!ec2Server || loadingContainers}
              className="p-2 text-blue-600 hover:bg-blue-50 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title={t('containers.refresh')}
            >
              <RefreshCw className={`w-5 h-5 ${loadingContainers ? 'animate-spin' : ''}`} />
            </button>

            {/* 헤더 삼점 메뉴 */}
            <div className="relative">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setOpenHeaderDropdown(!openHeaderDropdown);
                }}
                className="p-2 text-gray-600 hover:bg-gray-100 rounded transition-colors"
                title={t('containers.more')}
              >
                <MoreVertical className="w-5 h-5" />
              </button>

              {/* 헤더 드롭다운 메뉴 */}
              {openHeaderDropdown && (
                <div
                  className="absolute right-0 mt-1 w-40 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-10"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    onClick={() => {
                      onStartAll();
                      setOpenHeaderDropdown(false);
                    }}
                    disabled={!ec2Server || containers.length === 0}
                    className="w-full px-3 py-2 text-left text-sm text-green-600 hover:bg-green-50 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Play className="w-4 h-4" fill="currentColor" />
                    {t('containers.startAll')}
                  </button>
                  <button
                    onClick={() => {
                      onStopAll();
                      setOpenHeaderDropdown(false);
                    }}
                    disabled={!ec2Server || containers.length === 0}
                    className="w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Square className="w-4 h-4" fill="currentColor" />
                    {t('containers.stopAll')}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {loadingContainers ? (
          <div className="text-sm text-gray-500">{t('containers.loading')}</div>
        ) : containers.length === 0 ? (
          <div className="text-sm text-gray-500">{t('containers.noContainers')}</div>
        ) : (
          <div className="space-y-2">
            {containers.map((container) => {
              const isRunning = container.status.toLowerCase().includes('up');
              const isExpanded = expandedContainerIds.has(container.id);

              return (
                <div
                  key={container.id}
                  className="p-3 rounded-lg border border-gray-200 bg-white transition-all cursor-pointer hover:border-gray-300"
                  onClick={() => toggleExpand(container.id)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-start gap-2 flex-1 min-w-0">
                      {/* Status indicator circle */}
                      <div className="mt-0.5">
                        {isRunning ? (
                          <div className="w-4 h-4 bg-green-500 rounded-full"></div>
                        ) : (
                          <div className="w-4 h-4 border-2 border-gray-400 rounded-full"></div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-gray-900 truncate">
                          {container.name}
                        </div>
                        <div className="text-xs text-gray-500 mt-1 truncate">
                          {container.image}
                        </div>
                        <div className={`text-xs mt-1 ${isRunning ? 'text-green-600' : 'text-gray-400'}`}>
                          {container.status}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-3 items-center" onClick={(e) => e.stopPropagation()}>
                      {/* Start/Stop button */}
                      {isRunning ? (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onStopContainer(container.id, container.name);
                          }}
                          className="flex flex-col items-center gap-1 p-2 text-red-600 hover:bg-red-50 rounded transition-colors"
                        >
                          <Square className="w-5 h-5" fill="currentColor" />
                          <span className="text-xs font-medium">{t('containers.actions.stop')}</span>
                        </button>
                      ) : (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onStartContainer(container.id, container.name);
                          }}
                          className="flex flex-col items-center gap-1 p-2 text-green-600 hover:bg-green-50 rounded transition-colors"
                        >
                          <Play className="w-5 h-5" fill="currentColor" />
                          <span className="text-xs font-medium">{t('containers.actions.start')}</span>
                        </button>
                      )}

                      {/* Restart button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onRestartContainer(container.id, container.name);
                        }}
                        className="flex flex-col items-center gap-1 p-2 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                      >
                        <RotateCw className="w-5 h-5" />
                        <span className="text-xs font-medium">{t('containers.actions.restart')}</span>
                      </button>

                      {/* Delete button */}
                      {confirmDeleteId === container.id ? (
                        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => {
                              setConfirmDeleteId(null);
                              onRemoveContainer(container.id, container.name);
                            }}
                            className="px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700"
                          >
                            {t('containers.actions.confirmDelete')}
                          </button>
                          <button
                            onClick={() => setConfirmDeleteId(null)}
                            className="px-2 py-1 text-xs bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                          >
                            {t('containers.actions.cancel')}
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setConfirmDeleteId(container.id);
                          }}
                          disabled={deletingContainerId === container.id}
                          className="flex flex-col items-center gap-1 p-2 text-red-600 hover:bg-red-50 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {deletingContainerId === container.id ? (
                            <div className="w-5 h-5 border-2 border-red-600 border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <Trash2 className="w-5 h-5" />
                          )}
                          <span className="text-xs font-medium">{t('containers.actions.delete')}</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* 상세 정보 (펼쳤을 때만 표시) */}
                  {isExpanded && (
                    <div className="mt-3 ml-6 pt-3 border-t border-gray-100 space-y-1.5">
                      <div className="text-xs">
                        <span className="text-gray-500 font-medium">{t('containers.details.id')}:</span>{' '}
                        <span className="text-gray-700 font-mono">{container.id}</span>
                      </div>
                      {container.command && (
                        <div className="text-xs">
                          <span className="text-gray-500 font-medium">{t('containers.details.command')}:</span>{' '}
                          <span className="text-gray-700 font-mono break-all">{container.command}</span>
                        </div>
                      )}
                      {container.created && (
                        <div className="text-xs">
                          <span className="text-gray-500 font-medium">{t('containers.details.created')}:</span>{' '}
                          <span className="text-gray-700">{container.created}</span>
                        </div>
                      )}
                      {container.ports && (
                        <div className="text-xs">
                          <span className="text-gray-500 font-medium">{t('containers.details.ports')}:</span>{' '}
                          <span className="text-gray-700 font-mono">{container.ports || t('containers.details.noPorts')}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
