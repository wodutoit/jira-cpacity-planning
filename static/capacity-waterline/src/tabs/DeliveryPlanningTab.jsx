import React, { useState } from 'react';
import NativeSelect from '../components/NativeSelect';

const STAGES = [
  {
    id: 'sprints',
    label: 'Sprints & Capacity',
    number: 1,
    description: 'Select which sprints belong to this release for each team. Set per-sprint capacity overrides (e.g. leave, reduced availability). Shows base vs available capacity.',
    items: [
      'Sprint picker per team — from the team\'s mapped Jira board',
      'Release coverage: available weeks vs planned sprint weeks',
      'Per-sprint capacity override grid with reason field (e.g. "Public holiday -5pts")',
      'Base capacity vs adjusted capacity per team',
    ],
  },
  {
    id: 'convert',
    label: 'Convert Ideas',
    number: 2,
    description: 'Turn planned ideas into Jira epics (and stories per sprint). Converting an idea sets its status to Doing.',
    items: [
      'List of release ideas by team, each with a Convert button',
      'Converts idea → Jira Epic in the team\'s mapped space',
      'Optionally creates Story issues per sprint',
      'Mismatch warning if epic was moved to another team\'s project',
      'Idea status auto-advances to Doing on convert',
    ],
  },
  {
    id: 'waterline',
    label: 'Waterline',
    number: 3,
    description: 'Live view of the Jira items created from this release, grouped by team. Mark ideas Done when their epic completes.',
    items: [
      'Jira issues grouped by team and linked idea',
      'Planned pts vs actual (story points on created issues)',
      '"✓ Mark idea Done" button when linked epic is Done but idea isn\'t',
      'Sprint-level progress bars',
    ],
  },
  {
    id: 'reconcile',
    label: 'Reconcile',
    number: 4,
    description: 'Planned capacity vs actual converted points per team — shows where scope was added or dropped.',
    items: [
      'Per-team table: planned capacity · converted pts · variance',
      'Highlights teams over/under converted vs plan',
      'Unlinked Jira issues (not tied to any idea)',
    ],
  },
];

export default function DeliveryPlanningTab({ data }) {
  const { versions = [], config = {} } = data ?? {};
  const [versionId, setVersionId] = useState(
    localStorage.getItem('cpw:lastVersionId') ?? versions[0]?.id ?? null
  );
  const [activeStage, setActiveStage] = useState('sprints');

  const versionOpts = versions.map(v => ({ value: v.id, label: v.name }));
  const currentStage = STAGES.find(s => s.id === activeStage);

  return (
    <div>
      {/* Version picker */}
      <div className="rp-topbar">
        <div className="rp-version-wrap">
          <NativeSelect
            options={versionOpts}
            value={versionId}
            onChange={v => setVersionId(v)}
            placeholder="Select a version…"
          />
        </div>
      </div>

      {/* Stage stepper */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 24, background: '#fff', border: '1px solid #DFE1E6', borderRadius: 8, overflow: 'hidden' }}>
        {STAGES.map((stage, i) => {
          const active = stage.id === activeStage;
          return (
            <button
              key={stage.id}
              onClick={() => setActiveStage(stage.id)}
              style={{
                flex: 1, padding: '12px 8px', background: active ? '#0052CC' : 'transparent',
                border: 'none', borderRight: i < STAGES.length - 1 ? '1px solid #DFE1E6' : 'none',
                cursor: 'pointer', textAlign: 'center', transition: 'background .1s',
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 700, color: active ? 'rgba(255,255,255,0.7)' : '#97A0AF', marginBottom: 2 }}>
                STEP {stage.number}
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, color: active ? '#fff' : '#344563' }}>
                {stage.label}
              </div>
            </button>
          );
        })}
      </div>

      {/* Stage content placeholder */}
      {currentStage && (
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <span style={{ width: 28, height: 28, borderRadius: '50%', background: '#0052CC', color: '#fff', fontSize: 13, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {currentStage.number}
            </span>
            <h2 className="card-title" style={{ margin: 0 }}>{currentStage.label}</h2>
          </div>
          <p className="card-desc">{currentStage.description}</p>
          <div className="section-heading mb-12">Components to build</div>
          <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {currentStage.items.map(item => (
              <li key={item} style={{ display: 'flex', gap: 8, fontSize: 14, color: '#344563', lineHeight: 1.4 }}>
                <span style={{ color: '#DFE1E6', flexShrink: 0 }}>○</span>
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
