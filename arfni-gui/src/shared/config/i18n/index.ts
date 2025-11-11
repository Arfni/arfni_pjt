import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// Import English translations
import enCommon from './locales/en/common.json';
import enDeployment from './locales/en/deployment.json';
import enProjects from './locales/en/projects.json';
import enLogs from './locales/en/logs.json';
import enCanvas from './locales/en/canvas.json';
import enDialogs from './locales/en/dialogs.json';
import enErrors from './locales/en/errors.json';

// Import Korean translations
import koCommon from './locales/ko/common.json';
import koDeployment from './locales/ko/deployment.json';
import koProjects from './locales/ko/projects.json';
import koLogs from './locales/ko/logs.json';
import koCanvas from './locales/ko/canvas.json';
import koDialogs from './locales/ko/dialogs.json';
import koErrors from './locales/ko/errors.json';

const resources = {
  en: {
    common: enCommon,
    deployment: enDeployment,
    projects: enProjects,
    logs: enLogs,
    canvas: enCanvas,
    dialogs: enDialogs,
    errors: enErrors,
  },
  ko: {
    common: koCommon,
    deployment: koDeployment,
    projects: koProjects,
    logs: koLogs,
    canvas: koCanvas,
    dialogs: koDialogs,
    errors: koErrors,
  },
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    defaultNS: 'common',
    ns: ['common', 'deployment', 'projects', 'logs', 'canvas', 'dialogs', 'errors'],
    interpolation: {
      escapeValue: false, // React already escapes values
    },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'i18nextLng',
    },
    react: {
      useSuspense: false, // Disable suspense for Tauri app
    },
  });

export default i18n;
