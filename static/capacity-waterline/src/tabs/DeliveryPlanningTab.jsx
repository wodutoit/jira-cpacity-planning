import React, { useState, useEffect, useCallback } from 'react';
import { invoke, router } from '@forge/bridge';
import { withSaving } from '../utils/saving';
import IssueKey from '../components/IssueKey';

const SESSION_KEY = 'cpw:lastVersionId';

const SEL_STYLE = {
  appearance: 'none', WebkitAppearance: 'none',
  border: '1px solid var(--border)', borderRadius: 4,
  padding: '7px 30px 7px 12px', fontSize: 14, color: 'var(--text)',
  background: 'var(--surface) url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'10\' height=\'6\'%3E%3Cpath d=\'M0 0l5 6 5-6z\' fill=\'%236B778C\'/%3E%3C/svg%3E") no-repeat right 10px center',
  cursor: 'pointer', fontFamily: 'inherit', minWidth: 190, outline: 'none',
};

function fmtDate(iso) {
  if (!iso) return '';
  try { return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); }
  catch { return iso.slice(5, 10); }
}

function initials(name) {
  return (name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

const SIZES = ['XS', 'S', 'M', 'L', 'XL'];

function riceScore(idea) {
  const { reach, impact, effort, confidence } = idea;
  if (!effort) return null;
  return Math.round((reach * impact * ((confidence ?? 0) / 100)) / effort * 10) / 10;
}

function sizeFromPoints(pts, scale) {
  if (pts == null) return null;
  return SIZES.find(s => scale?.[s] === pts) ?? String(pts);
}

// ── Sprint Lozenge ────────────────────────────────────────────────────────────
function SprintLoz({ state }) {
  const m = state === 'active'
    ? { bg: 'var(--lz-g-bg)', text: 'var(--lz-g-text)', label: 'active' }
    : { bg: 'var(--lz-n-bg)', text: 'var(--lz-n-text)', label: state === 'closed' ? 'completed' : 'future' };
  return (
    <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '.4px', textTransform: 'uppercase', padding: '2px 6px', borderRadius: 3, background: m.bg, color: m.text, flexShrink: 0 }}>
      {m.label}
    </span>
  );
}

// Computes the same defaults as the prototype's onAddSprint: new sprint starts where
// the team's latest dated sprint ends, runs for the team's configured sprint-week length,
// and continues the team's own numbering (e.g. "Sprint 2" → "Sprint 3").
// Jira sprint dates come back as full ISO datetimes, often expressed in UTC even though
// they represent a local calendar date (e.g. "2026-07-28T14:00:00.000Z" IS "2026-07-29"
// in a UTC+10 instance). Slicing the raw string grabs the UTC date and is off by a day —
// parse it as a Date and read the LOCAL calendar date instead.
function dateOnly(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso.slice(0, 10);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function computeNextSprintDefaults(teamSprints, sprintWeeks) {
  const dated = [...teamSprints].filter(sp => sp.endDate).sort((a, b) => a.endDate < b.endDate ? -1 : 1);
  const latest = dated.length ? dated[dated.length - 1] : null;

  let maxNum = 0, prefix = 'Sprint ';
  teamSprints.forEach(sp => {
    const m = /^(.*?)(\d+)\s*$/.exec(sp.name || '');
    if (m) {
      const num = parseInt(m[2], 10);
      if (num > maxNum) { maxNum = num; prefix = m[1]; }
    }
  });
  const name = maxNum > 0 ? `${prefix}${maxNum + 1}` : '';

  const weeks = sprintWeeks || 2;
  const startISO = latest ? dateOnly(latest.endDate) : new Date().toISOString().slice(0, 10);
  const startD = new Date(startISO + 'T00:00');
  const endD = new Date(startD.getTime() + weeks * 7 * 86400000);
  const endISO = endD.getFullYear() + '-' + String(endD.getMonth() + 1).padStart(2, '0') + '-' + String(endD.getDate()).padStart(2, '0');

  return { name, start: startISO, end: endISO };
}

// ── Add / Edit Sprint Dialog ──────────────────────────────────────────────────
// mode: 'add' | 'edit'. In edit mode, initial values come from the existing sprint.
function SprintDialog({ mode, teamName, initial, saving, error, onSave, onCancel }) {
  const [name, setName] = useState(initial.name || '');
  const [goal, setGoal] = useState(initial.goal || '');
  const [start, setStart] = useState(initial.start || '');
  const [end, setEnd] = useState(initial.end || '');
  const canSave = name.trim().length > 0;
  const title = mode === 'edit' ? `Edit sprint — ${teamName}` : `Add sprint — ${teamName}`;

  return (
    <div onClick={onCancel} style={{ position: 'fixed', inset: 0, background: 'rgba(9,30,66,0.42)', zIndex: 110, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--surface)', borderRadius: 8, boxShadow: '0 12px 40px rgba(0,0,0,.3)', width: 460, maxWidth: '100%', padding: 24 }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)' }}>{title}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 16 }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-subtle)' }}>Sprint name</label>
          <input
            autoFocus
            value={name} onChange={e => setName(e.target.value)}
            placeholder="e.g. Sprint 14"
            style={{ border: '1px solid var(--border)', borderRadius: 4, background: 'var(--surface)', color: 'var(--text)', padding: '9px 10px', fontSize: 14, fontFamily: 'inherit', outline: 'none' }}
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 14 }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-subtle)' }}>Sprint goal <span style={{ fontWeight: 400, color: 'var(--text-subtlest)' }}>(optional)</span></label>
          <textarea
            value={goal} onChange={e => setGoal(e.target.value)}
            placeholder="What is this sprint trying to achieve?"
            rows={2}
            style={{ border: '1px solid var(--border)', borderRadius: 4, background: 'var(--surface)', color: 'var(--text)', padding: '9px 10px', fontSize: 14, fontFamily: 'inherit', outline: 'none', resize: 'vertical' }}
          />
        </div>
        <div style={{ display: 'flex', gap: 12, marginTop: 14 }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-subtle)' }}>Start date</label>
            <input type="text" value={start} onChange={e => setStart(e.target.value)} placeholder="YYYY-MM-DD"
              style={{ border: '1px solid var(--border)', borderRadius: 4, background: 'var(--surface)', color: 'var(--text)', padding: '9px 10px', fontSize: 14, fontFamily: 'inherit', outline: 'none' }} />
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-subtle)' }}>End date</label>
            <input type="text" value={end} onChange={e => setEnd(e.target.value)} placeholder="YYYY-MM-DD"
              style={{ border: '1px solid var(--border)', borderRadius: 4, background: 'var(--surface)', color: 'var(--text)', padding: '9px 10px', fontSize: 14, fontFamily: 'inherit', outline: 'none' }} />
          </div>
        </div>
        {error && (
          <div style={{ marginTop: 12, fontSize: 12, color: 'var(--over-text)' }}>{error}</div>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 22 }}>
          <button onClick={onCancel} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 4, padding: '8px 16px', fontSize: 14, fontWeight: 600, color: 'var(--text-subtle)', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
          <button
            disabled={!canSave || saving}
            onClick={() => canSave && onSave({ name: name.trim(), goal, start: start || null, end: end || null })}
            style={{ background: canSave ? 'var(--brand)' : 'var(--surface-sunken)', color: canSave ? '#fff' : 'var(--text-subtlest)', border: canSave ? 'none' : '1px solid var(--border)', borderRadius: 4, padding: '8px 16px', fontSize: 14, fontWeight: 600, cursor: (canSave && !saving) ? 'pointer' : 'default', fontFamily: 'inherit' }}
          >
            {saving ? 'Saving…' : (mode === 'edit' ? 'Save changes' : 'Save sprint')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Delete Sprint Dialog ───────────────────────────────────────────────────────
// state: 'confirm' | 'deleting' | 'nonEmpty'
function DeleteSprintDialog({ teamName, sprintName, state, count, error, boardHref, onConfirm, onCancel }) {
  const btnBase = { border: 'none', borderRadius: 4, padding: '8px 16px', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' };
  const cancelStyle = { ...btnBase, background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-subtle)' };

  return (
    <div onClick={onCancel} style={{ position: 'fixed', inset: 0, background: 'rgba(9,30,66,0.42)', zIndex: 110, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--surface)', borderRadius: 8, boxShadow: '0 12px 40px rgba(0,0,0,.3)', width: 440, maxWidth: '100%', padding: 24 }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)' }}>Delete sprint — {teamName}</div>

        {state === 'nonEmpty' ? (
          <>
            <div style={{ marginTop: 16, fontSize: 14, color: 'var(--text)', lineHeight: 1.5 }}>
              <strong>{sprintName}</strong> still has <strong>{count}</strong> issue{count === 1 ? '' : 's'} in it.
              To avoid silently moving work around, manage those issues directly in Jira before deleting this sprint.
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 22 }}>
              <button onClick={onCancel} style={cancelStyle}>Close</button>
              {boardHref && (
                <button onClick={() => router.open(boardHref)} style={{ ...btnBase, background: 'var(--brand)', color: '#fff' }}>Open board in Jira</button>
              )}
            </div>
          </>
        ) : (
          <>
            <div style={{ marginTop: 16, fontSize: 14, color: 'var(--text)', lineHeight: 1.5 }}>
              Delete <strong>{sprintName}</strong>? This permanently deletes the sprint in Jira and can't be undone.
            </div>
            {error && <div style={{ marginTop: 12, fontSize: 12, color: 'var(--over-text)' }}>{error}</div>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 22 }}>
              <button onClick={onCancel} disabled={state === 'deleting'} style={cancelStyle}>Cancel</button>
              <button
                onClick={onConfirm}
                disabled={state === 'deleting'}
                style={{ ...btnBase, background: 'var(--over)', color: '#fff', cursor: state === 'deleting' ? 'default' : 'pointer' }}
              >
                {state === 'deleting' ? 'Deleting…' : 'Delete sprint'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Sprint Selection Card ─────────────────────────────────────────────────────
function SprintSelectionCard({ teams, sprintsByTeam, selection, overrides, missingByTeam, collapsed, boardError, onToggleSprint, onToggleSection, onAddSprint, onEditSprint, onDeleteSprint, onCapChange, onRemoveMissing, onRecreateMissing }) {
  const stateOrder = { active: 0, future: 1, closed: 2 };

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
      <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Sprint selection</div>
        <div style={{ fontSize: 12, color: 'var(--text-subtlest)', marginTop: 2 }}>Pick upcoming sprints from each team's board. Each checked sprint feeds the waterline — set its capacity below, inherited from the team's base.</div>
      </div>

      {boardError === 'no_config' && (
        <div style={{ padding: '12px 16px', fontSize: 13, color: 'var(--filling-text)', background: 'var(--filling-bg)', borderBottom: '1px solid var(--filling-border)' }}>
          No Jira project configured. Set it up in the <strong>Jira Config</strong> tab first.
        </div>
      )}
      {boardError === 'no_team_board' && (
        <div style={{ padding: '12px 16px', fontSize: 13, color: 'var(--text-subtle)', background: 'var(--info-bg)', borderBottom: '1px solid var(--info-border)' }}>
          ⓘ No teams have a Jira board mapped. Go to <strong>Config → Teams</strong> and assign a Scrum board to each team.
        </div>
      )}

      {teams.map(t => {
        const teamSprints = [...(sprintsByTeam[t.id] || [])].sort((a, b) => {
          const so = (stateOrder[a.state] ?? 2) - (stateOrder[b.state] ?? 2);
          if (so !== 0) return so;
          if (a.startDate && b.startDate) return a.startDate.localeCompare(b.startDate);
          return (a.name || '').localeCompare(b.name || '');
        });
        const selIds = new Set(selection[t.id] || []);
        const selCount = selIds.size;
        const isCollapsed = !!collapsed[t.id];

        return (
          <div key={t.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
            {/* Team section header */}
            <button
              onClick={() => onToggleSection(t.id)}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '11px 16px', background: 'var(--surface-sunken)', border: 'none', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}
            >
              <span style={{ color: 'var(--text-subtlest)', fontSize: 11 }}>{isCollapsed ? '▸' : '▾'}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{t.name}</span>
              {t.boardName && <span style={{ fontSize: 11, color: 'var(--text-subtlest)' }}>board: {t.boardName}</span>}
              <div style={{ flex: 1 }} />
              <span style={{ fontSize: 11, color: selCount ? 'var(--brand)' : 'var(--text-subtle)', fontWeight: 600 }}>
                {selCount} selected
              </span>
            </button>

            {!isCollapsed && (
              <div style={{ padding: '6px 12px 10px' }}>
                {(missingByTeam[t.id] || []).map(sid => (
                  <div key={sid} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 6, background: 'var(--filling-bg)', border: '1px solid var(--filling-border)', marginBottom: 4 }}>
                    <span style={{ fontSize: 13 }}>⚠</span>
                    <span style={{ flex: 1, fontSize: 12, color: 'var(--filling-text)' }}>A previously selected sprint no longer exists in Jira.</span>
                    <button onClick={() => onRecreateMissing(t.id, sid)} style={{ background: 'transparent', border: 'none', color: 'var(--brand)', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>↺ Recreate</button>
                    <button onClick={() => onRemoveMissing(t.id, sid)} style={{ background: 'transparent', border: 'none', color: 'var(--text-subtle)', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>✕ Remove from plan</button>
                  </div>
                ))}
                {!t.boardId ? (
                  <div style={{ padding: '10px 4px', fontSize: 12, color: 'var(--text-subtlest)' }}>
                    No board mapped — assign one in Config → Teams.
                  </div>
                ) : teamSprints.length === 0 ? (
                  <div style={{ padding: '10px 4px', fontSize: 12, color: 'var(--text-subtlest)' }}>
                    No sprints found on this board.
                  </div>
                ) : (
                  teamSprints.map(sp => {
                    const checked = selIds.has(sp.id);
                    const dateRange = sp.startDate && sp.endDate
                      ? fmtDate(sp.startDate) + ' – ' + fmtDate(sp.endDate) : '';
                    const overrideKey = `${t.id}:${sp.id}`;
                    const basePts = t.sprintCap ?? 0;
                    const ov = overrides[overrideKey] || {};
                    return (
                      <div key={sp.id} style={{ borderRadius: 6, padding: '8px 12px', background: checked ? 'var(--surface-sunken)' : 'transparent' }}>
                        <div
                          onClick={() => onToggleSprint(t.id, sp.id)}
                          style={{ display: 'flex', alignItems: 'center', gap: 11, cursor: 'pointer' }}
                        >
                          {/* Checkbox */}
                          <div style={checked
                            ? { width: 17, height: 17, borderRadius: 4, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'var(--brand)', color: '#fff', fontSize: 11, fontWeight: 800, border: '1px solid var(--brand)' }
                            : { width: 17, height: 17, borderRadius: 4, flexShrink: 0, background: 'var(--surface)', border: '1.5px solid var(--border)' }
                          }>{checked ? '✓' : ''}</div>
                          {/* Name + dates */}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{sp.name}</div>
                            {dateRange && <div style={{ fontSize: 11, color: 'var(--text-subtlest)' }}>{dateRange}</div>}
                          </div>
                          <SprintLoz state={sp.state ?? 'future'} />
                          <button
                            onClick={e => { e.stopPropagation(); onEditSprint(t.id, sp); }}
                            title="Edit sprint"
                            style={{ border: 'none', background: 'transparent', color: 'var(--text-subtlest)', cursor: 'pointer', fontSize: 13, lineHeight: 1, padding: '3px 4px', fontFamily: 'inherit', flexShrink: 0 }}
                          >
                            ✎
                          </button>
                          <button
                            onClick={e => { e.stopPropagation(); onDeleteSprint(t.id, sp); }}
                            title="Delete sprint"
                            style={{ border: 'none', background: 'transparent', color: 'var(--text-subtlest)', cursor: 'pointer', fontSize: 13, lineHeight: 1, padding: '3px 4px', fontFamily: 'inherit', flexShrink: 0 }}
                          >
                            🗑
                          </button>
                        </div>
                        {checked && (
                          <div style={{ marginLeft: 28, marginTop: 6 }}>
                            <InlineCapacityEditor overrideKey={overrideKey} basePts={basePts} ov={ov} onCapChange={onCapChange} />
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
                <button
                  onClick={() => t.boardId && onAddSprint(t.id)}
                  disabled={!t.boardId}
                  title={t.boardId ? undefined : 'Map a Jira board to this team in Config → Teams first'}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', padding: '8px 12px', marginTop: 2, background: 'transparent', border: '1px dashed var(--border)', borderRadius: 6, color: t.boardId ? 'var(--brand)' : 'var(--text-subtlest)', fontSize: 12, fontWeight: 600, cursor: t.boardId ? 'pointer' : 'not-allowed', fontFamily: 'inherit' }}
                >
                  ＋ Add sprint
                </button>
              </div>
            )}
          </div>
        );
      })}

      {/* Legend */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', background: 'var(--surface-sunken)', color: 'var(--text-subtlest)', fontSize: 11 }}>
        <span style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--ok)', opacity: .7, flexShrink: 0 }} />
        Active &amp; future sprints · completed sprints shown when part of this release
      </div>
    </div>
  );
}

// ── Release Coverage Card ────────────────────────────────────────────────────
function ReleaseCoverageCard({ coverage }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '14px 16px 6px' }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 2 }}>
        Release coverage{' '}
        <span style={{ fontWeight: 500, color: 'var(--text-subtlest)', fontSize: 12 }}>— have we linked enough sprints for the planned capacity?</span>
      </div>
      {/* Table headers */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0 6px', borderBottom: '1px solid var(--border)', fontSize: 10, fontWeight: 700, letterSpacing: '.4px', textTransform: 'uppercase', color: 'var(--text-subtlest)' }}>
        <div style={{ width: 110 }}>Team</div>
        <div style={{ flex: 1 }}>Available vs planned</div>
        <div style={{ width: 78, textAlign: 'right' }}>Sprints</div>
        <div style={{ width: 104, textAlign: 'right' }}>Capacity</div>
        <div style={{ width: 96, textAlign: 'right' }}>Status</div>
      </div>
      {coverage.map(row => (
        <div key={row.team.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border-subtle)' }}>
          <div style={{ width: 110, display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <span style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--brand)', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, flexShrink: 0 }}>
              {initials(row.team.name)}
            </span>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.team.name}</span>
          </div>
          {/* Progress bar */}
          <div style={{ flex: 1, height: 8, borderRadius: 999, background: 'var(--surface-sunken)', overflow: 'hidden' }}>
            <div style={{ width: row.pct + '%', height: '100%', background: row.covered ? 'var(--ok)' : 'var(--filling)', borderRadius: 999, transition: 'width .2s ease' }} />
          </div>
          <div style={{ width: 78, textAlign: 'right', fontSize: 13, fontWeight: 700, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>
            {row.addedSprints} / {row.plannedSprints}
          </div>
          <div style={{ width: 104, textAlign: 'right', fontSize: 13, color: 'var(--text-subtle)', fontVariantNumeric: 'tabular-nums' }}>
            {row.capLabel} pts
          </div>
          <div style={{ width: 96, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
            <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.3px', textTransform: 'uppercase', padding: '3px 9px', borderRadius: 20, background: row.chip.bg, color: row.chip.text, border: '1px solid ' + row.chip.border, whiteSpace: 'nowrap' }}>
              {row.chip.label}
            </span>
            {row.sprintShort > 0 && (
              <span style={{ fontSize: 10, color: 'var(--filling-text)', whiteSpace: 'nowrap' }}>
                link {row.sprintShort} more sprint{row.sprintShort > 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Base Capacity Card ────────────────────────────────────────────────────────
function BaseCapacityCard({ teams, onBaseCap }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '14px 16px' }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 12 }}>
        Base capacity{' '}
        <span style={{ fontWeight: 500, color: 'var(--text-subtlest)', fontSize: 12 }}>— story points per sprint, from team config (edits sync back)</span>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14 }}>
        {teams.map(t => (
          <div key={t.id} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-subtle)' }}>{t.name}</label>
            <input
              type="number" min="0"
              defaultValue={t.sprintCap ?? 0}
              onBlur={e => onBaseCap(t.id, Number(e.target.value) || 0)}
              style={{ width: 84, border: '1px solid var(--border)', borderRadius: 4, background: 'var(--surface)', color: 'var(--text)', padding: 8, fontSize: 14, textAlign: 'center', fontFamily: 'inherit', outline: 'none', fontVariantNumeric: 'tabular-nums' }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Inline per-sprint capacity editor (lives inside a Sprint Selection row) ────
// Populated from the team's base capacity; edits create a per-sprint override.
function InlineCapacityEditor({ overrideKey, basePts, ov, onCapChange }) {
  const hasOv = ov.pts != null && ov.pts !== basePts;
  const [localPts, setLocalPts] = useState(ov.pts != null ? ov.pts : basePts);
  const [localNote, setLocalNote] = useState(ov.note || '');

  useEffect(() => {
    setLocalPts(ov.pts != null ? ov.pts : basePts);
    setLocalNote(ov.note || '');
  }, [ov.pts, ov.note, basePts]);

  const commit = (pts, note) => onCapChange(overrideKey, pts, note);
  const reset = () => { setLocalPts(basePts); setLocalNote(''); commit(null, ''); };

  return (
    <div onClick={e => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-subtlest)' }}>Capacity</span>
      <input
        type="number" min={0}
        value={localPts}
        onChange={e => setLocalPts(e.target.value === '' ? '' : Number(e.target.value))}
        onBlur={() => {
          const v = localPts === '' ? null : Number(localPts);
          commit(v !== basePts ? v : null, localNote);
        }}
        style={{ width: 58, textAlign: 'center', border: '1px solid ' + (hasOv ? 'var(--brand)' : 'var(--border)'), borderRadius: 4, background: 'var(--surface)', color: hasOv ? 'var(--text)' : 'var(--text-subtle)', fontWeight: hasOv ? 800 : 500, padding: '4px 6px', fontSize: 12, fontFamily: 'inherit', outline: 'none', fontVariantNumeric: 'tabular-nums' }}
      />
      <span style={{ fontSize: 11, color: 'var(--text-subtlest)' }}>pts</span>
      {hasOv && (
        <>
          <input
            type="text"
            placeholder="reason (e.g. leave)"
            value={localNote}
            onChange={e => setLocalNote(e.target.value)}
            onBlur={() => commit(localPts === '' ? null : Number(localPts), localNote)}
            style={{ flex: '1 1 140px', minWidth: 100, border: '1px solid var(--border)', borderRadius: 4, background: 'var(--surface)', color: 'var(--text)', padding: '4px 6px', fontSize: 11, fontFamily: 'inherit', outline: 'none' }}
          />
          <button
            onClick={reset}
            style={{ background: 'transparent', border: 'none', color: 'var(--brand)', cursor: 'pointer', fontSize: 11, fontWeight: 600, fontFamily: 'inherit', padding: 2, whiteSpace: 'nowrap' }}
          >
            ↺ reset to base
          </button>
        </>
      )}
    </div>
  );
}

// ── RICE popover (mirrors IdeaTable's, kept local since that one isn't exported) ─
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
              style={{ width: 60, border: '1px solid var(--border)', borderRadius: 4, padding: '4px 6px', fontSize: 13, textAlign: 'right', fontFamily: 'ui-monospace,monospace', color: 'var(--text)', background: 'var(--surface)', outline: 'none' }} />
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

// ── Convert (create Epic/Story) dialog ────────────────────────────────────────
function ConvertDialog({ idea, team, scale, teamSprints, getCap, issueType, saving, error, onCreate, onCancel }) {
  const [name, setName] = useState(idea.title || '');
  const [desc, setDesc] = useState('');
  const [sprintIds, setSprintIds] = useState([]);
  const [size, setSize] = useState(() => {
    const s = sizeFromPoints(idea.size, scale);
    return SIZES.includes(s) ? s : 'M';
  });
  const points = scale?.[size] ?? 0;
  const canCreate = name.trim().length > 0 && sprintIds.length > 0 && !!team?.boardId;

  const toggleSprint = (id) => setSprintIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const selectedSorted = [...sprintIds];
  const per = selectedSorted.length ? Math.floor(points / selectedSorted.length) : 0;

  return (
    <div onClick={onCancel} style={{ position: 'fixed', inset: 0, background: 'rgba(9,30,66,0.42)', zIndex: 110, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--surface)', borderRadius: 8, boxShadow: '0 12px 40px rgba(0,0,0,.3)', width: 520, maxWidth: '100%', padding: 24 }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)' }}>Create {issueType}</div>
        <div style={{ fontSize: 12, color: 'var(--text-subtlest)', marginTop: 4 }}>{team?.name} · links back to the idea and the release version</div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px', gap: 12, marginTop: 18, alignItems: 'end' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-subtle)' }}>Size</label>
            <select value={size} onChange={e => setSize(e.target.value)}
              style={{ appearance: 'none', WebkitAppearance: 'none', border: '1px solid var(--border)', borderRadius: 4, padding: '8px 24px 8px 10px', fontSize: 13, fontFamily: 'inherit', background: 'var(--surface) url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'10\' height=\'6\'%3E%3Cpath d=\'M0 0l5 6 5-6z\' fill=\'%236B778C\'/%3E%3C/svg%3E") no-repeat right 8px center', cursor: 'pointer', color: 'var(--text)', outline: 'none' }}>
              {SIZES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-subtle)' }}>Points</label>
            <div style={{ padding: '9px 4px', fontSize: 14, fontWeight: 700, color: 'var(--text)', textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{points}</div>
          </div>
        </div>

        {!team?.boardId && (
          <div style={{ marginTop: 14, fontSize: 12, color: 'var(--over-text)', background: 'var(--over-bg)', border: '1px solid var(--border)', borderRadius: 6, padding: '10px 12px' }}>
            This team has no Jira board linked. Set one on the Config page before converting.
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 16 }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-subtle)' }}>
            Add to sprints <span style={{ fontWeight: 500, color: 'var(--text-subtlest)' }}>— allocates points to the waterline</span>
          </label>
          {teamSprints.length > 0 ? (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {teamSprints.map(sp => {
                  const checked = sprintIds.includes(sp.id);
                  const cap = getCap(sp.id);
                  return (
                    <div key={sp.id} onClick={() => toggleSprint(sp.id)}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 6, cursor: 'pointer', border: '1px solid ' + (checked ? 'var(--brand)' : 'var(--border)'), background: checked ? 'var(--surface-sunken)' : 'var(--surface)' }}>
                      <span style={checked
                        ? { width: 17, height: 17, borderRadius: 4, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'var(--brand)', color: '#fff', fontSize: 11, fontWeight: 800, border: '1px solid var(--brand)' }
                        : { width: 17, height: 17, borderRadius: 4, flexShrink: 0, background: 'var(--surface)', border: '1.5px solid var(--border)' }
                      }>{checked ? '✓' : ''}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{sp.name}</div>
                        <div style={{ fontSize: 10, color: 'var(--text-subtlest)' }}>{fmtDate(sp.startDate)} – {fmtDate(sp.endDate)}</div>
                      </div>
                      <span style={{ fontSize: 11, color: 'var(--text-subtle)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>cap {cap}</span>
                    </div>
                  );
                })}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-subtlest)', marginTop: 2 }}>
                {sprintIds.length
                  ? `${points} pts across ${sprintIds.length} sprint${sprintIds.length === 1 ? '' : 's'} (~${per} each)`
                  : 'Select at least one sprint to allocate this work to the waterline.'}
              </div>
            </>
          ) : (
            <div style={{ fontSize: 12, color: 'var(--text-subtle)', background: 'var(--surface-sunken)', border: '1px solid var(--border)', borderRadius: 6, padding: '10px 12px' }}>
              No sprints selected for this team. Pick sprints in Sprints &amp; Capacity to allocate this work.
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 16 }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-subtle)' }}>{issueType} name</label>
          <input value={name} onChange={e => setName(e.target.value)}
            style={{ border: '1px solid var(--border)', borderRadius: 4, background: 'var(--surface)', color: 'var(--text)', padding: '9px 10px', fontSize: 14, fontFamily: 'inherit', outline: 'none' }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 14 }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-subtle)' }}>Description</label>
          <textarea value={desc} onChange={e => setDesc(e.target.value)} placeholder="What is this work and why? (optional)"
            style={{ border: '1px solid var(--border)', borderRadius: 4, background: 'var(--surface)', color: 'var(--text)', padding: '9px 10px', fontSize: 14, fontFamily: 'inherit', outline: 'none', minHeight: 96, resize: 'vertical', lineHeight: 1.45 }} />
        </div>
        {error && <div style={{ marginTop: 12, fontSize: 12, color: 'var(--over-text)' }}>{error}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 22 }}>
          <button onClick={onCancel} disabled={saving} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 4, padding: '8px 16px', fontSize: 14, fontWeight: 600, color: 'var(--text-subtle)', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
          <button
            disabled={!canCreate || saving}
            onClick={() => canCreate && onCreate({ name: name.trim(), description: desc, sprintIds, points, size })}
            style={{ background: (canCreate && !saving) ? 'var(--brand)' : 'var(--surface-sunken)', color: (canCreate && !saving) ? '#fff' : 'var(--text-subtlest)', border: (canCreate && !saving) ? 'none' : '1px solid var(--border)', borderRadius: 4, padding: '8px 16px', fontSize: 14, fontWeight: 600, cursor: (canCreate && !saving) ? 'pointer' : 'default', fontFamily: 'inherit' }}
          >
            {saving ? 'Creating…' : `Create ${issueType}`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Undo-link confirmation dialog ─────────────────────────────────────────────
function UndoDialog({ idea, issueKey, saving, onConfirm, onCancel }) {
  return (
    <div onClick={onCancel} style={{ position: 'fixed', inset: 0, background: 'rgba(9,30,66,0.42)', zIndex: 110, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--surface)', borderRadius: 8, boxShadow: '0 12px 40px rgba(0,0,0,.3)', width: 460, maxWidth: '100%', padding: 24 }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)' }}>Undo link for "{idea.title}"?</div>
        <div style={{ fontSize: 14, color: 'var(--text-subtle)', lineHeight: 1.5, marginTop: 10 }}>
          This unlinks issue <strong style={{ fontFamily: 'ui-monospace,monospace' }}>{issueKey}</strong> from the idea and marks it not converted. The Jira issue itself is not deleted.
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 22 }}>
          <button onClick={onCancel} disabled={saving} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 4, padding: '8px 16px', fontSize: 14, fontWeight: 600, color: 'var(--text-subtle)', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
          <button onClick={onConfirm} disabled={saving} style={{ background: 'var(--over)', color: '#fff', border: 'none', borderRadius: 4, padding: '8px 16px', fontSize: 14, fontWeight: 600, cursor: saving ? 'default' : 'pointer', fontFamily: 'inherit' }}>
            {saving ? 'Undoing…' : 'Undo link'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Convert Ideas stage ────────────────────────────────────────────────────────
function ConvertIdeasStage({
  ideas, teams, versionId, scale, siteUrl, sprintsByTeam, selection, overrides,
  conversion, epicProjectByIdea, loading,
  onTeamChange, onRiceChange, onSizeChange, onReorder, onConvertDone, onUndoDone,
}) {
  const [collapsed, setCollapsed] = useState({});
  const [pendingType, setPendingType] = useState({});
  const [ricePopoverFor, setRicePopoverFor] = useState(null);
  const [convertDialogIdea, setConvertDialogIdea] = useState(null);
  const [convertSaving, setConvertSaving] = useState(false);
  const [convertError, setConvertError] = useState(null);
  const [undoDialogIdea, setUndoDialogIdea] = useState(null);
  const [undoSaving, setUndoSaving] = useState(false);
  const [dragKey, setDragKey] = useState(null);
  const [dragOverKey, setDragOverKey] = useState(null);

  const teamById = Object.fromEntries(teams.map(t => [t.id, t]));

  const convIdeas = ideas.filter(i => i.release === versionId && i.team);
  const convTotal = convIdeas.length;
  const convDoneCount = convIdeas.filter(i => conversion[i.key]?.status === 'converted').length;
  const convEmpty = convTotal === 0;

  const byTeam = {};
  convIdeas.forEach(i => { (byTeam[i.team] = byTeam[i.team] || []).push(i); });
  const groups = teams.filter(t => byTeam[t.id]?.length).map(t => ({ team: t, ideas: byTeam[t.id] }));

  const getCapFor = (teamId, sprintId) => {
    const ov = overrides[`${teamId}:${sprintId}`];
    if (ov?.pts != null) return ov.pts;
    return teamById[teamId]?.sprintCap ?? 0;
  };

  const dialogIdea = convertDialogIdea ? convIdeas.find(i => i.key === convertDialogIdea) : null;
  const dialogTeam = dialogIdea ? teamById[dialogIdea.team] : null;
  const dialogTeamSprints = dialogTeam
    ? (sprintsByTeam[dialogTeam.id] || []).filter(sp => (selection[dialogTeam.id] || []).includes(sp.id))
      .sort((a, b) => (a.startDate || '').localeCompare(b.startDate || ''))
    : [];

  const undoIdea = undoDialogIdea ? convIdeas.find(i => i.key === undoDialogIdea) : null;
  const undoRecord = undoDialogIdea ? conversion[undoDialogIdea] : null;

  const handleCreate = async ({ name, description, sprintIds, points, size }) => {
    const idea = dialogIdea; const team = dialogTeam;
    if (!idea) return;
    if (!team?.boardId) { setConvertError('This team has no Jira board linked. Set one on the Config page.'); return; }
    const issueType = pendingType[idea.key] || 'Epic';
    setConvertSaving(true); setConvertError(null);
    try {
      const res = await withSaving(() => invoke('convertIdea', {
        ideaKey: idea.key, boardId: team.boardId, issueType, name, description, sprintIds, points,
      }));
      if (!res.ok) { setConvertError(res.error || 'Failed to convert'); return; }
      if (points !== idea.size) {
        invoke('updateIdeaSize', { issueKey: idea.key, points }).catch(() => {});
        onSizeChange(idea.key, points);
      }
      onConvertDone(idea.key, {
        status: 'converted', epicKey: res.epicKey, storyKeys: res.storyKeys, sprintIds,
        project: res.project || team.projectKey, type: issueType, name, desc: description, pts: points,
      });
      setConvertDialogIdea(null);
    } catch (e) {
      setConvertError(String(e.message || e));
    } finally {
      setConvertSaving(false);
    }
  };

  const handleUndo = async () => {
    if (!undoDialogIdea) return;
    setUndoSaving(true);
    try {
      await withSaving(() => invoke('undoConvert', { ideaKey: undoDialogIdea }));
      onUndoDone(undoDialogIdea);
      setUndoDialogIdea(null);
    } finally {
      setUndoSaving(false);
    }
  };

  const ricePopoverIdea = ricePopoverFor ? convIdeas.find(i => i.key === ricePopoverFor) : null;

  return (
    <>
      {ricePopoverIdea && (
        <RicePopover idea={ricePopoverIdea} onClose={() => setRicePopoverFor(null)}
          onSave={vals => { onRiceChange(ricePopoverIdea.key, vals); setRicePopoverFor(null); }} />
      )}
      {dialogIdea && (
        <ConvertDialog
          idea={dialogIdea} team={dialogTeam} scale={scale} teamSprints={dialogTeamSprints}
          getCap={sprintId => getCapFor(dialogTeam.id, sprintId)}
          issueType={pendingType[dialogIdea.key] || 'Epic'}
          saving={convertSaving} error={convertError}
          onCreate={handleCreate}
          onCancel={() => { setConvertDialogIdea(null); setConvertError(null); }}
        />
      )}
      {undoIdea && (
        <UndoDialog idea={undoIdea} issueKey={undoRecord?.epicKey || undoRecord?.storyKeys?.[0] || ''}
          saving={undoSaving} onConfirm={handleUndo} onCancel={() => setUndoDialogIdea(null)} />
      )}

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Convert ideas to stories</div>
            <div style={{ fontSize: 12, color: 'var(--text-subtlest)', marginTop: 2 }}>
              {convDoneCount} of {convTotal} converted · links each new issue back to its idea and the release version
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', background: 'var(--surface-sunken)', borderBottom: '1px solid var(--border)', fontSize: 11, fontWeight: 700, letterSpacing: '.4px', textTransform: 'uppercase', color: 'var(--text-subtlest)' }}>
          <div style={{ width: 52 }}>Rank</div>
          <div style={{ flex: 1 }}>Title</div>
          <div style={{ width: 56 }}>RICE</div>
          <div style={{ width: 64 }}>Size</div>
          <div style={{ width: 170 }}>Team</div>
          <div style={{ width: 100 }}>Type</div>
          <div style={{ width: 170 }}>Status</div>
        </div>

        {loading ? (
          <div style={{ padding: '50px 20px', textAlign: 'center', color: 'var(--text-subtlest)', fontSize: 14 }}>Loading…</div>
        ) : convEmpty ? (
          <div style={{ padding: '50px 20px', textAlign: 'center', color: 'var(--text-subtlest)', fontSize: 14 }}>
            No ideas assigned to this release. Add ideas to this version in Release Planning to convert them here.
          </div>
        ) : (
          groups.map(grp => {
            const isCollapsed = !!collapsed[grp.team.id];
            return (
              <div key={grp.team.id}>
                <div
                  onClick={() => setCollapsed(c => ({ ...c, [grp.team.id]: !c[grp.team.id] }))}
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => {
                    e.preventDefault();
                    if (dragKey) {
                      const dragged = convIdeas.find(i => i.key === dragKey);
                      if (dragged && conversion[dragKey]?.status !== 'converted' && dragged.team !== grp.team.id) {
                        onTeamChange(dragKey, grp.team.id);
                      }
                    }
                    setDragKey(null); setDragOverKey(null);
                  }}
                  title="Click to expand/collapse · drop here to move to the bottom of this team"
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 16px', background: 'var(--surface-sunken)', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                >
                  <span style={{ color: 'var(--text-subtlest)', fontSize: 11, width: 10, flexShrink: 0 }}>{isCollapsed ? '▸' : '▾'}</span>
                  <span style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--brand)', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, flexShrink: 0 }}>{initials(grp.team.name)}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.4px', textTransform: 'uppercase', color: 'var(--text-subtle)' }}>{grp.team.name}</span>
                  <div style={{ flex: 1 }} />
                  <span style={{ fontSize: 11, color: 'var(--text-subtlest)', fontVariantNumeric: 'tabular-nums' }}>
                    {grp.ideas.length} idea{grp.ideas.length !== 1 ? 's' : ''} · {grp.ideas.filter(i => conversion[i.key]?.status === 'converted').length} converted · {grp.ideas.reduce((a, i) => a + (i.size ?? 0), 0)} pts
                  </span>
                </div>

                {!isCollapsed && grp.ideas.map((idea, idx) => {
                  const rec = conversion[idea.key];
                  const converted = rec?.status === 'converted';
                  const score = riceScore(idea);
                  const mismatchProject = converted ? epicProjectByIdea[idea.key] : null;
                  const mismatch = !!(mismatchProject && mismatchProject !== teamById[idea.team]?.projectKey);
                  const mismatchTeam = mismatch ? teams.find(t => t.projectKey === mismatchProject) : null;
                  const type = pendingType[idea.key] || 'Epic';
                  const isDragging = dragKey === idea.key;
                  const isDragOver = dragOverKey === idea.key;

                  return (
                    <div
                      key={idea.key}
                      draggable={!converted}
                      onDragStart={() => setDragKey(idea.key)}
                      onDragOver={e => { e.preventDefault(); setDragOverKey(idea.key); }}
                      onDragLeave={() => setDragOverKey(null)}
                      onDrop={e => {
                        e.preventDefault();
                        if (dragKey && dragKey !== idea.key) onReorder(dragKey, idea.key);
                        setDragKey(null); setDragOverKey(null);
                      }}
                      onDragEnd={() => { setDragKey(null); setDragOverKey(null); }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 12, padding: '9px 16px',
                        borderBottom: '1px solid var(--border-subtle)', opacity: isDragging ? 0.4 : 1,
                        borderTop: isDragOver ? '2px solid var(--brand)' : undefined,
                        background: mismatch ? 'rgba(124,92,246,0.14)' : (converted ? 'var(--ok-bg)' : 'var(--surface)'),
                      }}
                    >
                      <div style={{ width: 52, display: 'flex', alignItems: 'center', gap: 8 }}>
                        {!converted && <span style={{ cursor: 'grab', color: 'var(--text-subtlest)', fontSize: 15, lineHeight: 1 }} title="Drag to reorder or across teams">⠿</span>}
                        {converted && <span style={{ color: 'var(--text-subtlest)', fontSize: 12, lineHeight: 1 }} title="Converted — reorder within team only; can't move to another team">🔒</span>}
                        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-subtle)', fontVariantNumeric: 'tabular-nums' }}>{idx + 1}</span>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          <IssueKey issueKey={idea.key} siteUrl={siteUrl} /> {idea.title}
                        </div>
                        {mismatch && <div style={{ fontSize: 11, fontWeight: 600, color: '#6D4BD8' }}>⚠ Epic moved to {mismatchProject} in Jira</div>}
                      </div>
                      <div style={{ width: 56 }}>
                        <button onClick={() => setRicePopoverFor(idea.key)}
                          style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '100%', padding: '3px 6px', borderRadius: 5, background: score > 0 ? 'var(--ok-bg)' : 'var(--lz-n-bg)', color: score > 0 ? 'var(--ok-text)' : 'var(--lz-n-text)', fontSize: 12, fontWeight: 800, fontVariantNumeric: 'tabular-nums', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
                          {score > 0 ? score : '—'}
                        </button>
                      </div>
                      <div style={{ width: 64, display: 'flex', flexDirection: 'column', gap: 1 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', fontFamily: 'ui-monospace,monospace' }}>{sizeFromPoints(idea.size, scale) ?? '—'}</span>
                        <span style={{ fontSize: 10, color: 'var(--text-subtlest)' }}>{idea.size ?? 0} pts</span>
                      </div>
                      <div style={{ width: 170 }}>
                        {!converted ? (
                          <>
                            <select value={idea.team} style={SEL_STYLE_SM}
                              onChange={e => onTeamChange(idea.key, e.target.value)}>
                              {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                            </select>
                            <div style={{ fontSize: 10, color: 'var(--text-subtlest)', marginTop: 3, fontFamily: 'ui-monospace,monospace' }}>
                              {teamById[idea.team]?.boardId
                                ? (teamById[idea.team]?.projectKey || teamById[idea.team]?.boardName || 'board linked')
                                : 'no board linked'}
                            </div>
                          </>
                        ) : (
                          <>
                            <span style={{ fontSize: 13, color: 'var(--text-subtle)' }}>{teamById[idea.team]?.name}</span>
                            <div style={{ fontSize: 10, color: 'var(--text-subtlest)', marginTop: 3, fontFamily: 'ui-monospace,monospace' }}>{rec.project}</div>
                          </>
                        )}
                      </div>
                      <div style={{ width: 100 }}>
                        {!converted ? (
                          <select value={type} style={SEL_STYLE_SM} onChange={e => setPendingType(p => ({ ...p, [idea.key]: e.target.value }))}>
                            <option value="Epic">Epic</option>
                            <option value="Story">Story</option>
                          </select>
                        ) : (
                          <span style={{ fontSize: 13, color: 'var(--text-subtle)' }}>{rec.type}</span>
                        )}
                      </div>
                      <div style={{ width: 170 }}>
                        {!converted ? (
                          <button onClick={() => setConvertDialogIdea(idea.key)}
                            style={{ background: 'var(--brand)', color: '#fff', border: 'none', borderRadius: 4, padding: '6px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                            Convert
                          </button>
                        ) : (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <IssueKey issueKey={rec.epicKey || rec.storyKeys?.[0]} siteUrl={siteUrl} style={{ fontWeight: 600 }} />
                            {mismatch && mismatchTeam && (
                              <button onClick={() => onTeamChange(idea.key, mismatchTeam.id)} title="Move idea to match the epic's team"
                                style={{ background: '#7C5CEF', color: '#fff', border: 'none', borderRadius: 4, padding: '5px 10px', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
                                Move to {mismatchTeam.name}
                              </button>
                            )}
                            <button onClick={() => setUndoDialogIdea(idea.key)}
                              style={{ background: 'transparent', border: 'none', color: 'var(--text-subtlest)', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>
                              undo
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })
        )}
      </div>
    </>
  );
}

const SEL_STYLE_SM = {
  appearance: 'none', WebkitAppearance: 'none',
  border: '1px solid var(--border)', borderRadius: 4,
  padding: '4px 20px 4px 7px', fontSize: 12, fontFamily: 'inherit',
  background: 'var(--surface) url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'10\' height=\'6\'%3E%3Cpath d=\'M0 0l5 6 5-6z\' fill=\'%236B778C\'/%3E%3C/svg%3E") no-repeat right 5px center',
  cursor: 'pointer', color: 'var(--text)', outline: 'none', width: '100%',
};

// ── Stage stubs ──────────────────────────────────────────────────────────────
function StageStub({ number, label, description, bullets }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '32px 28px', maxWidth: 680 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--surface-sunken)', border: '1px solid var(--border)', color: 'var(--text-subtle)', fontSize: 13, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{number}</div>
        <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>{label}</span>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.4px', textTransform: 'uppercase', padding: '2px 8px', borderRadius: 4, background: 'var(--lz-n-bg)', color: 'var(--lz-n-text)' }}>Coming soon</span>
      </div>
      <p style={{ fontSize: 13, color: 'var(--text-subtle)', lineHeight: 1.6, margin: '0 0 16px' }}>{description}</p>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {bullets.map(b => (
          <li key={b} style={{ display: 'flex', gap: 8, fontSize: 13, color: 'var(--text-subtle)', lineHeight: 1.4 }}>
            <span style={{ color: 'var(--border)' }}>○</span>{b}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Main tab ─────────────────────────────────────────────────────────────────
const STAGES = [
  { id: 'sprints', n: '1', label: 'Sprints & capacity' },
  { id: 'convert', n: '2', label: 'Convert ideas' },
  { id: 'waterline', n: '3', label: 'Waterline' },
];

export default function DeliveryPlanningTab({ data }) {
  const { teams = [], versions = [], config = {}, release = {}, siteUrl = '', ideas = [] } = data ?? {};
  const scale = config.scale ?? { XS: 1, S: 3, M: 8, L: 13, XL: 21 };

  const [versionId, setVersionId] = useState(() => {
    const stored = localStorage.getItem(SESSION_KEY);
    return stored && versions.some(v => v.id === stored) ? stored : '';
  });
  const [activeStage, setActiveStage] = useState('sprints');
  const [deliveryData, setDeliveryData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selection, setSelection] = useState({});
  const [overrides, setOverrides] = useState({});
  const [collapsed, setCollapsed] = useState({});
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [addSprintTeam, setAddSprintTeam] = useState(null); // teamId of open add dialog
  const [editingSprint, setEditingSprint] = useState(null); // { teamId, sprint } of open edit dialog
  const [sprintSaving, setSprintSaving] = useState(false);
  const [sprintError, setSprintError] = useState(null);
  const [deletingSprint, setDeletingSprint] = useState(null); // { teamId, sprint } of open delete dialog
  const [deleteState, setDeleteState] = useState('confirm'); // 'confirm' | 'deleting' | 'nonEmpty'
  const [deleteCount, setDeleteCount] = useState(0);
  const [deleteError, setDeleteError] = useState(null);
  // Local teams state so base capacity edits are reflected immediately
  const [localTeams, setLocalTeams] = useState(teams);
  useEffect(() => setLocalTeams(teams), [teams]);
  // Local ideas mirror (full app-wide list, unfiltered) for Convert Ideas — same pattern as ReleasePlanningTab
  const [localIdeas, setLocalIdeas] = useState(ideas);
  useEffect(() => setLocalIdeas(ideas), [ideas]);
  const [conversion, setConversion] = useState({});
  const [epicProjectByIdea, setEpicProjectByIdea] = useState({});
  const [convertLoading, setConvertLoading] = useState(false);

  // Load delivery data when version changes
  useEffect(() => {
    if (!versionId) { setDeliveryData(null); return; }
    setLoading(true);
    setDeliveryData(null);
    invoke('getDelivery', { versionId }).then(d => {
      setDeliveryData(d);
      const sel = {};
      Object.entries(d.selection || {}).forEach(([tid, ids]) => { sel[tid] = Array.isArray(ids) ? ids : []; });
      setSelection(sel);
      setOverrides(d.overrides || {});
      setDirty(false);
    }).catch(console.error).finally(() => setLoading(false));
  }, [versionId]);

  useEffect(() => { if (versionId) localStorage.setItem(SESSION_KEY, versionId); }, [versionId]);

  const toggleSprint = useCallback((teamId, sprintId) => {
    setSelection(prev => {
      const curr = [...(prev[teamId] || [])];
      const idx = curr.indexOf(sprintId);
      if (idx >= 0) curr.splice(idx, 1); else curr.push(sprintId);
      return { ...prev, [teamId]: curr };
    });
    setDirty(true); setSaved(false);
  }, []);

  const toggleSection = useCallback((teamId) => {
    setCollapsed(prev => ({ ...prev, [teamId]: !prev[teamId] }));
  }, []);

  // Capacity override: key = "${teamId}:${sprintId}", pts=null means remove override
  const handleCapChange = useCallback((overrideKey, pts, note) => {
    setOverrides(prev => {
      if (pts == null && !note) {
        const next = { ...prev };
        delete next[overrideKey];
        return next;
      }
      return { ...prev, [overrideKey]: { pts, note } };
    });
    setDirty(true); setSaved(false);
  }, []);

  // Create a real sprint on the team's Jira board via the Agile API.
  const handleSaveNewSprint = useCallback(async (teamId, { name, goal, start, end }) => {
    const team = localTeams.find(t => t.id === teamId);
    if (!team?.boardId) { setSprintError('This team has no Jira board mapped.'); return; }
    setSprintSaving(true);
    setSprintError(null);
    try {
      const res = await withSaving(() => invoke('createSprint', {
        boardId: team.boardId, name, goal, startDate: start, endDate: end,
      }));
      if (!res.ok) { setSprintError(res.error || 'Failed to create sprint'); return; }
      const newSprint = res.sprint;
      setDeliveryData(prev => {
        if (!prev) return prev;
        const teamSprints = [...(prev.sprintsByTeam[teamId] || []), newSprint];
        return { ...prev, sprintsByTeam: { ...prev.sprintsByTeam, [teamId]: teamSprints } };
      });
      // Auto-select it
      setSelection(prev => ({ ...prev, [teamId]: [...(prev[teamId] || []), newSprint.id] }));
      setAddSprintTeam(null);
      setDirty(true); setSaved(false);
    } catch (e) {
      setSprintError(String(e.message || e));
    } finally {
      setSprintSaving(false);
    }
  }, [localTeams]);

  // Edit an existing sprint via the Agile API (write:sprint:jira-software scope).
  const handleSaveEditSprint = useCallback(async (teamId, sprint, { name, goal, start, end }) => {
    setSprintSaving(true);
    setSprintError(null);
    try {
      const res = await withSaving(() => invoke('updateSprint', {
        sprintId: sprint.id, name, goal, startDate: start, endDate: end,
      }));
      if (!res.ok) { setSprintError(res.error || 'Failed to save sprint'); return; }
      const updated = res.sprint;
      setDeliveryData(prev => {
        if (!prev) return prev;
        const teamSprints = (prev.sprintsByTeam[teamId] || []).map(sp => sp.id === updated.id ? { ...sp, ...updated } : sp);
        return { ...prev, sprintsByTeam: { ...prev.sprintsByTeam, [teamId]: teamSprints } };
      });
      setEditingSprint(null);
    } catch (e) {
      setSprintError(String(e.message || e));
    } finally {
      setSprintSaving(false);
    }
  }, []);

  const openDeleteSprint = useCallback((teamId, sprint) => {
    setDeletingSprint({ teamId, sprint });
    setDeleteState('confirm');
    setDeleteCount(0);
    setDeleteError(null);
  }, []);

  const closeDeleteDialog = useCallback(() => setDeletingSprint(null), []);

  const handleConfirmDelete = useCallback(async () => {
    if (!deletingSprint) return;
    const { teamId, sprint } = deletingSprint;
    setDeleteState('deleting');
    setDeleteError(null);
    try {
      const res = await withSaving(() => invoke('deleteSprint', { sprintId: sprint.id }));
      if (res.nonEmpty) {
        setDeleteCount(res.count || 0);
        setDeleteState('nonEmpty');
        return;
      }
      if (!res.ok) {
        setDeleteError(res.error || 'Failed to delete sprint');
        setDeleteState('confirm');
        return;
      }
      setDeliveryData(prev => {
        if (!prev) return prev;
        const teamSprints = (prev.sprintsByTeam[teamId] || []).filter(sp => sp.id !== sprint.id);
        return { ...prev, sprintsByTeam: { ...prev.sprintsByTeam, [teamId]: teamSprints } };
      });
      setSelection(prev => ({ ...prev, [teamId]: (prev[teamId] || []).filter(id => id !== sprint.id) }));
      setOverrides(prev => {
        const key = `${teamId}:${sprint.id}`;
        if (!(key in prev)) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      });
      setDirty(true); setSaved(false);
      setDeletingSprint(null);
    } catch (e) {
      setDeleteError(String(e.message || e));
      setDeleteState('confirm');
    }
  }, [deletingSprint]);

  // Selected sprint IDs that no longer exist in Jira (reported by getDelivery).
  const handleRemoveMissing = useCallback((teamId, sprintId) => {
    setSelection(prev => ({ ...prev, [teamId]: (prev[teamId] || []).filter(id => id !== sprintId) }));
    setOverrides(prev => {
      const key = `${teamId}:${sprintId}`;
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setDeliveryData(prev => {
      if (!prev) return prev;
      const missing = { ...(prev.missingByTeam || {}) };
      missing[teamId] = (missing[teamId] || []).filter(id => id !== sprintId);
      if (!missing[teamId].length) delete missing[teamId];
      return { ...prev, missingByTeam: missing };
    });
    setDirty(true); setSaved(false);
  }, []);

  const handleRecreateMissing = useCallback((teamId, sprintId) => {
    handleRemoveMissing(teamId, sprintId);
    setSprintError(null);
    setAddSprintTeam(teamId);
  }, [handleRemoveMissing]);

  // Base capacity: save back to config
  const handleBaseCap = useCallback((teamId, pts) => {
    setLocalTeams(prev => prev.map(t => t.id === teamId ? { ...t, sprintCap: pts } : t));
    const fullConfig = { ...config, teams: localTeams.map(t => t.id === teamId ? { ...t, sprintCap: pts } : t) };
    invoke('saveConfig', fullConfig).catch(console.error);
    setDirty(true); setSaved(false);
  }, [config, localTeams]);

  const handleSave = async () => {
    if (!versionId) return;
    setSaving(true);
    try {
      await withSaving(() => invoke('saveDelivery', { versionId, selection, overrides }));
      setDirty(false); setSaved(true);
      setTimeout(() => setSaved(false), 2400);
    } finally { setSaving(false); }
  };

  // ── Convert Ideas: idea-level handlers (mirrors ReleasePlanningTab's pattern —
  // localIdeas is the FULL app-wide list so reordering/team changes stay consistent
  // with the Release Planning board) ──────────────────────────────────────────
  const handleIdeaTeamChange = useCallback((issueKey, teamId) => {
    setLocalIdeas(prev => prev.map(i => i.key === issueKey ? { ...i, team: teamId } : i));
    withSaving(() => invoke('updateIdeaTeam', { issueKey, teamId })).catch(console.error);
  }, []);

  const handleIdeaRiceChange = useCallback((issueKey, vals) => {
    setLocalIdeas(prev => prev.map(i => i.key === issueKey ? { ...i, ...vals } : i));
    withSaving(() => invoke('updateIdeaRice', { issueKey, ...vals })).catch(console.error);
  }, []);

  const handleIdeaReorder = useCallback((dragKey, dropKey) => {
    setLocalIdeas(prev => {
      const next = [...prev];
      const from = next.findIndex(i => i.key === dragKey);
      const to = next.findIndex(i => i.key === dropKey);
      if (from === -1 || to === -1) return prev;
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      withSaving(() => invoke('updateIdeaOrder', { order: next.map(i => i.key) })).catch(console.error);
      return next;
    });
  }, []);

  const loadConversion = useCallback(() => {
    setConvertLoading(true);
    invoke('getConversion').then(d => {
      setConversion(d.conversion || {});
      setEpicProjectByIdea(d.epicProjectByIdea || {});
    }).catch(console.error).finally(() => setConvertLoading(false));
  }, []);

  useEffect(() => {
    if (activeStage === 'convert') loadConversion();
  }, [activeStage, loadConversion]);

  const handleConvertDone = useCallback((ideaKey, record) => {
    setConversion(prev => ({ ...prev, [ideaKey]: record }));
  }, []);

  const handleIdeaSizeChange = useCallback((issueKey, points) => {
    setLocalIdeas(prev => prev.map(i => i.key === issueKey ? { ...i, size: points } : i));
  }, []);

  const handleUndoDone = useCallback((ideaKey) => {
    setConversion(prev => ({ ...prev, [ideaKey]: { status: 'not' } }));
    setEpicProjectByIdea(prev => {
      if (!(ideaKey in prev)) return prev;
      const next = { ...prev };
      delete next[ideaKey];
      return next;
    });
  }, []);

  const sprintsByTeam = deliveryData?.sprintsByTeam || {};

  const getCap = (teamId, sid) => {
    const key = `${teamId}:${sid}`;
    const ov = overrides[key];
    if (ov?.pts != null) return ov.pts;
    return localTeams.find(t => t.id === teamId)?.sprintCap ?? 0;
  };

  // Coverage: matches prototype exactly.
  // cap = ONLY the explicitly set release capacity (from Release Planning tab waterline).
  // No fallback to sprintCap*sprintsPerRelease — if nothing is set, hasCap=false → "No capacity".
  // covered = availableCap >= cap  OR  addedSprints >= plannedSprints
  const releaseCapacity = deliveryData?.releaseCapacity || {};
  const coverage = localTeams.map(t => {
    const selIds = selection[t.id] || [];
    const addedSprints = selIds.length;
    const plannedSprints = t.sprintsPerRelease || 0;
    const availableCap = selIds.reduce((acc, sid) => acc + getCap(t.id, sid), 0);
    const cap = releaseCapacity[t.id] ?? null;
    const hasCap = cap != null && cap > 0;
    const sprintShort = Math.max(0, plannedSprints - addedSprints);
    const covered = hasCap ? (availableCap >= cap || addedSprints >= plannedSprints) : true;
    const pct = hasCap ? Math.min(100, Math.round(availableCap / cap * 100)) : 0;
    const capLabel = hasCap ? `${availableCap} / ${cap}` : `${availableCap} / —`;
    const chip = !hasCap
      ? { bg: 'var(--lz-n-bg)', text: 'var(--lz-n-text)', border: 'var(--border)', label: 'No capacity' }
      : covered
        ? { bg: 'var(--ok-bg)', text: 'var(--ok-text)', border: 'var(--ok-border)', label: 'Covered' }
        : { bg: 'var(--filling-bg)', text: 'var(--filling-text)', border: 'var(--filling-border)', label: 'Under-linked' };
    return { team: t, addedSprints, plannedSprints, availableCap, cap, hasCap, covered, pct, capLabel, chip, sprintShort };
  });

  const selectedVersion = versions.find(v => v.id === versionId);

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 0 64px' }}>

      {/* Version picker + dirty banner */}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 24, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.4px', textTransform: 'uppercase', color: 'var(--text-subtlest)' }}>Version</label>
          <select style={SEL_STYLE} value={versionId} onChange={e => { setVersionId(e.target.value); setDirty(false); setSaved(false); }}>
            <option value="">Select a version…</option>
            {versions.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        </div>
        <div style={{ flex: 1 }} />
        {dirty && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--filling-bg)', border: '1px solid var(--filling-border)', borderRadius: 6, padding: '10px 12px 10px 14px' }}>
            <span style={{ fontSize: 16 }}>⚠</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--filling-text)' }}>Unsaved changes — Save to keep</span>
            <button onClick={handleSave} disabled={saving} style={{ background: 'var(--brand)', color: '#fff', border: 'none', borderRadius: 3, padding: '5px 12px', fontSize: 13, fontWeight: 600, cursor: saving ? 'default' : 'pointer', fontFamily: 'inherit' }}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        )}
        {saved && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--ok-bg)', border: '1px solid var(--ok-border)', borderRadius: 6, padding: '10px 14px', color: 'var(--ok-text)', fontSize: 13, fontWeight: 600 }}>✓ Saved</div>
        )}
      </div>

      {/* Empty state */}
      {!versionId ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18, padding: '80px 20px' }}>
          <div style={{ width: 64, height: 64, borderRadius: 14, background: 'var(--surface-sunken)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, color: 'var(--text-subtlest)' }}>◔</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)' }}>Select a version to begin delivery planning.</div>
          <div style={{ fontSize: 14, color: 'var(--text-subtle)', maxWidth: 360, lineHeight: 1.5, textAlign: 'center' }}>Choose a release to link sprints, override capacity, and track conversion of ideas to Jira epics.</div>
        </div>
      ) : (
        <>
          {/* Stepper */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 16px', marginBottom: 16 }}>
            {STAGES.map((st, i) => {
              const on = activeStage === st.id;
              return (
                <React.Fragment key={st.id}>
                  <button
                    onClick={() => setActiveStage(st.id)}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 9, background: 'transparent', border: 'none', padding: '6px 4px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 14, fontWeight: on ? 700 : 600, color: on ? 'var(--text)' : 'var(--text-subtle)' }}
                  >
                    <span style={{ width: 24, height: 24, flexShrink: 0, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, background: on ? 'var(--brand)' : 'var(--surface-sunken)', color: on ? '#fff' : 'var(--text-subtle)', border: on ? 'none' : '1px solid var(--border)' }}>
                      {st.n}
                    </span>
                    {st.label}
                  </button>
                  <span style={{ color: 'var(--text-subtlest)', fontSize: 13, padding: '0 4px' }}>›</span>
                </React.Fragment>
              );
            })}
            <div style={{ flex: 1, minWidth: 16 }} />
            <span style={{ color: 'var(--text-subtlest)', fontSize: 13, paddingRight: 6 }}>·</span>
            <button
              onClick={() => setActiveStage('reconcile')}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: 'transparent', border: '1px solid ' + (activeStage === 'reconcile' ? 'var(--brand)' : 'var(--border)'), borderRadius: 6, padding: '6px 14px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 700, color: activeStage === 'reconcile' ? 'var(--brand)' : 'var(--text-subtle)' }}
            >
              Reconcile ↗
            </button>
          </div>

          {/* Stage content */}
          {loading ? (
            <div style={{ textAlign: 'center', padding: '56px', color: 'var(--text-subtlest)', fontSize: 14 }}>Loading sprints…</div>
          ) : activeStage === 'sprints' ? (
            deliveryData && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <ReleaseCoverageCard coverage={coverage} />
                <BaseCapacityCard teams={localTeams} onBaseCap={handleBaseCap} />
                <SprintSelectionCard
                  teams={localTeams}
                  sprintsByTeam={sprintsByTeam}
                  selection={selection}
                  overrides={overrides}
                  missingByTeam={deliveryData.missingByTeam || {}}
                  collapsed={collapsed}
                  boardError={deliveryData.boardError}
                  onToggleSprint={toggleSprint}
                  onToggleSection={toggleSection}
                  onAddSprint={teamId => { setSprintError(null); setAddSprintTeam(teamId); }}
                  onEditSprint={(teamId, sprint) => { setSprintError(null); setEditingSprint({ teamId, sprint }); }}
                  onDeleteSprint={openDeleteSprint}
                  onCapChange={handleCapChange}
                  onRemoveMissing={handleRemoveMissing}
                  onRecreateMissing={handleRecreateMissing}
                />
              </div>
            )
          ) : activeStage === 'convert' ? (
            <ConvertIdeasStage
              ideas={localIdeas}
              teams={localTeams}
              versionId={versionId}
              scale={scale}
              siteUrl={siteUrl}
              sprintsByTeam={sprintsByTeam}
              selection={selection}
              overrides={overrides}
              conversion={conversion}
              epicProjectByIdea={epicProjectByIdea}
              loading={convertLoading}
              onTeamChange={handleIdeaTeamChange}
              onRiceChange={handleIdeaRiceChange}
              onSizeChange={handleIdeaSizeChange}
              onReorder={handleIdeaReorder}
              onConvertDone={handleConvertDone}
              onUndoDone={handleUndoDone}
            />
          ) : activeStage === 'waterline' ? (
            <StageStub
              number="3" label="Waterline"
              description={'Live sprint × team grid showing allocated vs capacity. Click a cell to see that team\'s items in that sprint.'}
              bullets={[
                'Sprint × Team grid showing allocated vs capacity per cell',
                'Click a cell to see items with move/reassign options',
                'Planned (from ideas) vs actual (from Jira story points) per team',
                '"✓ Mark idea Done" button when linked epic is closed but idea isn\'t',
              ]}
            />
          ) : (
            <StageStub
              number="R" label="Reconcile"
              description={'Planned capacity vs actual converted story points per team.'}
              bullets={[
                'Per-team bar chart: planned pts vs actual pts',
                'Drift % with ≈ on-track · ▲ over-running · ▼ under labels',
                'Grand total row: overall planned vs actual for the release',
              ]}
            />
          )}
        </>
      )}

      {/* Add sprint dialog */}
      {addSprintTeam && (
        <SprintDialog
          mode="add"
          teamName={localTeams.find(t => t.id === addSprintTeam)?.name || ''}
          initial={computeNextSprintDefaults(
            sprintsByTeam[addSprintTeam] || [],
            localTeams.find(t => t.id === addSprintTeam)?.sprintWeeks
          )}
          saving={sprintSaving}
          error={sprintError}
          onSave={sp => handleSaveNewSprint(addSprintTeam, sp)}
          onCancel={() => { setAddSprintTeam(null); setSprintError(null); }}
        />
      )}

      {/* Edit sprint dialog */}
      {editingSprint && (
        <SprintDialog
          mode="edit"
          teamName={localTeams.find(t => t.id === editingSprint.teamId)?.name || ''}
          initial={{
            name: editingSprint.sprint.name || '',
            goal: editingSprint.sprint.goal || '',
            start: dateOnly(editingSprint.sprint.startDate),
            end: dateOnly(editingSprint.sprint.endDate),
          }}
          saving={sprintSaving}
          error={sprintError}
          onSave={sp => handleSaveEditSprint(editingSprint.teamId, editingSprint.sprint, sp)}
          onCancel={() => { setEditingSprint(null); setSprintError(null); }}
        />
      )}

      {/* Delete sprint dialog */}
      {deletingSprint && (() => {
        const deletingTeam = localTeams.find(t => t.id === deletingSprint.teamId);
        const boardHref = (deletingTeam?.projectKey && deletingTeam?.boardId && siteUrl)
          ? `${siteUrl}/jira/software/projects/${deletingTeam.projectKey}/boards/${deletingTeam.boardId}`
          : null;
        return (
          <DeleteSprintDialog
            teamName={deletingTeam?.name || ''}
            sprintName={deletingSprint.sprint.name}
            state={deleteState}
            count={deleteCount}
            error={deleteError}
            boardHref={boardHref}
            onConfirm={handleConfirmDelete}
            onCancel={closeDeleteDialog}
          />
        );
      })()}
    </div>
  );
}
