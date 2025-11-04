import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Globe, Key } from 'lucide-react';
import { useState, useEffect } from 'react';

type SettingsCategory = 'general' | 'api';

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

  // OpenAI API Key setting
  const [apiKey, setApiKey] = useState('');
  const [initialApiKey, setInitialApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);

  // Load API key from localStorage on mount
  useEffect(() => {
    const savedKey = localStorage.getItem('openai_api_key');
    if (savedKey) {
      setApiKey(savedKey);
      setInitialApiKey(savedKey);
    }
  }, []);

  // Save language to localStorage
  const handleLanguageChange = (newLanguage: 'en' | 'ko') => {
    setLanguage(newLanguage);
  };

  // Apply all settings
  const handleApply = () => {
    // Save language
    localStorage.setItem('app_language', language);
    setInitialLanguage(language);

    // Save API key
    if (apiKey.trim()) {
      localStorage.setItem('openai_api_key', apiKey.trim());
      setInitialApiKey(apiKey.trim());
    } else {
      localStorage.removeItem('openai_api_key');
      setInitialApiKey('');
    }
  };

  // Check if there are any changes
  const hasChanges = language !== initialLanguage || apiKey.trim() !== initialApiKey;

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
          <div className="max-w-3xl mx-auto p-6 space-y-6">

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
              <div className="bg-white rounded-lg border border-gray-200 p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 bg-green-50 rounded-lg flex items-center justify-center">
                    <Key className="w-5 h-5 text-green-600" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">OpenAI API Key</h2>
                    <p className="text-sm text-gray-500">Enter your OpenAI API key for AI features</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      API Key
                    </label>
                    <div className="relative">
                      <input
                        type={showApiKey ? 'text' : 'password'}
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        placeholder="sk-..."
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent pr-20"
                      />
                      <button
                        onClick={() => setShowApiKey(!showApiKey)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1 text-xs text-gray-600 hover:text-gray-900"
                      >
                        {showApiKey ? 'Hide' : 'Show'}
                      </button>
                    </div>
                  </div>

                  <p className="mt-2 text-xs text-gray-500">
                    Your API key is stored locally and never sent to our servers
                  </p>
                </div>
              </div>
            )}

          </div>
        </main>
      </div>

      {/* Footer with Close and Apply buttons */}
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
    </div>
  );
}
