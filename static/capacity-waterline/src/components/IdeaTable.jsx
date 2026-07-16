import React, { useState, useRef } from 'react';
import { withSaving } from '../utils/saving';
import IssueKey from './IssueKey';

const SIZES = ['XS', 'S', 'M', 'L', 'XL'];

function initials(name) {
  return (name ?? '?').split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

function riceScore(idea) {
  const { reach, impact, effort, confidence } = idea;
  if (!effort) return null;
  return Math.round((reach * impact * ((confidence ?? 0) / 100)) / effort * 10) / 10;
}

function sizeFromPoints(pts, scale) {
  if (pts == null) return null;
  return SIZES.find(s => scale[s] === pts) ?? String(pts);
}

// Per-idea waterline state based on cumulative allocation within team+version
function computeRowStates(ideas, teams, scale, versionId, capByTeam, threshold) {
  const sizeToPoints = s => scale?.[s] ?? 0;
  const states = {};
  for (const team of teams) {
    const cap = (capByTeam[team.id] ?? (team.sprintCap * team.sprintsPerRelease)) || 0;
    const teamIdeas = ideas
      .filter(i => i.release === versionId && i.team === team.id)
      .sort((a, b) => (a._rank ?? 0) - (b._rank ?? 0));
    let cum = 0;
    for (const idea of teamIdeas) {
      const pts = idea.size ?? 0; // size is already numeric points
      cum += pts;
      if (!cap) { states[idea.key] = 'none'; continue; }
      const pct = cum / cap * 100;
      states[idea.key] = pct > 100 ? 'over' : pct > threshold ? 'filling' : 'ok';
    }
  }
  return states;
}

const ROW_BG = { over: 'var(--over-bg)', filling: 'var(--filling-bg)', ok: 'transparent', none: 'transparent' };

const STATUS_COLORS = {
  'Backlog': { background: 'var(--lz-n-bg)', color: 'var(--lz-n-text)' },
  'ToDo':    { background: 'var(--lz-n-bg)', color: 'var(--lz-n-text)' },
  'Doing':   { background: 'var(--info-bg)', color: 'var(--info-text)' },
  'Done':    { background: 'var(--ok-bg)',   color: 'var(--ok-text)' },
};

const SEL_STYLE = {
  appearance: 'none', WebkitAppearance: 'none',
  border: '1px solid var(--border)', borderRadius: 4,
  padding: '4px 20px 4px 7px', fontSize: 12, fontFamily: 'inherit',
  background: 'var(--surface) url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'10\' height=\'6\'%3E%3Cpath d=\'M0 0l5 6 5-6z\' fill=\'%236B778C\'/%3E%3C/svg%3E") no-repeat right 5px center',
  cursor: 'pointer', color: 'var(--text)', outline: 'none', width: '100%',
};

function DotRating({ value, max = 5, onChange, color }) {
  return (
    <span style={{ display: 'inline-flex', gap: 4 }}>
      {Array.from({ length: max }, (_, i) => i + 1).map(n => {
        const filled = n <= (value ?? 0);
        return (
          <button key={n} type="button" onClick={() => onChange(n === value ? 0 : n)}
            style={{ width: 18, height: 18, borderRadius: '50%', border: 'none', cursor: 'pointer', padding: 0,
              background: filled ? color : 'var(--surface-sunken)',
              boxShadow: filled ? 'none' : 'inset 0 0 0 1.5px var(--border)',
            }} title={String(n)} />
        );
      })}
    </span>
  );
}

function RicePopover({ idea, onClose, onSave }) {
  const [r, setR] = useState(idea.reach ?? 0);
  const [im, setIm] = useState(idea.impact ?? 0);
  const [ef, setEf] = useState(idea.effort ?? 0);
  const [co, setCo] = useState(idea.confidence ?? 0);

  const score = ef > 0 ? Math.round((r * im * (co / 100)) / ef * 10) / 10 : null;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 24, width: 340, boxShadow: '0 8px 32px rgba(9,30,66,.24)', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>RICE Score</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-subtlest)', fontSize: 18, lineHeight: 1 }}>×</button>
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-subtle)', fontWeight: 500 }}>{idea.title}</div>

        {[['Reach', '#E0A800', r, setR], ['Impact', '#6E93F5', im, setIm], ['Effort', '#EE8C86', ef, setEf]].map(([label, color, val, set]) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 13, color: 'var(--text-subtle)', width: 70 }}>{label}</span>
            <DotRating value={val} color={color} onChange={v => set(v)} />
          </div>
        ))}

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 13, color: 'var(--text-subtle)', width: 70 }}>Confidence</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <input type="number" min="0" max="100" value={co}
              onChange={e => setCo(Math.min(100, Math.max(0, parseInt(e.target.value, 10) || 0)))}
              style={{ width: 60, border: '1px solid var(--border)', borderRadius: 4, padding: '4px 6px', fontSize: 13, textAlign: 'right', fontFamily: 'inherit', fontFamily: 'ui-monospace,monospace', color: 'var(--text)', background: 'var(--surface)', outline: 'none' }} />
            <span style={{ fontSize: 13, color: 'var(--text-subtlest)' }}>%</span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 8, borderTop: '1px solid var(--border)' }}>
          <span style={{ fontSize: 12, color: 'var(--text-subtle)' }}>RICE score</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 72, padding: '5px 14px', borderRadius: 5, background: score > 0 ? 'var(--ok-bg)' : 'var(--surface-sunken)', color: score > 0 ? 'var(--ok-text)' : 'var(--text-subtlest)', fontSize: 16, fontWeight: 800 }}>
            {score > 0 ? score : '—'}
          </span>
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 4, padding: '6px 14px', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', color: 'var(--text)' }}>Cancel</button>
          <button onClick={() => onSave({ reach: r, impact: im, effort: ef, confidence: co })} style={{ background: 'var(--brand)', color: '#fff', border: 'none', borderRadius: 4, padding: '6px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Save</button>
        </div>
      </div>
    </div>
  );
}

export default function IdeaTable({
  ideas, teams, versions, scale, versionId, versionIds, siteUrl,
  release, teamFilter, onTeamChange, onVersionChange, onStatusChange, onRiceChange,
  onReorder, statusMap, versionFilterLabel, onVersionFilterClear,
}) {
  const [collapsed, setCollapsed] = useState({});
  const [ricePopover, setRicePopover] = useState(null);
  const [dragKey, setDragKey] = useState(null);
  const [dragOverKey, setDragOverKey] = useState(null);
  const threshold = release?.threshold ?? 70;
  const capByTeam = release?.capacityByTeam ?? {};
  const teamMap    = Object.fromEntries((teams ?? []).map(t => [t.id, t]));
  const versionMap = Object.fromEntries((versions ?? []).map(v => [v.id, v.name]));
  // Reverse: Jira status name → lifecycle key
  const reverseStatus = Object.fromEntries(Object.entries(statusMap ?? {}).map(([lc, js]) => [js, lc]));
  const riceIdeaData = ricePopover ? ideas.find(i => i.key === ricePopover) : null;

  const rowStates = computeRowStates(ideas, teams ?? [], scale, versionId, capByTeam, threshold);

  // Scored ideas (RICE > 0) drive the waterline — these go into team groups.
  const scoredIdeas = ideas.filter(i => { const s = riceScore(i); return s != null && s > 0; });

  // Apply team filter if set (only affects scored/assigned ideas)
  const filtered = teamFilter ? scoredIdeas.filter(i => i.team === teamFilter) : scoredIdeas;

  // Version filtering: versionIds array overrides single versionId
  const versionSet = versionIds ? new Set(versionIds) : null;
  const matchesVersion = i => versionSet ? versionSet.has(i.release) : i.release === versionId;

  const inVersion = filtered.filter(matchesVersion);
  const byTeam = {};
  for (const idea of inVersion) {
    const key = idea.team ?? '__unassigned';
    (byTeam[key] = byTeam[key] ?? []).push(idea);
  }

  // Unassigned: all ideas with the selected version and no team, regardless of RICE score.
  // These are shown separately so planners know they still need team assignment.
  const allInVersion = ideas.filter(matchesVersion);
  const unassignedAll = allInVersion.filter(i => !i.team);
  // Merge: unassigned from scored ideas + unscored ideas with no team
  const unassigned = unassignedAll.length > 0 ? unassignedAll : (byTeam['__unassigned'] ?? []);
  // Remove unassigned from scored byTeam if present (avoid double-counting)
  delete byTeam['__unassigned'];

  const assignedGroups = (teams ?? [])
    .map(t => ({ team: t, ideas: byTeam[t.id] ?? [] }))
    .filter(g => g.ideas.length > 0);

  const toggleGroup = key => setCollapsed(c => ({ ...c, [key]: !c[key] }));

  const thStyle = {
    fontSize: 11, fontWeight: 700, letterSpacing: '.4px', textTransform: 'uppercase',
    color: 'var(--text-subtlest)', padding: '0 4px',
  };

  function IdeaRow({ idea, rank }) {
    const state = rowStates[idea.key] ?? 'none';
    const score = riceScore(idea);
    const size  = sizeFromPoints(idea.size, scale);
    const currentLifecycle = reverseStatus[idea.status] ?? idea.status ?? '';
    const statusStyle = STATUS_COLORS[currentLifecycle] ?? { background: 'var(--lz-n-bg)', color: 'var(--lz-n-text)' };
    const isDragging  = dragKey === idea.key;
    const isDragOver  = dragOverKey === idea.key;

    return (
      <tr
        draggable
        onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; setDragKey(idea.key); }}
        onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOverKey(idea.key); }}
        onDragLeave={() => setDragOverKey(null)}
        onDrop={e => {
          e.preventDefault();
          if (dragKey && dragKey !== idea.key) onReorder?.(dragKey, idea.key);
          setDragKey(null); setDragOverKey(null);
        }}
        onDragEnd={() => { setDragKey(null); setDragOverKey(null); }}
        style={{
          background: ROW_BG[state], opacity: isDragging ? 0.4 : 1,
          borderTop: isDragOver ? '2px solid var(--brand)' : undefined,
          borderBottom: isDragOver ? 'none' : '1px solid var(--border-subtle)',
          transition: 'opacity .15s',
        }}>
        {/* Rank */}
        <td style={{ width: 52, padding: '8px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
          <span style={{ color: 'var(--text-subtlest)', cursor: 'grab', fontSize: 14, marginRight: 4 }}>⠿</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-subtle)', fontVariantNumeric: 'tabular-nums' }}>{rank}</span>
        </td>
        {/* Title */}
        <td style={{ padding: '8px 8px 8px 0' }}>
          <IssueKey issueKey={idea.key} siteUrl={siteUrl} />
          <span style={{ fontSize: 14, color: 'var(--brand)', fontWeight: 500 }}>{idea.title}</span>
        </td>
        {/* RICE — clickable pill opens popover */}
        <td style={{ width: 64, padding: '8px 4px', textAlign: 'center' }}>
          <button onClick={() => setRicePopover(idea.key)}
            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '3px 6px', borderRadius: 5, background: score > 0 ? 'var(--ok-bg)' : 'var(--lz-n-bg)', color: score > 0 ? 'var(--ok-text)' : 'var(--lz-n-text)', fontSize: 12, fontWeight: 800, fontVariantNumeric: 'tabular-nums', border: 'none', cursor: 'pointer', fontFamily: 'inherit', minWidth: 36 }}>
            {score > 0 ? score : '—'}
          </button>
        </td>
        {/* Size */}
        <td style={{ width: 90, padding: '8px 4px' }}>
          <select value={size ?? ''} style={{ ...SEL_STYLE, fontFamily: 'ui-monospace,monospace' }}
            onChange={e => onVersionChange?.(idea.key, e.target.value || null, 'size')}>
            <option value="">—</option>
            {SIZES.map(s => <option key={s} value={s}>{s} · {scale?.[s] ?? '?'}</option>)}
          </select>
        </td>
        {/* Team */}
        <td style={{ width: 120, padding: '8px 4px' }}>
          <select value={idea.team ?? ''} style={SEL_STYLE}
            onChange={e => onTeamChange?.(idea.key, e.target.value || null)}>
            <option value="">— Unassigned</option>
            {(teams ?? []).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </td>
        {/* Version */}
        <td style={{ width: 96, padding: '8px 4px' }}>
          <select value={idea.release ?? ''} style={{ ...SEL_STYLE, fontFamily: 'ui-monospace,monospace' }}
            onChange={e => onVersionChange?.(idea.key, e.target.value || null, 'version')}>
            <option value="">—</option>
            {(versions ?? []).map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        </td>
        {/* Status */}
        <td style={{ width: 128, padding: '8px 4px' }}>
          <select value={currentLifecycle} style={{ ...SEL_STYLE, ...statusStyle, fontWeight: 700 }}
            onChange={e => onStatusChange?.(idea.key, e.target.value)}>
            {['Backlog', 'ToDo', 'Doing', 'Done'].map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </td>
      </tr>
    );
  }

  if (inVersion.length === 0 && !teamFilter) return null;

  return (
    <>
    {riceIdeaData && (
      <RicePopover
        idea={riceIdeaData}
        onClose={() => setRicePopover(null)}
        onSave={vals => {
          onRiceChange?.(riceIdeaData.key, vals);
          setRicePopover(null);
        }}
      />
    )}
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', boxShadow: 'var(--shadow-sm)' }}>
      {/* Version filter banner (By version mode) */}
      {versionFilterLabel && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', background: 'var(--info-bg)', borderBottom: '1px solid var(--info-border)' }}>
          <span style={{ fontSize: 13, color: 'var(--info-text)', flex: 1 }}>
            Version <strong>{versionFilterLabel}</strong> · {inVersion.length} idea{inVersion.length !== 1 ? 's' : ''}
          </span>
          <button onClick={onVersionFilterClear}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'var(--surface)', border: '1px solid var(--info-border)', borderRadius: 4, padding: '4px 10px', fontSize: 12, fontWeight: 600, color: 'var(--info-text)', cursor: 'pointer', fontFamily: 'inherit' }}>
            ✕ Clear
          </button>
        </div>
      )}

      {/* Team filter banner */}
      {teamFilter && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', background: 'var(--info-bg)', borderBottom: '1px solid var(--info-border)' }}>
          <span style={{ fontSize: 13, color: 'var(--info-text)', flex: 1 }}>
            Filtered to <strong>{teamMap[teamFilter]?.name ?? teamFilter}</strong> · {inVersion.length} idea{inVersion.length !== 1 ? 's' : ''}
          </span>
          <button onClick={() => onTeamChange?.(null, null, 'filter')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'var(--surface)', border: '1px solid var(--info-border)', borderRadius: 4, padding: '4px 10px', fontSize: 12, fontWeight: 600, color: 'var(--info-text)', cursor: 'pointer', fontFamily: 'inherit' }}>
            ✕ Clear filter
          </button>
        </div>
      )}

      {/* Column headers */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'var(--surface-sunken)' }}>
        <span style={{ ...thStyle, width: 52 }}>Rank</span>
        <span style={{ ...thStyle, flex: 1 }}>Title</span>
        <span style={{ ...thStyle, width: 64 }}>RICE</span>
        <span style={{ ...thStyle, width: 90 }}>Size</span>
        <span style={{ ...thStyle, width: 120 }}>Team</span>
        <span style={{ ...thStyle, width: 96 }}>Version</span>
        <span style={{ ...thStyle, width: 128 }}>Status</span>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <tbody>
          {assignedGroups.map(({ team, ideas: gIdeas }) => {
            const pts = gIdeas.reduce((s, i) => s + (i.size ?? 0), 0);
            const isCollapsed = collapsed[team.id];
            return (
              <React.Fragment key={team.id}>
                {/* Group header */}
                <tr style={{ background: 'var(--surface-sunken)', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                  onClick={() => toggleGroup(team.id)}>
                  <td colSpan={7} style={{ padding: '8px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ color: 'var(--text-subtlest)', fontSize: 11 }}>{isCollapsed ? '▸' : '▾'}</span>
                      <span style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--brand)', color: '#fff', fontSize: 9, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        {initials(team.name)}
                      </span>
                      <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.4px', textTransform: 'uppercase', color: 'var(--text-subtle)' }}>
                        {team.name}
                      </span>
                      <span style={{ flex: 1 }} />
                      <span style={{ fontSize: 11, color: 'var(--text-subtlest)', fontVariantNumeric: 'tabular-nums' }}>
                        {gIdeas.length} idea{gIdeas.length !== 1 ? 's' : ''} · {pts} pts
                      </span>
                    </div>
                  </td>
                </tr>
                {!isCollapsed && gIdeas.map((idea, i) => <IdeaRow key={idea.key} idea={idea} rank={i + 1} />)}
              </React.Fragment>
            );
          })}

          {/* Unassigned group */}
          {unassigned.length > 0 && (
            <React.Fragment>
              <tr style={{ background: 'var(--surface-sunken)', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                onClick={() => toggleGroup('__unassigned')}>
                <td colSpan={7} style={{ padding: '8px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ color: 'var(--text-subtlest)', fontSize: 11 }}>{collapsed['__unassigned'] ? '▸' : '▾'}</span>
                    <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                    <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.4px', textTransform: 'uppercase', color: 'var(--text-subtlest)' }}>
                      Unassigned ({unassigned.length})
                    </span>
                    <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                  </div>
                </td>
              </tr>
              {!collapsed['__unassigned'] && unassigned.map(idea => (
                <tr key={idea.key} style={{ background: 'var(--unassigned-bg)', borderBottom: '1px solid var(--border-subtle)' }}>
                  <td style={{ width: 52, padding: '8px 16px', textAlign: 'center', color: 'var(--text-subtlest)', fontSize: 13 }}>–</td>
                  <td style={{ padding: '8px 8px 8px 0' }}>
                    <IssueKey issueKey={idea.key} siteUrl={siteUrl} />
                    <span style={{ fontSize: 14, color: 'var(--brand)', fontWeight: 500 }}>{idea.title}</span>
                  </td>
                  <td style={{ width: 64, padding: '8px 4px' }} />
                  <td style={{ width: 90, padding: '8px 4px' }}>
                    <span style={{ fontSize: 12, color: 'var(--text-subtlest)' }}>{sizeFromPoints(idea.size, scale) ?? '—'}</span>
                  </td>
                  <td style={{ width: 120, padding: '8px 4px' }}>
                    <select value={idea.team ?? ''} style={SEL_STYLE}
                      onChange={e => onTeamChange?.(idea.key, e.target.value || null)}>
                      <option value="">— Unassigned</option>
                      {(teams ?? []).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </td>
                  <td style={{ width: 96, padding: '8px 4px' }}>
                    <span style={{ fontSize: 12, color: 'var(--text-subtlest)', fontFamily: 'monospace' }}>{versionMap[idea.release] ?? '—'}</span>
                  </td>
                  <td style={{ width: 128, padding: '8px 4px' }} />
                </tr>
              ))}
            </React.Fragment>
          )}

          {assignedGroups.length === 0 && unassigned.length === 0 && (
            <tr><td colSpan={7} style={{ padding: 32, textAlign: 'center', color: 'var(--text-subtlest)', fontSize: 13 }}>
              No scored ideas linked to this version yet.
            </td></tr>
          )}
        </tbody>
      </table>
    </div>
    </>
  );
}
