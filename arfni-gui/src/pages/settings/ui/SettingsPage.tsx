import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Globe, Key } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SettingsCategory } from './types';
import { GeneralSettings } from './GeneralSettings';
import { ApiKeysSettings } from './ApiKeysSettings';

export default function SettingsPage() {
  const navigate = useNavigate();
  const { i18n, t } = useTranslation('common');

  // Selected category
  const [selectedCategory, setSelectedCategory] = useState<SettingsCategory>('general');

  // Language setting - read from i18n
  const [language, setLanguage] = useState<'en' | 'ko'>(() => {
    const current = i18n.language;
    return (current === 'ko') ? 'ko' : 'en';
  });
  const [initialLanguage, setInitialLanguage] = useState<'en' | 'ko'>(() => {
    const current = i18n.language;
    return (current === 'ko') ? 'ko' : 'en';
  });

  // API Keys changes tracking
  const [hasApiKeyChanges, setHasApiKeyChanges] = useState(false);

  // Check if there are changes (for Apply button)
  const hasLanguageChanges = language !== initialLanguage;
  const hasChanges = selectedCategory === 'general' ? hasLanguageChanges : hasApiKeyChanges;

  // Save language to localStorage
  const handleLanguageChange = (newLanguage: 'en' | 'ko') => {
    setLanguage(newLanguage);
  };

  // Apply settings based on current tab
  const handleApply = async () => {
    if (selectedCategory === 'general' && hasLanguageChanges) {
      // Apply language change
      i18n.changeLanguage(language);
      setInitialLanguage(language);
    } else if (selectedCategory === 'api' && hasApiKeyChanges) {
      // Apply API key change
      const handler = (window as any).__apiKeysApplyHandler;
      if (handler) {
        await handler();
      }
    }
  };

  // Navigate back to projects
  const handleClose = () => {
    navigate('/projects');
  };

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/projects')}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            title={t('settings.backToProjects')}
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-xl font-semibold">{t('settings.title')}</h1>
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
              <span className="font-medium">{t('settings.sidebar.general')}</span>
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
              <span className="font-medium">{t('settings.sidebar.apiKeys')}</span>
            </button>
          </nav>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-4xl mx-auto p-6 space-y-6">
            {/* General Settings */}
            {selectedCategory === 'general' && (
              <GeneralSettings
                language={language}
                onLanguageChange={handleLanguageChange}
              />
            )}

            {/* API Keys Settings */}
            {selectedCategory === 'api' && (
              <ApiKeysSettings
                isActive={selectedCategory === 'api'}
                onHasChanges={setHasApiKeyChanges}
                onApplyRequested={() => {}}
              />
            )}
          </div>
        </main>
      </div>

      {/* Unified Footer with Close and Apply buttons */}
      <footer className="bg-white border-t border-gray-200 px-6 py-4">
        <div className="flex items-center justify-end gap-3">
          <button
            onClick={handleClose}
            className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
          >
            {t('buttons.close')}
          </button>
          <button
            onClick={handleApply}
            disabled={!hasChanges}
            className="px-6 py-2 text-white rounded-lg transition-colors"
            style={{
              backgroundColor: hasChanges ? '#4C65E2' : '#9CA3AF',
              cursor: hasChanges ? 'pointer' : 'default',
              opacity: 1
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
            {t('buttons.apply')}
          </button>
        </div>
      </footer>
    </div>
  );
}
