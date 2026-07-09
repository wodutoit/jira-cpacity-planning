import React from 'react';
import Placeholder from '../components/Placeholder';

export default function JiraTab({ data }) {
  return (
    <Placeholder
      title="Jira"
      description="Integration mapping between app concepts and Jira fields. Save is disabled until Validate passes."
      screens={[
        'Idea Space picker + Releases field name',
        'Idea field mapping — Summary, T-shirt size, Team, Target release, Status, RICE fields',
        'Idea status mapping — New / Backlog / ToDo / Doing / Done → Jira status names',
        'Teams table — each team mapped to a Jira Space (board)',
        'Delivery item mapping — issue types, Estimate field, Epic link, Sprint, Team fields',
        'Validate config button — calls Jira API to confirm spaces / fields / statuses resolve',
      ]}
    />
  );
}
