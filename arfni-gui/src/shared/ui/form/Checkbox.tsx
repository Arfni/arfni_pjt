import React from 'react';

interface CheckboxProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

export function Checkbox({ label, ...props }: CheckboxProps) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
      <input
        type="checkbox"
        {...props}
        style={{
          marginRight: '0.5rem',
          cursor: 'pointer',
          ...props.style
        }}
      />
      {label && <span>{label}</span>}
    </label>
  );
}
