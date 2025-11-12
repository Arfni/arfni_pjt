import React, { useState, useEffect, useMemo } from 'react';
import { Key, Plus, X, Copy, Trash2, Eye, EyeOff } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { useTranslation } from 'react-i18next';
import { ApiKeyMetaDto, AddKeyParams, PROVIDERS, ProviderType } from './types';

interface ApiKeysSettingsProps {
  isActive: boolean;
  onHasChanges?: (hasChanges: boolean) => void;
  onApplyRequested?: () => void;
}

export function ApiKeysSettings({ isActive, onHasChanges, onApplyRequested }: ApiKeysSettingsProps) {
  const { t } = useTranslation('common');

  // API Keys management
  const [apiKeys, setApiKeys] = useState<ApiKeyMetaDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  // Selection state (for staged activation)
  const [selectedKeyId, setSelectedKeyId] = useState<string | null>(null);
  const [initialSelectedKeyId, setInitialSelectedKeyId] = useState<string | null>(null);

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [deleteConfirmModal, setDeleteConfirmModal] = useState<string | null>(null);

  // Add API key form
  const [provider, setProvider] = useState<ProviderType>('openai');
  const [label, setLabel] = useState('');
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [setActive, setSetActive] = useState(true);
  const [showApiKeyInput, setShowApiKeyInput] = useState(false);

  // Sorted API keys
  const sortedApiKeys = useMemo(() => {
    return [...apiKeys].sort((a, b) =>
      a.provider === b.provider ? a.label.localeCompare(b.label) : a.provider.localeCompare(b.provider)
    );
  }, [apiKeys]);

  // Fetch API keys
  async function fetchApiKeys() {
    setLoading(true);
    try {
      const data = await invoke<ApiKeyMetaDto[]>('list_api_keys');
      setApiKeys(data);

      // Initialize selection with active key
      const activeKey = data.find((key) => key.is_active);
      if (activeKey) {
        setSelectedKeyId(activeKey.id);
        setInitialSelectedKeyId(activeKey.id);
      }
    } catch (e: any) {
      console.error(e);
      alert(t('settings.messages.loadFailed', { error: e }));
    } finally {
      setLoading(false);
    }
  }

  // Load API keys when component becomes active
  useEffect(() => {
    if (isActive) {
      fetchApiKeys();
    }
  }, [isActive]);

  // Notify parent of changes
  useEffect(() => {
    const hasChanges = selectedKeyId !== initialSelectedKeyId;
    if (onHasChanges) {
      onHasChanges(hasChanges);
    }
  }, [selectedKeyId, initialSelectedKeyId, onHasChanges]);

  // Reset form and close modal
  const closeModal = () => {
    setIsModalOpen(false);
    setLabel('');
    setApiKeyInput('');
    setSetActive(true);
    setShowApiKeyInput(false);
    setProvider('openai');
  };

  // Add or update API key
  async function handleAddApiKey(e: React.FormEvent) {
    e.preventDefault();
    if (!label.trim() || !apiKeyInput.trim()) {
      alert(t('settings.messages.labelAndKeyRequired'));
      return;
    }
    setBusy('add');
    try {
      const params: AddKeyParams = {
        provider,
        label: label.trim(),
        api_key: apiKeyInput.trim(),
        set_active: setActive,
      };
      await invoke('add_api_key', { params });
      await fetchApiKeys();
      closeModal();
    } catch (e: any) {
      console.error(e);
      alert(t('settings.messages.addUpdateFailed', { error: e }));
    } finally {
      setBusy(null);
    }
  }

  // Delete API key - open confirmation modal
  function handleDeleteApiKey(id: string) {
    setDeleteConfirmModal(id);
  }

  // Confirm and execute delete
  async function confirmDelete() {
    if (!deleteConfirmModal) return;
    const id = deleteConfirmModal;
    setDeleteConfirmModal(null);
    setBusy(`del:${id}`);
    try {
      await invoke('delete_api_key', { id });
      await fetchApiKeys();
    } catch (e: any) {
      console.error(e);
      alert(t('settings.messages.deleteFailed', { error: e }));
    } finally {
      setBusy(null);
    }
  }

  // Apply selected key (called from parent's Apply button)
  async function handleApplySelection() {
    // No changes made
    if (selectedKeyId === initialSelectedKeyId) {
      return;
    }
    setBusy('apply');
    try {
      if (selectedKeyId === null) {
        // Deactivate all active keys
        await invoke('deactivate_all_api_keys');
      } else {
        // Activate the selected key
        await invoke('set_active_api_key', { id: selectedKeyId });
      }
      await fetchApiKeys();
      setInitialSelectedKeyId(selectedKeyId);
    } catch (e: any) {
      console.error(e);
      alert(t('settings.messages.activateFailed', { error: e }));
    } finally {
      setBusy(null);
    }
  }

  // Expose apply handler to parent
  useEffect(() => {
    if (onApplyRequested) {
      // Store reference to apply handler
      (window as any).__apiKeysApplyHandler = handleApplySelection;
    }
  }, [onApplyRequested, selectedKeyId, initialSelectedKeyId]);

  // Copy active key to clipboard
  async function handleCopyActiveKey(provider: string) {
    try {
      const key = await invoke<string | null>('get_active_api_key', { provider });
      if (!key) {
        alert(t('settings.messages.noActiveKey'));
        return;
      }
      await navigator.clipboard.writeText(key);
      alert(t('settings.messages.keyCopied'));
    } catch (e: any) {
      console.error(e);
      alert(t('settings.messages.getCopyFailed', { error: e }));
    }
  }

  const busyCheck = (token: string) => busy === token;

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 bg-green-50 rounded-lg flex items-center justify-center">
            <Key className="w-5 h-5 text-green-600" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{t('settings.apiKeys.title')}</h2>
            <p className="text-sm text-gray-500">{t('settings.apiKeys.description')}</p>
          </div>
        </div>
        <p className="text-xs text-gray-500 mt-2" dangerouslySetInnerHTML={{ __html: t('settings.apiKeys.note') }} />
      </div>

      {/* Divider */}
      <div className="border-t border-gray-200 mb-6"></div>

      {/* Saved Keys List */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">{t('settings.apiKeys.savedKeys')}</h3>
          <div className="flex items-center gap-2">
            <button
              onClick={(e) => {
                e.preventDefault();
                const hasActiveKey = apiKeys.some(key => key.is_active);
                if (!hasActiveKey) return; // Do nothing when disabled

                const activeKey = apiKeys.find(key => key.is_active);
                if (activeKey) {
                  handleCopyActiveKey(activeKey.provider);
                }
              }}
              className={`px-3 py-2 flex items-center gap-2 border border-gray-300 rounded-lg transition-all cursor-pointer active:scale-95 ${
                apiKeys.some(key => key.is_active)
                  ? 'text-gray-700 hover:bg-gray-50 active:bg-gray-100'
                  : 'text-gray-400'
              }`}
              type="button"
            >
              <Copy className="w-4 h-4" />
              <span className="text-sm font-medium">{t('settings.apiKeys.copyActiveKey')}</span>
            </button>
            <button
              onClick={() => setIsModalOpen(true)}
              className="px-3 py-2 flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-all active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span className="text-sm font-medium">{t('settings.apiKeys.addApiKey')}</span>
            </button>
          </div>
        </div>

        {sortedApiKeys.length === 0 && !loading && (
          <p className="text-sm text-gray-500 text-center py-8">{t('settings.apiKeys.noKeys')}</p>
        )}

        <div className="space-y-3">
          {sortedApiKeys.map((item) => {
            const isSelected = selectedKeyId === item.id;
            return (
              <div
                key={item.id}
                onClick={() => setSelectedKeyId(selectedKeyId === item.id ? null : item.id)}
                className={`border rounded-lg p-4 transition-colors cursor-pointer ${
                  isSelected ? 'border-[#59A055] bg-green-50' : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-gray-900">{item.label}</span>
                      <span className="text-xs px-2 py-0.5 rounded-full border border-gray-300 bg-white font-medium">
                        {item.provider}
                      </span>
                      {item.is_active && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">
                          {t('settings.apiKeys.active')}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500">
                      {t('settings.apiKeys.updated')}: {new Date(item.updated_at).toLocaleString()}
                      {item.last_used_at && ` · ${t('settings.apiKeys.lastUsed')}: ${new Date(item.last_used_at).toLocaleString()}`}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      className="p-2 rounded-md border border-red-300 text-red-600 hover:bg-red-50 transition-colors"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteApiKey(item.id);
                      }}
                      disabled={busyCheck(`del:${item.id}`)}
                      title={t('buttons.delete')}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Add/Update Key Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={closeModal}>
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900">
                {t('settings.apiKeys.addApiKey')}
              </h2>
              <button
                onClick={closeModal}
                className="p-1 hover:bg-gray-100 rounded transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleAddApiKey} className="p-6">
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {t('settings.apiKeys.provider')}
                    </label>
                    <select
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      value={provider}
                      onChange={(e) => setProvider(e.target.value as ProviderType)}
                    >
                      {PROVIDERS.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {t('settings.apiKeys.label')}
                    </label>
                    <input
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder={t('settings.apiKeys.labelPlaceholder')}
                      value={label}
                      onChange={(e) => setLabel(e.target.value)}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {t('settings.apiKeys.apiKey')}
                  </label>
                  <div className="relative">
                    <input
                      type={showApiKeyInput ? 'text' : 'password'}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent pr-12"
                      placeholder={t('settings.apiKeys.apiKeyPlaceholder')}
                      value={apiKeyInput}
                      onChange={(e) => setApiKeyInput(e.target.value)}
                    />
                    <button
                      type="button"
                      onClick={() => setShowApiKeyInput(!showApiKeyInput)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-gray-600 hover:text-gray-900 rounded transition-colors"
                      title={showApiKeyInput ? t('settings.apiKeys.hide') : t('settings.apiKeys.show')}
                    >
                      {showApiKeyInput ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={setActive}
                      onChange={(e) => setSetActive(e.target.checked)}
                      className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    />
                    {t('settings.apiKeys.setActiveAfterSave')}
                  </label>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="flex items-center justify-end gap-3 mt-6 pt-6 border-t border-gray-200">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  {t('buttons.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={busyCheck('add')}
                  className={`px-6 py-2 rounded-lg text-white font-medium transition-colors ${
                    busyCheck('add') ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'
                  }`}
                >
                  {busyCheck('add') ? t('status.saving') : t('buttons.save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setDeleteConfirmModal(null)}>
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900">{t('buttons.delete')}</h2>
              <button
                onClick={() => setDeleteConfirmModal(null)}
                className="p-1 hover:bg-gray-100 rounded transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6">
              <p className="text-gray-700">{t('settings.messages.deleteConfirm')}</p>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end gap-3 px-6 pb-6">
              <button
                onClick={() => setDeleteConfirmModal(null)}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                {t('buttons.cancel')}
              </button>
              <button
                onClick={confirmDelete}
                className="px-6 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors"
              >
                {t('buttons.delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
