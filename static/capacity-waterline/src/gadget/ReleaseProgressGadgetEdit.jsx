import React, { useState, useEffect } from 'react';
import { invoke, view } from '@forge/bridge';

const SELECT_STYLE = {
  width: '100%', border: '1px solid var(--border)', borderRadius: 4,
  padding: '7px 10px', fontSize: 14, color: 'var(--text)', background: 'var(--surface)',
  fontFamily: 'inherit',
};

export default function ReleaseProgressGadgetEdit() {
  const [versions, setVersions] = useState([]);
  const [versionId, setVersionId] = useState('');
  const [okThreshold, setOkThreshold] = useState(95);
  const [riskThreshold, setRiskThreshold] = useState(80);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    view.theme.enable().catch(() => {});
    Promise.all([invoke('getGadgetVersions'), view.getContext().catch(() => ({}))])
      .then(([{ versions }, ctx]) => {
        setVersions((versions ?? []).filter(v => !v.archived));
        const cfg = ctx?.extension?.gadgetConfiguration ?? {};
        setVersionId(cfg.versionId ?? '');
        setOkThreshold(cfg.okThreshold ?? 95);
        setRiskThreshold(cfg.riskThreshold ?? 80);
      })
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    const ok = Math.max(0, Math.min(100, okThreshold));
    const risk = Math.max(0, Math.min(ok, riskThreshold));
    setSaving(true);
    try {
      await view.submit({ versionId, okThreshold: ok, riskThreshold: risk });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="center-msg" data-app-shell="true">Loading…</div>;
  }

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14, fontFamily: 'inherit', color: 'var(--text)' }}>
      <div className="field-group" style={{ marginBottom: 0 }}>
        <label className="field-label">Release version</label>
        <select value={versionId} onChange={e => setVersionId(e.target.value)} style={SELECT_STYLE}>
          <option value="">Auto — next upcoming release</option>
          {versions.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
        </select>
        <div className="field-hint">
          "Auto" always shows the next unreleased version with the nearest target date.
        </div>
      </div>

      <div className="two-col">
        <div className="field-group" style={{ marginBottom: 0 }}>
          <label className="field-label">OK threshold</label>
          <input
            type="number" min="0" max="100" value={okThreshold}
            onChange={e => setOkThreshold(parseInt(e.target.value, 10) || 0)}
            style={SELECT_STYLE}
          />
          <div className="field-hint">Actual ≥ this % of expected progress → OK.</div>
        </div>
        <div className="field-group" style={{ marginBottom: 0 }}>
          <label className="field-label">Risk threshold</label>
          <input
            type="number" min="0" max="100" value={riskThreshold}
            onChange={e => setRiskThreshold(parseInt(e.target.value, 10) || 0)}
            style={SELECT_STYLE}
          />
          <div className="field-hint">Below this % of expected progress → Risk. Between the two → Behind.</div>
        </div>
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        style={{
          alignSelf: 'flex-start', background: 'var(--brand)', color: '#fff', border: 'none',
          borderRadius: 4, padding: '7px 16px', fontSize: 14, fontWeight: 600,
          cursor: saving ? 'default' : 'pointer', fontFamily: 'inherit',
        }}
      >
        {saving ? 'Saving…' : 'Save'}
      </button>
    </div>
  );
}
