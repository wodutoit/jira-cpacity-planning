import React from 'react';
import Placeholder from '../components/Placeholder';

export default function ReleasePlanningTab({ data }) {
  return (
    <Placeholder
      title="Release Planning"
      description="Planning and Delivery modes. Planning: capacity waterline chart + idea board. Delivery: sprint selection, convert to epics, waterline, reconcile."
      screens={[
        'Version picker + Planning / Delivery mode toggle',
        'Waterline chart — 4 team bars + Total, threshold line, state labels (OK / FILLING / OVER)',
        'Capacity NumberField editors per team, Save button, threshold editor',
        'Idea table grouped by team — rank, RICE, size, team assign, version, status',
        'Delivery stages: Sprints & Capacity → Convert Ideas → Waterline → Reconcile',
      ]}
    />
  );
}
