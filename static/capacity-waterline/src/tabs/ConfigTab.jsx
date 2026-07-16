import React, { useState, useEffect } from 'react';
import { invoke } from '@forge/bridge';
import Button from '../components/Button';
import UserPicker from '../components/UserPicker';

const SIZES = ['XS', 'S', 'M', 'L', 'XL'];
const DEFAULT_SCALE = { XS: 1, S: 3, M: 8, L: 13, XL: 21 };

function newTeam() {
  return { id: `team-${Date.now()}`, name: '', teamJiraId: null, sprintWeeks: 2, sprintCap: 20, sprintsPerRelease: 3, boardId: null, boardName: '' };
}

// Dropdown for selecting a team from the configured Jira Select field options.
// Options are fetched from the field's allowedValues via the issue create metadata.
function TeamSelect({ options, optionsLoading, optionsError, onSelect }) {
  const [selected, setSelected] = useState('');

  const commit = () => {
    const opt = options.find(o => o.name === selected);
    if (!opt) return;
    onSelect({ name: opt.name, id: null });
    setSelected('');
  };

  if (optionsLoading) return <span style={{ fontSize: 12, color: 'var(--text-subtlest)' }}>Loading options…</span>;

  if (optionsError || !options.length) return (
    <span style={{ fontSize: 12, color: 'var(--over-text)' }}>
      {optionsError || 'No options — set a Select List field in Jira Config first.'}
    </span>
  );

  return (
    <div style={{ display: 'flex', gap: 6 }}>
      <select className="config-input" value={selected} onChange={e => setSelected(e.target.value)} style={{ flex: 1 }}>
        <option value="">— select team —</option>
        {options.map(o => <option key={o.id} value={o.name}>{o.name}</option>)}
      </select>
      <button type="button" onClick={commit} disabled={!selected}
        style={{ flexShrink: 0, background: selected ? 'var(--brand)' : 'var(--surface-sunken)', color: selected ? '#fff' : 'var(--text-subtlest)', border: 'none', borderRadius: 4, padding: '4px 12px', fontSize: 12, fontWeight: 600, cursor: selected ? 'pointer' : 'default', fontFamily: 'inherit' }}>
        Add
      </button>
    </div>
  );
}

export default function ConfigTab({ data, onRefresh }) {
  const cfg = data?.config ?? {};

  const [teams, setTeams] = useState(() => cfg.teams ?? []);
  const [scale, setScale] = useState(() => ({ ...DEFAULT_SCALE, ...(cfg.scale ?? {}) }));
  const [threshold, setThreshold] = useState(() => cfg.threshold ?? 70);
  // admins and editors: [{accountId, displayName, emailAddress}]
  const [admins, setAdmins] = useState([]);
  const [adminsLoaded, setAdminsLoaded] = useState(false);
  const [editors, setEditors] = useState([]);
  const [editorsLoaded, setEditorsLoaded] = useState(false);
  const [boards, setBoards] = useState([]);
  const [boardsLoaded, setBoardsLoaded] = useState(false);
  const [boardsError, setBoardsError] = useState(null);
  const [teamOptions, setTeamOptions] = useState([]);
  const [teamOptionsLoading, setTeamOptionsLoading] = useState(true);
  const [teamOptionsError, setTeamOptionsError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    function resolveOrSet(stored, setter, setLoaded) {
      if (!stored.length) { setLoaded(true); return; }
      if (typeof stored[0] === 'object') { setter(stored); setLoaded(true); return; }
      invoke('resolveUsers', { accountIds: stored })
        .then(users => setter(users ?? []))
        .finally(() => setLoaded(true));
    }
    resolveOrSet(cfg.admins ?? [], setAdmins, setAdminsLoaded);
    resolveOrSet(cfg.editors ?? [], setEditors, setEditorsLoaded);
    invoke('getBoards').then(res => { setBoards(res.boards || []); if (res.error) setBoardsError(res.error); }).finally(() => setBoardsLoaded(true));
    invoke('getJiraTeams').then(res => { setTeamOptions(res?.teams ?? []); if (res?.error) setTeamOptionsError(res.error); }).catch(e => setTeamOptionsError(String(e))).finally(() => setTeamOptionsLoading(false));
  }, []);

  const touch = () => { setDirty(true); setSaved(false); };

  // ── Teams ──────────────────────────────────────────────────────────────
  const addTeam = () => { setTeams(t => [...t, newTeam()]); touch(); };
  const removeTeam = id => { setTeams(t => t.filter(x => x.id !== id)); touch(); };

  const selectJiraTeam = (appTeamId, jiraTeam) => {
    setTeams(t => t.map(x => x.id === appTeamId
      ? { ...x, name: jiraTeam.name, teamJiraId: jiraTeam.id || null }
      : x));
    touch();
  };

  const updateTeam = (id, key, raw) => {
    let val;
    if (key === 'name') val = raw;
    else if (key === 'boardId') {
      // raw is the selected board id string; also store boardName/projectKey for display and links
      const board = boards.find(b => String(b.id) === String(raw));
      setTeams(t => t.map(x => x.id === id ? { ...x, boardId: raw || null, boardName: board ? board.name : '', projectKey: board ? board.projectKey : '' } : x));
      touch();
      return;
    } else val = parseInt(raw, 10) || 0;
    setTeams(t => t.map(x => x.id === id ? { ...x, [key]: val } : x));
    touch();
  };

  // ── Save ───────────────────────────────────────────────────────────────
  const save = async () => {
    setSaving(true);
    try {
      await invoke('saveConfig', {
        ...cfg,
        teams,
        scale,
        threshold: parseInt(threshold, 10) || 70,
        admins,
        editors,
      });
      setSaved(true);
      setDirty(false);
      // Other tabs (Delivery Planning) hold their own snapshot of `teams` from app
      // load and never refetch on tab switch — refresh it now so board mappings
      // (boardId/projectKey) saved here show up there immediately.
      onRefresh?.();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card">
      <h2 className="card-title">Config</h2>
      <p className="card-desc">
        Teams, T-shirt scale, planning defaults, and access control. These settings apply across all releases.
      </p>

      {/* ── TEAMS ── */}
      <div className="section">
        <div className="section-heading">Teams</div>
        <p className="field-hint mb-16">
          Teams are loaded from the Select field configured as <strong>Team Field</strong> in the Jira Config tab. Add your team names as options on that field in Jira, then they will appear here.
        </p>

        <table className="teams-table">
          <thead>
            <tr>
              <th>Team</th>
              <th>Jira board</th>
              <th className="num">Sprint weeks</th>
              <th className="num">Sprint cap (pts)</th>
              <th className="num">Sprints / release</th>
              <th className="num">Release cap</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {teams.length === 0 && (
              <tr className="empty-row">
                <td colSpan={7}>No teams yet — add one below.</td>
              </tr>
            )}
            {teams.map(team => (
              <tr key={team.id}>
                <td>
                  {team.name ? (
                    // Saved team — name is readonly
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{team.name}</span>
                  ) : (
                    // New team — must select from configured Jira field options
                    <TeamSelect
                      options={teamOptions}
                      optionsLoading={teamOptionsLoading}
                      optionsError={teamOptionsError}
                      onSelect={opt => selectJiraTeam(team.id, opt)}
                    />
                  )}
                </td>
                <td>
                  {boardsLoaded ? (
                    boards.length === 0 ? (
                      <span style={{ fontSize: 12, color: 'var(--text-subtlest)' }}>
                        {boardsError ? `Error: ${boardsError}` : 'No boards found'}
                      </span>
                    ) : (
                      <select
                        className="config-input"
                        style={{ minWidth: 180 }}
                        value={team.boardId ?? ''}
                        onChange={e => updateTeam(team.id, 'boardId', e.target.value)}
                      >
                        <option value="">— no board —</option>
                        {boards.map(b => (
                          <option key={b.id} value={b.id}>
                            {b.name}{b.projectKey ? ` (${b.projectKey})` : ''}
                          </option>
                        ))}
                      </select>
                    )
                  ) : (
                    <span style={{ fontSize: 12, color: 'var(--text-subtlest)' }}>Loading…</span>
                  )}
                </td>
                <td className="num">
                  <input
                    className="config-input config-input--num"
                    type="number" min="1" max="8"
                    value={team.sprintWeeks}
                    onChange={e => updateTeam(team.id, 'sprintWeeks', e.target.value)}
                  />
                </td>
                <td className="num">
                  <input
                    className="config-input config-input--num"
                    type="number" min="0"
                    value={team.sprintCap}
                    onChange={e => updateTeam(team.id, 'sprintCap', e.target.value)}
                  />
                </td>
                <td className="num">
                  <input
                    className="config-input config-input--num"
                    type="number" min="1"
                    value={team.sprintsPerRelease}
                    onChange={e => updateTeam(team.id, 'sprintsPerRelease', e.target.value)}
                  />
                </td>
                <td className="num release-cap">
                  {team.sprintCap * team.sprintsPerRelease} pts
                </td>
                <td>
                  <button className="remove-btn" onClick={() => removeTeam(team.id)} title="Remove team">×</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-12">
          <Button appearance="default" onClick={addTeam}>+ Add team</Button>
        </div>
      </div>

      <hr className="divider" />

      {/* ── T-SHIRT SCALE ── */}
      <div className="section">
        <div className="section-heading">T-shirt Scale</div>
        <p className="field-hint mb-16">
          Story point values written to the size field for each T-shirt size.
          These map to capacity calculations across all teams and releases.
        </p>
        <div className="five-col">
          {SIZES.map(size => (
            <div className="field-group" key={size}>
              <label className="field-label">{size}</label>
              <input
                className="config-input config-input--num"
                type="number" min="0"
                value={scale[size] ?? 0}
                onChange={e => { setScale(s => ({ ...s, [size]: parseInt(e.target.value, 10) || 0 })); touch(); }}
              />
            </div>
          ))}
        </div>
      </div>

      <hr className="divider" />

      {/* ── PLANNING DEFAULTS ── */}
      <div className="section">
        <div className="section-heading">Planning Defaults</div>
        <div className="field-group">
          <label className="field-label">Default threshold %</label>
          <input
            className="config-input config-input--num"
            type="number" min="0" max="100"
            value={threshold}
            onChange={e => { setThreshold(e.target.value); touch(); }}
          />
          <p className="field-hint mt-12">
            The waterline bar turns amber when a team's allocation exceeds this percentage of their release capacity.
            Can be overridden per release on the planning board.
          </p>
        </div>
      </div>

      <hr className="divider" />

      {/* ── ACCESS CONTROL ── */}
      <div className="section">
        <div className="section-heading">Access Control</div>

        <div className="field-group">
          <label className="field-label">Admins</label>
          <p className="field-hint mb-12">
            Admins have full control — they can view and change the Config and Jira tabs.
            <strong> Leave empty to allow all users full access</strong> (recommended during initial setup).
          </p>
          {adminsLoaded
            ? <UserPicker value={admins} onChange={v => { setAdmins(v); touch(); }} />
            : <div className="text-subtle">Loading…</div>
          }
        </div>

        <hr className="divider" />

        <div className="field-group">
          <label className="field-label">Editors</label>
          <p className="field-hint mb-12">
            Editors can set team capacity and thresholds on the planning board.
            All other users are read-only. Leave empty to allow all users to edit.
          </p>
          {editorsLoaded
            ? <UserPicker value={editors} onChange={v => { setEditors(v); touch(); }} />
            : <div className="text-subtle">Loading…</div>
          }
        </div>
      </div>

      {/* ── SAVE ── */}
      <div className="action-row">
        <Button appearance="primary" onClick={save} isLoading={saving} isDisabled={!dirty}>
          Save changes
        </Button>
        {saved && <span className="action-status saved">✓ Saved</span>}
        {dirty && !saved && <span className="action-status">Unsaved changes</span>}
      </div>
    </div>
  );
}
