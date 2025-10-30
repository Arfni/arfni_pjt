import { useState } from 'react';
import { X, Folder, Loader2 } from 'lucide-react';
import { ec2ServerCommands, sshCommands } from '@shared/api/tauri/commands';
import { open } from '@tauri-apps/plugin-dialog';

interface AddServerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onServerAdded: () => void;
}

export function AddServerModal({ isOpen, onClose, onServerAdded }: AddServerModalProps) {
  const [name, setName] = useState('');
  const [host, setHost] = useState('');
  const [user, setUser] = useState('ubuntu');
  const [pemPath, setPemPath] = useState('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testSuccess, setTestSuccess] = useState(false);

  if (!isOpen) return null;

  const handlePemFileSelect = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: 'PEM Files', extensions: ['pem'] }],
        title: 'Select PEM File',
      });

      if (selected && typeof selected === 'string') {
        setPemPath(selected);
      }
    } catch (err) {
      console.error('PEM 파일 선택 실패:', err);
      setError('Failed to select PEM file');
    }
  };

  const handleTestConnection = async () => {
    setError(null);
    setTestSuccess(false);

    if (!host.trim() || !user.trim() || !pemPath.trim()) {
      setError('Host, User, and PEM file are required for connection test');
      return;
    }

    setTesting(true);
    try {
      console.log('Testing SSH connection...');
      const result = await sshCommands.execSystem(
        host.trim(),
        user.trim(),
        pemPath.trim(),
        'echo "connection_test"'
      );
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

    if (!name.trim() || !host.trim() || !user.trim() || !pemPath.trim()) {
      setError('All fields are required');
      return;
    }

    if (!testSuccess) {
      setError('Please test the connection first');
      return;
    }

    setSaving(true);
    try {
      await ec2ServerCommands.createServer({
        name: name.trim(),
        host: host.trim(),
        user: user.trim(),
        pemPath: pemPath.trim(),
      });

      // 성공 후 초기화
      setName('');
      setHost('');
      setUser('ubuntu');
      setPemPath('');
      setTestSuccess(false);

      onServerAdded();
      onClose();
    } catch (err) {
      console.error('서버 추가 실패:', err);
      setError(`Failed to add server: ${err}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-800">Add New EC2 Server</h2>
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
                onChange={(e) => setHost(e.target.value)}
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
                onChange={(e) => setUser(e.target.value)}
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
                disabled={testing || !host || !user || !pemPath}
                className="w-full px-4 py-2 text-white rounded-lg disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                style={{ backgroundColor: '#4C65E2' }}
                onMouseEnter={(e) => !(testing || !host || !user || !pemPath) && (e.currentTarget.style.backgroundColor = '#3B52C9')}
                onMouseLeave={(e) => !(testing || !host || !user || !pemPath) && (e.currentTarget.style.backgroundColor = '#4C65E2')}
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
              className="flex-1 px-4 py-2 text-white rounded-lg disabled:opacity-50 transition-colors"
              style={{ backgroundColor: '#4C65E2' }}
              onMouseEnter={(e) => !saving && (e.currentTarget.style.backgroundColor = '#3B52C9')}
              onMouseLeave={(e) => !saving && (e.currentTarget.style.backgroundColor = '#4C65E2')}
            >
              {saving ? 'Adding...' : 'Add Server'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
