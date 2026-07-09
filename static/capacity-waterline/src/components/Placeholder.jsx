import React from 'react';

export default function Placeholder({ title, description, screens }) {
  return (
    <div className="card">
      <h2 className="card-title">{title}</h2>
      <p className="card-desc">{description}</p>
      <div className="section-heading">Components to build</div>
      <ul className="error-list" style={{ listStyle: 'none' }}>
        {screens.map(s => (
          <li key={s} style={{ color: '#344563', marginBottom: 8, display: 'flex', gap: 8 }}>
            <span style={{ color: '#DFE1E6' }}>○</span>{s}
          </li>
        ))}
      </ul>
    </div>
  );
}
