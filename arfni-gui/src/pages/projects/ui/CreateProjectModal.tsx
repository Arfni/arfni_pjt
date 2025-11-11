import { X, FolderOpen } from 'lucide-react';
import { EC2Server } from '@shared/api/tauri/commands';
import { useTranslation } from 'react-i18next';

interface CreateProjectModalProps {
  isOpen: boolean;
  selectedTab: 'local' | 'ec2' | 'plugins';
  newProjectName: string;
  newProjectPath: string;
  creating: boolean;
  selectedEC2ServerId: string;
  ec2Servers: EC2Server[];
  error: string | null;
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
  error,
  onClose,
  onNameChange,
  onSelectFolder,
  onCreate,
}: CreateProjectModalProps) {
  const { t } = useTranslation('projects');

  if (!isOpen) return null;

  // 프로젝트 이름에 특수문자가 있는지 검증 (영문, 숫자, 언더스코어, 하이픈만 허용)
  const hasSpecialCharacters = newProjectName && !/^[a-zA-Z0-9_-]*$/.test(newProjectName);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold">
            {selectedTab === 'local' ? t('create.createLocalProject') : t('create.createEC2Project')}
          </h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('create.projectName')}
            </label>
            <input
              type="text"
              value={newProjectName}
              onChange={(e) => onNameChange(e.target.value)}
              placeholder={t('create.projectNamePlaceholder')}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={creating}
              autoFocus
            />
            {hasSpecialCharacters && (
              <p className="mt-1 text-sm text-red-600">
                {t('create.specialCharactersError')}
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('create.projectPath')}
            </label>
            <div className="flex gap-3">
              <input
                type="text"
                value={newProjectPath}
                readOnly
                placeholder={t('create.projectPathPlaceholder')}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 focus:outline-none"
              />
              <button
                onClick={onSelectFolder}
                disabled={creating}
                className="w-10 h-10 flex items-center justify-center bg-white text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
                title={t('create.browseFolder')}
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
            {t('create.cancel')}
          </button>
          <button
            onClick={onCreate}
            disabled={creating || !!hasSpecialCharacters}
            className="flex-1 px-4 py-2 text-white rounded-lg disabled:opacity-50 transition-colors"
            style={{ backgroundColor: '#4C65E2' }}
            onMouseEnter={(e) => !creating && !hasSpecialCharacters && (e.currentTarget.style.backgroundColor = '#3B52C9')}
            onMouseLeave={(e) => !creating && !hasSpecialCharacters && (e.currentTarget.style.backgroundColor = '#4C65E2')}
          >
            {creating ? t('create.creating') : t('create.create')}
          </button>
        </div>
      </div>
    </div>
  );
}
