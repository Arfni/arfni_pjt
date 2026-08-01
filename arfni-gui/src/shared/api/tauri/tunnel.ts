import { invoke } from '@tauri-apps/api/core';

export type TunnelKind = 'local' | 'remote' | 'dynamic';

/** ssh의 -L/-R/-D 문법을 그대로 옮긴 형태 (bind → target 순서). */
export interface TunnelSpec {
  kind: TunnelKind;
  /** -L/-D는 로컬에서, -R은 원격에서 바인드할 주소. 비우면 기본값 */
  bind_address?: string | null;
  bind_port: number;
  /** -D에서는 쓰이지 않는다 */
  target_host?: string | null;
  target_port?: number | null;
  label?: string | null;
}

export interface TunnelInfo {
  id: string;
  kind: TunnelKind;
  bind_address: string;
  bind_port: number;
  target_host: string | null;
  target_port: number | null;
  label: string | null;
  via: string;
  description: string;
}

export interface TunnelConnectParams {
  host: string;
  user: string;
  pem_path: string;
}

export const tunnelCommands = {
  open: (params: TunnelConnectParams, spec: TunnelSpec) =>
    invoke<string>('tunnel_open', { params, spec }),

  close: (id: string) => invoke<void>('tunnel_close', { id }),

  list: () => invoke<TunnelInfo[]>('tunnel_list'),
};

/** 로컬 포워딩만 브라우저로 열 수 있다. -R은 원격 바인드, -D는 SOCKS라 URL이 없다. */
export function browsableUrl(t: TunnelInfo): string | null {
  if (t.kind !== 'local') return null;
  // 0.0.0.0 / :: 로 바인드했더라도 이 PC에서 여는 주소는 루프백이다.
  const host =
    t.bind_address === '0.0.0.0' || t.bind_address === '' ? '127.0.0.1' : t.bind_address;
  const scheme = t.bind_port === 443 || t.target_port === 443 ? 'https' : 'http';
  return `${scheme}://${host}:${t.bind_port}`;
}

/**
 * 폼 입력 검증. 백엔드와 같은 규칙을 미리 걸러 왕복을 줄인다.
 *
 * 문구 대신 i18n 키를 돌려준다. 이 모듈은 UI 언어를 몰라야 한다.
 */
export interface SpecError {
  key: string;
  params?: Record<string, string>;
}

export function validateSpec(spec: TunnelSpec): SpecError | null {
  if (!Number.isInteger(spec.bind_port) || spec.bind_port < 1 || spec.bind_port > 65535) {
    return { key: 'tunnel.error.bindPort' };
  }
  if (spec.kind !== 'dynamic') {
    const tp = spec.target_port;
    if (!Number.isInteger(tp as number) || (tp as number) < 1 || (tp as number) > 65535) {
      return { key: 'tunnel.error.targetPort' };
    }
  }
  for (const [fieldKey, value] of [
    ['tunnel.field.bindAddressLocal', spec.bind_address],
    ['tunnel.field.targetHost', spec.target_host],
  ] as const) {
    if (value && value.includes(':')) {
      return { key: 'tunnel.error.colon', params: { field: fieldKey } };
    }
  }
  return null;
}
