import { useAppDispatch } from '@app/hooks';
import { updateNode } from '../model/canvasSlice';
import { CustomNode, ServiceNodeData, DatabaseNodeData } from '../model/types';
import { FormField, Input, Select, KeyValueEditor } from '../../../shared/ui/form';
import { HealthCheckEditor } from '../../../shared/ui/form/HealthCheckEditor';
import { VolumeArrayEditor } from '../../../shared/ui/form/VolumeArrayEditor';
import { TargetPropertyForm } from './TargetPropertyForm';
import { pluginService } from '@services/pluginLoader';

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

  // Get plugin for this service type
  const pluginPropertyForm = pluginService.getPropertyForm(serviceType);
  const plugin = pluginService.getPluginByServiceType(serviceType) || pluginService.getPluginByNodeType(serviceType);

  if (!plugin) {
    return (
      <div style={{ padding: '1rem' }}>
        <p>Unknown service type: {serviceType}</p>
        <p>No plugin found for this service. Please ensure the plugin is properly installed.</p>
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

  // 플러그인 속성 업데이트 헬퍼 - properties 필드에 저장
  const updateProperty = (propName: string, value: any) => {
    const currentProps = (data as ServiceNodeData).properties || {};
    dispatch(updateNode({
      id: node.id,
      data: {
        ...data,
        properties: {
          ...currentProps,
          [propName]: value
        }
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

            {/* Port Mapping */}
            <FormField label="Port Mapping">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: '0.5rem', alignItems: 'center' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <label style={{ fontSize: '0.7rem', color: '#6b7280', fontWeight: 500 }}>Host Port</label>
                  <Input
                    type="text"
                    value={data.ports?.[0]?.split(':')[0] || ''}
                    onChange={(e) => {
                      const hostPort = e.target.value;
                      const containerPort = data.ports?.[0]?.split(':')[1] || hostPort;
                      updateField('ports', hostPort && containerPort ? [`${hostPort}:${containerPort}`] : []);
                    }}
                    placeholder="3306"
                  />
                </div>
                <div style={{ paddingTop: '1.2rem', fontSize: '1.2rem', fontWeight: 'bold', color: '#9ca3af' }}>:</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <label style={{ fontSize: '0.7rem', color: '#6b7280', fontWeight: 500 }}>Container Port</label>
                  <Input
                    type="text"
                    value={data.ports?.[0]?.split(':')[1] || ''}
                    onChange={(e) => {
                      const containerPort = e.target.value;
                      const hostPort = data.ports?.[0]?.split(':')[0] || containerPort;
                      updateField('ports', hostPort && containerPort ? [`${hostPort}:${containerPort}`] : []);
                    }}
                    placeholder="3306"
                  />
                </div>
              </div>
            </FormField>
          </div>
        </details>


        {/* Storage & Volumes */}
        <details open>
          <summary style={{ cursor: 'pointer', fontWeight: 600, marginBottom: '1rem', fontSize: '0.875rem' }}>
            Storage & Volumes
          </summary>
          <div style={{ paddingLeft: '0.5rem' }}>
            <VolumeArrayEditor
              values={(() => {
                // Use user-defined volumes if available
                if (data.volumes && data.volumes.length > 0) {
                  return data.volumes;
                }

                // Otherwise get from plugin template
                const plugin = pluginService.getPluginByNodeType(serviceType);
                if (plugin?.manifest.contributes?.services) {
                  const serviceTemplate = plugin.manifest.contributes.services[serviceType];
                  if (serviceTemplate?.spec?.volumes) {
                    const volumes = serviceTemplate.spec.volumes;
                    // Handle both string format ("host:mount") and object format ({host, mount})
                    return volumes.map((vol: any) => {
                      if (typeof vol === 'string') {
                        const [host, mount] = vol.split(':');
                        return { host, mount };
                      }
                      return vol;
                    });
                  }
                }

                return [];
              })()}
              onChange={(volumes) => updateField('volumes', volumes)}
              label="Volume Mounts"
            />
          </div>
        </details>

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
              entries={(() => {
                // If user has defined env vars, use only those (don't merge with template)
                if (data.env && Object.keys(data.env).length > 0) {
                  return data.env;
                }

                // Otherwise, use plugin template as initial values
                const allEnv: Record<string, string> = {};

                const plugin = pluginService.getPluginByNodeType(serviceType);
                if (plugin?.manifest.contributes?.services) {
                  const serviceTemplate = plugin.manifest.contributes.services[serviceType];
                  // Support both 'env' and 'environment' keys
                  const envVars = serviceTemplate?.spec?.env || serviceTemplate?.spec?.environment;
                  if (envVars) {
                    Object.entries(envVars).forEach(([key, value]) => {
                      allEnv[key] = String(value);
                    });
                  }
                }

                return allEnv;
              })()}
              onChange={updateAllEnv}
              keyPlaceholder="KEY"
              valuePlaceholder="Value"
            />
          </div>
        </details>

        {/* Health Check */}
        <details>
          <summary style={{ cursor: 'pointer', fontWeight: 600, marginBottom: '1rem', fontSize: '0.875rem' }}>
            Health Check
          </summary>
          <div style={{ paddingLeft: '0.5rem' }}>
            <HealthCheckEditor
              value={(() => {
                // Use user-defined health check if available
                if ((data as any).health) {
                  return (data as any).health;
                }

                // Otherwise get from plugin template
                const plugin = pluginService.getPluginByNodeType(serviceType);
                if (plugin?.manifest.contributes?.services) {
                  const serviceTemplate = plugin.manifest.contributes.services[serviceType];
                  // Support both 'health' and 'healthcheck' keys
                  const healthConfig = serviceTemplate?.spec?.health || serviceTemplate?.spec?.healthcheck;
                  if (healthConfig) {
                    return healthConfig;
                  }
                }

                return null;
              })()}
              onChange={(health) => updateField('health', health)}
              label="Container Health Check"
            />
          </div>
        </details>
      </div>
    );
  }

  // Service 노드인 경우 - 플러그인 기반 PropertyForm 렌더링
  if (pluginPropertyForm && pluginPropertyForm.length > 0) {
    const serviceData = data as ServiceNodeData;
    const properties = serviceData.properties || {};

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

            {/* Port Mapping */}
            <FormField label="Port Mapping">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: '0.5rem', alignItems: 'center' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <label style={{ fontSize: '0.7rem', color: '#6b7280', fontWeight: 500 }}>Host Port</label>
                  <Input
                    type="text"
                    value={data.ports?.[0]?.split(':')[0] || '8000'}
                    onChange={(e) => {
                      const hostPort = e.target.value;
                      const containerPort = data.ports?.[0]?.split(':')[1] || hostPort;
                      updateField('ports', hostPort && containerPort ? [`${hostPort}:${containerPort}`] : []);
                    }}
                    placeholder="8000"
                  />
                </div>
                <div style={{ paddingTop: '1.2rem', fontSize: '1.2rem', fontWeight: 'bold', color: '#9ca3af' }}>:</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <label style={{ fontSize: '0.7rem', color: '#6b7280', fontWeight: 500 }}>Container Port</label>
                  <Input
                    type="text"
                    value={data.ports?.[0]?.split(':')[1] || '8000'}
                    onChange={(e) => {
                      const containerPort = e.target.value;
                      const hostPort = data.ports?.[0]?.split(':')[0] || containerPort;
                      updateField('ports', hostPort && containerPort ? [`${hostPort}:${containerPort}`] : []);
                    }}
                    placeholder="8000"
                  />
                </div>
              </div>
            </FormField>

            {/* Plugin Build Path */}
            <FormField label="Build Path">
              <Input
                value={serviceData.build || './'}
                onChange={(e) => updateField('build', e.target.value)}
                placeholder="./"
              />
            </FormField>
          </div>
        </details>

        {/* Plugin-specific Properties */}
        <details open>
          <summary style={{ cursor: 'pointer', fontWeight: 600, marginBottom: '1rem', fontSize: '0.875rem' }}>
            {plugin?.manifest?.displayName || serviceType} Configuration
          </summary>
          <div style={{ paddingLeft: '0.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {pluginPropertyForm.map((field: any) => {
              const currentValue = properties[field.name] !== undefined
                ? properties[field.name]
                : field.default || '';

              return (
                <FormField
                  key={field.name}
                  label={field.label || field.name}
                  required={field.required}
                >
                  {field.type === 'select' ? (
                    <Select
                      value={String(currentValue)}
                      onChange={(e) => updateProperty(field.name, e.target.value)}
                      options={field.options?.map((opt: string) => ({ label: opt, value: opt })) || []}
                    />
                  ) : field.type === 'number' ? (
                    <Input
                      type="number"
                      value={currentValue}
                      onChange={(e) => updateProperty(field.name, Number(e.target.value))}
                      placeholder={String(field.default || '')}
                    />
                  ) : field.type === 'checkbox' ? (
                    <input
                      type="checkbox"
                      checked={Boolean(currentValue)}
                      onChange={(e) => updateProperty(field.name, e.target.checked)}
                      style={{ width: 'auto', marginRight: '0.5rem' }}
                    />
                  ) : (
                    <Input
                      type={field.type || 'text'}
                      value={String(currentValue)}
                      onChange={(e) => updateProperty(field.name, e.target.value)}
                      placeholder={field.placeholder || String(field.default || '')}
                    />
                  )}
                  {field.description && (
                    <p style={{ fontSize: '0.75rem', color: '#666', marginTop: '0.25rem' }}>
                      {field.description}
                    </p>
                  )}
                </FormField>
              );
            })}
          </div>
        </details>

        {/* Storage & Volumes */}
        <details>
          <summary style={{ cursor: 'pointer', fontWeight: 600, marginBottom: '1rem', fontSize: '0.875rem' }}>
            Storage & Volumes
          </summary>
          <div style={{ paddingLeft: '0.5rem' }}>
            <VolumeArrayEditor
              values={(() => {
                // Use user-defined volumes if available
                if ((data as any).volumes && (data as any).volumes.length > 0) {
                  return (data as any).volumes;
                }

                // Otherwise get from plugin template
                const plugin = pluginService.getPluginByNodeType(serviceType);
                if (plugin?.manifest.contributes?.services) {
                  const serviceTemplate = plugin.manifest.contributes.services[serviceType];
                  if (serviceTemplate?.spec?.volumes) {
                    const volumes = serviceTemplate.spec.volumes;
                    // Handle both string format ("host:mount") and object format ({host, mount})
                    return volumes.map((vol: any) => {
                      if (typeof vol === 'string') {
                        const [host, mount] = vol.split(':');
                        return { host, mount };
                      }
                      return vol;
                    });
                  }
                }

                return [];
              })()}
              onChange={(volumes) => updateField('volumes', volumes)}
              label="Volume Mounts"
            />
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
              valuePlaceholder="VALUE"
            />
          </div>
        </details>

        {/* Health Check - New Editor */}
        <details>
          <summary style={{ cursor: 'pointer', fontWeight: 600, marginBottom: '1rem', fontSize: '0.875rem' }}>
            Health Check
          </summary>
          <div style={{ paddingLeft: '0.5rem' }}>
            <HealthCheckEditor
              value={(() => {
                // Use user-defined health check if available
                if ((data as any).health) {
                  return (data as any).health;
                }

                // Otherwise get from plugin template
                const plugin = pluginService.getPluginByNodeType(serviceType);
                if (plugin?.manifest.contributes?.services) {
                  const serviceTemplate = plugin.manifest.contributes.services[serviceType];
                  // Support both 'health' and 'healthcheck' keys
                  const healthConfig = serviceTemplate?.spec?.health || serviceTemplate?.spec?.healthcheck;
                  if (healthConfig) {
                    return healthConfig;
                  }
                }

                return null;
              })()}
              onChange={(health) => updateField('health', health)}
              label="Container Health Check"
            />
          </div>
        </details>

      </div>
    );
  }

  // No plugin found - should never reach here due to early return above
  return (
    <div style={{ padding: '1rem' }}>
      <p>Unknown service configuration</p>
    </div>
  );
}