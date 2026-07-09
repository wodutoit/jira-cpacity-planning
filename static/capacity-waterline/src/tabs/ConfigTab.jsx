import React from 'react';
import Placeholder from '../components/Placeholder';

export default function ConfigTab({ data }) {
  return (
    <Placeholder
      title="Config"
      description="App-owned settings: versions, teams, access control, planning defaults, T-shirt scale."
      screens={[
        'Versions table — name, target date, status (Released / Active / Pending)',
        'Teams table — name, sprint weeks, sprint cap, sprints per release, derived release capacity',
        'Access control — editor UserPicker (multi-select account IDs)',
        'Planning defaults — threshold %, untagged idea statuses',
        'T-shirt scale — XS / S / M / L / XL story point values',
      ]}
    />
  );
}
