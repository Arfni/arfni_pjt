import { useAppDispatch } from '@app/hooks';
import { useTranslation } from 'react-i18next';
import { updateNode } from '../model/canvasSlice';
import { CustomNode, NginxNodeData } from '../model/types';
import { FormField, Input, Select } from '../../../shared/ui/form';
import { Tooltip } from '../../../shared/ui/form/Tooltip';

interface NginxPropertyFormProps {
  node: CustomNode;
}

export function NginxPropertyForm({ node }: NginxPropertyFormProps) {
  const dispatch = useAppDispatch();
  const { t } = useTranslation('canvas');
  const data = node.data as NginxNodeData;

  const update = (field: string, value: any) => {
    dispatch(updateNode({ id: node.id, data: { ...data, [field]: value } }));
  };

  const updateNested = (section: keyof NginxNodeData, field: string, value: any) => {
    dispatch(updateNode({
      id: node.id,
      data: {
        ...data,
        [section]: { ...(data[section] as any), [field]: value },
      },
    }));
  };

  return (
    <div className="p-4 space-y-4">

      {/* 기본 설정 */}
      <details open>
        <summary className="cursor-pointer font-semibold text-sm mb-3">{t('nginx.sections.basic')}</summary>
        <div className="pl-2 space-y-3">
          <FormField label={t('nginx.labels.serviceName')} required>
            <Input
              value={data.name}
              onChange={(e) => update('name', e.target.value)}
              placeholder="nginx"
            />
          </FormField>
          <FormField label={t('nginx.labels.listenPort')} tooltip={t('nginx.tooltips.listenPort')}>
            <Input
              type="number"
              value={data.listenPort ?? 80}
              onChange={(e) => update('listenPort', Number(e.target.value))}
              placeholder="80"
            />
          </FormField>
          <FormField label={t('nginx.labels.serverName')} tooltip={t('nginx.tooltips.serverName')}>
            <Input
              value={data.serverName ?? '_'}
              onChange={(e) => update('serverName', e.target.value)}
              placeholder={t('nginx.placeholders.serverName')}
            />
          </FormField>
        </div>
      </details>

      {/* 보안 */}
      <details>
        <summary className="cursor-pointer font-semibold text-sm mb-3">{t('nginx.sections.security')}</summary>
        <div className="pl-2 space-y-4">

          {/* Rate Limiting */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
              <input
                type="checkbox"
                checked={data.rateLimit?.enabled ?? false}
                onChange={(e) => updateNested('rateLimit', 'enabled', e.target.checked)}
                className="rounded"
              />
              <span className="inline-flex items-center gap-1">
                {t('nginx.labels.rateLimitEnabled')}
                <Tooltip content={t('nginx.tooltips.rateLimitEnabled')} />
              </span>
            </label>
            {data.rateLimit?.enabled && (
              <div className="pl-5 space-y-2">
                <FormField label={t('nginx.labels.rate')} tooltip={t('nginx.tooltips.rate')}>
                  <Input
                    value={data.rateLimit.rate ?? '10r/s'}
                    onChange={(e) => updateNested('rateLimit', 'rate', e.target.value)}
                    placeholder="10r/s"
                  />
                </FormField>
                <FormField label={t('nginx.labels.burst')} tooltip={t('nginx.tooltips.burst')}>
                  <Input
                    type="number"
                    value={data.rateLimit.burst ?? 20}
                    onChange={(e) => updateNested('rateLimit', 'burst', Number(e.target.value))}
                    placeholder="20"
                  />
                </FormField>
              </div>
            )}
          </div>

          {/* SSL */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
              <input
                type="checkbox"
                checked={data.ssl?.enabled ?? false}
                onChange={(e) => updateNested('ssl', 'enabled', e.target.checked)}
                className="rounded"
              />
              <span className="inline-flex items-center gap-1">
                {t('nginx.labels.sslEnabled')}
                <Tooltip content={t('nginx.tooltips.sslEnabled')} />
              </span>
            </label>
            {data.ssl?.enabled && (
              <div className="pl-5 space-y-2">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={data.ssl.auto ?? false}
                    onChange={(e) => updateNested('ssl', 'auto', e.target.checked)}
                    className="rounded"
                  />
                  <span className="inline-flex items-center gap-1">
                    {t('nginx.labels.sslAuto')}
                    <Tooltip content={t('nginx.tooltips.sslAuto')} />
                  </span>
                </label>
                {data.ssl.auto ? (
                  <FormField label={t('nginx.labels.email')} tooltip={t('nginx.tooltips.email')}>
                    <Input
                      value={data.ssl.email ?? ''}
                      onChange={(e) => updateNested('ssl', 'email', e.target.value)}
                      placeholder={t('nginx.placeholders.email')}
                      className={!data.ssl.email ? 'border-red-400' : ''}
                    />
                    {!data.ssl.email && (
                      <p className="text-red-500 text-xs mt-1">
                        {t('nginx.errors.emailRequired')}
                      </p>
                    )}
                  </FormField>
                ) : (
                  <>
                    <FormField label={t('nginx.labels.certPath')} tooltip={t('nginx.tooltips.certPath')}>
                      <Input
                        value={data.ssl.certPath ?? ''}
                        onChange={(e) => updateNested('ssl', 'certPath', e.target.value)}
                        placeholder={t('nginx.placeholders.certPath')}
                      />
                    </FormField>
                    <FormField label={t('nginx.labels.keyPath')} tooltip={t('nginx.tooltips.keyPath')}>
                      <Input
                        value={data.ssl.keyPath ?? ''}
                        onChange={(e) => updateNested('ssl', 'keyPath', e.target.value)}
                        placeholder={t('nginx.placeholders.keyPath')}
                      />
                    </FormField>
                  </>
                )}
              </div>
            )}
          </div>

          {/* CORS */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
              <input
                type="checkbox"
                checked={data.cors?.enabled ?? false}
                onChange={(e) => updateNested('cors', 'enabled', e.target.checked)}
                className="rounded"
              />
              <span className="inline-flex items-center gap-1">
                {t('nginx.labels.corsEnabled')}
                <Tooltip content={t('nginx.tooltips.corsEnabled')} />
              </span>
            </label>
            {data.cors?.enabled && (
              <div className="pl-5">
                <FormField label={t('nginx.labels.corsOrigin')} tooltip={t('nginx.tooltips.corsOrigin')}>
                  <Input
                    value={data.cors.origin ?? '*'}
                    onChange={(e) => updateNested('cors', 'origin', e.target.value)}
                    placeholder={t('nginx.placeholders.corsOrigin')}
                  />
                </FormField>
              </div>
            )}
          </div>
        </div>
      </details>

      {/* 성능 */}
      <details>
        <summary className="cursor-pointer font-semibold text-sm mb-3">{t('nginx.sections.performance')}</summary>
        <div className="pl-2 space-y-3">

          <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
            <input
              type="checkbox"
              checked={data.gzip?.enabled ?? false}
              onChange={(e) => updateNested('gzip', 'enabled', e.target.checked)}
              className="rounded"
            />
            <span className="inline-flex items-center gap-1">
              {t('nginx.labels.gzip')}
              <Tooltip content={t('nginx.tooltips.gzip')} />
            </span>
          </label>

          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
              <input
                type="checkbox"
                checked={data.cache?.enabled ?? false}
                onChange={(e) => updateNested('cache', 'enabled', e.target.checked)}
                className="rounded"
              />
              <span className="inline-flex items-center gap-1">
                {t('nginx.labels.cacheEnabled')}
                <Tooltip content={t('nginx.tooltips.cacheEnabled')} />
              </span>
            </label>
            {data.cache?.enabled && (
              <div className="pl-5">
                <FormField label={t('nginx.labels.maxAge')} tooltip={t('nginx.tooltips.maxAge')}>
                  <Input
                    type="number"
                    value={data.cache.maxAge ?? 3600}
                    onChange={(e) => updateNested('cache', 'maxAge', Number(e.target.value))}
                    placeholder="3600"
                  />
                </FormField>
              </div>
            )}
          </div>

          <FormField label={t('nginx.labels.keepalive')} tooltip={t('nginx.tooltips.keepalive')}>
            <Input
              type="number"
              value={data.keepalive ?? 32}
              onChange={(e) => update('keepalive', Number(e.target.value))}
              placeholder="32"
            />
          </FormField>
        </div>
      </details>

      {/* 로드밸런싱 */}
      <details>
        <summary className="cursor-pointer font-semibold text-sm mb-3">{t('nginx.sections.loadBalancing')}</summary>
        <div className="pl-2">
          <FormField label={t('nginx.labels.lbMethod')} tooltip={t('nginx.tooltips.lbMethod')}>
            <Select
              value={data.loadBalancing?.method ?? 'round_robin'}
              onChange={(e) => updateNested('loadBalancing', 'method', e.target.value)}
              options={[
                { value: 'round_robin', label: t('nginx.lbMethods.roundRobin') },
                { value: 'least_conn', label: t('nginx.lbMethods.leastConn') },
                { value: 'ip_hash', label: t('nginx.lbMethods.ipHash') },
              ]}
            />
          </FormField>
        </div>
      </details>

      {/* 라우팅 안내 */}
      <details open>
        <summary className="cursor-pointer font-semibold text-sm mb-3">{t('nginx.sections.routing')}</summary>
        <div className="pl-2">
          <p className="text-xs text-gray-500">
            {t('nginx.routing.info')}
          </p>
          <p className="text-xs text-gray-400 mt-1">
            {t('nginx.routing.example')}
          </p>
        </div>
      </details>

    </div>
  );
}
