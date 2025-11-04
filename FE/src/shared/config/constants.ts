export const APP_NAME = 'ARFNI';
export const APP_DESCRIPTION = 'AI와 우리의 인프라 사이, 클릭 한 번으로 가깝게!';

export const NAVIGATION_ITEMS = [
  { id: 'download', label: 'Download', href: '#download' },
  { id: 'features', label: 'Features', href: '#features' },
  { id: 'roadmap', label: 'Roadmap', href: '#roadmap' },
  { id: 'docs', label: 'Docs', href: '#docs' },
] as const;

export const SOCIAL_LINKS = {
  github: 'https://github.com/your-org/arfni',
  twitter: 'https://twitter.com/arfni',
  discord: 'https://discord.gg/arfni',
} as const;

export const DOWNLOAD_LINKS = {
  windows: '/downloads/ARFNI_Setup_x64.exe',
  mac: null, // Coming soon
  linux: null, // Coming soon
} as const;