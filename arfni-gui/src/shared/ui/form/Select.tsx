import React from 'react';

interface SelectOption {
  label: string;
  value: string;
}

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  options: SelectOption[];
  fullWidth?: boolean;
}

export function Select({ options, fullWidth = true, ...props }: SelectProps) {
  return (
    <select
      {...props}
      style={{
        width: fullWidth ? '100%' : 'auto',
        padding: '0.5rem',
        border: '1px solid #ccc',
        borderRadius: '4px',
        fontSize: '0.875rem',
        backgroundColor: 'white',
        ...props.style
      }}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
