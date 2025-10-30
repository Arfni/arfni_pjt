import { X, FolderOpen } from 'lucide-react';
import { EC2Server } from '@shared/api/tauri/commands';

interface CreateProjectModalProps {
  isOpen: boolean;
  selectedTab: 'local' | 'ec2';
  newProjectName: string;
  newProjectPath: string;
  creating: boolean;
  selectedEC2ServerId: string;
  ec2Servers: EC2Server[];
  onClose: () => void;
  onNameChange: (name: string) => void;
  onSelectFolder: () => void;
  onCreate: () => void;
}

export function CreateProjectModal({
  isOpen,
  selectedTab,
  newProjectName,
  newProjectPath,
  creating,
  selectedEC2ServerId,
  ec2Servers,
  onClose,
  onNameChange,
  onSelectFolder,
  onCreate,
}: CreateProjectModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold">
            Create {selectedTab === 'local' ? 'Local' : 'EC2'} Project
          </h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Project Name
            </label>
            <input
              type="text"
              value={newProjectName}
              onChange={(e) => onNameChange(e.target.value)}
              placeholder="Enter project name"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={creating}
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Project Path
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={newProjectPath}
                readOnly
                placeholder="Select folder"
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 focus:outline-none"
              />
              <button
                onClick={onSelectFolder}
                disabled={creating}
                className="p-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50"
                title="Browse folder"
              >
                <FolderOpen className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Footer Buttons */}
        <div className="flex gap-3 p-6 border-t border-gray-200">
          <button
            onClick={onClose}
            disabled={creating}
            className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onCreate}
            disabled={creating || !newProjectName.trim() || !newProjectPath.trim()}
            className="flex-1 px-4 py-2 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            style={{ backgroundColor: '#4C65E2' }}
            onMouseEnter={(e) => !(creating || !newProjectName.trim() || !newProjectPath.trim()) && (e.currentTarget.style.backgroundColor = '#3B52C9')}
            onMouseLeave={(e) => !(creating || !newProjectName.trim() || !newProjectPath.trim()) && (e.currentTarget.style.backgroundColor = '#4C65E2')}
          >
            {creating ? 'Creating...' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}
