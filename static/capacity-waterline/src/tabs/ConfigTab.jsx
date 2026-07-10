import React, { useState, useEffect } from 'react';
import { invoke } from '@forge/bridge';
import Button from '../components/Button';
import UserPicker from '../components/UserPicker';

const SIZES = ['XS', 'S', 'M', 'L', 'XL'];
const DEFAULT_SCALE = { XS: 1, S: 3, M: 8, L: 13, XL: 21 };

function newTeam() {
  return { id: `team-${Date.now()}`, name: '', sprintWeeks: 2, sprintCap: 20, sprintsPerRelease: 3, boardId: null, boardName: '' };
}

export default function ConfigTab({ data }) {
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
  }, []);

  const touch = () => { setDirty(true); setSaved(false); };

  // ── Teams ──────────────────────────────────────────────────────────────
  const addTeam = () => { setTeams(t => [...t, newTeam()]); touch(); };
  const removeTeam = id => { setTeams(t => t.filter(x => x.id !== id)); touch(); };
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
          Add each delivery team. <strong>Release capacity</strong> = Sprint cap × Sprints per release.
          Teams with no ideas assigned yet should be added here before planning starts.
        </p>

        <table className="teams-table">
          <thead>
            <tr>
              <th>Team name</th>
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
                  <input
                    className="config-input"
                    value={team.name}
                    onChange={e => updateTeam(team.id, 'name', e.target.value)}
                    placeholder="e.g. Apollo"
                  />
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
