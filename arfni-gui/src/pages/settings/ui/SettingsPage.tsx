import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Globe, Key } from 'lucide-react';
import { useState, useEffect, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';

type SettingsCategory = 'general' | 'api';

// API Key types from ApiKeysPage
type ApiKeyMetaDto = {
  id: string;
  provider: string;
  label: string;
  created_at: string;
  updated_at: string;
  last_used_at?: string | null;
  is_active: boolean;
};

type AddKeyParams = {
  provider: string;
  label: string;
  api_key: string;
  set_active: boolean;
};

const PROVIDERS = ['openai', 'anthropic', 'google', 'etc'] as const;

export default function SettingsPage() {
  const navigate = useNavigate();

  // Selected category
  const [selectedCategory, setSelectedCategory] = useState<SettingsCategory>('general');

  // Language setting
  const [language, setLanguage] = useState<'en' | 'ko'>(() => {
    const saved = localStorage.getItem('app_language');
    return (saved === 'en' || saved === 'ko') ? saved : 'en';
  });
  const [initialLanguage, setInitialLanguage] = useState<'en' | 'ko'>(() => {
    const saved = localStorage.getItem('app_language');
    return (saved === 'en' || saved === 'ko') ? saved : 'en';
  });

  // API Keys management
  const [apiKeys, setApiKeys] = useState<ApiKeyMetaDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  // Add API key form
  const [provider, setProvider] = useState<(typeof PROVIDERS)[number]>('openai');
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
    } catch (e: any) {
      console.error(e);
      alert(`API 키 불러오기 실패: ${e}`);
    } finally {
      setLoading(false);
    }
  }

  // Load API keys when switching to API tab
  useEffect(() => {
    if (selectedCategory === 'api') {
      fetchApiKeys();
    }
  }, [selectedCategory]);

  // Add or update API key
  async function handleAddApiKey(e: React.FormEvent) {
    e.preventDefault();
    if (!label.trim() || !apiKeyInput.trim()) {
      alert('Label과 API Key는 필수입니다.');
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
      setLabel('');
      setApiKeyInput('');
      setSetActive(true);
      await fetchApiKeys();
    } catch (e: any) {
      console.error(e);
      alert(`추가/업데이트 실패: ${e}`);
    } finally {
      setBusy(null);
    }
  }

  // Delete API key
  async function handleDeleteApiKey(id: string) {
    if (!confirm('정말 삭제할까요? 되돌릴 수 없습니다.')) return;
    setBusy(`del:${id}`);
    try {
      await invoke('delete_api_key', { id });
      await fetchApiKeys();
    } catch (e: any) {
      console.error(e);
      alert(`삭제 실패: ${e}`);
    } finally {
      setBusy(null);
    }
  }

  // Set active API key
  async function handleSetActive(id: string) {
    setBusy(`active:${id}`);
    try {
      await invoke('set_active_api_key', { id });
      await fetchApiKeys();
    } catch (e: any) {
      console.error(e);
      alert(`활성화 실패: ${e}`);
    } finally {
      setBusy(null);
    }
  }

  // Copy active key to clipboard
  async function handleCopyActiveKey(provider: string) {
    try {
      const key = await invoke<string | null>('get_active_api_key', { provider });
      if (!key) {
        alert('활성화된 키가 없습니다.');
        return;
      }
      await navigator.clipboard.writeText(key);
      alert('활성 키가 클립보드에 복사되었습니다.');
    } catch (e: any) {
      console.error(e);
      alert(`키 가져오기 실패: ${e}`);
    }
  }

  const busyCheck = (token: string) => busy === token;

  // Save language to localStorage
  const handleLanguageChange = (newLanguage: 'en' | 'ko') => {
    setLanguage(newLanguage);
  };

  // Apply language settings
  const handleApply = () => {
    localStorage.setItem('app_language', language);
    setInitialLanguage(language);
  };

  // Check if there are any changes
  const hasChanges = language !== initialLanguage;

  // Close without saving
  const handleClose = () => {
    navigate('/projects');
  };

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/projects')}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-xl font-semibold">Settings</h1>
        </div>
      </header>

      {/* Main Content with Sidebar */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar Menu */}
        <aside className="w-64 bg-white border-r border-gray-200 overflow-y-auto">
          <nav className="p-4 space-y-1">
            <button
              onClick={() => setSelectedCategory('general')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors text-left ${
                selectedCategory === 'general'
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              <Globe className="w-5 h-5" />
              <span className="font-medium">General</span>
            </button>

            <button
              onClick={() => setSelectedCategory('api')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors text-left ${
                selectedCategory === 'api'
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              <Key className="w-5 h-5" />
              <span className="font-medium">API Keys</span>
            </button>
          </nav>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-4xl mx-auto p-6 space-y-6">

            {/* General Settings */}
            {selectedCategory === 'general' && (
              <div className="bg-white rounded-lg border border-gray-200 p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
                    <Globe className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">Language</h2>
                    <p className="text-sm text-gray-500">Select your preferred language</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <button
                    onClick={() => handleLanguageChange('en')}
                    className={`w-full px-4 py-3 rounded-lg border-2 transition-colors text-left ${
                      language === 'en'
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium text-gray-900">English</div>
                        <div className="text-sm text-gray-500">English (United States)</div>
                      </div>
                      {language === 'en' && (
                        <div className="w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center">
                          <div className="w-2 h-2 bg-white rounded-full"></div>
                        </div>
                      )}
                    </div>
                  </button>

                  <button
                    onClick={() => handleLanguageChange('ko')}
                    className={`w-full px-4 py-3 rounded-lg border-2 transition-colors text-left ${
                      language === 'ko'
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium text-gray-900">한국어</div>
                        <div className="text-sm text-gray-500">Korean (대한민국)</div>
                      </div>
                      {language === 'ko' && (
                        <div className="w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center">
                          <div className="w-2 h-2 bg-white rounded-full"></div>
                        </div>
                      )}
                    </div>
                  </button>
                </div>
              </div>
            )}

            {/* API Keys Settings */}
            {selectedCategory === 'api' && (
              <div className="space-y-6">
                {/* Header */}
                <div className="bg-white rounded-lg border border-gray-200 p-6">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-green-50 rounded-lg flex items-center justify-center">
                        <Key className="w-5 h-5 text-green-600" />
                      </div>
                      <div>
                        <h2 className="text-lg font-semibold text-gray-900">API Keys</h2>
                        <p className="text-sm text-gray-500">Manage your API keys for different providers</p>
                      </div>
                    </div>
                    <button
                      onClick={fetchApiKeys}
                      className="px-3 py-1.5 text-sm rounded-md border border-gray-300 hover:bg-gray-50 transition-colors"
                      disabled={loading}
                    >
                      {loading ? 'Loading...' : 'Refresh'}
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    Provider별로 여러 개의 키를 저장할 수 있습니다. 각 Provider에서는 <b>항상 하나만 활성화</b>됩니다.
                  </p>
                </div>

                {/* Add/Update Form */}
                <div className="bg-white rounded-lg border border-gray-200 p-6">
                  <h3 className="font-semibold text-gray-900 mb-4">Add / Update API Key</h3>
                  <form className="space-y-4" onSubmit={handleAddApiKey}>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Provider
                        </label>
                        <select
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          value={provider}
                          onChange={(e) => setProvider(e.target.value as any)}
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
                          Label
                        </label>
                        <input
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          placeholder="예: dev / prod / personal"
                          value={label}
                          onChange={(e) => setLabel(e.target.value)}
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        API Key
                      </label>
                      <div className="relative">
                        <input
                          type={showApiKeyInput ? 'text' : 'password'}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent pr-20"
                          placeholder="sk-..."
                          value={apiKeyInput}
                          onChange={(e) => setApiKeyInput(e.target.value)}
                        />
                        <button
                          type="button"
                          onClick={() => setShowApiKeyInput(!showApiKeyInput)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1 text-xs text-gray-600 hover:text-gray-900"
                        >
                          {showApiKeyInput ? 'Hide' : 'Show'}
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <label className="flex items-center gap-2 text-sm text-gray-700">
                        <input
                          type="checkbox"
                          checked={setActive}
                          onChange={(e) => setSetActive(e.target.checked)}
                          className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                        />
                        저장 후 활성화
                      </label>

                      <button
                        type="submit"
                        disabled={busyCheck('add')}
                        className={`px-6 py-2 rounded-lg text-white font-medium transition-colors ${
                          busyCheck('add') ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'
                        }`}
                      >
                        {busyCheck('add') ? 'Saving...' : 'Save'}
                      </button>
                    </div>
                  </form>
                </div>

                {/* Saved Keys List */}
                <div className="bg-white rounded-lg border border-gray-200 p-6">
                  <h3 className="font-semibold text-gray-900 mb-4">Saved Keys</h3>

                  {sortedApiKeys.length === 0 && !loading && (
                    <p className="text-sm text-gray-500 text-center py-8">저장된 키가 없습니다.</p>
                  )}

                  <div className="space-y-3">
                    {sortedApiKeys.map((item) => (
                      <div
                        key={item.id}
                        className={`border rounded-lg p-4 transition-colors ${
                          item.is_active ? 'border-green-300 bg-green-50' : 'border-gray-200'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-4">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-xs px-2 py-0.5 rounded-full border border-gray-300 bg-white font-medium">
                                {item.provider}
                              </span>
                              <span className="font-medium text-gray-900">{item.label}</span>
                              {item.is_active && (
                                <span className="text-xs px-2 py-0.5 rounded-full bg-green-600 text-white font-medium">
                                  Active
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-gray-500">
                              Updated: {new Date(item.updated_at).toLocaleString()}
                              {item.last_used_at && ` · Last used: ${new Date(item.last_used_at).toLocaleString()}`}
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              className="px-3 py-1.5 text-xs rounded-md border border-gray-300 hover:bg-gray-50 transition-colors"
                              onClick={() => handleCopyActiveKey(item.provider)}
                              title="활성 키 복사"
                            >
                              Copy Active
                            </button>

                            {!item.is_active && (
                              <button
                                className="px-3 py-1.5 text-xs rounded-md border border-gray-300 hover:bg-gray-50 transition-colors"
                                onClick={() => handleSetActive(item.id)}
                                disabled={busyCheck(`active:${item.id}`)}
                              >
                                {busyCheck(`active:${item.id}`) ? '...' : 'Set Active'}
                              </button>
                            )}

                            <button
                              className="px-3 py-1.5 text-xs rounded-md border border-red-300 text-red-600 hover:bg-red-50 transition-colors"
                              onClick={() => handleDeleteApiKey(item.id)}
                              disabled={busyCheck(`del:${item.id}`)}
                            >
                              {busyCheck(`del:${item.id}`) ? '...' : 'Delete'}
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

          </div>
        </main>
      </div>

      {/* Footer with Close and Apply buttons (only for general settings) */}
      {selectedCategory === 'general' && (
        <footer className="bg-white border-t border-gray-200 px-6 py-4">
          <div className="flex items-center justify-end gap-3">
            <button
              onClick={handleClose}
              className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Close
            </button>
            <button
              onClick={handleApply}
              disabled={!hasChanges}
              className="px-6 py-2 text-white rounded-lg transition-colors"
              style={{
                backgroundColor: hasChanges ? '#4C65E2' : '#9CA3AF',
                cursor: hasChanges ? 'pointer' : 'default',
                opacity: hasChanges ? 1 : 1
              }}
              onMouseEnter={(e) => {
                if (hasChanges) {
                  e.currentTarget.style.opacity = '0.9';
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.opacity = '1';
              }}
            >
              Apply
            </button>
          </div>
        </footer>
      )}

      {/* Footer for API Keys tab */}
      {selectedCategory === 'api' && (
        <footer className="bg-white border-t border-gray-200 px-6 py-4">
          <div className="flex items-center justify-end">
            <button
              onClick={handleClose}
              className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Close
            </button>
          </div>
        </footer>
      )}
    </div>
  );
}
