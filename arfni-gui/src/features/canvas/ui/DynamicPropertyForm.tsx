import { useAppDispatch } from '@app/hooks';
import { updateNode } from '../model/canvasSlice';
import { CustomNode, ServiceNodeData, DatabaseNodeData } from '../model/types';
import { getServiceConfig } from '../config/serviceConfigs';
import { FormField, Input, Select, KeyValueEditor } from '../../../shared/ui/form';
import { TargetPropertyForm } from './TargetPropertyForm';

interface DynamicPropertyFormProps {
  node: CustomNode;
}

export function DynamicPropertyForm({ node }: DynamicPropertyFormProps) {
  const dispatch = useAppDispatch();

  // Target 노드인 경우 TargetPropertyForm 사용
  if (node.type === 'target') {
    return <TargetPropertyForm node={node} />;
  }

  const data = node.data as ServiceNodeData | DatabaseNodeData;

  // 서비스 타입 결정
  const serviceType = node.type === 'database'
    ? (data as DatabaseNodeData).type
    : (data as ServiceNodeData).serviceType || 'custom';

  console.log('DynamicPropertyForm - node:', node);
  console.log('DynamicPropertyForm - serviceType:', serviceType);
  console.log('DynamicPropertyForm - data:', data);

  const config = getServiceConfig(serviceType);

  if (!config) {
    return (
      <div style={{ padding: '1rem' }}>
        <p>Unknown service type: {serviceType}</p>
        <p>Please select a valid service type.</p>
      </div>
    );
  }

  // 노드 데이터 업데이트 헬퍼
  const updateField = (field: string, value: any) => {
    dispatch(updateNode({
      id: node.id,
      data: {
        ...data,
        [field]: value
      }
    }));
  };

  const updateEnv = (envKey: string, envValue: string) => {
    const currentEnv = data.env || {};
    dispatch(updateNode({
      id: node.id,
      data: {
        ...data,
        env: {
          ...currentEnv,
          [envKey]: envValue
        }
      }
    }));
  };

  const updateAllEnv = (newEnv: Record<string, string>) => {
    dispatch(updateNode({
      id: node.id,
      data: {
        ...data,
        env: newEnv
      }
    }));
  };

  // Database 노드인 경우
  if (node.type === 'database') {
    return (
      <div className="dynamic-property-form p-4 space-y-4">
        {/* Basic Information */}
        <details open>
          <summary style={{ cursor: 'pointer', fontWeight: 600, marginBottom: '1rem', fontSize: '0.875rem' }}>
            Basic Information
          </summary>
          <div style={{ paddingLeft: '0.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <FormField label="Service Name" required>
              <Input
                value={data.name}
                onChange={(e) => updateField('name', e.target.value)}
                placeholder="my-service"
              />
            </FormField>

            {config.supportsVersion && (
              <FormField label="Version">
                {config.versionOptions ? (
                  <Select
                    value={(data as DatabaseNodeData).version || config.defaultVersion || ''}
                    onChange={(e) => updateField('version', e.target.value)}
                    options={config.versionOptions.map(v => ({ label: v, value: v }))}
                  />
                ) : (
                  <Input
                    value={(data as DatabaseNodeData).version || config.defaultVersion || ''}
                    onChange={(e) => updateField('version', e.target.value)}
                    placeholder={config.defaultVersion}
                  />
                )}
              </FormField>
            )}

            <FormField label="Port">
              <Input
                value={data.ports?.[0] || config.defaultPortMapping || ''}
                onChange={(e) => {
                  const value = e.target.value;
                  updateField('ports', value ? [value] : []);
                }}
                placeholder={config.defaultPortMapping || '5432'}
              />
            </FormField>
          </div>
        </details>

        {/* Authentication */}
        <details open>
          <summary style={{ cursor: 'pointer', fontWeight: 600, marginBottom: '1rem', fontSize: '0.875rem' }}>
            Authentication
          </summary>
          <div style={{ paddingLeft: '0.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {config.requiredEnvVars && config.requiredEnvVars.map((envVar) => {
              const currentValue = data.env?.[envVar.key] || envVar.defaultValue || '';
              return (
                <FormField
                  key={envVar.key}
                  label={envVar.label || envVar.key}
                  required={envVar.required}
                >
                  <Input
                    type={envVar.type}
                    value={String(currentValue)}
                    onChange={(e) => updateEnv(envVar.key, e.target.value)}
                    placeholder={envVar.placeholder || String(envVar.defaultValue || '')}
                  />
                </FormField>
              );
            })}
            {config.optionalEnvVars && config.optionalEnvVars.map((envVar) => {
              const currentValue = data.env?.[envVar.key] || envVar.defaultValue || '';
              return (
                <FormField
                  key={envVar.key}
                  label={envVar.label || envVar.key}
                >
                  <Input
                    type={envVar.type}
                    value={String(currentValue)}
                    onChange={(e) => updateEnv(envVar.key, e.target.value)}
                    placeholder={envVar.placeholder || String(envVar.defaultValue || '')}
                  />
                </FormField>
              );
            })}
          </div>
        </details>

        {/* Storage */}
        {config.supportsVolumes && (
          <details open>
            <summary style={{ cursor: 'pointer', fontWeight: 600, marginBottom: '1rem', fontSize: '0.875rem' }}>
              Storage
            </summary>
            <div style={{ paddingLeft: '0.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <FormField label="Volume Path">
                <Input
                  value={data.volumes?.[0]?.host || config.defaultVolumes?.[0]?.host || ''}
                  onChange={(e) => {
                    const currentMount = data.volumes?.[0]?.mount || config.defaultVolumes?.[0]?.mount || '';
                    updateField('volumes', [{ host: e.target.value, mount: currentMount }]);
                  }}
                  placeholder="./.arfni/data"
                />
              </FormField>
              <FormField label="Size (GB)">
                <Input
                  type="number"
                  value={(data as any).storageSize || 10}
                  onChange={(e) => updateField('storageSize', Number(e.target.value))}
                  placeholder="10"
                />
              </FormField>
            </div>
          </details>
        )}

        {/* Resource Limits */}
        <details open>
          <summary style={{ cursor: 'pointer', fontWeight: 600, marginBottom: '1rem', fontSize: '0.875rem' }}>
            Resource Limits
          </summary>
          <div style={{ paddingLeft: '0.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <FormField label="Memory Limit (MB)">
              <Input
                type="number"
                value={(data as any).memoryLimit || 512}
                onChange={(e) => updateField('memoryLimit', Number(e.target.value))}
                placeholder="512"
              />
            </FormField>
            <FormField label="CPU Limit">
              <Input
                type="number"
                step="0.1"
                value={(data as any).cpuLimit || 0.5}
                onChange={(e) => updateField('cpuLimit', Number(e.target.value))}
                placeholder="0.5"
              />
            </FormField>
          </div>
        </details>

        {/* Environment Variables */}
        <details open>
          <summary style={{ cursor: 'pointer', fontWeight: 600, marginBottom: '1rem', fontSize: '0.875rem' }}>
            Environment Variables
          </summary>
          <div style={{ paddingLeft: '0.5rem' }}>
            <KeyValueEditor
              entries={data.env || {}}
              onChange={updateAllEnv}
              keyPlaceholder="KEY"
              valuePlaceholder="Value"
            />
          </div>
        </details>
      </div>
    );
  }

  // Service 노드인 경우 (Runtime)
  return (
    <div className="dynamic-property-form p-4 space-y-4">
      {/* Basic Information */}
      <details open>
        <summary style={{ cursor: 'pointer', fontWeight: 600, marginBottom: '1rem', fontSize: '0.875rem' }}>
          Basic Information
        </summary>
        <div style={{ paddingLeft: '0.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <FormField label="Service Name" required>
            <Input
              value={data.name}
              onChange={(e) => updateField('name', e.target.value)}
              placeholder="my-service"
            />
          </FormField>

          {config.supportsVersion && (
            <FormField label="Version">
              {config.versionOptions ? (
                <Select
                  value={(data as DatabaseNodeData).version || config.defaultVersion || ''}
                  onChange={(e) => updateField('version', e.target.value)}
                  options={config.versionOptions.map(v => ({ label: v, value: v }))}
                />
              ) : (
                <Input
                  value={(data as DatabaseNodeData).version || config.defaultVersion || ''}
                  onChange={(e) => updateField('version', e.target.value)}
                  placeholder={config.defaultVersion}
                />
              )}
            </FormField>
          )}

          <FormField label="Port">
            <Input
              value={data.ports?.[0] || config.defaultPortMapping || ''}
              onChange={(e) => {
                const value = e.target.value;
                updateField('ports', value ? [value] : []);
              }}
              placeholder={config.defaultPortMapping || '8080:8080'}
            />
          </FormField>
        </div>
      </details>

      {/* Build Setting */}
      {config.buildRequired && (
        <details open>
          <summary style={{ cursor: 'pointer', fontWeight: 600, marginBottom: '1rem', fontSize: '0.875rem' }}>
            Build Setting
          </summary>
          <div style={{ paddingLeft: '0.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <FormField label="Build Path">
              <Input
                value={(data as ServiceNodeData).build || config.defaultBuildPath || ''}
                onChange={(e) => updateField('build', e.target.value)}
                placeholder={config.defaultBuildPath}
              />
            </FormField>
          </div>
        </details>
      )}

      {/* Environment Variables */}
      <details open>
        <summary style={{ cursor: 'pointer', fontWeight: 600, marginBottom: '1rem', fontSize: '0.875rem' }}>
          Environment Variables
        </summary>
        <div style={{ paddingLeft: '0.5rem' }}>
          <KeyValueEditor
            entries={data.env || {}}
            onChange={updateAllEnv}
            keyPlaceholder="KEY"
            valuePlaceholder="VALUE"
          />
        </div>
      </details>

      {/* Health Check */}
      {config.defaultHealthCheck && (
        <details open>
          <summary style={{ cursor: 'pointer', fontWeight: 600, marginBottom: '1rem', fontSize: '0.875rem' }}>
            Health Check
          </summary>
          <div style={{ paddingLeft: '0.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {config.defaultHealthCheck?.httpGet && (
              <>
                <FormField label="HTTP Path">
                  <Input
                    value={(data.health && 'httpGet' in data.health) ? data.health.httpGet?.path || config.defaultHealthCheck?.httpGet?.path || '/health' : config.defaultHealthCheck?.httpGet?.path || '/health'}
                    onChange={(e) => {
                      const currentPort = (data.health && 'httpGet' in data.health) ? data.health.httpGet?.port || config.defaultHealthCheck?.httpGet?.port || 8080 : 8080;
                      updateField('health', { httpGet: { path: e.target.value, port: currentPort } });
                    }}
                  />
                </FormField>
                <FormField label="Port">
                  <Input
                    type="number"
                    value={(data.health && 'httpGet' in data.health) ? data.health.httpGet?.port || config.defaultHealthCheck?.httpGet?.port || 8080 : config.defaultHealthCheck?.httpGet?.port || 8080}
                    onChange={(e) => {
                      const currentPath = (data.health && 'httpGet' in data.health) ? data.health.httpGet?.path || config.defaultHealthCheck?.httpGet?.path || '/health' : '/health';
                      updateField('health', { httpGet: { path: currentPath, port: Number(e.target.value) } });
                    }}
                  />
                </FormField>
              </>
            )}
            {config.defaultHealthCheck.tcp && !config.defaultHealthCheck?.httpGet && (
              <FormField label="TCP Port">
                <Input
                  type="number"
                  value={data.health?.tcp?.port || config.defaultHealthCheck.tcp.port}
                  onChange={(e) => updateField('health', { tcp: { port: Number(e.target.value) } })}
                />
              </FormField>
            )}
          </div>
        </details>
      )}
    </div>
  );
}
