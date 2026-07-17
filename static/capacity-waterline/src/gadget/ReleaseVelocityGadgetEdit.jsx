import React, { useState, useEffect } from 'react';
import { view } from '@forge/bridge';

const SPRINT_OPTIONS = Array.from({ length: 10 }, (_, i) => i + 1);

const SELECT_STYLE = {
  width: '100%', border: '1px solid var(--border)', borderRadius: 4,
  padding: '7px 10px', fontSize: 14, color: 'var(--text)', background: 'var(--surface)',
  fontFamily: 'inherit',
};

export default function ReleaseVelocityGadgetEdit() {
  const [sprintCount, setSprintCount] = useState(5);
  const [showVersions, setShowVersions] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    view.theme.enable().catch(() => {});
    view.getContext().catch(() => ({}))
      .then(ctx => {
        const cfg = ctx?.extension?.gadgetConfiguration ?? {};
        setSprintCount(Math.min(10, Math.max(1, cfg.sprintCount ?? 5)));
        setShowVersions(cfg.showVersions !== false);
      })
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await view.submit({ sprintCount, showVersions });
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
        <label className="field-label">Closed sprints to show (default)</label>
        <select value={sprintCount} onChange={e => setSprintCount(parseInt(e.target.value, 10))} style={SELECT_STYLE}>
          {SPRINT_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
        </select>
        <div className="field-hint">
          Viewers can change this on the gadget itself. A team with fewer closed sprints just shows what it has.
        </div>
      </div>

      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text)', cursor: 'pointer' }}>
        <input type="checkbox" checked={showVersions} onChange={e => setShowVersions(e.target.checked)} />
        Show the version summary chart
      </label>

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
