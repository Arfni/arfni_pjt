import React from 'react';

interface FormFieldProps {
  label: string;
  required?: boolean;
  description?: string;
  error?: string;
  children: React.ReactNode;
}

export function FormField({
  label,
  required = false,
  description,
  error,
  children
}: FormFieldProps) {
  return (
    <div className="form-field" style={{ marginBottom: '1rem' }}>
      <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>
        {label}
        {required && <span style={{ color: 'red', marginLeft: '0.25rem' }}>*</span>}
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
