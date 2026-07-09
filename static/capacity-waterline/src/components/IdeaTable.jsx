import React from 'react';

const SIZE_ORDER = ['XS', 'S', 'M', 'L', 'XL'];

function riceScore(idea) {
  const { reach, impact, effort, confidence } = idea;
  if (!reach && !impact && !effort && !confidence) return null;
  if (!effort) return 0;
  return Math.round((reach * impact * (confidence / 100)) / effort * 10) / 10;
}

function sizeFromPoints(pts, scale) {
  if (pts == null) return null;
  for (const s of SIZE_ORDER) {
    if (scale[s] === pts) return s;
  }
  return String(pts);
}

function StatusLoz({ status }) {
  const map = {
    'In Progress': 'doing', 'Doing': 'doing',
    'Done': 'done', 'Selected for Development': 'todo',
    'ToDo': 'todo', 'To Do': 'todo',
  };
  const cls = map[status] ?? 'default';
  return <span className={`status-loz ${cls}`}>{status ?? '—'}</span>;
}

export default function IdeaTable({ ideas, teams, versions, scale, versionId, onTeamChange, onVersionChange }) {
  const teamMap = Object.fromEntries((teams ?? []).map(t => [t.id, t.name]));
  const versionMap = Object.fromEntries((versions ?? []).map(v => [v.id, v.name]));
  const teamOpts = teams ?? [];
  const versionOpts = versions ?? [];

  // Filter to selected version + untagged
  const inVersion = ideas.filter(i => i.release === versionId);
  const untagged = ideas.filter(i => !i.release);

  // Group by team
  const byTeam = {};
  for (const idea of inVersion) {
    const key = idea.team ?? '__unassigned';
    (byTeam[key] = byTeam[key] ?? []).push(idea);
  }

  const groups = [
    ...teamOpts.map(t => ({ key: t.id, label: t.name, ideas: byTeam[t.id] ?? [] })),
    { key: '__unassigned', label: 'Unassigned', ideas: byTeam['__unassigned'] ?? [] },
  ].filter(g => g.ideas.length > 0);

  if (groups.length === 0 && untagged.length === 0) {
    return (
      <div className="idea-table-wrap">
        <div className="idea-table-empty">No ideas tagged to this version yet.</div>
      </div>
    );
  }

  function IdeaRow({ idea, dimmed }) {
    const score = idea.riceScore ?? riceScore(idea);
    const size = idea.size != null ? sizeFromPoints(idea.size, scale) : null;

    return (
      <tr className={dimmed ? 'idea-unassigned' : ''}>
        <td>
          <span className="idea-key">{idea.key}</span>
          <span className="idea-title" title={idea.title}>{idea.title}</span>
        </td>
        <td>
          {score != null
            ? <span className={`rice-pill ${score > 0 ? 'scored' : 'zero'}`}>{score > 0 ? score : '—'}</span>
            : <span className="rice-pill zero">—</span>
          }
        </td>
        <td>
          <span className={`size-badge${size ? '' : ' unset'}`}>{size ?? '—'}</span>
        </td>
        <td>
          <select
            className="inline-select"
            value={idea.team ?? ''}
            onChange={e => onTeamChange?.(idea.key, e.target.value || null)}
          >
            <option value="">— Unassigned</option>
            {teamOpts.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </td>
        <td>
          <select
            className="inline-select"
            value={idea.release ?? ''}
            onChange={e => onVersionChange?.(idea.key, e.target.value || null)}
          >
            <option value="">— Untagged</option>
            {versionOpts.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        </td>
        <td><StatusLoz status={idea.status} /></td>
      </tr>
    );
  }

  return (
    <div className="idea-table-wrap">
      <table className="idea-table">
        <thead>
          <tr>
            <th>Title</th>
            <th>RICE</th>
            <th>Size</th>
            <th>Team</th>
            <th>Version</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {groups.map(group => (
            <React.Fragment key={group.key}>
              <tr className="idea-group-row">
                <td colSpan={6}>
                  {group.label}
                  <span style={{ fontWeight: 400, color: '#6B778C', marginLeft: 8 }}>
                    {group.ideas.length} idea{group.ideas.length !== 1 ? 's' : ''}
                  </span>
                </td>
              </tr>
              {group.ideas.map(idea => (
                <IdeaRow key={idea.key} idea={idea} dimmed={group.key === '__unassigned'} />
              ))}
            </React.Fragment>
          ))}

          {untagged.length > 0 && (
            <React.Fragment>
              <tr className="idea-group-row">
                <td colSpan={6} style={{ color: '#97A0AF' }}>
                  Untagged — not counted in waterline
                  <span style={{ fontWeight: 400, marginLeft: 8 }}>{untagged.length} idea{untagged.length !== 1 ? 's' : ''}</span>
                </td>
              </tr>
              {untagged.map(idea => (
                <IdeaRow key={idea.key} idea={idea} dimmed />
              ))}
            </React.Fragment>
          )}
        </tbody>
      </table>
    </div>
  );
}
