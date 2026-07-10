import React from 'react';

const TRACK_H = 300;
const SEG_COLOR = {
  ok: 'var(--ok)',
  filling: 'var(--filling)',
  over: 'var(--over)',
  nocap: 'var(--lz-n-bg)',
};
const SEG_TEXT = { ok: '#fff', filling: '#fff', over: '#fff', nocap: 'var(--text-subtle)' };

function teamState(pts, cap, threshold) {
  if (!cap) return 'nocap';
  if (pts > cap) return 'over';
  if (pts > cap * threshold / 100) return 'filling';
  return 'ok';
}

export default function VersionChart({
  ideas, teams, versions, scale, release,
  currentVersionId, futureCount, onFutureCount,
  versionFilter, onVersionFilter,
}) {
  const threshold  = release?.threshold ?? 70;
  const capByTeam  = release?.capacityByTeam ?? {};

  // Baseline total capacity (sprint cap × sprints per release, no version overrides)
  const totalCapAll = teams.reduce((s, t) =>
    s + ((t.sprintCap ?? 0) * (t.sprintsPerRelease ?? 0)), 0);

  // Visible versions: current first, then up to futureCount others
  const others = versions.filter(v => v.id !== currentVersionId);
  const visibleVersions = [
    ...(versions.find(v => v.id === currentVersionId) ? [versions.find(v => v.id === currentVersionId)] : []),
    ...others.slice(0, futureCount),
  ];

  // Per-version team allocations
  const versionData = visibleVersions.map(v => {
    const segs = [];
    let totalAlloc = 0;
    for (const t of teams) {
      const pts = ideas
        .filter(i => i.release === v.id && i.team === t.id)
        .reduce((s, i) => s + (i.size ?? 0), 0);
      if (pts <= 0) continue;
      totalAlloc += pts;
      const cap = (capByTeam[t.id] ?? (t.sprintCap * t.sprintsPerRelease)) || 0;
      const state = teamState(pts, cap, threshold);
      // Label: first 2 chars of name uppercase + pts
      const label = t.name.slice(0, 2).toUpperCase() + ' ' + pts;
      const tooltip = `${t.name}: ${pts} pts · ${state.toUpperCase()}`;
      segs.push({ team: t, pts, state, label, tooltip });
    }
    return { version: v, segs, totalAlloc };
  });

  const versionTotals = versionData.map(v => v.totalAlloc);
  const vScale = Math.max(totalCapAll, ...versionTotals, 1) * 1.06;
  const capLineY = totalCapAll > 0 ? (totalCapAll / vScale * 100) : 0;

  const FUTURE_OPTIONS = [1, 2, 3, 4, 5];

  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8,
      padding: '20px 20px 16px', boxShadow: 'var(--shadow-sm)', marginBottom: 16,
    }}>

      {/* Top row: future count + legend */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, color: 'var(--text-subtlest)', fontWeight: 600 }}>Future versions</span>
          <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
            {FUTURE_OPTIONS.map(f => (
              <button key={f} onClick={() => onFutureCount?.(f)}
                style={{ padding: '4px 11px', border: 'none', fontFamily: 'inherit', fontSize: 12, fontWeight: 700, cursor: 'pointer', background: futureCount === f ? 'var(--brand)' : 'var(--surface)', color: futureCount === f ? '#fff' : 'var(--text-subtle)' }}>
                {f}
              </button>
            ))}
          </div>
        </div>
        {/* Legend */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 12, color: 'var(--text-subtle)' }}>
          {[['var(--ok)', 'OK'], ['var(--filling)', 'Filling'], ['var(--over)', 'Over']].map(([c, l]) => (
            <span key={l} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 9, height: 9, borderRadius: 2, background: c, display: 'inline-block' }} />
              {l}
            </span>
          ))}
        </div>
      </div>

      {/* Chart title */}
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>
          Roadmap — {visibleVersions.length} version{visibleVersions.length !== 1 ? 's' : ''}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-subtlest)' }}>
          Stacked by team · coloured by each team's state in the version
        </div>
      </div>

      {/* Bars */}
      <div style={{ position: 'relative', display: 'flex', gap: 28, alignItems: 'flex-start', justifyContent: visibleVersions.length < 4 ? 'center' : 'stretch', padding: '26px 6px 0' }}>

        {/* Overlay: total cap line */}
        <div style={{ position: 'absolute', left: 6, right: 6, top: 26, height: TRACK_H, pointerEvents: 'none', zIndex: 5 }}>
          {totalCapAll > 0 && (
            <div style={{ position: 'absolute', left: 0, right: 0, bottom: `${capLineY}%`, borderTop: '2px dashed var(--text-subtlest)', opacity: 0.6 }}>
              <span style={{ position: 'absolute', right: -2, top: -8, background: 'var(--text-subtlest)', color: 'var(--surface)', fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 3, letterSpacing: '.3px' }}>
                Σ capacity
              </span>
            </div>
          )}
        </div>

        {visibleVersions.length === 0 ? (
          <div style={{ width: '100%', padding: '60px 20px', textAlign: 'center', color: 'var(--text-subtlest)', fontSize: 14 }}>
            Select a version in the picker to see the roadmap.
          </div>
        ) : versionData.map(({ version, segs, totalAlloc }) => {
          const selected  = versionFilter === version.id;
          const isCurrent = version.id === currentVersionId;

          return (
            <div key={version.id}
              onClick={() => onVersionFilter?.(selected ? null : version.id)}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'stretch',
                flex: '1 1 0', minWidth: 0, maxWidth: 300, cursor: 'pointer',
                borderRadius: 6, padding: 4, margin: -4,
                background: selected ? 'var(--surface-hover)' : 'transparent',
                transition: 'background-color .15s',
              }}>

              {/* Track */}
              <div style={{
                height: TRACK_H, border: '1px solid var(--border)', borderRadius: 4,
                overflow: 'hidden', background: 'var(--surface-sunken)',
                display: 'flex', flexDirection: 'column-reverse',
                boxShadow: selected ? '0 0 0 2px var(--brand)' : 'none',
                transition: 'box-shadow .15s',
              }}>
                {segs.map(({ team, pts, state, label, tooltip }) => {
                  const segH = pts / vScale * 100;
                  return (
                    <div key={team.id} title={tooltip}
                      style={{
                        height: `${segH}%`, background: SEG_COLOR[state],
                        borderTop: '1px solid var(--surface)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        overflow: 'hidden', minHeight: 3, transition: 'height .2s ease',
                      }}>
                      {segH > 8 && (
                        <span style={{ fontSize: 10, fontWeight: 700, color: SEG_TEXT[state], whiteSpace: 'nowrap', pointerEvents: 'none' }}>
                          {label}
                        </span>
                      )}
                    </div>
                  );
                })}
                {segs.length === 0 && (
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontSize: 11, color: 'var(--text-subtlest)' }}>no ideas</span>
                  </div>
                )}
              </div>

              {/* Labels */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, paddingTop: 8 }}>
                <span style={{ display: 'inline-block', padding: '1px 8px', borderRadius: 3, fontSize: 10, fontWeight: 800, letterSpacing: '.4px', background: isCurrent ? 'var(--info-bg)' : 'var(--lz-n-bg)', color: isCurrent ? 'var(--info-text)' : 'var(--lz-n-text)' }}>
                  {isCurrent ? 'CURRENT' : 'FUTURE'}
                </span>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', fontFamily: 'ui-monospace,SFMono-Regular,monospace', textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%' }}>
                  {version.name}
                </span>
                <span style={{ fontSize: 11, color: 'var(--text-subtle)', fontVariantNumeric: 'tabular-nums' }}>
                  {totalAlloc} / {totalCapAll} pts
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 12, fontSize: 11, color: 'var(--text-subtlest)', textAlign: 'center' }}>
        Each bar stacks teams (initials); segment colour = that team's state in the version. Click a version to filter ideas below.
      </div>
    </div>
  );
}
