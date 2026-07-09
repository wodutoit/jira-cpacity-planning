import React, { useState } from 'react';
import IntakeTab from '../tabs/IntakeTab';
import ReleasePlanningTab from '../tabs/ReleasePlanningTab';
import ConfigTab from '../tabs/ConfigTab';
import JiraTab from '../tabs/JiraTab';

const ALL_TABS = [
  { id: 'intake', label: 'Intake', component: IntakeTab, adminOnly: false },
  { id: 'release-planning', label: 'Release Planning', component: ReleasePlanningTab, adminOnly: false },
  { id: 'config', label: 'Config', component: ConfigTab, adminOnly: true },
  { id: 'jira', label: 'Jira', component: JiraTab, adminOnly: true },
];

function isAdmin(config, currentAccountId) {
  const admins = config?.admins ?? [];
  // Empty list → everyone is admin
  if (!admins.length) return true;
  return admins.some(a => a.accountId === currentAccountId);
}

export default function TabShell({ initialData, onRefresh, refreshing }) {
  const admin = isAdmin(initialData?.config, initialData?.currentUser?.accountId);
  const tabs = ALL_TABS.filter(t => !t.adminOnly || admin);

  const [activeTab, setActiveTab] = useState('intake');

  // If active tab became hidden (e.g. admin rights removed), fall back
  const visibleIds = new Set(tabs.map(t => t.id));
  const safeActive = visibleIds.has(activeTab) ? activeTab : tabs[0]?.id;

  const ActiveComponent = tabs.find(t => t.id === safeActive)?.component;

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-wordmark">
          <span className="app-badge">W</span>
          Capacity Waterline
        </div>
        {tabs.map(tab => (
          <button
            key={tab.id}
            className={`tab-btn${safeActive === tab.id ? ' active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
          {!admin && <span style={{ fontSize: 12, color: '#97A0AF' }}>Read-only</span>}
          <button
            onClick={onRefresh}
            disabled={refreshing}
            style={{
              background: 'none', border: 'none', cursor: refreshing ? 'default' : 'pointer',
              color: refreshing ? '#97A0AF' : '#6B778C', fontSize: 13, padding: '0 8px',
              display: 'flex', alignItems: 'center', gap: 4,
            }}
            title="Reload data from Jira"
          >
            <span style={{ display: 'inline-block', animation: refreshing ? 'btn-rotate .8s linear infinite' : 'none' }}>↻</span>
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </header>
      <main className="tab-content">
        {ActiveComponent && <ActiveComponent data={initialData} />}
      </main>
    </div>
  );
}
