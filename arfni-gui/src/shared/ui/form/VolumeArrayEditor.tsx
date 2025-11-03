import { useState } from 'react';

interface Volume {
  host: string;
  mount: string;
}

interface VolumeArrayEditorProps {
  values: Volume[] | string[];
  onChange: (values: Volume[]) => void;
  label?: string;
}

export function VolumeArrayEditor({ values = [], onChange, label }: VolumeArrayEditorProps) {
  // Normalize values to Volume[] format
  const normalizeVolumes = (vals: Volume[] | string[]): Volume[] => {
    if (!vals || vals.length === 0) return [];

    return vals.map((v) => {
      if (typeof v === 'string') {
        // Parse "host:mount" format
        const parts = v.split(':');
        return {
          host: parts[0] || '',
          mount: parts[1] || ''
        };
      }
      return v;
    });
  };

  const volumes = normalizeVolumes(values);
  const [newHost, setNewHost] = useState('');
  const [newMount, setNewMount] = useState('');

  const handleAdd = () => {
    if (newHost.trim() && newMount.trim()) {
      onChange([...volumes, { host: newHost.trim(), mount: newMount.trim() }]);
      setNewHost('');
      setNewMount('');
    }
  };

  const handleRemove = (index: number) => {
    const updated = volumes.filter((_, i) => i !== index);
    onChange(updated);
  };

  const handleChange = (index: number, field: 'host' | 'mount', value: string) => {
    const updated = [...volumes];
    updated[index] = { ...updated[index], [field]: value };
    onChange(updated);
  };

  const handleKeyPress = (e: React.KeyboardEvent, field: 'host' | 'mount') => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (field === 'host' && newHost.trim()) {
        // Move focus to mount field
        const mountInput = e.currentTarget.parentElement?.parentElement?.querySelector('input[placeholder*="Container"]') as HTMLInputElement;
        mountInput?.focus();
      } else if (field === 'mount' && newHost.trim() && newMount.trim()) {
        handleAdd();
      }
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      {label && (
        <label style={{ fontWeight: 500, fontSize: '0.875rem' }}>
          {label}
        </label>
      )}

      {/* Existing volumes */}
      {volumes.map((volume, index) => (
        <div key={index} style={{ padding: '0.75rem', border: '1px solid #e5e7eb', borderRadius: '4px', backgroundColor: '#f9fafb' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#374151' }}>Volume #{index + 1}</span>
            <button
              onClick={() => handleRemove(index)}
              style={{
                padding: '0.25rem 0.5rem',
                backgroundColor: '#ef4444',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '0.75rem',
                fontWeight: 500
              }}
              type="button"
            >
              Remove
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <div>
              <label style={{ fontSize: '0.7rem', color: '#6b7280', fontWeight: 500, display: 'block', marginBottom: '0.25rem' }}>Host Path</label>
              <input
                type="text"
                value={volume.host}
                onChange={(e) => handleChange(index, 'host', e.target.value)}
                placeholder="./data"
                style={{
                  width: '100%',
                  padding: '0.4rem',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  fontSize: '0.8rem',
                  boxSizing: 'border-box'
                }}
              />
            </div>
            <div>
              <label style={{ fontSize: '0.7rem', color: '#6b7280', fontWeight: 500, display: 'block', marginBottom: '0.25rem' }}>Container Path</label>
              <input
                type="text"
                value={volume.mount}
                onChange={(e) => handleChange(index, 'mount', e.target.value)}
                placeholder="/var/lib/data"
                style={{
                  width: '100%',
                  padding: '0.4rem',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  fontSize: '0.8rem',
                  boxSizing: 'border-box'
                }}
              />
            </div>
          </div>
        </div>
      ))}

      {/* Add new volume */}
      <div style={{ padding: '0.75rem', border: '1px dashed #d1d5db', borderRadius: '4px', backgroundColor: '#fafafa' }}>
        <div style={{ fontSize: '0.75rem', color: '#6b7280', fontWeight: 600, marginBottom: '0.5rem' }}>
          Add New Volume
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <div>
            <label style={{ fontSize: '0.7rem', color: '#6b7280', display: 'block', marginBottom: '0.25rem' }}>Host Path</label>
            <input
              type="text"
              value={newHost}
              onChange={(e) => setNewHost(e.target.value)}
              onKeyPress={(e) => handleKeyPress(e, 'host')}
              placeholder="./data"
              style={{
                width: '100%',
                padding: '0.4rem',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '0.8rem',
                boxSizing: 'border-box'
              }}
            />
          </div>
          <div>
            <label style={{ fontSize: '0.7rem', color: '#6b7280', display: 'block', marginBottom: '0.25rem' }}>Container Path</label>
            <input
              type="text"
              value={newMount}
              onChange={(e) => setNewMount(e.target.value)}
              onKeyPress={(e) => handleKeyPress(e, 'mount')}
              placeholder="/var/lib/data"
              style={{
                width: '100%',
                padding: '0.4rem',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '0.8rem',
                boxSizing: 'border-box'
              }}
            />
          </div>
          <button
            onClick={handleAdd}
            style={{
              width: '100%',
              padding: '0.5rem',
              backgroundColor: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '0.8rem',
              fontWeight: 500
            }}
            type="button"
          >
            + Add Volume
          </button>
        </div>
      </div>
    </div>
  );
}
