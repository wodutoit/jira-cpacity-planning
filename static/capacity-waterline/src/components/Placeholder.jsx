import React from 'react';

export default function Placeholder({ title, description, screens }) {
  return (
    <div style={{ maxWidth: 640 }}>
      <div style={{
        background: '#fff',
        borderRadius: 8,
        border: '1px solid #DFE1E6',
        padding: 32,
      }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: '#172B4D', marginBottom: 8 }}>
          {title}
        </h2>
        <p style={{ fontSize: 14, color: '#6B778C', marginBottom: 24, lineHeight: 1.5 }}>
          {description}
        </p>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#97A0AF', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
          Components to build
        </div>
        <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {screens.map((s) => (
            <li key={s} style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 8,
              fontSize: 14,
              color: '#344563',
              lineHeight: 1.4,
            }}>
              <span style={{ color: '#DFE1E6', flexShrink: 0, marginTop: 2 }}>○</span>
              {s}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
