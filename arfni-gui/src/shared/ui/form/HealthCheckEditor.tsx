import { useState } from 'react';

interface HealthCheck {
  test?: string[];
  interval?: string;
  timeout?: string;
  retries?: number;
  start_period?: string;
}

interface HealthCheckEditorProps {
  value: HealthCheck | null;
  onChange: (value: HealthCheck | null) => void;
  label?: string;
}

type HealthCheckType = 'none' | 'http' | 'tcp' | 'exec';

export function HealthCheckEditor({ value, onChange, label }: HealthCheckEditorProps) {
  // Determine current health check type
  const getCurrentType = (): HealthCheckType => {
    if (!value || !value.test) return 'none';
    const testStr = Array.isArray(value.test) ? value.test.join(' ') : value.test;
    if (testStr.includes('curl') || testStr.includes('wget')) return 'http';
    if (testStr.includes('nc ') || testStr.includes('telnet')) return 'tcp';
    return 'exec';
  };

  const [healthType, setHealthType] = useState<HealthCheckType>(getCurrentType());
  const [httpUrl, setHttpUrl] = useState(value?.test?.[2]?.split(' ')[1] || 'http://localhost:8000/health');
  const [tcpPort, setTcpPort] = useState('8000');
  const [execCommand, setExecCommand] = useState(
    value?.test ? (Array.isArray(value.test) ? value.test.slice(2).join(' ') : value.test) : ''
  );
  const [interval, setInterval] = useState(value?.interval || '30s');
  const [timeout, setTimeout] = useState(value?.timeout || '10s');
  const [retries, setRetries] = useState(value?.retries || 3);
  const [startPeriod, setStartPeriod] = useState(value?.start_period || '0s');

  const handleTypeChange = (newType: HealthCheckType) => {
    setHealthType(newType);

    if (newType === 'none') {
      onChange(null);
      return;
    }

    updateHealthCheck(newType);
  };

  const updateHealthCheck = (type: HealthCheckType = healthType) => {
    if (type === 'none') {
      onChange(null);
      return;
    }

    let test: string[];

    switch (type) {
      case 'http':
        test = ['CMD-SHELL', `curl -f ${httpUrl} || exit 1`];
        break;
      case 'tcp':
        test = ['CMD-SHELL', `nc -z localhost ${tcpPort} || exit 1`];
        break;
      case 'exec':
        test = ['CMD-SHELL', execCommand];
        break;
      default:
        return;
    }

    onChange({
      test,
      interval,
      timeout,
      retries,
      start_period: startPeriod
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {label && (
        <label style={{ fontWeight: 500, fontSize: '0.875rem' }}>
          {label}
        </label>
      )}

      {/* Health Check Type Selector */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <label style={{ fontSize: '0.75rem', color: '#666' }}>Check Type</label>
        <select
          value={healthType}
          onChange={(e) => handleTypeChange(e.target.value as HealthCheckType)}
          style={{
            padding: '0.5rem',
            border: '1px solid #ddd',
            borderRadius: '4px',
            fontSize: '0.875rem'
          }}
        >
          <option value="none">No Health Check</option>
          <option value="http">HTTP Check</option>
          <option value="tcp">TCP Port Check</option>
          <option value="exec">Custom Command</option>
        </select>
      </div>

      {/* Type-specific configuration */}
      {healthType === 'http' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <label style={{ fontSize: '0.75rem', color: '#666' }}>HTTP URL</label>
          <input
            type="text"
            value={httpUrl}
            onChange={(e) => {
              setHttpUrl(e.target.value);
              setTimeout(() => updateHealthCheck(), 0);
            }}
            placeholder="http://localhost:8000/health"
            style={{
              padding: '0.5rem',
              border: '1px solid #ddd',
              borderRadius: '4px',
              fontSize: '0.875rem'
            }}
          />
        </div>
      )}

      {healthType === 'tcp' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <label style={{ fontSize: '0.75rem', color: '#666' }}>TCP Port</label>
          <input
            type="text"
            value={tcpPort}
            onChange={(e) => {
              setTcpPort(e.target.value);
              setTimeout(() => updateHealthCheck(), 0);
            }}
            placeholder="8000"
            style={{
              padding: '0.5rem',
              border: '1px solid #ddd',
              borderRadius: '4px',
              fontSize: '0.875rem'
            }}
          />
        </div>
      )}

      {healthType === 'exec' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <label style={{ fontSize: '0.75rem', color: '#666' }}>Command</label>
          <input
            type="text"
            value={execCommand}
            onChange={(e) => {
              setExecCommand(e.target.value);
              setTimeout(() => updateHealthCheck(), 0);
            }}
            placeholder="pg_isready -U postgres"
            style={{
              padding: '0.5rem',
              border: '1px solid #ddd',
              borderRadius: '4px',
              fontSize: '0.875rem'
            }}
          />
        </div>
      )}

      {/* Common health check settings */}
      {healthType !== 'none' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <label style={{ fontSize: '0.75rem', color: '#666' }}>Interval</label>
              <input
                type="text"
                value={interval}
                onChange={(e) => {
                  setInterval(e.target.value);
                  setTimeout(() => updateHealthCheck(), 0);
                }}
                placeholder="30s"
                style={{
                  padding: '0.5rem',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  fontSize: '0.875rem'
                }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <label style={{ fontSize: '0.75rem', color: '#666' }}>Timeout</label>
              <input
                type="text"
                value={timeout}
                onChange={(e) => {
                  setTimeout(e.target.value);
                  setTimeout(() => updateHealthCheck(), 0);
                }}
                placeholder="10s"
                style={{
                  padding: '0.5rem',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  fontSize: '0.875rem'
                }}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <label style={{ fontSize: '0.75rem', color: '#666' }}>Retries</label>
              <input
                type="number"
                value={retries}
                onChange={(e) => {
                  setRetries(Number(e.target.value));
                  setTimeout(() => updateHealthCheck(), 0);
                }}
                min="1"
                max="10"
                style={{
                  padding: '0.5rem',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  fontSize: '0.875rem'
                }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <label style={{ fontSize: '0.75rem', color: '#666' }}>Start Period</label>
              <input
                type="text"
                value={startPeriod}
                onChange={(e) => {
                  setStartPeriod(e.target.value);
                  setTimeout(() => updateHealthCheck(), 0);
                }}
                placeholder="0s"
                style={{
                  padding: '0.5rem',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  fontSize: '0.875rem'
                }}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
