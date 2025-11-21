import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// Import translations
import koCommon from './locales/ko/common.json';
import koHero from './locales/ko/hero.json';
import koFeatures from './locales/ko/features.json';
import koIntegrations from './locales/ko/integrations.json';

import enCommon from './locales/en/common.json';
import enHero from './locales/en/hero.json';
import enFeatures from './locales/en/features.json';
import enIntegrations from './locales/en/integrations.json';
import enDownload from './locales/en/download.json';

import jaCommon from './locales/ja/common.json';
import jaHero from './locales/ja/hero.json';
import jaFeatures from './locales/ja/features.json';
import jaIntegrations from './locales/ja/integrations.json';
import jaDownload from './locales/ja/download.json';
import koDownload from './locales/ko/download.json';
import koDoc from './locales/ko/doc.json';
import koReleaseNotes from './locales/ko/releaseNotes.json';
import enDoc from './locales/en/doc.json';
import enReleaseNotes from './locales/en/releaseNotes.json';
import jaDoc from './locales/ja/doc.json';
import jaReleaseNotes from './locales/ja/releaseNotes.json';

const resources = {
  ko: {
    common: koCommon,
    hero: koHero,
    features: koFeatures,
    integrations: koIntegrations,
    download: koDownload,
    doc: koDoc,
    releaseNotes: koReleaseNotes,
  },
  en: {
    common: enCommon,
    hero: enHero,
    features: enFeatures,
    integrations: enIntegrations,
    download: enDownload,
    doc: enDoc,
    releaseNotes: enReleaseNotes,
  },
  ja: {
    common: jaCommon,
    hero: jaHero,
    features: jaFeatures,
    integrations: jaIntegrations,
    download: jaDownload,
    doc: jaDoc,
    releaseNotes: jaReleaseNotes,
  },
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'ko',
    defaultNS: 'common',
    ns: [
      'common',
      'hero',
      'features',
      'integrations',
      'download',
      'doc',
      'releaseNotes',
    ],

    interpolation: {
      escapeValue: false,
    },

    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
    },
  });

export default i18n;
