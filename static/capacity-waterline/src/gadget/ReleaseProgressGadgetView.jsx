import React, { useState, useEffect, useCallback } from 'react';
import { invoke, view, router } from '@forge/bridge';
import { fmtDate, pickAutoVersion } from './gadgetUtils';

const GLOBAL_PAGE_MODULE_KEY = 'capacity-waterline';
const TRACK_H = 130;

const COLORS = {
  ok:     { fill: 'var(--ok)',      bg: 'var(--ok-bg)',      text: 'var(--ok-text)' },
  behind: { fill: 'var(--filling)', bg: 'var(--filling-bg)', text: 'var(--filling-text)' },
  risk:   { fill: 'var(--over)',    bg: 'var(--over-bg)',    text: 'var(--over-text)' },
  noplan: { fill: 'var(--border)',  bg: 'transparent',       text: 'var(--text-subtlest)' },
};
const STATE_LABEL = { ok: 'OK', behind: 'BEHIND', risk: 'RISK', noplan: 'NO PLAN' };

// Ratio = how much of the time-expected progress has actually been delivered.
// Nothing is expected yet (future release, no sprint started) → can't be behind.
function progressState(actual, planned, expectedPct, okThreshold, riskThreshold) {
  if (!planned) return 'noplan';
  if (expectedPct <= 0) return 'ok';
  const ratio = (actual / planned * 100) / expectedPct * 100;
  if (ratio >= okThreshold) return 'ok';
  if (ratio >= riskThreshold) return 'behind';
  return 'risk';
}

// Released → fully expected. Not yet started (no mapped sprint active/closed) →
// nothing expected yet. Otherwise, prorate linearly from the earliest mapped
// sprint's start date to the version's target release date.
function computeExpectedPct(version, hasStartedSprint, earliestSprintStart) {
  if (!version) return 0;
  if (version.released) return 100;
  if (!hasStartedSprint || !earliestSprintStart || !version.releaseDate) return 0;
  const start = new Date(earliestSprintStart).getTime();
  const end = new Date(version.releaseDate).getTime();
  if (end <= start) return 100;
  const pct = (Date.now() - start) / (end - start) * 100;
  return Math.max(0, Math.min(100, pct));
}

function Legend() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 11, color: 'var(--text-subtle)', flexWrap: 'wrap' }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        <span style={{ width: 14, height: 0, borderTop: '2px solid var(--text-subtlest)', display: 'inline-block' }} />
        Expected Progress
      </span>
      {[['var(--ok)', 'OK'], ['var(--filling)', 'Behind'], ['var(--over)', 'Risk']].map(([c, l]) => (
        <span key={l} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: c, display: 'inline-block' }} />
          {l}
        </span>
      ))}
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        <span style={{ width: 14, height: 0, borderTop: '2px dashed var(--threshold)', display: 'inline-block' }} />
        Planned
      </span>
    </div>
  );
}

export default function ReleaseProgressGadgetView() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [versions, setVersions] = useState([]);
  const [teams, setTeams] = useState([]);
  const [ideas, setIdeas] = useState([]);
  const [actualByTeam, setActualByTeam] = useState({});
  const [earliestSprintStart, setEarliestSprintStart] = useState(null);
  const [hasStartedSprint, setHasStartedSprint] = useState(false);
  const [versionId, setVersionId] = useState('');
  const [okThreshold, setOkThreshold] = useState(95);
  const [riskThreshold, setRiskThreshold] = useState(80);
  const [switching, setSwitching] = useState(false);

  const loadForVersion = useCallback((vId) => {
    return Promise.all([
      invoke('getAll', { versionId: vId }),
      invoke('getReleaseProgress', { versionId: vId }),
    ]).then(([all, progress]) => {
      setTeams(all.teams ?? []);
      setIdeas(all.ideas ?? []);
      setActualByTeam(progress.actualByTeam ?? {});
      setEarliestSprintStart(progress.earliestSprintStart ?? null);
      setHasStartedSprint(!!progress.hasStartedSprint);
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
        setOkThreshold(cfg.okThreshold ?? 95);
        setRiskThreshold(cfg.riskThreshold ?? 80);
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
  const expectedPct = computeExpectedPct(selectedVersion, hasStartedSprint, earliestSprintStart);

  const plannedByTeam = {};
  for (const idea of ideas) {
    if (idea.release !== versionId || !idea.team) continue;
    plannedByTeam[idea.team] = (plannedByTeam[idea.team] ?? 0) + (idea.size ?? 0);
  }

  const teamCols = teams.map(t => ({
    id: t.id, name: t.name,
    planned: plannedByTeam[t.id] ?? 0,
    actual: actualByTeam[t.id] ?? 0,
  }));
  const totalPlanned = teamCols.reduce((s, c) => s + c.planned, 0);
  const totalActual = teamCols.reduce((s, c) => s + c.actual, 0);
  const cols = [...teamCols, { id: '__total', name: 'Total', planned: totalPlanned, actual: totalActual, isTotal: true }];
  const maxScale = Math.max(totalPlanned, ...cols.map(c => c.actual), 1) * 1.15;
  const planY = totalPlanned ? (totalPlanned / maxScale * 100) : 0;
  const expectedPts = totalPlanned * expectedPct / 100;
  const expY = maxScale ? (expectedPts / maxScale * 100) : 0;

  return (
    <div style={{ padding: '14px 16px 16px', fontFamily: 'inherit', color: 'var(--text)', fontSize: 13 }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 10 }}>
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
        <Legend />
      </div>

      {/* Bars */}
      <div style={{ position: 'relative', display: 'flex', gap: 16, alignItems: 'flex-start', padding: '20px 4px 0', opacity: switching ? 0.5 : 1 }}>
        <div style={{ position: 'absolute', left: 4, right: 4, top: 20, height: TRACK_H, pointerEvents: 'none', zIndex: 5 }}>
          {totalPlanned > 0 && (
            <>
              <div style={{ position: 'absolute', left: 0, right: 0, bottom: `${expY}%`, borderTop: '2px solid var(--text-subtlest)', opacity: 0.7 }}>
                <span style={{ position: 'absolute', right: -2, top: -8, background: 'var(--text-subtlest)', color: 'var(--surface)', fontSize: 8, fontWeight: 700, padding: '1px 4px', borderRadius: 3, letterSpacing: '.3px' }}>
                  Exp
                </span>
              </div>
              <div style={{ position: 'absolute', left: 0, right: 0, bottom: `${planY}%`, borderTop: '2px dashed var(--threshold)' }}>
                <span style={{ position: 'absolute', right: -2, top: -8, background: 'var(--threshold)', color: '#fff', fontSize: 9, fontWeight: 800, padding: '1px 4px', borderRadius: 3 }}>
                  Plan
                </span>
              </div>
            </>
          )}
        </div>

        {cols.map(col => {
          const state = progressState(col.actual, col.planned, expectedPct, okThreshold, riskThreshold);
          const c = COLORS[state];
          const heightPct = col.planned ? (col.actual / maxScale * 100) : 0;
          const pct = col.planned ? Math.round(col.actual / col.planned * 100) : null;

          return (
            <div key={col.id} style={{
              display: 'flex', flexDirection: 'column', alignItems: 'stretch', flex: '1 1 0', minWidth: 0,
              ...(col.isTotal ? { borderLeft: '1px dashed var(--border)', paddingLeft: 14, marginLeft: 6 } : {}),
            }}>
              <div style={{
                position: 'relative', height: TRACK_H, borderRadius: 3, overflow: 'hidden',
                border: '1px solid var(--border)', background: 'var(--surface-sunken)',
              }}>
                {col.planned > 0 && (
                  <div style={{
                    position: 'absolute', left: 0, right: 0, bottom: 0, height: `${heightPct}%`,
                    background: c.fill, borderRadius: '3px 3px 0 0',
                  }} />
                )}
                {!col.planned && (
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 6 }}>
                    <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-subtlest)' }}>no plan set</span>
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
                  {col.planned ? `${col.actual} / ${col.planned} pts · ${pct}%` : `${col.actual} pts · no plan`}
                </span>
                {col.isTotal && (
                  <span style={{ fontSize: 10, color: 'var(--text-subtlest)', fontVariantNumeric: 'tabular-nums' }}>
                    Expected {Math.round(expectedPts)} pts
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

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
