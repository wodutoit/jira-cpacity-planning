import React, { useState, useEffect } from 'react';
import { invoke, view } from '@forge/bridge';

const TRACK_H = 70;
const BAR_W = 15;
// Value labels float above each bar via a negative transform, which can escape the
// track's own box when a bar is near its tallest. Reserving this much margin above
// the track keeps that label inside the row's layout box instead of overlapping
// whatever sits above it, or getting clipped by an ancestor's overflow:auto scroll.
const LABEL_HEADROOM = 16;
const SPRINT_OPTIONS = Array.from({ length: 10 }, (_, i) => i + 1);

function fmtShort(iso) {
  if (!iso) return '';
  try { return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); }
  catch { return iso; }
}

function BarGroup({ label, committed, actual, maxScale }) {
  const cH = maxScale ? Math.min(100, committed / maxScale * 100) : 0;
  const aH = maxScale ? Math.min(100, actual / maxScale * 100) : 0;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: BAR_W * 2 + 6 }}>
      <div style={{ display: 'flex', gap: 2, alignItems: 'flex-end', height: TRACK_H, marginTop: LABEL_HEADROOM }}>
        {[['var(--filling)', committed, cH], ['var(--ok)', actual, aH]].map(([color, val, h], i) => (
          <div key={i} style={{ position: 'relative', width: BAR_W, height: TRACK_H }}>
            <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: `${h}%`, background: color, borderRadius: '2px 2px 0 0' }} />
            <span style={{ position: 'absolute', left: '50%', bottom: `${h}%`, transform: 'translate(-50%, -100%)', fontSize: 9, fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap' }}>
              {val}
            </span>
          </div>
        ))}
      </div>
      <span style={{ fontSize: 9, color: 'var(--text-subtlest)', whiteSpace: 'nowrap' }}>{label}</span>
    </div>
  );
}

function TeamRow({ team, sprintCount }) {
  const shown = team.sprints.slice(Math.max(0, team.sprints.length - sprintCount));

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
      <div style={{ width: 90, flexShrink: 0, fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>{team.name}</div>
      {shown.length === 0 ? (
        <div style={{ flex: 1, fontSize: 12, color: 'var(--text-subtlest)' }}>No closed sprints found.</div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 12, flex: 1, overflowX: 'auto', paddingBottom: 2 }}>
            {(() => {
              const maxScale = Math.max(1, ...shown.flatMap(s => [s.committed, s.velocity])) * 1.15;
              return shown.map(s => (
                <BarGroup key={s.id} label={fmtShort(s.endDate)} committed={s.committed} actual={s.velocity} maxScale={maxScale} />
              ));
            })()}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-subtle)', whiteSpace: 'nowrap', textAlign: 'right', flexShrink: 0 }}>
            <div>Avg Commitment: {Math.round(shown.reduce((s, x) => s + x.committed, 0) / shown.length)}</div>
            <div>Avg Velocity: {Math.round(shown.reduce((s, x) => s + x.velocity, 0) / shown.length)}</div>
          </div>
        </>
      )}
    </div>
  );
}

function Legend() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 11, color: 'var(--text-subtle)' }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        <span style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--filling)', display: 'inline-block' }} />
        Committed
      </span>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        <span style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--ok)', display: 'inline-block' }} />
        Actual
      </span>
    </div>
  );
}

export default function ReleaseVelocityGadgetView() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [teams, setTeams] = useState([]);
  const [versions, setVersions] = useState([]);
  const [sprintCount, setSprintCount] = useState(5);
  const [showVersions, setShowVersions] = useState(true);

  useEffect(() => {
    view.theme.enable().catch(() => {});
    Promise.all([invoke('getVelocityData'), view.getContext().catch(() => ({}))])
      .then(([data, ctx]) => {
        setTeams(data.teams ?? []);
        setVersions(data.versions ?? []);
        const cfg = ctx?.extension?.gadgetConfiguration ?? {};
        setSprintCount(Math.min(10, Math.max(1, cfg.sprintCount ?? 5)));
        setShowVersions(cfg.showVersions !== false);
      })
      .catch(err => setError(String(err)))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="center-msg" data-app-shell="true" style={{ padding: 24, fontSize: 13 }}>Loading…</div>;
  }
  if (error) {
    return <div style={{ padding: 16, color: 'var(--over-text)', fontSize: 13 }}>Failed to load: {error}</div>;
  }
  if (!teams.length) {
    return <div style={{ padding: 16, color: 'var(--text-subtlest)', fontSize: 13 }}>No teams configured yet — add teams in the app's Config tab first.</div>;
  }

  // Version sums cover only the sprints actually shown above, per team.
  const versionTotals = {};
  teams.forEach(team => {
    const shown = team.sprints.slice(Math.max(0, team.sprints.length - sprintCount));
    shown.forEach(s => {
      if (!s.versionId) return;
      const v = versionTotals[s.versionId] ?? (versionTotals[s.versionId] = { committed: 0, actual: 0 });
      v.committed += s.committed;
      v.actual += s.velocity;
    });
  });
  const versionRows = Object.entries(versionTotals).map(([versionId, v]) => ({
    versionId, name: versions.find(x => x.id === versionId)?.name ?? versionId, ...v,
  }));
  const versionMaxScale = versionRows.length
    ? Math.max(1, ...versionRows.flatMap(v => [v.committed, v.actual])) * 1.15
    : 1;

  return (
    <div style={{ padding: '14px 16px 16px', fontFamily: 'inherit', color: 'var(--text)', fontSize: 13 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 12 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.4px', textTransform: 'uppercase', color: 'var(--text-subtlest)' }}>Closed sprints</span>
          <select
            value={sprintCount}
            onChange={e => setSprintCount(parseInt(e.target.value, 10))}
            style={{ border: '1px solid var(--border)', borderRadius: 4, padding: '5px 8px', fontSize: 13, color: 'var(--text)', background: 'var(--surface)', fontFamily: 'inherit' }}
          >
            {SPRINT_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
        <Legend />
      </div>

      {teams.map(team => <TeamRow key={team.id} team={team} sprintCount={sprintCount} />)}

      {showVersions && versionRows.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.4px', textTransform: 'uppercase', color: 'var(--text-subtlest)', marginBottom: 8 }}>
            Versions
          </div>
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
            {versionRows.map(v => (
              <div key={v.versionId} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <BarGroup label={v.name} committed={v.committed} actual={v.actual} maxScale={versionMaxScale} />
              </div>
            ))}
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-subtlest)', marginTop: 8 }}>
            * Sums include only the sprints shown above — versions with sprints outside this window will look smaller than their full total.
          </div>
        </div>
      )}
    </div>
  );
}
