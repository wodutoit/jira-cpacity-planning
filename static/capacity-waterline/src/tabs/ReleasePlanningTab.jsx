import React, { useState, useCallback, useEffect } from 'react';
import { invoke, router } from '@forge/bridge';
import { withSaving } from '../utils/saving';
import WaterlineChart from '../components/WaterlineChart';
import VersionChart from '../components/VersionChart';
import IdeaTable from '../components/IdeaTable';

const SESSION_KEY = 'cpw:lastVersionId';

function fmtDate(iso) {
  if (!iso) return '';
  try { return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }); }
  catch { return iso; }
}

const SEL_STYLE = {
  appearance: 'none', WebkitAppearance: 'none',
  border: '1px solid var(--border)', borderRadius: 4,
  padding: '7px 30px 7px 12px', fontSize: 14, color: 'var(--text)',
  background: 'var(--surface) url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'10\' height=\'6\'%3E%3Cpath d=\'M0 0l5 6 5-6z\' fill=\'%236B778C\'/%3E%3C/svg%3E") no-repeat right 10px center',
  cursor: 'pointer', fontFamily: 'inherit', minWidth: 190, outline: 'none',
};

function rice(i) {
  if (!i.effort) return null;
  return Math.round((i.reach * i.impact * ((i.confidence ?? 0) / 100)) / i.effort * 10) / 10;
}

export default function ReleasePlanningTab({ data }) {
  const { ideas = [], teams = [], versions = [], config = {}, currentUser, siteUrl = '' } = data ?? {};
  const scale   = config.scale   ?? { XS: 1, S: 3, M: 8, L: 13, XL: 21 };
  const jiraCfg = config.jiraCfg ?? {};

  const [versionId, setVersionId] = useState(() => {
    const stored = localStorage.getItem(SESSION_KEY);
    return stored && versions.some(v => v.id === stored) ? stored : '';
  });
  useEffect(() => { if (versionId) localStorage.setItem(SESSION_KEY, versionId); }, [versionId]);

  const [release, setRelease] = useState(() => data?.release ?? { capacityByTeam: {}, threshold: config.threshold ?? 70 });
  const [dirty, setDirty]     = useState(false);
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);
  const [showLowTag, setShowLowTag] = useState(true);
  const [teamFilter, setTeamFilter]     = useState(null);
  const [chartMode, setChartMode]       = useState('team'); // 'team' | 'version'
  const [futureCount, setFutureCount]   = useState(5);
  const [versionFilter, setVersionFilter] = useState(null); // for By version mode
  const [localIdeas, setLocalIdeas] = useState(ideas);
  useEffect(() => setLocalIdeas(ideas), [ideas]);

  const editors = config.editors ?? [];
  const admins  = config.admins  ?? [];
  const me      = currentUser?.accountId;
  const canEdit = !editors.length || editors.some(e => e.accountId === me)
                || !admins.length  || admins.some(a => a.accountId === me);

  const updateRelease = (patch) => { setRelease(r => ({ ...r, ...patch })); setDirty(true); setSaved(false); };

  const handleCapacityChange = useCallback((teamId, value) => {
    if (!canEdit) return;
    setRelease(r => {
      const next = { ...r.capacityByTeam };
      if (value == null) delete next[teamId]; else next[teamId] = value;
      return { ...r, capacityByTeam: next };
    });
    setDirty(true); setSaved(false);
  }, [canEdit]);

  const handleThreshold = useCallback((v) => {
    if (!canEdit) return;
    updateRelease({ threshold: v });
  }, [canEdit]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await invoke('saveCapacity', { versionId, capacityByTeam: release.capacityByTeam, threshold: release.threshold });
      setDirty(false); setSaved(true);
      setTimeout(() => setSaved(false), 2400);
    } finally { setSaving(false); }
  };

  const handleTeamChange = useCallback((issueKey, teamId, mode) => {
    if (mode === 'filter') { setTeamFilter(null); return; }
    setLocalIdeas(prev => prev.map(i => i.key === issueKey ? { ...i, team: teamId } : i));
    withSaving(() => invoke('updateIdeaTeam', { issueKey, teamId })).catch(console.error);
  }, []);

  const handleVersionChange = useCallback((issueKey, value, mode) => {
    if (mode === 'size') {
      const pts = value ? (scale?.[value] ?? null) : null;
      setLocalIdeas(prev => prev.map(i => i.key === issueKey ? { ...i, size: pts } : i));
      withSaving(() => invoke('updateIdeaSize', { issueKey, points: pts })).catch(console.error);
    } else {
      setLocalIdeas(prev => prev.map(i => i.key === issueKey ? { ...i, release: value } : i));
      withSaving(() => invoke('updateIdeaRelease', { issueKey, versionId: value })).catch(console.error);
    }
  }, [scale]);

  const handleReorder = useCallback((dragKey, dropKey) => {
    setLocalIdeas(prev => {
      const next = [...prev];
      const from = next.findIndex(i => i.key === dragKey);
      const to   = next.findIndex(i => i.key === dropKey);
      if (from === -1 || to === -1) return prev;
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      withSaving(() => invoke('updateIdeaOrder', { order: next.map(i => i.key) })).catch(console.error);
      return next;
    });
  }, []);

  const handleTeamFilter = useCallback((id) => setTeamFilter(id), []);

  const handleStatusChange = useCallback((issueKey, lifecycle) => {
    const jiraStatus = jiraCfg.statusMap?.[lifecycle] ?? lifecycle;
    setLocalIdeas(prev => prev.map(i => i.key === issueKey ? { ...i, status: jiraStatus } : i));
    withSaving(() => invoke('transitionIdea', { issueKey, targetStatus: lifecycle })).catch(console.error);
  }, [jiraCfg]);

  const handleRiceChange = useCallback((issueKey, vals) => {
    setLocalIdeas(prev => prev.map(i => i.key === issueKey ? { ...i, ...vals } : i));
    withSaving(() => invoke('updateIdeaRice', { issueKey, ...vals })).catch(console.error);
  }, []);

  // Plan-visible ideas: scored + not New status
  const jiraNew = jiraCfg.statusMap?.New ?? 'New';
  const planIdeas = localIdeas.filter(i => {
    const score = rice(i);
    return score != null && score > 0 && i.status !== jiraNew;
  });

  const unassignedCount = localIdeas.filter(i => !i.release).length;
  const unsizedCount    = localIdeas.filter(i => i.release === versionId && i.size == null).length;

  const selectedVersion = versions.find(v => v.id === versionId);
  const versionOpts     = versions.map(v => ({ value: v.id, label: v.name }));

  // Display states
  const showNone  = !versionId;
  const showEmpty = versionId && planIdeas.filter(i => i.release === versionId).length === 0;
  const showBoard = versionId && !showEmpty;

  const VERSION_PICKER = (onChange) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.4px', textTransform: 'uppercase', color: 'var(--text-subtlest)' }}>Version</label>
      <select style={SEL_STYLE} value={versionId} onChange={e => onChange(e.target.value)}>
        <option value="">Select a version…</option>
        {versions.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
      </select>
    </div>
  );

  return (
    <div style={{ maxWidth: 1120, margin: '0 auto', padding: '0 0 64px' }}>

      {/* ── View tabs — always at top ── */}
      <div style={{ display: 'flex', borderBottom: '2px solid var(--border)', marginBottom: 20 }}>
        {[['team', 'By team'], ['version', 'By version']].map(([mode, label]) => (
          <button key={mode} onClick={() => { setChartMode(mode); setVersionFilter(null); setTeamFilter(null); }}
            style={{ padding: '10px 20px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'inherit', color: chartMode === mode ? 'var(--brand)' : 'var(--text-subtle)', borderBottom: chartMode === mode ? '2px solid var(--brand)' : '2px solid transparent', marginBottom: -2 }}>
            {label}
          </button>
        ))}
      </div>

      {/* ══════════ BY TEAM ══════════ */}
      {chartMode === 'team' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Version picker + unsaved/saved banners */}
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 24, flexWrap: 'wrap' }}>
            {VERSION_PICKER(v => { setVersionId(v); setDirty(false); setSaved(false); setTeamFilter(null); })}
            {selectedVersion && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.4px', textTransform: 'uppercase', color: 'var(--text-subtlest)' }}>Target release date</label>
                <span style={{ fontSize: 14, color: selectedVersion.releaseDate ? 'var(--text)' : 'var(--text-subtlest)', padding: '7px 0' }}>
                  {selectedVersion.releaseDate ? fmtDate(selectedVersion.releaseDate) : 'Not set'}
                </span>
              </div>
            )}
            {(jiraCfg.releaseSpace || jiraCfg.ideaSpace) && (
              <button type="button"
                onClick={() => router.open(`${siteUrl}/projects/${jiraCfg.releaseSpace || jiraCfg.ideaSpace}?selectedItem=com.atlassian.jira.jira-projects-plugin%3Arelease-page`)}
                style={{ background: 'transparent', border: 'none', color: 'var(--brand)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', padding: '7px 0', alignSelf: 'flex-end' }}>
                Manage releases ↗
              </button>
            )}
            <div style={{ flex: 1 }} />
            {dirty && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--filling-bg)', border: '1px solid var(--filling-border)', borderRadius: 6, padding: '10px 12px 10px 14px' }}>
                <span style={{ fontSize: 16 }}>⚠</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--filling-text)' }}>Unsaved changes — Save to keep</span>
                <button onClick={handleSave} style={{ background: 'var(--brand)', color: '#fff', border: 'none', borderRadius: 3, padding: '5px 12px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            )}
            {saved && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--ok-bg)', border: '1px solid var(--ok-border)', borderRadius: 6, padding: '10px 14px', color: 'var(--ok-text)', fontSize: 13, fontWeight: 600 }}>✓ Saved</div>
            )}
          </div>

          {/* No version selected */}
          {showNone && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18, padding: '80px 20px' }}>
              <div style={{ width: 64, height: 64, borderRadius: 14, background: 'var(--surface-sunken)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, color: 'var(--text-subtlest)' }}>◔</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)' }}>Select a version to begin planning.</div>
              <div style={{ fontSize: 14, color: 'var(--text-subtle)', maxWidth: 360, lineHeight: 1.5, textAlign: 'center' }}>
                Choose a release from the picker above to load its teams, capacity, and linked ideas.
              </div>
            </div>
          )}

          {/* Version selected but no scored ideas */}
          {showEmpty && (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '80px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 56, height: 56, borderRadius: 12, background: 'var(--surface-sunken)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, color: 'var(--text-subtlest)' }}>∅</div>
              <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)' }}>No scored ideas linked to this version.</div>
              <div style={{ fontSize: 14, color: 'var(--text-subtle)', maxWidth: 380, textAlign: 'center', lineHeight: 1.5 }}>
                Score ideas in Intake and tag them to <strong>{selectedVersion?.name}</strong> to see the waterline.
              </div>
            </div>
          )}

          {/* Board */}
          {showBoard && (
            <>
              {showLowTag && unassignedCount > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--info-bg)', border: '1px solid var(--info-border)', borderRadius: 6, padding: '9px 12px' }}>
                  <span style={{ fontSize: 15 }}>ⓘ</span>
                  <span style={{ fontSize: 13, color: 'var(--info-text)', flex: 1 }}>
                    <strong>{unassignedCount}</strong> idea{unassignedCount !== 1 ? 's' : ''} have no version tag — waterline may be incomplete.
                  </span>
                  <button onClick={() => setShowLowTag(false)} style={{ background: 'transparent', border: 'none', color: 'var(--info-text)', cursor: 'pointer', fontSize: 16, padding: '0 4px' }}>×</button>
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>Release waterline — {selectedVersion?.name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-subtlest)' }}>Allocated vs capacity, per team</div>
                {(unsizedCount > 0 || unassignedCount > 0) && (
                  <div style={{ fontSize: 12, color: 'var(--text-subtle)', marginTop: 2 }}>
                    <strong style={{ color: 'var(--text)' }}>{unsizedCount}</strong> unsized ·{' '}
                    <strong style={{ color: 'var(--text)' }}>{unassignedCount}</strong> unassigned — contribute 0 pts
                  </div>
                )}
              </div>

              <WaterlineChart
                teams={teams} ideas={localIdeas} scale={scale}
                versionId={versionId} release={release}
                onCapacityChange={handleCapacityChange} onThresholdChange={handleThreshold}
                onSave={handleSave} saving={saving} dirty={dirty}
                teamFilter={teamFilter} onTeamFilter={handleTeamFilter}
              />

              <IdeaTable
                ideas={localIdeas} teams={teams} versions={versions}
                scale={scale} versionId={versionId} release={release}
                teamFilter={teamFilter} statusMap={jiraCfg.statusMap} siteUrl={siteUrl}
                onTeamChange={handleTeamChange} onVersionChange={handleVersionChange}
                onStatusChange={handleStatusChange} onRiceChange={handleRiceChange}
                onReorder={handleReorder}
              />
            </>
          )}
        </div>
      )}

      {/* ══════════ BY VERSION ══════════ */}
      {chartMode === 'version' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <VersionChart
            ideas={localIdeas} teams={teams} versions={versions}
            scale={scale} release={release}
            currentVersionId={versionId}
            futureCount={futureCount} onFutureCount={setFutureCount}
            versionFilter={versionFilter} onVersionFilter={setVersionFilter}
          />

          <IdeaTable
            ideas={localIdeas} teams={teams} versions={versions}
            scale={scale}
            versionId={versionFilter ?? versions[0]?.id}
            versionIds={versionFilter ? null : versions.slice(0, futureCount + 1).map(v => v.id)}
            release={release}
            teamFilter={null} statusMap={jiraCfg.statusMap}
            versionFilterLabel={versionFilter ? versions.find(v => v.id === versionFilter)?.name : null}
            onVersionFilterClear={() => setVersionFilter(null)}
            onTeamChange={handleTeamChange} onVersionChange={handleVersionChange}
            onStatusChange={handleStatusChange} onRiceChange={handleRiceChange}
            onReorder={handleReorder}
          />
        </div>
      )}
    </div>
  );
}
