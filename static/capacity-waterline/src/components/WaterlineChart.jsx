import React, { useState } from 'react';

const SCALE_TOP = 130; // bars can fill up to 130% of capacity
const TRACK_H   = 300; // px

const COLORS = {
  ok:      { fill: 'var(--ok)',      bg: 'var(--ok-bg)',      text: 'var(--ok-text)',      border: 'var(--ok-border)' },
  filling: { fill: 'var(--filling)', bg: 'var(--filling-bg)', text: 'var(--filling-text)', border: 'var(--filling-border)' },
  over:    { fill: 'var(--over)',    bg: 'var(--over-bg)',    text: 'var(--over-text)',    border: 'var(--over-border)' },
  nocap:   { fill: 'var(--border)',  bg: 'transparent',       text: 'var(--text-subtlest)',border: 'var(--border)' },
};
const STATE_LABEL = { ok: 'OK', filling: 'FILLING', over: 'OVER', nocap: 'SET CAP' };

function barState(alloc, cap, threshold) {
  if (!cap) return 'nocap';
  const pct = alloc / cap * 100;
  if (pct > 100) return 'over';
  if (pct > threshold) return 'filling';
  return 'ok';
}

function fillY(alloc, cap) {
  if (!cap) return 0;
  return Math.min(alloc / cap * 100, SCALE_TOP) / SCALE_TOP * 100;
}

function initials(name) {
  return (name ?? '?').split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

export default function WaterlineChart({
  teams, ideas, scale, versionId, release,
  onCapacityChange, onThresholdChange, onSave, saving, dirty,
  teamFilter, onTeamFilter,
}) {
  const [hoveredTeam, setHoveredTeam] = useState(null);

  const threshold = release?.threshold ?? 70;
  const capByTeam = release?.capacityByTeam ?? {};

  const sizeToPoints = s => scale?.[s] ?? 0;

  // Allocation per team for this version
  // idea.size is already the numeric points value — no scale lookup needed
  const allocByTeam = {};
  for (const idea of ideas) {
    if (idea.release !== versionId) continue;
    if (!idea.team) continue;
    const pts = idea.size ?? 0;
    allocByTeam[idea.team] = (allocByTeam[idea.team] ?? 0) + pts;
  }

  const teamCols = teams.map(t => {
    const cap   = (capByTeam[t.id] ?? (t.sprintCap * t.sprintsPerRelease)) || 0;
    const alloc = allocByTeam[t.id] ?? 0;
    return { id: t.id, name: t.name, cap, alloc };
  });

  const totalAlloc = teamCols.reduce((s, c) => s + c.alloc, 0);
  const totalCap   = teamCols.reduce((s, c) => s + c.cap, 0);
  const cols = [...teamCols, { id: '__total', name: 'Total', cap: totalCap, alloc: totalAlloc, isTotal: true }];

  // Are there any over-capacity bars? (for "target" highlight)
  const hasOver = teamCols.some(c => c.cap && c.alloc / c.cap * 100 > 100);

  // Smoothing candidates: teams at/under threshold, ranked by how much free capacity
  // they have — used both for the dashed "target" border and the hover callout text.
  const headrooms = teamCols
    .filter(c => c.cap && c.alloc / c.cap * 100 <= threshold)
    .map(c => ({ name: c.name, free: c.cap - c.alloc }))
    .sort((a, b) => b.free - a.free);

  const threshY = threshold / SCALE_TOP * 100;  // % from bottom
  const capY    = 100 / SCALE_TOP * 100;         // ≈ 76.9%

  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8,
      padding: '20px 20px 16px', boxShadow: 'var(--shadow-sm)', marginBottom: 16,
    }}>

      {/* Legend */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 14, marginBottom: 12, fontSize: 12, color: 'var(--text-subtle)' }}>
        {[['var(--ok)', 'OK'], ['var(--filling)', 'Filling'], ['var(--over)', 'Over']].map(([color, label]) => (
          <span key={label} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 9, height: 9, borderRadius: 2, background: color, display: 'inline-block' }} />
            {label}
          </span>
        ))}
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 16, height: 0, borderTop: '2px dashed var(--threshold)', display: 'inline-block' }} />
          Threshold
        </span>
      </div>

      {/* Bars */}
      <div style={{ position: 'relative', display: 'flex', gap: 20, alignItems: 'flex-start', padding: `26px 6px 0` }}>
        {/* Overlay: threshold + cap lines */}
        <div style={{ position: 'absolute', left: 6, right: 6, top: 26, height: TRACK_H, pointerEvents: 'none', zIndex: 5 }}>
          {/* Threshold line */}
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: `${threshY}%`, borderTop: '2px dashed var(--threshold)' }}>
            <span style={{ position: 'absolute', right: -2, top: -9, background: 'var(--threshold)', color: '#fff', fontSize: 10, fontWeight: 800, padding: '1px 5px', borderRadius: 3 }}>
              {threshold}%
            </span>
          </div>
          {/* Cap line */}
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: `${capY}%`, borderTop: '2px solid var(--text-subtlest)', opacity: 0.5 }}>
            <span style={{ position: 'absolute', right: -2, top: -8, background: 'var(--text-subtlest)', color: 'var(--surface)', fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 3, letterSpacing: '.3px' }}>
              cap
            </span>
          </div>
        </div>

        {cols.map((col, i) => {
          const state   = barState(col.alloc, col.cap, threshold);
          const c       = COLORS[state];
          const fy      = fillY(col.alloc, col.cap);
          const pct     = col.cap ? Math.round(col.alloc / col.cap * 100) : null;
          const isOver  = state === 'over';
          const isTarget= !col.isTotal && hasOver && state === 'ok' && col.cap > 0;
          const selected = teamFilter === col.id;
          const hasOverride = capByTeam[col.id] != null;

          const trackBorder = selected ? '2px solid var(--brand)'
            : isTarget ? '1.5px dashed var(--ok-border)'
            : '1px solid var(--border)';

          // Smoothing hint: hovering an over-capacity bar suggests where to move work;
          // hovering an under-capacity "target" bar (dashed border) explains why it's one.
          const hovered = hoveredTeam === col.id;
          let calloutText = null;
          if (!col.isTotal && hovered) {
            if (isOver) {
              const tgt = headrooms[0];
              calloutText = tgt
                ? `Over by ${col.alloc - col.cap} pts — move work to ${tgt.name} (${tgt.free} free)`
                : `Over by ${col.alloc - col.cap} pts — no team has headroom`;
            } else if (isTarget) {
              calloutText = `${col.cap - col.alloc} pts free — room to absorb work`;
            }
          }

          return (
            <div key={col.id}
              onClick={() => !col.isTotal && onTeamFilter?.(selected ? null : col.id)}
              onMouseEnter={() => setHoveredTeam(col.id)}
              onMouseLeave={() => setHoveredTeam(null)}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'stretch',
                flex: '1 1 0', minWidth: 0, position: 'relative',
                cursor: col.isTotal ? 'default' : 'pointer',
                borderRadius: 6, padding: '4px 2px', margin: '-4px -2px',
                background: selected ? 'var(--surface-hover)' : 'transparent',
                transition: 'background-color .15s',
                ...(col.isTotal ? { borderLeft: '1px dashed var(--border)', paddingLeft: 20, marginLeft: 10 } : {}),
              }}>

              {/* Smoothing hint callout */}
              {calloutText && (
                <div style={{
                  position: 'absolute', bottom: '100%', left: '50%', transform: 'translateX(-50%)',
                  marginBottom: 6, background: 'var(--text)', color: 'var(--surface)',
                  fontSize: 11, fontWeight: 600, padding: '5px 9px', borderRadius: 4,
                  whiteSpace: 'nowrap', zIndex: 20, boxShadow: 'var(--shadow-sm)', pointerEvents: 'none',
                }}>
                  {calloutText}
                </div>
              )}

              {/* Track */}
              <div style={{
                position: 'relative', height: TRACK_H, borderRadius: 3, overflow: 'hidden',
                border: trackBorder,
                boxShadow: selected ? '0 0 0 2px var(--brand)' : 'none',
                background: !col.cap
                  ? 'repeating-linear-gradient(45deg,var(--surface-sunken),var(--surface-sunken) 7px,var(--border-subtle) 7px,var(--border-subtle) 8px)'
                  : 'var(--surface-sunken)',
              }}>
                {/* Fill */}
                {col.cap > 0 && (
                  <div style={{
                    position: 'absolute', left: 0, right: 0, bottom: 0,
                    height: `${fy}%`,
                    background: c.fill,
                    borderRadius: '3px 3px 0 0',
                    transition: 'height .2s cubic-bezier(.2,.7,.3,1)',
                    zIndex: 2,
                    ...(isOver ? { animation: 'wl-pulse 1.9s ease-in-out infinite' } : {}),
                  }} />
                )}
                {/* No-cap text */}
                {!col.cap && (
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 8 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-subtlest)', lineHeight: 1.3 }}>
                      no capacity<br />set yet
                    </span>
                  </div>
                )}
              </div>

              {/* Labels below track */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, paddingTop: 8 }}>
                {/* State chip */}
                <span style={{
                  display: 'inline-block', padding: '2px 8px', borderRadius: 3,
                  fontSize: 10, fontWeight: 800, letterSpacing: '.5px',
                  background: c.bg, color: c.text,
                  border: state === 'nocap' ? '1px solid var(--border)' : 'none',
                }}>
                  {STATE_LABEL[state]}
                </span>
                {/* Team name */}
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%' }}>
                  {col.name}
                </span>
                {/* Metric */}
                <span style={{ fontSize: 11, color: 'var(--text-subtle)', fontVariantNumeric: 'tabular-nums', textAlign: 'center' }}>
                  {col.cap ? `${col.alloc} / ${col.cap} pts · ${pct}%` : `${col.alloc} pts · no cap`}
                </span>

                {/* Capacity input (not on total bar) */}
                {!col.isTotal && (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, marginTop: 2 }}>
                    <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.3px', textTransform: 'uppercase', color: 'var(--text-subtlest)' }}>
                      {hasOverride ? 'Capacity · override' : 'Capacity'}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                      <input
                        type="number" min="0"
                        value={(capByTeam[col.id] ?? col.cap) || ''}
                        placeholder="Set pts"
                        onClick={e => e.stopPropagation()}
                        onChange={e => { e.stopPropagation(); onCapacityChange(col.id, parseInt(e.target.value, 10) || 0); }}
                        style={{
                          width: 58, border: `1px solid ${!col.cap ? 'var(--brand)' : 'var(--border)'}`,
                          borderRadius: 4, background: 'var(--surface)', color: 'var(--text)',
                          padding: '4px 6px', fontSize: 13, textAlign: 'center',
                          fontFamily: 'inherit', outline: 'none', fontVariantNumeric: 'tabular-nums',
                        }}
                      />
                      {hasOverride && (
                        <button
                          title={`Reset to baseline (${col.cap} pts)`}
                          onClick={e => { e.stopPropagation(); onCapacityChange(col.id, null); }}
                          style={{ border: 'none', background: 'transparent', color: 'var(--brand)', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: '0 2px' }}
                        >↺</button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer: threshold + save */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 14, marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-subtle)' }}>Threshold</span>
          <div style={{ display: 'flex', alignItems: 'center', border: '1px solid var(--border)', borderRadius: 4, overflow: 'hidden' }}>
            <input
              type="number" min="0" max="100"
              value={threshold}
              onChange={e => onThresholdChange(parseInt(e.target.value, 10) || 0)}
              style={{ width: 52, border: 'none', background: 'var(--surface)', color: 'var(--text)', padding: '6px 4px 6px 8px', fontSize: 13, textAlign: 'right', fontFamily: 'inherit', outline: 'none', fontVariantNumeric: 'tabular-nums' }}
            />
            <span style={{ padding: '6px 8px 6px 2px', fontSize: 13, color: 'var(--text-subtlest)', background: 'var(--surface)' }}>%</span>
          </div>
        </div>
        <button
          onClick={onSave}
          disabled={!dirty || saving}
          style={{
            background: dirty ? 'var(--brand)' : 'var(--surface-sunken)',
            color: dirty ? '#fff' : 'var(--text-subtlest)',
            border: dirty ? 'none' : '1px solid var(--border)',
            borderRadius: 4, padding: '7px 16px', fontSize: 14, fontWeight: 600,
            cursor: dirty ? 'pointer' : 'default', fontFamily: 'inherit',
          }}
        >
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </div>

      <style>{`
        @keyframes wl-pulse {
          0%,100% { box-shadow: 0 0 0 0 rgba(0,0,0,0); }
          50%      { box-shadow: 0 0 18px 2px var(--over-glow); }
        }
      `}</style>
    </div>
  );
}
