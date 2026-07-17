import React, { useState, useEffect } from 'react';
import { invoke, view } from '@forge/bridge';

const FUTURE_OPTIONS = [1, 2, 3, 4, 5, 6];

const SELECT_STYLE = {
  width: '100%', border: '1px solid var(--border)', borderRadius: 4,
  padding: '7px 10px', fontSize: 14, color: 'var(--text)', background: 'var(--surface)',
  fontFamily: 'inherit',
};

export default function GadgetEdit() {
  const [versions, setVersions] = useState([]);
  const [versionId, setVersionId] = useState('');
  const [mode, setMode] = useState('team');
  const [futureCount, setFutureCount] = useState(4);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    view.theme.enable().catch(() => {});
    Promise.all([invoke('getGadgetVersions'), view.getContext().catch(() => ({}))])
      .then(([{ versions }, ctx]) => {
        setVersions((versions ?? []).filter(v => !v.archived));
        const cfg = ctx?.extension?.gadgetConfiguration ?? {};
        setVersionId(cfg.versionId ?? '');
        setMode(cfg.mode ?? 'team');
        setFutureCount(cfg.futureCount ?? 4);
      })
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await view.submit({ versionId, mode, futureCount });
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
        <label className="field-label">Chart mode</label>
        <select value={mode} onChange={e => setMode(e.target.value)} style={SELECT_STYLE}>
          <option value="team">By team — one release, all teams</option>
          <option value="version">By version — one team's roadmap, multiple releases</option>
        </select>
      </div>

      <div className="field-group" style={{ marginBottom: 0 }}>
        <label className="field-label">{mode === 'version' ? 'Current version' : 'Release version'}</label>
        <select value={versionId} onChange={e => setVersionId(e.target.value)} style={SELECT_STYLE}>
          <option value="">Auto — next upcoming release</option>
          {versions.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
        </select>
        <div className="field-hint">
          "Auto" always shows the next unreleased version with the nearest target date.
        </div>
      </div>

      {mode === 'version' && (
        <div className="field-group" style={{ marginBottom: 0 }}>
          <label className="field-label">Future versions to show</label>
          <select value={futureCount} onChange={e => setFutureCount(parseInt(e.target.value, 10))} style={SELECT_STYLE}>
            {FUTURE_OPTIONS.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
          <div className="field-hint">
            Shown alongside the current version, in addition to it.
          </div>
        </div>
      )}

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
