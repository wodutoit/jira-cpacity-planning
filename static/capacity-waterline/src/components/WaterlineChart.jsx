import React from 'react';
import Button from './Button';

// Compute waterline state for a team bar
function barState(alloc, cap, threshold) {
  if (!cap) return 'nocap';
  const pct = alloc / cap;
  if (pct > 1) return 'over';
  if (pct > threshold / 100) return 'filling';
  return 'ok';
}

function barHeight(alloc, cap) {
  if (!cap) return 0;
  return Math.min(alloc / cap, 1.4) * 100; // cap visual at 140%
}

const STATE_LABELS = { ok: 'OK', filling: 'Filling', over: 'Over', nocap: 'Set cap' };

export default function WaterlineChart({
  teams,          // [{id, name, sprintCap, sprintsPerRelease}]
  ideas,          // [{team, size, release}]
  scale,          // {XS,S,M,L,XL}
  versionId,      // currently selected version id
  release,        // {capacityByTeam:{[teamId]:number}, threshold}
  onCapacityChange, // (teamId, value) => void
  onThresholdChange,// (value) => void
  onSave,
  saving,
  dirty,
}) {
  const threshold = release?.threshold ?? 70;
  const capByTeam = release?.capacityByTeam ?? {};

  // Compute allocations for the selected version
  const sizeToPoints = (s) => scale?.[s] ?? 0;
  const allocByTeam = {};
  for (const idea of ideas) {
    if (idea.release !== versionId) continue;
    if (!idea.team) continue;
    const pts = idea.size != null ? sizeToPoints(idea.size) : 0;
    allocByTeam[idea.team] = (allocByTeam[idea.team] ?? 0) + pts;
  }

  const totalAlloc = Object.values(allocByTeam).reduce((a, b) => a + b, 0);
  const totalCap = teams.reduce((sum, t) => {
    const cap = (capByTeam[t.id] ?? (t.sprintCap * t.sprintsPerRelease)) || 0;
    return sum + cap;
  }, 0);

  const cols = [
    ...teams.map(t => {
      const cap = (capByTeam[t.id] ?? (t.sprintCap * t.sprintsPerRelease)) || 0;
      const alloc = allocByTeam[t.id] ?? 0;
      return { id: t.id, name: t.name, cap, alloc, isTotal: false };
    }),
    { id: '__total', name: 'Total', cap: totalCap, alloc: totalAlloc, isTotal: true },
  ];

  const thresholdPct = Math.max(0, Math.min(100, threshold));

  if (!versionId) {
    return <div className="wl-empty">Select a version to see the waterline</div>;
  }

  return (
    <div className="wl-chart">
      <div className="wl-bars-wrap">
        {cols.map((col, i) => {
          const state = barState(col.alloc, col.cap, threshold);
          const fillH = barHeight(col.alloc, col.cap);
          const thresholdBottom = `${thresholdPct}%`;

          return (
            <div key={col.id} className={`wl-team-col${col.isTotal ? ' total-col' : ''}`}>
              <div className="wl-bar-area">
                <div className="wl-bar-bg" />
                <div
                  className={`wl-bar-fill ${state}`}
                  style={{ height: `${fillH}%` }}
                />
                {/* Threshold line — only shown when cap is set */}
                {col.cap > 0 && (
                  <div
                    className="wl-threshold-line"
                    style={{ bottom: thresholdBottom }}
                  >
                    {i === cols.length - 1 && (
                      <span className="wl-threshold-label">{threshold}%</span>
                    )}
                  </div>
                )}
              </div>

              <div className={`wl-state-label ${state}`}>{STATE_LABELS[state]}</div>
              <div className="wl-team-name" title={col.name}>{col.name}</div>
              <div className="wl-pts">
                {col.alloc} / {col.cap || '—'} pts
                {col.cap > 0 && ` · ${Math.round(col.alloc / col.cap * 100)}%`}
              </div>

              {col.isTotal ? (
                <div className="wl-cap-label">auto</div>
              ) : (
                <input
                  className="wl-cap-input"
                  type="number"
                  min="0"
                  value={capByTeam[col.id] ?? (col.cap || '')}
                  placeholder={col.cap ? String(col.cap) : 'Set cap'}
                  onChange={e => onCapacityChange(col.id, parseInt(e.target.value, 10) || 0)}
                />
              )}
              <div className="wl-cap-label">capacity</div>
            </div>
          );
        })}
      </div>

      <div className="wl-footer">
        <Button
          appearance="primary"
          onClick={onSave}
          isLoading={saving}
          isDisabled={!dirty}
        >
          Save changes
        </Button>
        <div className="wl-threshold-wrap">
          <span>Threshold:</span>
          <input
            type="number"
            min="0"
            max="100"
            value={threshold}
            onChange={e => onThresholdChange(parseInt(e.target.value, 10) || 0)}
          />
          <span>%</span>
        </div>
        {dirty && <span className="action-status">Unsaved changes</span>}
      </div>
    </div>
  );
}
