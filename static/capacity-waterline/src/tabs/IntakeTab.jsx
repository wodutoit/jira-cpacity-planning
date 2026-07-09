import React from 'react';
import Placeholder from '../components/Placeholder';

export default function IntakeTab({ data }) {
  return (
    <Placeholder
      title="Intake"
      description="Capture new ideas and set RICE scores. An idea joins Release Planning once it has a score and is promoted from New to Backlog."
      screens={[
        'Add-idea form (summary, size, target release)',
        'Version + Team filter chips',
        'RICE table — Reach / Impact / Effort dots, Confidence %, RICE score, Team, Target release, Status',
        'New→Backlog gate (disabled until score > 0)',
      ]}
    />
  );
}
