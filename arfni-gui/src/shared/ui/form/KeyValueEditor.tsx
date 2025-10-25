import React, { useState } from 'react';
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
          <div
            key={key}
            style={{
              display: 'flex',
              gap: '0.5rem',
              marginBottom: '0.5rem',
              alignItems: 'center'
            }}
          >
            <Input
              value={key}
              disabled
              fullWidth={false}
              style={{ flex: '0 0 150px', backgroundColor: '#f5f5f5' }}
            />
            <Input
              value={value}
              onChange={(e) => handleUpdate(key, e.target.value)}
              placeholder={valuePlaceholder}
              style={{ flex: 1 }}
            />
            <button
              onClick={() => handleRemove(key)}
              style={{
                padding: '0.5rem 0.75rem',
                border: '1px solid #ccc',
                borderRadius: '4px',
                backgroundColor: '#fff',
                cursor: 'pointer',
                fontSize: '0.875rem'
              }}
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      {/* Add new entry */}
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
        <Input
          value={newKey}
          onChange={(e) => setNewKey(e.target.value)}
          placeholder={keyPlaceholder}
          fullWidth={false}
          style={{ flex: '0 0 150px' }}
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
          style={{ flex: 1 }}
          onKeyPress={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleAdd();
            }
          }}
        />
        <button
          onClick={handleAdd}
          disabled={!newKey.trim() || !newValue.trim()}
          style={{
            padding: '0.5rem 0.75rem',
            border: '1px solid #ccc',
            borderRadius: '4px',
            backgroundColor: !newKey.trim() || !newValue.trim() ? '#f5f5f5' : '#007bff',
            color: !newKey.trim() || !newValue.trim() ? '#999' : 'white',
            cursor: !newKey.trim() || !newValue.trim() ? 'not-allowed' : 'pointer',
            fontSize: '0.875rem'
          }}
        >
          +
        </button>
      </div>
    </div>
  );
}
