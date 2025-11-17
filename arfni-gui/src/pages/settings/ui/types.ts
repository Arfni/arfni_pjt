export type SettingsCategory = 'general' | 'api';

export type ApiKeyMetaDto = {
  id: string;
  provider: string;
  label: string;
  created_at: string;
  updated_at: string;
  last_used_at?: string | null;
  is_active: boolean;
};

export type AddKeyParams = {
  provider: string;
  label: string;
  api_key: string;
  set_active: boolean;
};

export const PROVIDERS = ['OpenAI', 'anthropic', 'google', 'etc'] as const;
export type ProviderType = (typeof PROVIDERS)[number];
