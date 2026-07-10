import React, { useState, useCallback, useRef } from 'react';
import { invoke } from '@forge/bridge';
import { withSaving } from '../utils/saving';
import Button from '../components/Button';
import NativeSelect from '../components/NativeSelect';

const SIZES = ['XS', 'S', 'M', 'L', 'XL'];
const LIFECYCLE = ['New', 'Backlog', 'ToDo', 'Doing', 'Done'];

function rice(reach, impact, effort, confidence) {
  if (!effort) return null;
  return Math.round((reach * impact * ((confidence ?? 0) / 100)) / effort * 10) / 10;
}

// Multi-select chip filter row
function FilterChips({ label, chips, active, onChange }) {
  const allActive = active.length === 0;
  const toggle = val => {
    if (val === '__all') { onChange([]); return; }
    const next = active.includes(val) ? active.filter(v => v !== val) : [...active, val];
    onChange(next);
  };
  return (
    <div className="filter-row">
      <span className="filter-row-label">{label}</span>
      <div className="chip-row">
        <button className={`chip${allActive ? ' active' : ''}`} onClick={() => toggle('__all')}>All</button>
        {chips.map(c => (
          <button key={c.value} className={`chip${active.includes(c.value) ? ' active' : ''}`}
            onClick={() => toggle(c.value)}>{c.label}</button>
        ))}
      </div>
    </div>
  );
}

// Dot rating — filled solid color, empty hollow circle
function DotRating({ value, max = 5, onChange, color }) {
  return (
    <span style={{ display: 'inline-flex', gap: 3 }}>
      {Array.from({ length: max }, (_, i) => i + 1).map(n => {
        const filled = n <= (value ?? 0);
        return (
          <button key={n} type="button" onClick={() => onChange(n === value ? 0 : n)}
            style={{
              width: 13, height: 13, borderRadius: '50%', border: 'none', cursor: 'pointer', padding: 0,
              background: filled ? color : 'var(--ds-background-neutral, #F4F5F7)',
              boxShadow: filled ? 'none' : 'inset 0 0 0 1.5px #DFE1E6',
              transition: 'background .1s',
            }} title={String(n)} />
        );
      })}
    </span>
  );
}

// Inline-editable title cell
function EditableTitle({ value, ideaKey, onChange }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  const commit = () => {
    setEditing(false);
    if (draft.trim() && draft.trim() !== value) onChange(ideaKey, draft.trim());
    else setDraft(value);
  };

  if (editing) {
    return (
      <input className="config-input" autoFocus
        style={{ fontSize: 13, padding: '2px 6px', minWidth: 180 }}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setDraft(value); setEditing(false); } }}
      />
    );
  }
  return (
    <span className="idea-title" title={`${value} — click to edit`}
      style={{ cursor: 'text', borderBottom: '1px dashed transparent' }}
      onMouseEnter={e => e.currentTarget.style.borderBottomColor = '#DFE1E6'}
      onMouseLeave={e => e.currentTarget.style.borderBottomColor = 'transparent'}
      onClick={() => { setDraft(value); setEditing(true); }}>
      {value}
    </span>
  );
}

export default function IntakeTab({ data }) {
  const { ideas: allIdeas = [], teams = [], versions = [], config = {} } = data ?? {};
  const scale = config.scale ?? { XS: 1, S: 3, M: 8, L: 13, XL: 21 };
  const jiraCfg = config.jiraCfg ?? {};
  const statusMap = jiraCfg.statusMap ?? {};
  // Reverse: Jira status name → lifecycle key
  const reverseStatus = Object.fromEntries(Object.entries(statusMap).map(([lc, js]) => [js, lc]));

  const [localIdeas, setLocalIdeas] = useState(allIdeas);

  // Chip filters — version and team use IDs, status uses lifecycle names
  const [versionChips, setVersionChips] = useState([]);   // empty = All
  const [teamChips, setTeamChips]       = useState([]);   // empty = All
  const [statusChips, setStatusChips]   = useState(['New', 'Backlog']); // default intake statuses
  const [sortDir, setSortDir] = useState(-1); // -1 = desc

  // Add form
  const [newTitle, setNewTitle] = useState('');
  const [newSize, setNewSize] = useState('');
  const [newVersion, setNewVersion] = useState('');
  const [newTeam, setNewTeam] = useState('');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState('');

  const sizeToPoints = s => scale[s] ?? 0;
  const pointsToSize = pts => pts == null ? null : (SIZES.find(s => scale[s] === pts) ?? String(pts));

  const updateLocal = (key, patch) =>
    setLocalIdeas(prev => prev.map(i => i.key === key ? { ...i, ...patch } : i));

  // ── Handlers ─────────────────────────────────────────────────────────
  const handleRice = useCallback(async (key, field, value) => {
    const idea = localIdeas.find(i => i.key === key);
    if (!idea) return;
    const updated = { ...idea, [field]: value };
    updateLocal(key, { [field]: value });
    withSaving(() => invoke('updateIdeaRice', {
      issueKey: key,
      reach: updated.reach, impact: updated.impact,
      effort: updated.effort, confidence: updated.confidence,
    })).catch(console.error);
  }, [localIdeas]);

  const handleConf = useCallback(async (key, raw) => {
    const value = Math.min(100, Math.max(0, parseInt(raw, 10) || 0));
    handleRice(key, 'confidence', value);
  }, [handleRice]);

  const handleTitle = useCallback(async (key, summary) => {
    updateLocal(key, { title: summary });
    await invoke('updateIdeaSummary', { issueKey: key, summary }).catch(console.error);
  }, []);

  const handleSize = useCallback(async (key, sizeLabel) => {
    const pts = sizeLabel ? sizeToPoints(sizeLabel) : null;
    updateLocal(key, { size: pts });
    await invoke('updateIdeaSize', { issueKey: key, points: pts }).catch(console.error);
  }, [scale]);

  const handleTeam = useCallback(async (key, teamId) => {
    updateLocal(key, { team: teamId || null });
    await invoke('updateIdeaTeam', { issueKey: key, teamId: teamId || null }).catch(console.error);
  }, []);

  const handleVersion = useCallback(async (key, versionId) => {
    updateLocal(key, { release: versionId || null });
    await invoke('updateIdeaRelease', { issueKey: key, versionId: versionId || null }).catch(console.error);
  }, []);

  const handleStatus = useCallback(async (key, lifecycle) => {
    const idea = localIdeas.find(i => i.key === key);
    const score = idea ? rice(idea.reach, idea.impact, idea.effort, idea.confidence) : 0;
    if (lifecycle === 'Backlog' && !(score > 0)) return; // guard — enforced by disabled attr too
    const jiraStatus = statusMap[lifecycle] ?? lifecycle;
    updateLocal(key, { status: jiraStatus });
    await invoke('transitionIdea', { issueKey: key, targetStatus: lifecycle }).catch(console.error);
  }, [localIdeas, statusMap]);

  const handleDelete = useCallback(async (key) => {
    setLocalIdeas(prev => prev.filter(i => i.key !== key));
    await invoke('deleteIdea', { issueKey: key }).catch(console.error);
  }, []);

  const handleAdd = async () => {
    if (!newTitle.trim()) return;
    setAdding(true); setAddError('');
    try {
      const pts = newSize ? sizeToPoints(newSize) : null;
      const result = await invoke('createIdea', {
        title: newTitle.trim(), size: pts,
        releaseId: newVersion || null, teamId: newTeam || null,
      });
      if (result.ok) {
        setNewTitle(''); setNewSize('');
        // retain version and team for frictionless repeat-adds
        setLocalIdeas(prev => [{
          key: result.key, title: newTitle.trim(),
          status: statusMap.New ?? 'New',
          size: pts, release: newVersion || null,
          team: newTeam || null,
          reach: 0, impact: 0, effort: 0, confidence: 0,
        }, ...prev]);
      } else {
        setAddError(result.error ?? 'Failed to create idea');
      }
    } finally { setAdding(false); }
  };

  // ── Filtering + sorting ───────────────────────────────────────────────
  // Convert status chip lifecycle names → Jira status names for comparison
  const activeJiraStatuses = statusChips.map(lc => statusMap[lc] ?? lc);

  let displayed = localIdeas.filter(i => {
    if (activeJiraStatuses.length > 0 && !activeJiraStatuses.includes(i.status)) return false;
    if (versionChips.length > 0 && !versionChips.includes(i.release ?? '__none')) return false;
    if (teamChips.length > 0   && !teamChips.includes(i.team ?? '__none'))   return false;
    return true;
  });

  displayed = [...displayed].sort((a, b) => {
    const sa = rice(a.reach, a.impact, a.effort, a.confidence) ?? -1;
    const sb = rice(b.reach, b.impact, b.effort, b.confidence) ?? -1;
    return (sa - sb) * sortDir;
  });

  // ── Header counts (over ALL ideas, ignore filters) ────────────────────
  const jiraNew     = statusMap.New     ?? 'New';
  const jiraBacklog = statusMap.Backlog ?? 'Backlog';
  const newCount     = localIdeas.filter(i => i.status === jiraNew).length;
  const backlogCount = localIdeas.filter(i => i.status === jiraBacklog).length;
  const readyCount   = localIdeas.filter(i => i.status === jiraNew && rice(i.reach, i.impact, i.effort, i.confidence) > 0).length;

  // ── Chip options ──────────────────────────────────────────────────────
  const versionChipOpts = [
    ...versions.map(v => ({ value: v.id, label: v.name })),
    { value: '__none', label: 'Untagged' },
  ];
  const teamChipOpts = [
    ...teams.map(t => ({ value: t.id, label: t.name })),
    { value: '__none', label: 'Unassigned' },
  ];
  const statusChipOpts = LIFECYCLE.map(lc => ({ value: lc, label: lc }));

  const teamSelectOpts = teams.map(t => ({ value: t.id, label: t.name }));
  const versionSelectOpts = versions.map(v => ({ value: v.id, label: v.name }));

  return (
    <div>
      {/* ── Header counts ── */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <div className="card" style={{ padding: '8px 16px', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 18, fontWeight: 700, color: '#344563' }}>{newCount}</span>
          <span style={{ fontSize: 12, color: '#6B778C' }}>New</span>
        </div>
        <div className="card" style={{ padding: '8px 16px', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 18, fontWeight: 700, color: '#6D4BD8' }}>{backlogCount}</span>
          <span style={{ fontSize: 12, color: '#6B778C' }}>Backlog</span>
        </div>
        {readyCount > 0 && (
          <div style={{ padding: '5px 12px', background: '#E3FCEF', borderRadius: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#006644' }}>{readyCount}</span>
            <span style={{ fontSize: 12, color: '#006644' }}>scored & ready to promote</span>
          </div>
        )}
      </div>

      {/* ── Add form ── */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <label className="field-label mb-4">Summary</label>
            <input className="config-input" value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAdd()}
              placeholder="New idea summary…" />
          </div>
          <div style={{ width: 110 }}>
            <label className="field-label mb-4">Team</label>
            <NativeSelect options={teamSelectOpts} value={newTeam} onChange={setNewTeam} placeholder="— Team" />
          </div>
          <div style={{ width: 100 }}>
            <label className="field-label mb-4">Size</label>
            <NativeSelect options={SIZES.map(s => ({ value: s, label: `${s} · ${scale[s] ?? '?'}` }))} value={newSize} onChange={setNewSize} placeholder="—" />
          </div>
          <div style={{ width: 150 }}>
            <label className="field-label mb-4">Version</label>
            <NativeSelect options={versionSelectOpts} value={newVersion} onChange={setNewVersion} placeholder="— Untagged" />
          </div>
          <Button appearance="primary" onClick={handleAdd} isLoading={adding} isDisabled={!newTitle.trim()}>
            + Add idea
          </Button>
        </div>
        {addError && <p style={{ color: '#DE350B', fontSize: 13, marginTop: 8 }}>{addError}</p>}
      </div>

      {/* ── Filter chips ── */}
      <div className="filter-section">
        <FilterChips label="Version" chips={versionChipOpts} active={versionChips} onChange={setVersionChips} />
        <FilterChips label="Team"    chips={teamChipOpts}    active={teamChips}    onChange={setTeamChips} />
        <FilterChips label="Status"  chips={statusChipOpts}  active={statusChips}  onChange={setStatusChips} />
      </div>

      <div style={{ fontSize: 12, color: '#6B778C', marginBottom: 8 }}>
        {displayed.length} idea{displayed.length !== 1 ? 's' : ''}
      </div>

      {/* ── RICE table ── */}
      <div className="idea-table-wrap">
        <table className="idea-table">
          <thead>
            <tr>
              <th style={{ minWidth: 200 }}>Summary</th>
              <th style={{ width: 75 }}>Reach</th>
              <th style={{ width: 75 }}>Impact</th>
              <th style={{ width: 75 }}>Effort</th>
              <th style={{ width: 62 }}>Conf%</th>
              <th style={{ width: 62, cursor: 'pointer', userSelect: 'none', color: '#0052CC' }}
                onClick={() => setSortDir(d => d === -1 ? 1 : -1)}>
                RICE {sortDir === -1 ? '↓' : '↑'}
              </th>
              <th style={{ width: 70 }}>Size</th>
              <th style={{ width: 110 }}>Team</th>
              <th style={{ width: 120 }}>Version</th>
              <th style={{ width: 105 }}>Status</th>
              <th style={{ width: 30 }}></th>
            </tr>
          </thead>
          <tbody>
            {displayed.length === 0 && (
              <tr><td colSpan={11} className="idea-table-empty">
                No ideas in intake — add one above to start evaluating.
              </td></tr>
            )}
            {displayed.map(idea => {
              const score = rice(idea.reach, idea.impact, idea.effort, idea.confidence);
              const hasScore = score > 0;
              const currentLifecycle = reverseStatus[idea.status] ?? idea.status;
              const isBacklog = idea.status === jiraBacklog;

              return (
                <tr key={idea.key}
                  style={{ background: isBacklog ? 'rgba(124,92,246,0.06)' : undefined }}>
                  <td>
                    <span className="idea-key">{idea.key}</span>
                    <EditableTitle value={idea.title} ideaKey={idea.key} onChange={handleTitle} />
                  </td>
                  <td>
                    <DotRating value={idea.reach ?? 0} color="#E0A800"
                      onChange={v => handleRice(idea.key, 'reach', v)} />
                  </td>
                  <td>
                    <DotRating value={idea.impact ?? 0} color="#6E93F5"
                      onChange={v => handleRice(idea.key, 'impact', v)} />
                  </td>
                  <td>
                    <DotRating value={idea.effort ?? 0} color="#EE8C86"
                      onChange={v => handleRice(idea.key, 'effort', v)} />
                  </td>
                  <td>
                    <input className="config-input config-input--num" type="number"
                      min="0" max="100" style={{ width: 55 }}
                      value={idea.confidence ?? 0}
                      onChange={e => handleConf(idea.key, e.target.value)} />
                  </td>
                  <td>
                    <span className={`rice-pill ${hasScore ? 'scored' : 'zero'}`}>
                      {hasScore ? score : '—'}
                    </span>
                  </td>
                  <td>
                    <select className="inline-select" value={pointsToSize(idea.size) ?? ''}
                      onChange={e => handleSize(idea.key, e.target.value || null)}>
                      <option value="">—</option>
                      {SIZES.map(s => <option key={s} value={s}>{s} · {scale[s] ?? '?'}</option>)}
                    </select>
                  </td>
                  <td>
                    <select className="inline-select" value={idea.team ?? ''}
                      onChange={e => handleTeam(idea.key, e.target.value)}>
                      <option value="">— Unassigned</option>
                      {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </td>
                  <td>
                    <select className="inline-select" value={idea.release ?? ''}
                      onChange={e => handleVersion(idea.key, e.target.value)}>
                      <option value="">— Untagged</option>
                      {versions.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                    </select>
                  </td>
                  <td>
                    <select className="inline-select" value={currentLifecycle}
                      disabled={!hasScore && currentLifecycle === 'New'}
                      style={{ opacity: !hasScore && currentLifecycle === 'New' ? 0.5 : 1,
                               cursor: !hasScore && currentLifecycle === 'New' ? 'not-allowed' : 'pointer' }}
                      onChange={e => handleStatus(idea.key, e.target.value)}>
                      {LIFECYCLE.map(lc => (
                        <option key={lc} value={lc}
                          disabled={lc === 'Backlog' && !hasScore}>
                          {lc}
                        </option>
                      ))}
                    </select>
                    {!hasScore && currentLifecycle === 'New' && (
                      <div style={{ fontSize: 10, color: '#97A0AF', marginTop: 2 }}>needs RICE to promote</div>
                    )}
                  </td>
                  <td>
                    <button className="remove-btn" title="Delete idea"
                      onClick={() => handleDelete(idea.key)}>×</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
