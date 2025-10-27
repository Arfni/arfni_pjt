import React from 'react';
import { useAppDispatch } from '@app/hooks';
import { updateNode } from '../model/canvasSlice';
import { CustomNode, ServiceNodeData, DatabaseNodeData } from '../model/types';
import { getServiceConfig, ServiceTypeConfig } from '../config/serviceConfigs';
import { FormField, Input, Select, Checkbox, KeyValueEditor } from '../../../shared/ui/form';

interface DynamicPropertyFormProps {
  node: CustomNode;
}

export function DynamicPropertyForm({ node }: DynamicPropertyFormProps) {
  const dispatch = useAppDispatch();
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

  return (
    <div className="dynamic-property-form" style={{ padding: '1rem', overflowY: 'auto' }}>
      <h3 style={{ marginBottom: '1rem', fontSize: '1.125rem', fontWeight: 600 }}>
        {config.name} Configuration
      </h3>

      {/* Service Name */}
      <FormField label="Service Name" required>
        <Input
          value={data.name}
          onChange={(e) => updateField('name', e.target.value)}
          placeholder="my-service"
        />
      </FormField>

      {/* Version (if supported) */}
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

      {/* Build Path (if build required) */}
      {config.buildRequired && (
        <FormField
          label="Build Path"
          description="Relative path to application source code"
        >
          <Input
            value={(data as ServiceNodeData).build || config.defaultBuildPath || ''}
            onChange={(e) => updateField('build', e.target.value)}
            placeholder={config.defaultBuildPath}
          />
        </FormField>
      )}

      {/* Image (if not build required) */}
      {!config.buildRequired && config.defaultImage && (
        <FormField label="Image">
          <Input
            value={(data as ServiceNodeData).image || config.defaultImage}
            onChange={(e) => updateField('image', e.target.value)}
            placeholder={config.defaultImage}
          />
        </FormField>
      )}

      {/* Ports */}
      <FormField
        label="Ports"
        description="Format: host:container (e.g., 8080:8080)"
      >
        <Input
          value={data.ports?.[0] || config.defaultPortMapping || ''}
          onChange={(e) => {
            const value = e.target.value;
            updateField('ports', value ? [value] : []);
          }}
          placeholder={config.defaultPortMapping || '8080:8080'}
        />
      </FormField>

      {/* Required Environment Variables */}
      {config.requiredEnvVars && config.requiredEnvVars.length > 0 && (
        <>
          <h4 style={{ marginTop: '1.5rem', marginBottom: '0.75rem', fontSize: '0.95rem', fontWeight: 600 }}>
            Environment Variables
          </h4>
          {config.requiredEnvVars.map((envVar) => {
            const currentValue = data.env?.[envVar.key] || envVar.defaultValue || '';

            return (
              <FormField
                key={envVar.key}
                label={envVar.label || envVar.key}
                required={envVar.required}
                description={envVar.description}
              >
                {envVar.type === 'boolean' ? (
                  <Checkbox
                    checked={currentValue === 'true' || currentValue === true}
                    onChange={(e) => updateEnv(envVar.key, e.target.checked ? 'true' : 'false')}
                  />
                ) : (
                  <Input
                    type={envVar.type}
                    value={String(currentValue)}
                    onChange={(e) => updateEnv(envVar.key, e.target.value)}
                    placeholder={envVar.placeholder || String(envVar.defaultValue || '')}
                  />
                )}
              </FormField>
            );
          })}
        </>
      )}

      {/* Optional Environment Variables (Collapsible) */}
      {config.optionalEnvVars && config.optionalEnvVars.length > 0 && (
        <details style={{ marginTop: '1rem' }}>
          <summary style={{ cursor: 'pointer', fontWeight: 500, marginBottom: '0.5rem' }}>
            Optional Environment Variables
          </summary>
          <div style={{ paddingLeft: '1rem' }}>
            {config.optionalEnvVars.map((envVar) => {
              const currentValue = data.env?.[envVar.key] || envVar.defaultValue || '';

              return (
                <FormField
                  key={envVar.key}
                  label={envVar.label || envVar.key}
                  description={envVar.description}
                >
                  {envVar.type === 'boolean' ? (
                    <Checkbox
                      checked={currentValue === 'true' || currentValue === true}
                      onChange={(e) => updateEnv(envVar.key, e.target.checked ? 'true' : 'false')}
                    />
                  ) : (
                    <Input
                      type={envVar.type}
                      value={String(currentValue)}
                      onChange={(e) => updateEnv(envVar.key, e.target.value)}
                      placeholder={envVar.placeholder || String(envVar.defaultValue || '')}
                    />
                  )}
                </FormField>
              );
            })}
          </div>
        </details>
      )}

      {/* Custom Environment Variables */}
      <details style={{ marginTop: '1rem' }}>
        <summary style={{ cursor: 'pointer', fontWeight: 500, marginBottom: '0.5rem' }}>
          Custom Environment Variables
        </summary>
        <div style={{ paddingLeft: '1rem' }}>
          <KeyValueEditor
            entries={data.env || {}}
            onChange={updateAllEnv}
            keyPlaceholder="VARIABLE_NAME"
            valuePlaceholder="value"
          />
        </div>
      </details>

      {/* Additional Fields (service-specific) */}
      {config.additionalFields && config.additionalFields.length > 0 && (
        <>
          <h4 style={{ marginTop: '1.5rem', marginBottom: '0.75rem', fontSize: '0.95rem', fontWeight: 600 }}>
            Additional Settings
          </h4>
          {config.additionalFields.map((field) => {
            const currentValue = (data as any)[field.key] || field.defaultValue || '';

            return (
              <FormField
                key={field.key}
                label={field.label}
                description={field.description}
              >
                {field.type === 'select' && field.options ? (
                  <Select
                    value={String(currentValue)}
                    onChange={(e) => updateField(field.key, e.target.value)}
                    options={field.options}
                  />
                ) : field.type === 'boolean' ? (
                  <Checkbox
                    checked={currentValue === true || currentValue === 'true'}
                    onChange={(e) => updateField(field.key, e.target.checked)}
                  />
                ) : (
                  <Input
                    type={field.type}
                    value={String(currentValue)}
                    onChange={(e) => {
                      const value = field.type === 'number'
                        ? Number(e.target.value)
                        : e.target.value;
                      updateField(field.key, value);
                    }}
                  />
                )}
              </FormField>
            );
          })}
        </>
      )}

      {/* Volumes (if supported) */}
      {config.supportsVolumes && (
        <details style={{ marginTop: '1rem' }}>
          <summary style={{ cursor: 'pointer', fontWeight: 500, marginBottom: '0.5rem' }}>
            Volumes
          </summary>
          <div style={{ paddingLeft: '1rem' }}>
            <FormField label="Host Path">
              <Input
                value={data.volumes?.[0]?.host || config.defaultVolumes?.[0]?.host || ''}
                onChange={(e) => {
                  const currentMount = data.volumes?.[0]?.mount || config.defaultVolumes?.[0]?.mount || '';
                  updateField('volumes', [{ host: e.target.value, mount: currentMount }]);
                }}
                placeholder="./.arfni/data"
              />
            </FormField>
            <FormField label="Mount Path">
              <Input
                value={data.volumes?.[0]?.mount || config.defaultVolumes?.[0]?.mount || ''}
                onChange={(e) => {
                  const currentHost = data.volumes?.[0]?.host || config.defaultVolumes?.[0]?.host || '';
                  updateField('volumes', [{ host: currentHost, mount: e.target.value }]);
                }}
                placeholder="/var/lib/data"
              />
            </FormField>
          </div>
        </details>
      )}

      {/* Health Check */}
      {config.defaultHealthCheck && (
        <details style={{ marginTop: '1rem' }}>
          <summary style={{ cursor: 'pointer', fontWeight: 500, marginBottom: '0.5rem' }}>
            Health Check
          </summary>
          <div style={{ paddingLeft: '1rem' }}>
            {config.defaultHealthCheck.tcp && (
              <FormField label="TCP Port">
                <Input
                  type="number"
                  value={data.health?.tcp?.port || config.defaultHealthCheck.tcp.port}
                  onChange={(e) => updateField('health', { tcp: { port: Number(e.target.value) } })}
                />
              </FormField>
            )}
            {config.defaultHealthCheck.httpGet && (
              <>
                <FormField label="HTTP Path">
                  <Input
                    value={data.health?.httpGet?.path || config.defaultHealthCheck.httpGet.path}
                    onChange={(e) => {
                      const currentPort = data.health?.httpGet?.port || config.defaultHealthCheck.httpGet?.port || 8080;
                      updateField('health', { httpGet: { path: e.target.value, port: currentPort } });
                    }}
                  />
                </FormField>
                <FormField label="HTTP Port">
                  <Input
                    type="number"
                    value={data.health?.httpGet?.port || config.defaultHealthCheck.httpGet.port}
                    onChange={(e) => {
                      const currentPath = data.health?.httpGet?.path || config.defaultHealthCheck.httpGet?.path || '/health';
                      updateField('health', { httpGet: { path: currentPath, port: Number(e.target.value) } });
                    }}
                  />
                </FormField>
              </>
            )}
          </div>
        </details>
      )}
    </div>
  );
}
