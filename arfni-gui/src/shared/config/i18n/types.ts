import 'react-i18next';
import type common from './locales/en/common.json';
import type deployment from './locales/en/deployment.json';
import type projects from './locales/en/projects.json';
import type logs from './locales/en/logs.json';
import type canvas from './locales/en/canvas.json';
import type dialogs from './locales/en/dialogs.json';
import type errors from './locales/en/errors.json';

declare module 'react-i18next' {
  interface CustomTypeOptions {
    defaultNS: 'common';
    resources: {
      common: typeof common;
      deployment: typeof deployment;
      projects: typeof projects;
      logs: typeof logs;
      canvas: typeof canvas;
      dialogs: typeof dialogs;
      errors: typeof errors;
    };
  }
}
