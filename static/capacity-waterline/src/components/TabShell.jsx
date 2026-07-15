import React, { useState, useEffect } from 'react';
import IntakeTab from '../tabs/IntakeTab';
import ReleasePlanningTab from '../tabs/ReleasePlanningTab';
import DeliveryPlanningTab from '../tabs/DeliveryPlanningTab';
import ConfigTab from '../tabs/ConfigTab';
import JiraTab from '../tabs/JiraTab';

// `route` matches a `pages[].route` entry in manifest.yml's jira:globalPage module —
// those are the tabs that also appear as sidebar sub-items under the app's nav entry.
const ALL_TABS = [
  { id: 'intake',            label: 'Intake',            component: IntakeTab,           adminOnly: false, route: 'intake' },
  { id: 'release-planning',  label: 'Release Planning',  component: ReleasePlanningTab,  adminOnly: false, route: 'release-planning' },
  { id: 'delivery-planning', label: 'Delivery Planning', component: DeliveryPlanningTab, adminOnly: false, route: 'delivery-planning' },
  { id: 'config',            label: 'Config',            component: ConfigTab,           adminOnly: true  },
  { id: 'jira',              label: 'Jira',              component: JiraTab,             adminOnly: true  },
];

function isAdmin(config, currentAccountId) {
  const admins = config?.admins ?? [];
  if (!admins.length) return true;
  return admins.some(a => a.accountId === currentAccountId);
}

function routeToTabId(pathname) {
  const segment = (pathname ?? '').split('/').filter(Boolean).pop();
  return ALL_TABS.find(t => t.route === segment)?.id;
}

export default function TabShell({ initialData, onRefresh, refreshing, history }) {
  const admin = isAdmin(initialData?.config, initialData?.currentUser?.accountId);
  const tabs = ALL_TABS.filter(t => !t.adminOnly || admin);

  const [activeTab, setActiveTab] = useState(() => routeToTabId(history?.location?.pathname) || 'intake');
  const [savingCount, setSavingCount] = useState(0);

  useEffect(() => {
    const handler = e => setSavingCount(c => Math.max(0, c + e.detail));
    window.addEventListener('cpw-saving', handler);
    return () => window.removeEventListener('cpw-saving', handler);
  }, []);

  // Sidebar sub-item clicks only move the Forge history location — listen so the
  // in-app tab state follows along (and stays correct across browser back/forward).
  useEffect(() => {
    if (!history?.listen) return;
    const unlisten = history.listen(location => {
      const id = routeToTabId(location?.pathname);
      if (id) setActiveTab(id);
    });
    return () => unlisten?.();
  }, [history]);

  const goToTab = id => {
    if (id === activeTab) return;
    setActiveTab(id);
    const route = ALL_TABS.find(t => t.id === id)?.route;
    if (route && history?.push) history.push('/' + route);
  };

  const visibleIds = new Set(tabs.map(t => t.id));
  const safeActive = visibleIds.has(activeTab) ? activeTab : tabs[0]?.id;
  const ActiveComponent = tabs.find(t => t.id === safeActive)?.component;

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-wordmark">
          <span className="app-badge">RCP</span>
          Release Capacity Planning
        </div>
        {tabs.map(tab => (
          <button
            key={tab.id}
            className={`tab-btn${safeActive === tab.id ? ' active' : ''}`}
            onClick={() => goToTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
          {!admin && <span style={{ fontSize: 12, color: 'var(--text-subtlest)' }}>Read-only</span>}

          {/* Global saving indicator */}
          {savingCount > 0 && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--text-subtlest)' }}>
              <span className="btn-spin" style={{ width: 11, height: 11, borderColor: 'var(--border)', borderTopColor: 'var(--brand)' }} />
              Saving…
            </span>
          )}

          <button
            onClick={onRefresh}
            disabled={refreshing}
            style={{
              background: 'none', border: 'none', cursor: refreshing ? 'default' : 'pointer',
              color: refreshing ? 'var(--text-subtlest)' : 'var(--text-subtle)', fontSize: 13, padding: '0 8px',
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
        {ActiveComponent && <ActiveComponent data={initialData} onRefresh={onRefresh} />}
      </main>
    </div>
  );
}
