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

import jaCommon from './locales/ja/common.json';
import jaHero from './locales/ja/hero.json';
import jaFeatures from './locales/ja/features.json';
import jaIntegrations from './locales/ja/integrations.json';

const resources = {
  ko: {
    common: koCommon,
    hero: koHero,
    features: koFeatures,
    integrations: koIntegrations,
  },
  en: {
    common: enCommon,
    hero: enHero,
    features: enFeatures,
    integrations: enIntegrations,
  },
  ja: {
    common: jaCommon,
    hero: jaHero,
    features: jaFeatures,
    integrations: jaIntegrations,
  },
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'ko',
    defaultNS: 'common',
    ns: ['common', 'hero', 'features', 'integrations'],

    interpolation: {
      escapeValue: false,
    },

    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
    },
  });

export default i18n;