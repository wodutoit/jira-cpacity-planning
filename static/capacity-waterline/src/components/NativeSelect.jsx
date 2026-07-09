import React from 'react';

// Lightweight CSP-safe select — use instead of @atlaskit/select where a native
// dropdown is sufficient (version picker, simple field pickers).
export default function NativeSelect({ options = [], value, onChange, placeholder, disabled }) {
  return (
    <select
      className="native-select"
      value={value ?? ''}
      onChange={e => onChange(e.target.value || null)}
      disabled={disabled}
    >
      {placeholder && <option value="">{placeholder}</option>}
      {options.map(o => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}
