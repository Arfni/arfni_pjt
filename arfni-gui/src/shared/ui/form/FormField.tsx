import React from 'react';

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
          {tooltip && (
            <span className="relative group inline-flex">
              <span className="cursor-help text-gray-400 hover:text-gray-600 text-xs border border-gray-300 rounded-full w-4 h-4 inline-flex items-center justify-center leading-none select-none">
                ?
              </span>
              <span className="absolute left-5 top-0 z-50 invisible group-hover:visible bg-gray-800 text-white text-xs rounded px-2 py-1.5 w-52 whitespace-normal font-normal pointer-events-none shadow-lg">
                {tooltip}
              </span>
            </span>
          )}
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
