import React from 'react';
import { Globe } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface GeneralSettingsProps {
  language: 'en' | 'ko';
  onLanguageChange: (newLanguage: 'en' | 'ko') => void;
}

export function GeneralSettings({ language, onLanguageChange }: GeneralSettingsProps) {
  const { t } = useTranslation('common');

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
          <Globe className="w-5 h-5 text-blue-600" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-gray-900">{t('settings.general.language.title')}</h2>
          <p className="text-sm text-gray-500">{t('settings.general.language.description')}</p>
        </div>
      </div>

      <div className="space-y-2">
        <button
          onClick={() => onLanguageChange('en')}
          className={`w-full px-4 py-3 rounded-lg border-2 transition-colors text-left ${
            language === 'en'
              ? 'border-blue-500 bg-blue-50'
              : 'border-gray-200 hover:border-gray-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium text-gray-900">{t('settings.general.language.english')}</div>
              <div className="text-sm text-gray-500">{t('settings.general.language.englishFull')}</div>
            </div>
            {language === 'en' && (
              <div className="w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center">
                <div className="w-2 h-2 bg-white rounded-full"></div>
              </div>
            )}
          </div>
        </button>

        <button
          onClick={() => onLanguageChange('ko')}
          className={`w-full px-4 py-3 rounded-lg border-2 transition-colors text-left ${
            language === 'ko'
              ? 'border-blue-500 bg-blue-50'
              : 'border-gray-200 hover:border-gray-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium text-gray-900">{t('settings.general.language.korean')}</div>
              <div className="text-sm text-gray-500">{t('settings.general.language.koreanFull')}</div>
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
  );
}
