import { useAppDispatch } from '@app/hooks';
import { updateNode } from '../model/canvasSlice';
import { CustomNode, NginxNodeData } from '../model/types';
import { FormField, Input, Select } from '../../../shared/ui/form';

interface NginxPropertyFormProps {
  node: CustomNode;
}

export function NginxPropertyForm({ node }: NginxPropertyFormProps) {
  const dispatch = useAppDispatch();
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
        <summary className="cursor-pointer font-semibold text-sm mb-3">기본 설정</summary>
        <div className="pl-2 space-y-3">
          <FormField label="서비스 이름" required>
            <Input
              value={data.name}
              onChange={(e) => update('name', e.target.value)}
              placeholder="nginx"
            />
          </FormField>
          <FormField label="리스닝 포트">
            <Input
              type="number"
              value={data.listenPort ?? 80}
              onChange={(e) => update('listenPort', Number(e.target.value))}
              placeholder="80"
            />
          </FormField>
          <FormField label="서버 도메인 (server_name)">
            <Input
              value={data.serverName ?? '_'}
              onChange={(e) => update('serverName', e.target.value)}
              placeholder="myapp.com 또는 _"
            />
          </FormField>
        </div>
      </details>

      {/* 보안 */}
      <details>
        <summary className="cursor-pointer font-semibold text-sm mb-3">보안</summary>
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
              Rate Limiting 활성화
            </label>
            {data.rateLimit?.enabled && (
              <div className="pl-5 space-y-2">
                <FormField label="Rate (예: 10r/s)">
                  <Input
                    value={data.rateLimit.rate ?? '10r/s'}
                    onChange={(e) => updateNested('rateLimit', 'rate', e.target.value)}
                    placeholder="10r/s"
                  />
                </FormField>
                <FormField label="Burst">
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
              SSL/TLS 활성화
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
                  Let's Encrypt 자동 발급
                </label>
                {data.ssl.auto ? (
                  <FormField label="이메일 (Let's Encrypt 알림용)">
                    <Input
                      value={data.ssl.email ?? ''}
                      onChange={(e) => updateNested('ssl', 'email', e.target.value)}
                      placeholder="admin@example.com"
                      className={!data.ssl.email ? 'border-red-400' : ''}
                    />
                    {!data.ssl.email && (
                      <p className="text-red-500 text-xs mt-1">
                        이메일을 입력해야 Let's Encrypt 인증서를 발급할 수 있습니다.
                      </p>
                    )}
                  </FormField>
                ) : (
                  <>
                    <FormField label="인증서 경로 (certPath)">
                      <Input
                        value={data.ssl.certPath ?? ''}
                        onChange={(e) => updateNested('ssl', 'certPath', e.target.value)}
                        placeholder="/etc/nginx/certs/cert.pem"
                      />
                    </FormField>
                    <FormField label="개인키 경로 (keyPath)">
                      <Input
                        value={data.ssl.keyPath ?? ''}
                        onChange={(e) => updateNested('ssl', 'keyPath', e.target.value)}
                        placeholder="/etc/nginx/certs/key.pem"
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
              CORS 헤더 자동 추가
            </label>
            {data.cors?.enabled && (
              <div className="pl-5">
                <FormField label="허용 Origin">
                  <Input
                    value={data.cors.origin ?? '*'}
                    onChange={(e) => updateNested('cors', 'origin', e.target.value)}
                    placeholder="* 또는 https://myapp.com"
                  />
                </FormField>
              </div>
            )}
          </div>
        </div>
      </details>

      {/* 성능 */}
      <details>
        <summary className="cursor-pointer font-semibold text-sm mb-3">성능</summary>
        <div className="pl-2 space-y-3">

          <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
            <input
              type="checkbox"
              checked={data.gzip?.enabled ?? false}
              onChange={(e) => updateNested('gzip', 'enabled', e.target.checked)}
              className="rounded"
            />
            Gzip 압축
          </label>

          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
              <input
                type="checkbox"
                checked={data.cache?.enabled ?? false}
                onChange={(e) => updateNested('cache', 'enabled', e.target.checked)}
                className="rounded"
              />
              Cache-Control 헤더
            </label>
            {data.cache?.enabled && (
              <div className="pl-5">
                <FormField label="max-age (초)">
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

          <FormField label="Keepalive 커넥션 수">
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
        <summary className="cursor-pointer font-semibold text-sm mb-3">로드밸런싱</summary>
        <div className="pl-2">
          <FormField label="방식">
            <Select
              value={data.loadBalancing?.method ?? 'round_robin'}
              onChange={(e) => updateNested('loadBalancing', 'method', e.target.value)}
              options={[
                { value: 'round_robin', label: 'Round Robin (기본)' },
                { value: 'least_conn', label: 'Least Connections' },
                { value: 'ip_hash', label: 'IP Hash' },
              ]}
            />
          </FormField>
        </div>
      </details>

      {/* 라우팅 안내 */}
      <details open>
        <summary className="cursor-pointer font-semibold text-sm mb-3">라우팅</summary>
        <div className="pl-2">
          <p className="text-xs text-gray-500">
            서비스에서 NGINX 노드로 엣지를 연결한 후,
            엣지를 클릭하면 Location 경로를 설정할 수 있습니다.
          </p>
          <p className="text-xs text-gray-400 mt-1">
            예: FastAPI → <code>/api/</code>, React → <code>/</code>
          </p>
        </div>
      </details>

    </div>
  );
}
