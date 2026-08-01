import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Folder,
  FileText,
  Crosshair,
  Link2,
  ArrowUp,
  Home,
  RefreshCw,
  FolderPlus,
  Upload,
  Download,
  Trash2,
  Pencil,
  Eye,
  X,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { listen } from '@tauri-apps/api/event';
import { open as openDialog, save as saveDialog, confirm } from '@tauri-apps/plugin-dialog';
import { EC2Server } from '@shared/api/tauri/commands';
import { useTranslation } from 'react-i18next';
import {
  sftpCommands,
  SftpEntry,
  SftpProgress,
  SftpTextPreview,
  joinRemote,
  resolveRemotePath,
  parentRemote,
  baseName,
  formatBytes,
  formatMtime,
} from '@shared/api/tauri/sftp';

const FOLLOW_KEY = 'arfni.sftpFollowTerminal';

interface SftpPanelProps {
  ec2Server: EC2Server | null;
  /** 활성 터미널의 원격 작업 디렉터리. 따라가기가 켜져 있으면 여기로 이동한다. */
  followPath?: string | null;
  onClose: () => void;
}

interface Transfer {
  transferId: string;
  name: string;
  direction: 'download' | 'upload';
  transferred: number;
  total: number;
  done: boolean;
}

type Prompt =
  | { kind: 'mkdir' }
  | { kind: 'rename'; entry: SftpEntry }
  | null;

export function SftpPanel({ ec2Server, followPath, onClose }: SftpPanelProps) {
  const { t } = useTranslation('logs');
  const [follow, setFollow] = useState(() => localStorage.getItem(FOLLOW_KEY) !== '0');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [cwd, setCwd] = useState('');
  const [entries, setEntries] = useState<SftpEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [prompt, setPrompt] = useState<Prompt>(null);
  const [promptValue, setPromptValue] = useState('');
  const [pathDraft, setPathDraft] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ entry: SftpEntry; data: SftpTextPreview } | null>(null);
  const [previewing, setPreviewing] = useState(false);

  const sessionIdRef = useRef<string | null>(null);
  const promptInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  // --- 전송 진행률 ---
  useEffect(() => {
    const unlisten = listen<SftpProgress>('sftp:progress', (e) => {
      const p = e.payload;
      if (p.id !== sessionIdRef.current) return;
      setTransfers((prev) => {
        const idx = prev.findIndex((t) => t.transferId === p.transfer_id);
        const next: Transfer = {
          transferId: p.transfer_id,
          name: p.name,
          direction: p.direction,
          transferred: p.transferred,
          total: p.total,
          done: p.done,
        };
        if (idx === -1) return [...prev, next];
        const copy = [...prev];
        copy[idx] = next;
        return copy;
      });
      // 완료된 항목은 잠깐 보여주고 치운다.
      if (p.done) {
        setTimeout(() => {
          setTransfers((prev) => prev.filter((t) => t.transferId !== p.transfer_id));
        }, 2500);
      }
    });
    return () => {
      void unlisten.then((f) => f());
    };
  }, []);

  // SFTP에는 CWD 개념이 없어 상대 경로는 서버가 홈 기준으로 푼다.
  // 표시 중인 cwd를 붙여 절대 경로로 만든 뒤에 보내야 현재 위치가 반영된다.
  const cwdRef = useRef('');
  const homeRef = useRef('');

  const loadDir = useCallback(async (id: string, path: string) => {
    setLoading(true);
    setError(null);
    try {
      const absolute = resolveRemotePath(cwdRef.current, path, homeRef.current);
      const resolved = await sftpCommands.canonicalize(id, absolute);
      const list = await sftpCommands.list(id, resolved);
      cwdRef.current = resolved;
      setCwd(resolved);
      setEntries(list);
      setSelected(null);
      if (listRef.current) listRef.current.scrollTop = 0;
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  const connect = useCallback(async () => {
    if (!ec2Server || connecting) return;
    setConnecting(true);
    setError(null);
    try {
      const id = await sftpCommands.connect({
        host: ec2Server.host,
        user: ec2Server.user,
        pem_path: ec2Server.pem_path,
      });
      setSessionId(id);
      const home = await sftpCommands.home(id);
      homeRef.current = home;
      cwdRef.current = home;
      await loadDir(id, home);
    } catch (e) {
      setError(String(e));
      setSessionId(null);
    } finally {
      setConnecting(false);
    }
  }, [ec2Server, connecting, loadDir]);

  // 패널이 열리면 자동 연결, 언마운트 시 세션 정리
  useEffect(() => {
    void connect();
    return () => {
      const id = sessionIdRef.current;
      if (id) void sftpCommands.disconnect(id).catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ec2Server?.id]);

  useEffect(() => {
    if (prompt) setTimeout(() => promptInputRef.current?.focus(), 0);
  }, [prompt]);

  const refresh = useCallback(() => {
    if (sessionId && cwd) void loadDir(sessionId, cwd);
  }, [sessionId, cwd, loadDir]);

  useEffect(() => {
    localStorage.setItem(FOLLOW_KEY, follow ? '1' : '0');
  }, [follow]);

  // 터미널이 cd 하면 따라간다 (MobaXterm의 "Follow terminal folder").
  // 원격 셸의 창 제목에서 읽은 값이라 셸에 아무것도 주입하지 않는다.
  useEffect(() => {
    if (!follow || !sessionId || !followPath) return;
    if (followPath === cwdRef.current) return;
    void loadDir(sessionId, followPath);
  }, [follow, sessionId, followPath, loadDir]);

  const enter = useCallback(
    (entry: SftpEntry) => {
      if (!sessionId) return;
      // 심볼릭 링크는 canonicalize가 대상까지 풀어준다.
      if (entry.is_dir || entry.is_symlink) void loadDir(sessionId, entry.path);
    },
    [sessionId, loadDir]
  );

  const goUp = useCallback(() => {
    if (!sessionId || !cwd || cwd === '/') return;
    void loadDir(sessionId, parentRemote(cwd));
  }, [sessionId, cwd, loadDir]);

  const goHome = useCallback(async () => {
    if (!sessionId) return;
    try {
      const home = await sftpCommands.home(sessionId);
      await loadDir(sessionId, home);
    } catch (e) {
      setError(String(e));
    }
  }, [sessionId, loadDir]);

  const download = useCallback(
    async (entry: SftpEntry) => {
      if (!sessionId || entry.is_dir) return;
      try {
        const target = await saveDialog({ defaultPath: entry.name });
        if (!target) return;
        await sftpCommands.download(sessionId, entry.path, target);
      } catch (e) {
        setError(String(e));
      }
    },
    [sessionId]
  );

  /** 텍스트 미리보기. 256KB까지만 읽고, 바이너리면 내용 대신 안내를 띄운다. */
  const openPreview = useCallback(
    async (entry: SftpEntry) => {
      if (!sessionId || entry.is_dir) return;
      setPreviewing(true);
      setError(null);
      try {
        const data = await sftpCommands.readText(sessionId, entry.path, 256 * 1024);
        setPreview({ entry, data });
      } catch (e) {
        setError(String(e));
      } finally {
        setPreviewing(false);
      }
    },
    [sessionId]
  );

  // 미리보기: Escape로 닫기
  useEffect(() => {
    if (!preview) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPreview(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [preview]);

  const upload = useCallback(async () => {
    if (!sessionId || !cwd) return;
    try {
      const picked = await openDialog({ multiple: true });
      if (!picked) return;
      const files = Array.isArray(picked) ? picked : [picked];
      for (const local of files) {
        await sftpCommands.upload(sessionId, local, joinRemote(cwd, baseName(local)));
      }
      refresh();
    } catch (e) {
      setError(String(e));
    }
  }, [sessionId, cwd, refresh]);

  const remove = useCallback(
    async (entry: SftpEntry) => {
      if (!sessionId) return;
      const ok = await confirm(
        entry.is_dir
          ? t('sftp.confirmDeleteDir', { name: entry.name })
          : t('sftp.confirmDeleteFile', { name: entry.name }),
        { title: t('sftp.deleteTitle'), kind: 'warning' }
      );
      if (!ok) return;
      try {
        await sftpCommands.remove(sessionId, entry.path);
        refresh();
      } catch (e) {
        setError(String(e));
      }
    },
    [sessionId, refresh]
  );

  const submitPrompt = useCallback(async () => {
    if (!sessionId || !prompt) return;
    const value = promptValue.trim();
    if (!value) return;
    try {
      if (prompt.kind === 'mkdir') {
        await sftpCommands.mkdir(sessionId, joinRemote(cwd, value));
      } else {
        await sftpCommands.rename(sessionId, prompt.entry.path, joinRemote(cwd, value));
      }
      setPrompt(null);
      setPromptValue('');
      refresh();
    } catch (e) {
      setError(String(e));
    }
  }, [sessionId, prompt, promptValue, cwd, refresh]);

  const selectedEntry = useMemo(
    () => entries.find((e) => e.path === selected) ?? null,
    [entries, selected]
  );

  const onListKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!selectedEntry) return;
      if (e.key === 'Enter') {
        e.preventDefault();
        if (selectedEntry.is_dir) enter(selectedEntry);
        else void openPreview(selectedEntry);
      } else if (e.key === 'Delete') {
        e.preventDefault();
        void remove(selectedEntry);
      } else if (e.key === 'F2') {
        e.preventDefault();
        setPromptValue(selectedEntry.name);
        setPrompt({ kind: 'rename', entry: selectedEntry });
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        goUp();
      }
    },
    [selectedEntry, enter, openPreview, remove, goUp]
  );

  return (
    <div className="h-full flex flex-col bg-white border-l border-gray-200 min-w-0">
      {/* Header */}
      <div className="px-3 py-2 flex items-center justify-between border-b border-gray-200 bg-gray-50 flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Folder className="w-4 h-4 text-blue-600 flex-shrink-0" />
          <span className="font-semibold text-sm">SFTP</span>
          {connecting && <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-500" />}
          {sessionId && !connecting && (
            <span className="w-1.5 h-1.5 rounded-full bg-green-500" title="connected" />
          )}
        </div>
        <button
          onClick={onClose}
          className="p-1 hover:bg-gray-200 rounded"
          title={t('sftp.close')}
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Toolbar */}
      <div className="px-2 py-1.5 flex items-center gap-1 border-b border-gray-200 flex-shrink-0">
        <IconBtn onClick={goUp} disabled={!sessionId || cwd === '/'} title={t('sftp.parent')}>
          <ArrowUp className="w-4 h-4" />
        </IconBtn>
        <IconBtn onClick={() => void goHome()} disabled={!sessionId} title={t('sftp.home')}>
          <Home className="w-4 h-4" />
        </IconBtn>
        <IconBtn onClick={refresh} disabled={!sessionId || loading} title={t('sftp.refresh')}>
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </IconBtn>
        <IconBtn
          onClick={() => setFollow((v) => !v)}
          disabled={!sessionId}
          title={t('sftp.followTerminal')}
          active={follow}
        >
          <Crosshair className="w-4 h-4" />
        </IconBtn>
        <div className="w-px h-5 bg-gray-200 mx-1" />
        <IconBtn
          onClick={() => {
            setPromptValue('');
            setPrompt({ kind: 'mkdir' });
          }}
          disabled={!sessionId}
          title={t('sftp.newFolder')}
        >
          <FolderPlus className="w-4 h-4" />
        </IconBtn>
        <IconBtn onClick={() => void upload()} disabled={!sessionId} title={t('sftp.upload')}>
          <Upload className="w-4 h-4" />
        </IconBtn>
        <IconBtn
          onClick={() => selectedEntry && void openPreview(selectedEntry)}
          disabled={!selectedEntry || selectedEntry.is_dir || previewing}
          title={t('sftp.preview')}
        >
          {previewing ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Eye className="w-4 h-4" />
          )}
        </IconBtn>
        <IconBtn
          onClick={() => selectedEntry && void download(selectedEntry)}
          disabled={!selectedEntry || selectedEntry.is_dir}
          title={t('sftp.download')}
        >
          <Download className="w-4 h-4" />
        </IconBtn>
        <IconBtn
          onClick={() => {
            if (!selectedEntry) return;
            setPromptValue(selectedEntry.name);
            setPrompt({ kind: 'rename', entry: selectedEntry });
          }}
          disabled={!selectedEntry}
          title={t('sftp.rename')}
        >
          <Pencil className="w-4 h-4" />
        </IconBtn>
        <IconBtn
          onClick={() => selectedEntry && void remove(selectedEntry)}
          disabled={!selectedEntry}
          title={t('sftp.delete')}
          danger
        >
          <Trash2 className="w-4 h-4" />
        </IconBtn>
      </div>

      {/* Path */}
      <div className="px-2 py-1.5 border-b border-gray-200 flex-shrink-0">
        <input
          className="w-full font-mono text-xs bg-gray-50 border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
          value={pathDraft ?? cwd}
          disabled={!sessionId}
          onChange={(e) => setPathDraft(e.target.value)}
          onFocus={() => setPathDraft(cwd)}
          onBlur={() => setPathDraft(null)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && sessionId && pathDraft !== null) {
              void loadDir(sessionId, pathDraft);
              setPathDraft(null);
              (e.target as HTMLInputElement).blur();
            }
            if (e.key === 'Escape') {
              setPathDraft(null);
              (e.target as HTMLInputElement).blur();
            }
          }}
        />
      </div>

      {/* Prompt (mkdir / rename) */}
      {prompt && (
        <div className="px-2 py-2 border-b border-gray-200 bg-blue-50 flex items-center gap-2 flex-shrink-0">
          <span className="text-xs text-gray-600 flex-shrink-0">
            {prompt.kind === 'mkdir' ? t('sftp.newFolder') : t('sftp.newName')}
          </span>
          <input
            ref={promptInputRef}
            className="flex-1 min-w-0 font-mono text-xs bg-white border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
            value={promptValue}
            onChange={(e) => setPromptValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void submitPrompt();
              if (e.key === 'Escape') {
                setPrompt(null);
                setPromptValue('');
              }
            }}
          />
          <button
            onClick={() => void submitPrompt()}
            className="px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs flex-shrink-0"
          >
            {t('sftp.confirm')}
          </button>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="px-3 py-2 bg-red-50 border-b border-red-200 flex items-start gap-2 flex-shrink-0">
          <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
          <pre className="text-xs text-red-700 whitespace-pre-wrap break-all flex-1 font-mono">
            {error}
          </pre>
          <button onClick={() => setError(null)} className="flex-shrink-0">
            <X className="w-3.5 h-3.5 text-red-600" />
          </button>
        </div>
      )}

      {/* Not connected */}
      {!sessionId && !connecting && (
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="text-center">
            <p className="text-sm text-gray-500 mb-3">
              {ec2Server ? t('sftp.notConnected') : t('sftp.noServerInfo')}
            </p>
            <button
              onClick={() => void connect()}
              disabled={!ec2Server}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm disabled:opacity-50"
            >
              {t('sftp.connect')}
            </button>
          </div>
        </div>
      )}

      {/* File list */}
      {sessionId && (
        <div
          ref={listRef}
          className="flex-1 overflow-y-auto outline-none min-h-0"
          tabIndex={0}
          onKeyDown={onListKeyDown}
        >
          {entries.length === 0 && !loading && (
            <div className="p-4 text-center text-xs text-gray-400">{t('sftp.empty')}</div>
          )}
          {entries.map((entry) => (
            <div
              key={entry.path}
              onClick={() => setSelected(entry.path)}
              onDoubleClick={() => (entry.is_dir ? enter(entry) : void openPreview(entry))}
              className={`flex items-center gap-2 px-3 py-1.5 cursor-pointer text-xs border-b border-gray-50 ${
                selected === entry.path ? 'bg-blue-100' : 'hover:bg-gray-50'
              }`}
              title={`${entry.mode}  ${entry.path}`}
            >
              {entry.is_symlink ? (
                <Link2 className="w-3.5 h-3.5 text-cyan-600 flex-shrink-0" />
              ) : entry.is_dir ? (
                <Folder className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
              ) : (
                <FileText className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
              )}
              <span className="flex-1 min-w-0 truncate font-mono">{entry.name}</span>
              <span className="text-gray-400 tabular-nums flex-shrink-0 w-16 text-right">
                {entry.is_dir ? '' : formatBytes(entry.size)}
              </span>
              <span className="text-gray-400 tabular-nums flex-shrink-0 hidden xl:inline">
                {formatMtime(entry.mtime)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Transfers */}
      {transfers.length > 0 && (
        <div className="border-t border-gray-200 flex-shrink-0 max-h-32 overflow-y-auto">
          {transfers.map((t) => {
            const pct = t.total > 0 ? Math.min(100, (t.transferred / t.total) * 100) : t.done ? 100 : 0;
            return (
              <div key={t.transferId} className="px-3 py-1.5 border-b border-gray-50">
                <div className="flex items-center justify-between text-[11px] mb-1">
                  <span className="font-mono truncate flex-1 min-w-0">
                    {t.direction === 'upload' ? '↑' : '↓'} {t.name}
                  </span>
                  <span className="text-gray-500 tabular-nums flex-shrink-0 ml-2">
                    {formatBytes(t.transferred)}
                    {t.total > 0 && ` / ${formatBytes(t.total)}`}
                  </span>
                </div>
                <div className="h-1 bg-gray-200 rounded overflow-hidden">
                  <div
                    className={`h-full transition-all ${t.done ? 'bg-green-500' : 'bg-blue-500'}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 텍스트 미리보기 */}
      {preview && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-8"
          onClick={() => setPreview(null)}
        >
          <div
            className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-full flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between flex-shrink-0">
              <div className="min-w-0">
                <div className="font-mono text-sm truncate">{preview.entry.path}</div>
                <div className="text-xs text-gray-500">
                  {formatBytes(preview.data.size)}
                  {preview.data.truncated &&
                    ` · ${t('sftp.truncated', { size: formatBytes(256 * 1024) })}`}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0 ml-4">
                <button
                  onClick={() => {
                    const entry = preview.entry;
                    setPreview(null);
                    void download(entry);
                  }}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm"
                >
                  {t('sftp.download')}
                </button>
                <button
                  onClick={() => setPreview(null)}
                  className="p-1.5 hover:bg-gray-200 rounded"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {preview.data.likely_binary ? (
              <div className="p-8 text-center text-sm text-gray-500">
                {t('sftp.binaryFile')}
              </div>
            ) : (
              <pre className="flex-1 overflow-auto p-4 text-xs font-mono whitespace-pre bg-gray-50 min-h-0">
                {preview.data.text}
              </pre>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function IconBtn({
  children,
  onClick,
  disabled,
  title,
  danger,
  active,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  title: string;
  danger?: boolean;
  /** 토글형 버튼의 켜짐 상태 */
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`p-1.5 rounded disabled:opacity-30 disabled:cursor-not-allowed ${
        danger
          ? 'hover:bg-red-100 text-red-600'
          : active
            ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
            : 'hover:bg-gray-200 text-gray-700'
      }`}
    >
      {children}
    </button>
  );
}
