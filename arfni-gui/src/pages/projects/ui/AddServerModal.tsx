import { useState, useEffect } from 'react';
import { X, Folder, Loader2 } from 'lucide-react';
import { ec2ServerCommands, EC2Server } from '@shared/api/tauri/commands';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';

interface AddServerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onServerAdded: () => void;
  editServer?: EC2Server | null; // 수정할 서버 (null이면 추가 모드)
}

export function AddServerModal({ isOpen, onClose, onServerAdded, editServer }: AddServerModalProps) {
  const [name, setName] = useState('');
  const [host, setHost] = useState('');
  const [user, setUser] = useState('ubuntu');
  const [pemPath, setPemPath] = useState('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testSuccess, setTestSuccess] = useState(false);

  // 수정 모드일 때 서버 정보로 폼 초기화
  useEffect(() => {
    if (editServer) {
      setName(editServer.name);
      setHost(editServer.host);
      setUser(editServer.user);
      setPemPath(editServer.pem_path);
      setTestSuccess(false);
      setError(null);
    } else {
      // 추가 모드일 때 초기화
      setName('');
      setHost('');
      setUser('ubuntu');
      setPemPath('');
      setTestSuccess(false);
      setError(null);
    }
  }, [editServer, isOpen]);

  if (!isOpen) return null;

  const isEditMode = !!editServer;

  const handlePemFileSelect = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: 'PEM Files', extensions: ['pem'] }],
        title: 'Select PEM File',
      });

      if (selected && typeof selected === 'string') {
        setPemPath(selected);
        setTestSuccess(false); // PEM 파일 변경 시 재테스트 필요
      }
    } catch (err) {
      console.error('PEM 파일 선택 실패:', err);
      setError('Failed to select PEM file');
    }
  };

  const handleTestConnection = async () => {
    setError(null);
    setTestSuccess(false);

    // 필수 필드 검증
    if (!host.trim()) {
      setError('Please enter Host Address before testing connection');
      return;
    }
    if (!user.trim()) {
      setError('Please enter Username before testing connection');
      return;
    }
    if (!pemPath.trim()) {
      setError('Please select PEM Key File before testing connection');
      return;
    }

    setTesting(true);
    try {
      console.log('Testing SSH connection...');
      // 새로운 test_ssh_connection command 사용 (CMD 창 안 뜸)
      const result = await invoke<string>('test_ssh_connection', {
        host: host.trim(),
        user: user.trim(),
        keyPath: pemPath.trim()
      });
      console.log('Connection test result:', result);
      setTestSuccess(true);
    } catch (err) {
      console.error('Connection test failed:', err);
      setError(`Connection test failed: ${err}`);
    } finally {
      setTesting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // 필수 필드 검증
    if (!name.trim()) {
      setError('Please enter Server Name');
      return;
    }
    if (!host.trim()) {
      setError('Please enter Host Address');
      return;
    }
    if (!user.trim()) {
      setError('Please enter Username');
      return;
    }
    if (!pemPath.trim()) {
      setError('Please select PEM Key File');
      return;
    }

    // 수정 모드일 때는 변경 사항이 있을 때만 테스트 요구
    if (isEditMode && editServer) {
      const hasChanges =
        name.trim() !== editServer.name ||
        host.trim() !== editServer.host ||
        user.trim() !== editServer.user ||
        pemPath.trim() !== editServer.pem_path;

      // 변경 사항이 있으면 테스트 성공 필요
      if (hasChanges && !testSuccess) {
        setError('Please test the SSH connection first after making changes');
        return;
      }
    } else {
      // 추가 모드일 때는 항상 테스트 성공 필요
      if (!testSuccess) {
        setError('Please test the SSH connection first');
        return;
      }
    }

    setSaving(true);
    try {
      if (isEditMode && editServer) {
        // 수정 모드
        await ec2ServerCommands.updateServer({
          id: editServer.id,
          name: name.trim(),
          host: host.trim(),
          user: user.trim(),
          pemPath: pemPath.trim(),
        });
      } else {
        // 추가 모드
        await ec2ServerCommands.createServer({
          name: name.trim(),
          host: host.trim(),
          user: user.trim(),
          pemPath: pemPath.trim(),
        });
      }

      // 성공 후 초기화
      setName('');
      setHost('');
      setUser('ubuntu');
      setPemPath('');
      setTestSuccess(false);

      onServerAdded();
      onClose();
    } catch (err) {
      console.error(`서버 ${isEditMode ? '수정' : '추가'} 실패:`, err);
      setError(`Failed to ${isEditMode ? 'update' : 'add'} server: ${err}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
    >
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-800">
            {isEditMode ? 'Edit EC2 Server' : 'Add New EC2 Server'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-6 py-4">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="space-y-4">
            {/* Server Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Server Name *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My EC2 Server"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>

            {/* Host */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Host Address *
              </label>
              <input
                type="text"
                value={host}
                onChange={(e) => {
                  setHost(e.target.value);
                  setTestSuccess(false);
                }}
                placeholder="ec2-12-34-56-78.compute.amazonaws.com"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>

            {/* User */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Username *
              </label>
              <input
                type="text"
                value={user}
                onChange={(e) => {
                  setUser(e.target.value);
                  setTestSuccess(false);
                }}
                placeholder="ubuntu"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>

            {/* PEM File */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                PEM Key File *
              </label>
              <div className="flex gap-3">
                <input
                  type="text"
                  value={pemPath}
                  readOnly
                  placeholder="Select PEM file..."
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg bg-gray-50"
                  required
                />
                <button
                  type="button"
                  onClick={handlePemFileSelect}
                  className="w-10 h-10 flex items-center justify-center bg-white text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                  title="Browse PEM file"
                >
                  <Folder className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Test Connection Button */}
            <div className="mt-6">
              <button
                type="button"
                onClick={handleTestConnection}
                disabled={testing}
                className="w-full px-4 py-2 text-white rounded-lg disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                style={{ backgroundColor: '#4C65E2' }}
                onMouseEnter={(e) => !testing && (e.currentTarget.style.backgroundColor = '#3B52C9')}
                onMouseLeave={(e) => !testing && (e.currentTarget.style.backgroundColor = '#4C65E2')}
              >
                {testing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Testing Connection...
                  </>
                ) : testSuccess ? (
                  <>✅ Connection Successful</>
                ) : (
                  <>Test SSH Connection</>
                )}
              </button>
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-gray-200 mt-4 -mx-6"></div>

          {/* Buttons */}
          <div className="flex gap-3 mt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 px-4 py-2 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              style={{ backgroundColor: '#4C65E2' }}
              onMouseEnter={(e) => !saving && (e.currentTarget.style.backgroundColor = '#3B52C9')}
              onMouseLeave={(e) => !saving && (e.currentTarget.style.backgroundColor = '#4C65E2')}
            >
              {saving ? (isEditMode ? 'Updating...' : 'Adding...') : (isEditMode ? 'Update Server' : 'Add Server')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
