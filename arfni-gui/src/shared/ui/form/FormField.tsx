import React from 'react';
import { Tooltip } from './Tooltip';

interface FormFieldProps {
  label: string;
  required?: boolean;
  tooltip?: string;
  description?: string;
  error?: string;
  children: React.ReactNode;
}

export function FormField({
  label,
  required = false,
  tooltip,
  description,
  error,
  children
}: FormFieldProps) {
  return (
    <div className="form-field" style={{ marginBottom: '1rem' }}>
      <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>
        <span className="inline-flex items-center gap-1">
          {label}
          {required && <span style={{ color: 'red' }}>*</span>}
          {tooltip && <Tooltip content={tooltip} />}
        </span>
      </label>
      {description && (
        <p style={{ fontSize: '0.875rem', color: '#666', marginBottom: '0.5rem' }}>
          {description}
        </p>
      )}
      {children}
      {error && (
        <p style={{ fontSize: '0.875rem', color: 'red', marginTop: '0.25rem' }}>
          {error}
        </p>
      )}
    </div>
  );
}
