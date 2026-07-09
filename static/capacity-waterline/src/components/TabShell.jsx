import React, { useState } from 'react';
import IntakeTab from '../tabs/IntakeTab';
import ReleasePlanningTab from '../tabs/ReleasePlanningTab';
import ConfigTab from '../tabs/ConfigTab';
import JiraTab from '../tabs/JiraTab';

const TABS = [
  { id: 'intake', label: 'Intake', component: IntakeTab },
  { id: 'release-planning', label: 'Release Planning', component: ReleasePlanningTab },
  { id: 'config', label: 'Config', component: ConfigTab },
  { id: 'jira', label: 'Jira', component: JiraTab },
];

const styles = {
  root: {
    minHeight: '100vh',
    background: '#F4F5F7',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    borderBottom: '2px solid #DFE1E6',
    background: '#fff',
    padding: '0 24px',
    height: 44,
  },
  wordmark: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginRight: 24,
    fontWeight: 700,
    fontSize: 14,
    color: '#172B4D',
    flexShrink: 0,
  },
  badge: {
    background: '#0052CC',
    color: '#fff',
    borderRadius: 4,
    padding: '2px 7px',
    fontSize: 12,
    fontWeight: 700,
  },
  tabButton: (active) => ({
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: '0 16px',
    height: 44,
    fontSize: 14,
    color: active ? '#0052CC' : '#42526E',
    fontWeight: active ? 600 : 400,
    borderBottom: active ? '2px solid #0052CC' : '2px solid transparent',
    marginBottom: -2,
    transition: 'color 0.1s',
  }),
  content: {
    padding: 24,
  },
};

export default function TabShell({ initialData }) {
  const [activeTab, setActiveTab] = useState('release-planning');

  const ActiveComponent = TABS.find((t) => t.id === activeTab)?.component;

  return (
    <div style={styles.root}>
      <header style={styles.header}>
        <div style={styles.wordmark}>
          <span style={styles.badge}>W</span>
          Capacity Waterline
        </div>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={styles.tabButton(activeTab === tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </header>
      <main style={styles.content}>
        {ActiveComponent && <ActiveComponent data={initialData} />}
      </main>
    </div>
  );
}
