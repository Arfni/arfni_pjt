import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  fullWidth?: boolean;
}

export function Input({ fullWidth = true, ...props }: InputProps) {
  return (
    <input
      {...props}
      style={{
        width: fullWidth ? '100%' : 'auto',
        padding: '0.5rem',
        border: '1px solid #ccc',
        borderRadius: '4px',
        fontSize: '0.875rem',
        ...props.style
      }}
    />
  );
}
