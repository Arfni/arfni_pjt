import { useCallback, useEffect, useState } from 'react';
import {
  Network,
  Plus,
  X,
  Trash2,
  ExternalLink,
  AlertCircle,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { listen } from '@tauri-apps/api/event';
import { openUrl } from '@tauri-apps/plugin-opener';
import { useTranslation } from 'react-i18next';
import { EC2Server } from '@shared/api/tauri/commands';
import {
  tunnelCommands,
  TunnelInfo,
  TunnelKind,
  TunnelSpec,
  browsableUrl,
  validateSpec,
} from '@shared/api/tauri/tunnel';

interface TunnelPanelProps {
  server: EC2Server | null;
  onClose: () => void;
}

const emptyDraft = (): TunnelSpec => ({
  kind: 'local',
  bind_address: '',
  bind_port: 0,
  target_host: '',
  target_port: 0,
  label: '',
});

export function TunnelPanel({ server, onClose }: TunnelPanelProps) {
  const { t } = useTranslation('logs');
  const [tunnels, setTunnels] = useState<TunnelInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [draft, setDraft] = useState<TunnelSpec>(emptyDraft);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setTunnels(await tunnelCommands.list());
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // 터널이 열리거나(수동/자동) ssh가 죽어서 reaper가 수거하면 목록을 다시 읽는다.
  useEffect(() => {
    const subs = ['tunnel:opened', 'tunnel:closed'].map((evt) =>
      listen(evt, () => void refresh())
    );
    return () => {
      subs.forEach((s) => void s.then((f) => f()));
    };
  }, [refresh]);

  const submit = useCallback(async () => {
    if (!server) {
      setError(t('tunnel.error.noServerInfo'));
      return;
    }
    const spec: TunnelSpec = {
      ...draft,
      bind_address: draft.bind_address?.trim() || null,
      target_host: draft.kind === 'dynamic' ? null : draft.target_host?.trim() || null,
      target_port: draft.kind === 'dynamic' ? null : draft.target_port,
      label: draft.label?.trim() || null,
    };

    const invalid = validateSpec(spec);
    if (invalid) {
      // params.field는 필드 이름의 i18n 키다. 한 번 더 번역해서 넣는다.
      setError(
        t(invalid.key, invalid.params ? { field: t(invalid.params.field) } : undefined)
      );
      return;
    }

    setOpening(true);
    setError(null);
    try {
      await tunnelCommands.open(
        { host: server.host, user: server.user, pem_path: server.pem_path },
        spec
      );
      setDraft(emptyDraft());
      setFormOpen(false);
      await refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setOpening(false);
    }
  }, [server, draft, refresh, t]);

  const close = useCallback(
    async (id: string) => {
      try {
        await tunnelCommands.close(id);
      } catch (e) {
        setError(String(e));
      } finally {
        await refresh();
      }
    },
    [refresh]
  );

  return (
    <div className="h-full flex flex-col bg-white border-l border-gray-200 min-w-0">
      {/* Header */}
      <div className="px-3 py-2 flex items-center justify-between border-b border-gray-200 bg-gray-50 flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Network className="w-4 h-4 text-blue-600 flex-shrink-0" />
          <span className="font-semibold text-sm">{t('tunnel.title')}</span>
          <span className="text-xs text-gray-500">{tunnels.length}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => void refresh()}
            className="p-1 hover:bg-gray-200 rounded"
            title={t('tunnel.refresh')}
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={onClose} className="p-1 hover:bg-gray-200 rounded" title={t('tunnel.close')}>
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

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

      {/* Add form */}
      <div className="border-b border-gray-200 flex-shrink-0">
        {!formOpen ? (
          <button
            onClick={() => setFormOpen(true)}
            disabled={!server}
            className="w-full px-3 py-2 flex items-center gap-2 text-sm text-blue-700 hover:bg-blue-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Plus className="w-4 h-4" />
            {t('tunnel.add')}
          </button>
        ) : (
          <div className="p-3 space-y-2 bg-blue-50/40">
            <div className="flex gap-1">
              {(['local', 'remote', 'dynamic'] as TunnelKind[]).map((k) => (
                <button
                  key={k}
                  onClick={() => setDraft((d) => ({ ...d, kind: k }))}
                  className={`flex-1 px-2 py-1 rounded text-xs ${
                    draft.kind === k
                      ? 'bg-blue-600 text-white'
                      : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {t(`tunnel.kind.${k}`)}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-gray-500">{t(`tunnel.hint.${draft.kind}`)}</p>

            <div className="grid grid-cols-2 gap-2">
              <Field
                label={t(
                  draft.kind === 'remote'
                    ? 'tunnel.field.bindAddressRemote'
                    : 'tunnel.field.bindAddressLocal'
                )}
                placeholder={draft.kind === 'remote' ? 'localhost' : '127.0.0.1'}
                value={draft.bind_address ?? ''}
                onChange={(v) => setDraft((d) => ({ ...d, bind_address: v }))}
              />
              <Field
                label={t('tunnel.field.bindPort')}
                placeholder="9091"
                value={draft.bind_port ? String(draft.bind_port) : ''}
                onChange={(v) => setDraft((d) => ({ ...d, bind_port: Number(v) || 0 }))}
              />
              {draft.kind !== 'dynamic' && (
                <>
                  <Field
                    label={t('tunnel.field.targetHost')}
                    placeholder="localhost"
                    value={draft.target_host ?? ''}
                    onChange={(v) => setDraft((d) => ({ ...d, target_host: v }))}
                  />
                  <Field
                    label={t('tunnel.field.targetPort')}
                    placeholder="9090"
                    value={draft.target_port ? String(draft.target_port) : ''}
                    onChange={(v) => setDraft((d) => ({ ...d, target_port: Number(v) || 0 }))}
                  />
                </>
              )}
            </div>

            <Field
              label={t('tunnel.field.label')}
              placeholder="Grafana"
              value={draft.label ?? ''}
              onChange={(v) => setDraft((d) => ({ ...d, label: v }))}
            />

            <div className="flex gap-2 pt-1">
              <button
                onClick={() => void submit()}
                disabled={opening}
                className="flex-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {opening && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {t('tunnel.open')}
              </button>
              <button
                onClick={() => {
                  setFormOpen(false);
                  setDraft(emptyDraft());
                  setError(null);
                }}
                className="px-3 py-1.5 bg-gray-200 hover:bg-gray-300 rounded text-sm"
              >
                {t('tunnel.cancel')}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Active tunnels */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {tunnels.length === 0 && !loading && (
          <div className="p-4 text-center text-xs text-gray-400">
            {t('tunnel.empty')}
          </div>
        )}
        {tunnels.map((tn) => {
          const url = browsableUrl(tn);
          return (
            <div key={tn.id} className="px-3 py-2 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 flex-shrink-0" />
                <span
                  className="text-xs font-mono flex-1 min-w-0 truncate"
                  title={tn.description}
                >
                  {tn.label || tn.description}
                </span>
                {url && (
                  <button
                    onClick={() => void openUrl(url)}
                    className="p-1 hover:bg-gray-200 rounded text-gray-600 flex-shrink-0"
                    title={t('tunnel.openInBrowser', { url })}
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  onClick={() => void close(tn.id)}
                  className="p-1 hover:bg-red-100 rounded text-red-600 flex-shrink-0"
                  title={t('tunnel.removeTunnel')}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              {tn.label && (
                <div className="text-[11px] text-gray-500 font-mono pl-3.5 truncate">
                  {tn.description}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder?: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block min-w-0">
      <span className="block text-[11px] text-gray-500 mb-0.5">{label}</span>
      <input
        className="w-full bg-white border border-gray-300 rounded px-2 py-1 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
