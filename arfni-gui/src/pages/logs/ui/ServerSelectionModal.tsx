import { useState } from 'react';
import { X, Server, Check, Loader2, Plus } from 'lucide-react';
import { EC2Server, sshCommands, ec2ServerCommands } from '@shared/api/tauri/commands';

interface ServerSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  servers: EC2Server[];
  selectedServerId: string;
  onSelectServer: (serverId: string) => void;
  onAddNewServer: () => void;
}

export function ServerSelectionModal({
  isOpen,
  onClose,
  servers,
  selectedServerId,
  onSelectServer,
  onAddNewServer,
}: ServerSelectionModalProps) {
  const [connectingServerId, setConnectingServerId] = useState<string | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleServerClick = async (server: EC2Server) => {
    // SSH 연결 테스트
    setConnectingServerId(server.id);
    setConnectionError(null);

    try {
      console.log('SSH 연결 테스트 시작:', server.host);

      // SSH 연결 테스트 (간단한 명령어 실행)
      const testCommand = 'echo "connection_test"';
      const result = await sshCommands.execSystem(
        server.host,
        server.user,
        server.pem_path,
        testCommand
      );

      console.log('SSH 연결 성공:', result);

      // 마지막 연결 시간 업데이트
      await ec2ServerCommands.updateLastConnected(server.id);

      // 서버 선택
      onSelectServer(server.id);
      onClose();
    } catch (error) {
      console.error('SSH 연결 실패:', error);
      setConnectionError(`${server.name} 연결 실패: ${error}`);
    } finally {
      setConnectingServerId(null);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-800">Select EC2 Server</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Server List */}
        <div className="px-6 py-4 max-h-96 overflow-y-auto">
          {connectionError && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
              {connectionError}
            </div>
          )}

          {servers.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Server className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p>No servers available</p>
              <p className="text-sm mt-1">Add a new server to get started</p>
            </div>
          ) : (
            <div className="space-y-2">
              {servers.map((server) => {
                const isSelected = server.id === selectedServerId;
                const isConnecting = connectingServerId === server.id;

                return (
                  <button
                    key={server.id}
                    onClick={() => handleServerClick(server)}
                    disabled={isConnecting}
                    className={`w-full text-left p-4 rounded-lg border-2 transition-all ${
                      isSelected
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300 bg-white'
                    } ${isConnecting ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <Server className={`w-4 h-4 ${isSelected ? 'text-blue-600' : 'text-gray-400'}`} />
                          <h3 className="font-semibold text-gray-800">{server.name}</h3>
                        </div>
                        <p className="text-sm text-gray-500 mt-1">{server.user}@{server.host}</p>
                        {server.last_connected_at && (
                          <p className="text-xs text-gray-400 mt-1">
                            Last connected: {new Date(server.last_connected_at).toLocaleString()}
                          </p>
                        )}
                      </div>

                      <div className="ml-4">
                        {isConnecting ? (
                          <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
                        ) : isSelected ? (
                          <Check className="w-5 h-5 text-blue-600" />
                        ) : null}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200">
          <button
            onClick={() => {
              onClose();
              onAddNewServer();
            }}
            className="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center justify-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Add New Server
          </button>
        </div>
      </div>
    </div>
  );
}
