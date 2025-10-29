import { useState } from 'react';
import { Input } from './Input';

interface KeyValueEditorProps {
  entries: Record<string, string>;
  onChange: (entries: Record<string, string>) => void;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
}

export function KeyValueEditor({
  entries,
  onChange,
  keyPlaceholder = 'KEY',
  valuePlaceholder = 'value'
}: KeyValueEditorProps) {
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');

  const handleAdd = () => {
    if (newKey.trim() && newValue.trim()) {
      onChange({
        ...entries,
        [newKey.trim()]: newValue.trim()
      });
      setNewKey('');
      setNewValue('');
    }
  };

  const handleRemove = (key: string) => {
    const updated = { ...entries };
    delete updated[key];
    onChange(updated);
  };

  const handleUpdate = (oldKey: string, newVal: string) => {
    onChange({
      ...entries,
      [oldKey]: newVal
    });
  };

  return (
    <div className="key-value-editor">
      {/* Existing entries */}
      <div style={{ marginBottom: '0.5rem' }}>
        {Object.entries(entries).map(([key, value]) => (
          <div key={key} style={{ marginBottom: '0.5rem' }}>
            <div
              style={{
                display: 'flex',
                gap: '0.5rem',
                width: '100%',
                marginBottom: '0.25rem',
                alignItems: 'center'
              }}
            >
              <Input
                value={key}
                disabled
                fullWidth={false}
                style={{ width: '50%', backgroundColor: '#f5f5f5' }}
              />
              <Input
                value={value}
                onChange={(e) => handleUpdate(key, e.target.value)}
                placeholder={valuePlaceholder}
                style={{ width: '50%'}}
              />
            </div>
            <button
              onClick={() => handleRemove(key)}
              style={{
                width: '100%',
                padding: '0.5rem',
                border: '1px solid #E5E7EB',
                borderRadius: '4px',
                backgroundColor: '#fff',
                cursor: 'pointer',
                fontSize: '0.875rem',
                color: '#DC2626',
                fontWeight: 500
              }}
            >
              Remove
            </button>
          </div>
        ))}
      </div>

      {/* Add new entry */}
      <div>
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
          <Input
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
            placeholder={keyPlaceholder}
            fullWidth={false}
            style={{ flex: 1, width: "50%" }}
            onKeyPress={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAdd();
              }
            }}
          />
          <Input
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            placeholder={valuePlaceholder}
            style={{ flex: 1, width: "50%" }}
            onKeyPress={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAdd();
              }
            }}
          />
        </div>
        <button
          onClick={handleAdd}
          disabled={!newKey.trim() || !newValue.trim()}
          style={{
            width: '100%',
            padding: '0.625rem',
            border: 'none',
            borderRadius: '4px',
            backgroundColor: !newKey.trim() || !newValue.trim() ? '#E5E7EB' : '#4F46E5',
            color: !newKey.trim() || !newValue.trim() ? '#9CA3AF' : 'white',
            cursor: !newKey.trim() || !newValue.trim() ? 'not-allowed' : 'pointer',
            fontSize: '0.875rem',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.25rem'
          }}
        >
          <span style={{ fontSize: '1rem' }}>+</span>
          Add Variable
        </button>
      </div>
    </div>
  );
}
