import React, { useCallback, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { ec2ServerCommands } from '@shared/api/tauri/commands';

interface SettingsDialogProps {
  show: boolean;
  onClose: () => void;
  currentProject: any | null;
  onOpenProjectFolder: () => void;
}

export function SettingsDialog({
  show,
  onClose,
  currentProject,
  onOpenProjectFolder,
}: SettingsDialogProps) {
  const [settingsTab, setSettingsTab] = useState<'projectPath' | 'activePort'>('projectPath');
  const [portSearchQuery, setPortSearchQuery] = useState('');
  const [activePorts, setActivePorts] = useState<number[]>([]);

  const fetchActivePorts = useCallback(async () => {
    try {
      if (currentProject?.environment === 'ec2') {
        if (!currentProject.ec2_server_id) {
          console.error('EC2 서버 ID가 없습니다.');
          setActivePorts([]);
          return;
        }
        const ec2Server = await ec2ServerCommands.getServerById(currentProject.ec2_server_id);
        const params = {
          host: ec2Server.host,
          user: ec2Server.user,
          pem_path: ec2Server.pem_path,
        };
        const result = await invoke<number[]>('list_ec2_listening_ports', { params });
        setActivePorts(result);
      } else {
        const result = await invoke<number[]>('list_listening_ports');
        setActivePorts(result);
      }
    } catch (error) {
      console.error('포트 조회 실패:', error);
      setActivePorts([]);
    }
  }, [currentProject]);

  const handleSettingsTabChange = useCallback(async (tab: 'projectPath' | 'activePort') => {
    setSettingsTab(tab);
    if (tab === 'activePort') {
      await fetchActivePorts();
    }
  }, [fetchActivePorts]);

  if (!show) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-[800px] h-[600px] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-2xl font-bold text-gray-800">Setting</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Left Sidebar */}
          <div className="w-48 bg-gray-50 border-r p-4">
            <div className="relative mb-4">
              <input
                type="text"
                placeholder="Search..."
                className="w-full px-3 py-2 border rounded-lg text-sm pr-8"
              />
              <svg className="w-4 h-4 absolute right-3 top-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>

            <div className="space-y-1">
              <button
                onClick={() => handleSettingsTabChange('projectPath')}
                className={`w-full text-left px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                  settingsTab === 'projectPath'
                    ? 'bg-blue-100 text-blue-700'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                Project Path
              </button>
              <button
                onClick={() => handleSettingsTabChange('activePort')}
                className={`w-full text-left px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                  settingsTab === 'activePort'
                    ? 'bg-blue-100 text-blue-700'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                Active Port
              </button>
            </div>
          </div>

          {/* Right Content */}
          <div className="flex-1 p-8 overflow-y-auto">
            {settingsTab === 'projectPath' && (
              <div>
                <h3 className="text-xl font-semibold text-gray-800 mb-6">Project Path</h3>
                <div className="flex items-center gap-3">
                  <input
                    type="text"
                    value={currentProject?.path || ''}
                    readOnly
                    className="flex-1 px-4 py-3 border rounded-lg bg-gray-50 text-gray-700"
                  />
                  <button
                    onClick={onOpenProjectFolder}
                    className="px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    title="폴더 열기"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                    </svg>
                  </button>
                </div>
              </div>
            )}

            {settingsTab === 'activePort' && (
              <div>
                <h3 className="text-xl font-semibold text-gray-800 mb-6">
                  Activate Port {currentProject?.environment === 'ec2' ? '(EC2)' : '(Local)'}
                </h3>

                {/* Search */}
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Search</label>
                  <div className="relative">
                    <input
                      type="text"
                      value={portSearchQuery}
                      onChange={(e) => setPortSearchQuery(e.target.value)}
                      placeholder="Input Port Number..."
                      className="w-full px-4 py-3 border rounded-lg pr-10"
                    />
                    <svg className="w-5 h-5 absolute right-3 top-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </div>
                  {portSearchQuery && (
                    <div className="mt-2">
                      {activePorts.includes(parseInt(portSearchQuery)) ? (
                        <p className="text-green-600 font-medium">This port is activate!</p>
                      ) : (
                        <p className="text-red-600 font-medium">This port is unactivate!</p>
                      )}
                    </div>
                  )}
                </div>

                {/* All Active Ports */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">All Active Port</label>
                  <div className="border rounded-lg p-4 bg-gray-50 max-h-64 overflow-y-auto">
                    <p className="text-gray-700 text-sm leading-relaxed break-all">
                      {activePorts.length > 0 ? activePorts.join(', ') : '활성 포트가 없습니다.'}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
