import React, { useState, useEffect, useCallback } from 'react';
import { invoke, view, router } from '@forge/bridge';
import { fmtDate, pickAutoVersion } from './gadgetUtils';

const GLOBAL_PAGE_MODULE_KEY = 'capacity-waterline';
const TRACK_H = 130;

const COLORS = {
  ok:      { fill: 'var(--ok)',      bg: 'var(--ok-bg)',      text: 'var(--ok-text)' },
  filling: { fill: 'var(--filling)', bg: 'var(--filling-bg)', text: 'var(--filling-text)' },
  over:    { fill: 'var(--over)',    bg: 'var(--over-bg)',    text: 'var(--over-text)' },
  nocap:   { fill: 'var(--border)',  bg: 'transparent',       text: 'var(--text-subtlest)' },
};
const STATE_LABEL = { ok: 'OK', filling: 'FILLING', over: 'OVER', nocap: 'SET CAP' };

function barState(alloc, cap, threshold) {
  if (!cap) return 'nocap';
  const pct = alloc / cap * 100;
  if (pct > 100) return 'over';
  if (pct > threshold) return 'filling';
  return 'ok';
}

function Legend({ showThreshold }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 11, color: 'var(--text-subtle)' }}>
      {[['var(--ok)', 'OK'], ['var(--filling)', 'Filling'], ['var(--over)', 'Over']].map(([c, l]) => (
        <span key={l} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: c, display: 'inline-block' }} />
          {l}
        </span>
      ))}
      {showThreshold && (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 14, height: 0, borderTop: '2px dashed var(--threshold)', display: 'inline-block' }} />
          Threshold
        </span>
      )}
    </div>
  );
}

export default function GadgetView() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [versions, setVersions] = useState([]);
  const [teams, setTeams] = useState([]);
  const [ideas, setIdeas] = useState([]);
  const [release, setRelease] = useState({ capacityByTeam: {}, threshold: 70 });
  const [versionId, setVersionId] = useState('');
  const [mode, setMode] = useState('team');
  const [futureCount, setFutureCount] = useState(4);
  const [switching, setSwitching] = useState(false);

  const loadForVersion = useCallback((vId) => {
    return invoke('getAll', { versionId: vId }).then(result => {
      setTeams(result.teams ?? []);
      setIdeas(result.ideas ?? []);
      setRelease(result.release ?? { capacityByTeam: {}, threshold: 70 });
      setVersionId(vId);
    });
  }, []);

  useEffect(() => {
    view.theme.enable().catch(() => {});
    Promise.all([invoke('getGadgetVersions'), view.getContext().catch(() => ({}))])
      .then(([{ versions: allVersions }, ctx]) => {
        const openVersions = (allVersions ?? []).filter(v => !v.archived);
        setVersions(openVersions);
        const cfg = ctx?.extension?.gadgetConfiguration ?? {};
        setMode(cfg.mode ?? 'team');
        setFutureCount(cfg.futureCount ?? 4);
        const configuredId = cfg.versionId || '';
        const resolvedId = (configuredId && openVersions.some(v => v.id === configuredId))
          ? configuredId
          : pickAutoVersion(openVersions);
        if (!resolvedId) return Promise.resolve();
        return loadForVersion(resolvedId);
      })
      .catch(err => setError(String(err)))
      .finally(() => setLoading(false));
  }, [loadForVersion]);

  const handleVersionChange = (vId) => {
    setSwitching(true);
    loadForVersion(vId).finally(() => setSwitching(false));
  };

  const openReleasePlanning = () => {
    try {
      localStorage.setItem('cpw:lastVersionId', versionId);
      localStorage.setItem('cpw:openTab', 'release-planning');
    } catch { /* localStorage unavailable */ }
    router.navigate({ target: 'module', moduleKey: GLOBAL_PAGE_MODULE_KEY });
  };

  if (loading) {
    return <div className="center-msg" data-app-shell="true" style={{ padding: 24, fontSize: 13 }}>Loading…</div>;
  }
  if (error) {
    return <div style={{ padding: 16, color: 'var(--over-text)', fontSize: 13 }}>Failed to load: {error}</div>;
  }
  if (!versionId) {
    return <div style={{ padding: 16, color: 'var(--text-subtlest)', fontSize: 13 }}>No releases found yet — configure the app's Jira Config tab first.</div>;
  }

  const selectedVersion = versions.find(v => v.id === versionId);
  const threshold = release?.threshold ?? 70;
  const capByTeam = release?.capacityByTeam ?? {};

  return (
    <div style={{ padding: '14px 16px 16px', fontFamily: 'inherit', color: 'var(--text)', fontSize: 13 }}>
      {/* Header row — the version selector only makes sense in "by team" mode; in
          "by version" mode the roadmap is fixed by config and each column shows its
          own release date below its points instead of a single header date. */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: mode === 'version' ? 'flex-end' : 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 10 }}>
        {mode !== 'version' && (
          <div style={{ display: 'flex', gap: 20, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.4px', textTransform: 'uppercase', color: 'var(--text-subtlest)' }}>Version</span>
              <select
                value={versionId}
                onChange={e => handleVersionChange(e.target.value)}
                disabled={switching}
                style={{ border: '1px solid var(--border)', borderRadius: 4, padding: '5px 8px', fontSize: 13, color: 'var(--text)', background: 'var(--surface)', fontFamily: 'inherit' }}
              >
                {versions.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.4px', textTransform: 'uppercase', color: 'var(--text-subtlest)' }}>Target release date</span>
              <span style={{ fontSize: 13, padding: '5px 0', color: selectedVersion?.releaseDate ? 'var(--text)' : 'var(--text-subtlest)' }}>
                {fmtDate(selectedVersion?.releaseDate)}
              </span>
            </div>
          </div>
        )}
        <Legend showThreshold={mode !== 'version'} />
      </div>

      {mode === 'version'
        ? <ByVersionBars teams={teams} ideas={ideas} versions={versions} versionId={versionId} capByTeam={capByTeam} threshold={threshold} futureCount={futureCount} switching={switching} />
        : <ByTeamBars teams={teams} ideas={ideas} versionId={versionId} capByTeam={capByTeam} threshold={threshold} switching={switching} />}

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
        <button
          onClick={openReleasePlanning}
          style={{ background: 'transparent', border: 'none', color: 'var(--brand)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}
        >
          Open in Release Planning ↗
        </button>
      </div>
    </div>
  );
}

// One bar per team (plus a Total bar) for a single, selected version.
function ByTeamBars({ teams, ideas, versionId, capByTeam, threshold, switching }) {
  const allocByTeam = {};
  for (const idea of ideas) {
    if (idea.release !== versionId || !idea.team) continue;
    allocByTeam[idea.team] = (allocByTeam[idea.team] ?? 0) + (idea.size ?? 0);
  }

  const teamCols = teams.map(t => {
    const cap = (capByTeam[t.id] ?? (t.sprintCap * t.sprintsPerRelease)) || 0;
    return { id: t.id, name: t.name, cap, alloc: allocByTeam[t.id] ?? 0 };
  });
  const totalAlloc = teamCols.reduce((s, c) => s + c.alloc, 0);
  const totalCap = teamCols.reduce((s, c) => s + c.cap, 0);
  const cols = [...teamCols, { id: '__total', name: 'Total', cap: totalCap, alloc: totalAlloc, isTotal: true }];
  const maxScale = Math.max(totalCap, ...cols.map(c => c.alloc), 1) * 1.15;
  const threshY = totalCap ? (totalCap * threshold / 100) / maxScale * 100 : 0;
  const capY = maxScale ? totalCap / maxScale * 100 : 0;

  return (
    <div style={{ position: 'relative', display: 'flex', gap: 16, alignItems: 'flex-start', padding: '20px 4px 0', opacity: switching ? 0.5 : 1 }}>
      <div style={{ position: 'absolute', left: 4, right: 4, top: 20, height: TRACK_H, pointerEvents: 'none', zIndex: 5 }}>
        {totalCap > 0 && (
          <>
            <div style={{ position: 'absolute', left: 0, right: 0, bottom: `${threshY}%`, borderTop: '2px dashed var(--threshold)' }}>
              <span style={{ position: 'absolute', right: -2, top: -8, background: 'var(--threshold)', color: '#fff', fontSize: 9, fontWeight: 800, padding: '1px 4px', borderRadius: 3 }}>
                {threshold}%
              </span>
            </div>
            <div style={{ position: 'absolute', left: 0, right: 0, bottom: `${capY}%`, borderTop: '2px solid var(--text-subtlest)', opacity: 0.5 }}>
              <span style={{ position: 'absolute', right: -2, top: -8, background: 'var(--text-subtlest)', color: 'var(--surface)', fontSize: 8, fontWeight: 700, padding: '1px 4px', borderRadius: 3, letterSpacing: '.3px' }}>
                cap
              </span>
            </div>
          </>
        )}
      </div>

      {cols.map(col => {
        const state = barState(col.alloc, col.cap, threshold);
        const c = COLORS[state];
        const heightPct = col.cap ? (col.alloc / maxScale * 100) : 0;
        const pct = col.cap ? Math.round(col.alloc / col.cap * 100) : null;

        return (
          <div key={col.id} style={{
            display: 'flex', flexDirection: 'column', alignItems: 'stretch', flex: '1 1 0', minWidth: 0,
            ...(col.isTotal ? { borderLeft: '1px dashed var(--border)', paddingLeft: 14, marginLeft: 6 } : {}),
          }}>
            <div style={{
              position: 'relative', height: TRACK_H, borderRadius: 3, overflow: 'hidden',
              border: '1px solid var(--border)', background: 'var(--surface-sunken)',
            }}>
              {col.cap > 0 && (
                <div style={{
                  position: 'absolute', left: 0, right: 0, bottom: 0, height: `${heightPct}%`,
                  background: c.fill, borderRadius: '3px 3px 0 0',
                }} />
              )}
              {!col.cap && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 6 }}>
                  <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-subtlest)' }}>no cap set</span>
                </div>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, paddingTop: 6 }}>
              <span style={{ display: 'inline-block', padding: '1px 7px', borderRadius: 3, fontSize: 9, fontWeight: 800, letterSpacing: '.4px', background: c.bg, color: c.text }}>
                {STATE_LABEL[state]}
              </span>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%' }}>
                {col.name}
              </span>
              <span style={{ fontSize: 10, color: 'var(--text-subtle)', fontVariantNumeric: 'tabular-nums' }}>
                {col.cap ? `${col.alloc} / ${col.cap} pts · ${pct}%` : `${col.alloc} pts · no cap`}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// One stacked bar per version (current + N future), segments coloured by each
// team's state within that version — mirrors ReleasePlanningTab's "By version" chart.
function ByVersionBars({ teams, ideas, versions, versionId, capByTeam, threshold, futureCount, switching }) {
  const anchor = versions.find(v => v.id === versionId);
  const others = versions.filter(v => v.id !== versionId);
  const visibleVersions = anchor ? [anchor, ...others.slice(0, futureCount)] : others.slice(0, futureCount + 1);

  const totalCapAll = teams.reduce((s, t) => s + ((t.sprintCap ?? 0) * (t.sprintsPerRelease ?? 0)), 0);

  const versionData = visibleVersions.map(v => {
    const segs = [];
    let totalAlloc = 0;
    for (const t of teams) {
      const pts = ideas.filter(i => i.release === v.id && i.team === t.id).reduce((s, i) => s + (i.size ?? 0), 0);
      if (pts <= 0) continue;
      totalAlloc += pts;
      const cap = (capByTeam[t.id] ?? (t.sprintCap * t.sprintsPerRelease)) || 0;
      const state = barState(pts, cap, threshold);
      segs.push({ team: t, pts, state, label: t.name.slice(0, 2).toUpperCase() + ' ' + pts });
    }
    return { version: v, segs, totalAlloc };
  });

  const vScale = Math.max(totalCapAll, ...versionData.map(d => d.totalAlloc), 1) * 1.1;
  const capLineY = totalCapAll > 0 ? (totalCapAll / vScale * 100) : 0;

  if (visibleVersions.length === 0) {
    return <div style={{ padding: '40px 8px', textAlign: 'center', color: 'var(--text-subtlest)', fontSize: 12 }}>No versions to show.</div>;
  }

  return (
    <div style={{ position: 'relative', display: 'flex', gap: 12, alignItems: 'flex-start', padding: '20px 4px 0', opacity: switching ? 0.5 : 1 }}>
      <div style={{ position: 'absolute', left: 4, right: 4, top: 20, height: TRACK_H, pointerEvents: 'none', zIndex: 5 }}>
        {totalCapAll > 0 && (
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: `${capLineY}%`, borderTop: '2px dashed var(--text-subtlest)', opacity: 0.6 }}>
            <span style={{ position: 'absolute', right: -2, top: -8, background: 'var(--text-subtlest)', color: 'var(--surface)', fontSize: 8, fontWeight: 700, padding: '1px 4px', borderRadius: 3, letterSpacing: '.3px' }}>
              Σ cap
            </span>
          </div>
        )}
      </div>

      {versionData.map(({ version, segs, totalAlloc }) => {
        const isCurrent = version.id === versionId;
        return (
          <div key={version.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', flex: '1 1 0', minWidth: 0 }}>
            <div style={{
              height: TRACK_H, border: '1px solid var(--border)', borderRadius: 3,
              overflow: 'hidden', background: 'var(--surface-sunken)',
              display: 'flex', flexDirection: 'column-reverse',
            }}>
              {segs.map(({ team, pts, state, label }) => {
                const segH = pts / vScale * 100;
                const c = COLORS[state];
                return (
                  <div key={team.id} title={`${team.name}: ${pts} pts · ${state.toUpperCase()}`}
                    style={{
                      height: `${segH}%`, background: c.fill, borderTop: '1px solid var(--surface)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', minHeight: 2,
                    }}>
                    {segH > 10 && <span style={{ fontSize: 9, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap' }}>{label}</span>}
                  </div>
                );
              })}
              {segs.length === 0 && (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontSize: 10, color: 'var(--text-subtlest)' }}>no ideas</span>
                </div>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, paddingTop: 6 }}>
              <span style={{ display: 'inline-block', padding: '1px 7px', borderRadius: 3, fontSize: 9, fontWeight: 800, letterSpacing: '.4px', background: isCurrent ? 'var(--info-bg)' : 'var(--lz-n-bg)', color: isCurrent ? 'var(--info-text)' : 'var(--lz-n-text)' }}>
                {isCurrent ? 'CURRENT' : 'FUTURE'}
              </span>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%' }}>
                {version.name}
              </span>
              <span style={{ fontSize: 10, color: 'var(--text-subtle)', fontVariantNumeric: 'tabular-nums' }}>
                {totalAlloc} / {totalCapAll} pts
              </span>
              <span style={{ fontSize: 10, color: 'var(--text-subtlest)' }}>
                {fmtDate(version.releaseDate)}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
