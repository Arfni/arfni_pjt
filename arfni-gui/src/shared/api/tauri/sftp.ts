import { invoke } from '@tauri-apps/api/core';

export interface SftpEntry {
  name: string;
  path: string;
  is_dir: boolean;
  is_symlink: boolean;
  size: number;
  /** unix epoch seconds */
  mtime: number | null;
  permissions: number | null;
  /** "drwxr-xr-x" */
  mode: string;
}

export interface SftpProgress {
  id: string;
  transfer_id: string;
  name: string;
  direction: 'download' | 'upload';
  transferred: number;
  total: number;
  done: boolean;
}

export interface SftpTextPreview {
  text: string;
  /** maxBytes를 넘어 잘렸는지 */
  truncated: boolean;
  /** NUL 바이트가 있어 텍스트로 보기 부적합한지 */
  likely_binary: boolean;
  /** 원본 전체 크기 (bytes) */
  size: number;
}

export interface SftpConnectParams {
  host: string;
  user: string;
  pem_path: string;
}

export const sftpCommands = {
  connect: (params: SftpConnectParams) => invoke<string>('sftp_connect', { params }),

  disconnect: (id: string) => invoke<void>('sftp_disconnect', { id }),

  home: (id: string) => invoke<string>('sftp_home', { id }),

  canonicalize: (id: string, path: string) => invoke<string>('sftp_canonicalize', { id, path }),

  list: (id: string, path: string) => invoke<SftpEntry[]>('sftp_list', { id, path }),

  mkdir: (id: string, path: string) => invoke<void>('sftp_mkdir', { id, path }),

  rename: (id: string, from: string, to: string) => invoke<void>('sftp_rename', { id, from, to }),

  remove: (id: string, path: string) => invoke<void>('sftp_remove', { id, path }),

  readText: (id: string, path: string, maxBytes?: number) =>
    invoke<SftpTextPreview>('sftp_read_text', { id, path, maxBytes }),

  download: (id: string, remotePath: string, localPath: string) =>
    invoke<number>('sftp_download', { id, remotePath, localPath }),

  upload: (id: string, localPath: string, remotePath: string) =>
    invoke<number>('sftp_upload', { id, localPath, remotePath }),
};

/** 원격 경로는 항상 POSIX. Windows 구분자가 섞이면 안 된다. */
export function joinRemote(base: string, name: string): string {
  if (base === '/') return `/${name}`;
  return `${base.replace(/\/+$/, '')}/${name}`;
}

export function parentRemote(path: string): string {
  const trimmed = path.replace(/\/+$/, '');
  if (!trimmed || trimmed === '') return '/';
  const idx = trimmed.lastIndexOf('/');
  if (idx <= 0) return '/';
  return trimmed.slice(0, idx);
}

/**
 * 사용자 입력을 절대 경로로 만든다.
 *
 * SFTP 프로토콜에는 CWD 개념이 없다. `SSH_FXP_REALPATH`에 상대 경로를 주면 서버가
 * 무조건 **홈 기준**으로 푼다. 그래서 `/opt`에서 `logs`를 입력하면 `/opt/logs`가 아니라
 * `/home/ubuntu/logs`를 찾다가 "No such file"이 난다.
 * 표시 중인 cwd를 직접 붙여 절대 경로로 바꿔 보내야 한다.
 *
 * `~`는 sftp-server가 확장해 주지 않으므로 여기서 home으로 치환한다.
 */
export function resolveRemotePath(cwd: string, input: string, home?: string): string {
  const raw = input.trim();
  if (!raw) return cwd && cwd.startsWith('/') ? cwd : '/';

  let base: string;
  let rest: string;

  if (raw === '~' || raw.startsWith('~/')) {
    base = home && home.startsWith('/') ? home : '/';
    rest = raw === '~' ? '' : raw.slice(2);
  } else if (raw.startsWith('/')) {
    base = '/';
    rest = raw;
  } else {
    base = cwd && cwd.startsWith('/') ? cwd : '/';
    rest = raw;
  }

  const segments = base.split('/').filter(Boolean);
  for (const seg of rest.split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') {
      segments.pop();
      continue;
    }
    segments.push(seg);
  }

  return `/${segments.join('/')}`;
}

export function baseName(path: string): string {
  const parts = path.split(/[/\\]/);
  return parts[parts.length - 1] || path;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}

export function formatMtime(epochSeconds: number | null): string {
  if (!epochSeconds) return '';
  const d = new Date(epochSeconds * 1000);
  const pad = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}`;
}
