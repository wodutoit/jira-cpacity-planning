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

const NORMAL_TABS = ALL_TABS.filter(t => !t.adminOnly);
const CONFIG_TABS = ALL_TABS.filter(t => t.adminOnly);

// App is "unconfigured" until Jira Config has a project set and at least one team exists —
// used to force Config mode open by default on first use, instead of landing on empty tabs.
function needsSetup(config) {
  return !config?.jiraCfg?.ideaSpace || !(config?.teams?.length > 0);
}

export default function TabShell({ initialData, onRefresh, refreshing, history }) {
  const admin = isAdmin(initialData?.config, initialData?.currentUser?.accountId);

  // Config mode swaps the whole tab bar to Config + Jira (admin-only) and hides the
  // regular Intake/Release/Delivery tabs — mirrors the "settings" pattern other Jira
  // apps use, since Forge has no way to hook into the sidebar's native kebab menu.
  const [configMode, setConfigMode] = useState(() => admin && needsSetup(initialData?.config));
  const visibleTabs = configMode ? CONFIG_TABS : NORMAL_TABS;

  // The dashboard gadget's "Open in Release Planning" link can't deep-link to a
  // sidebar route directly (Forge has no cross-module route API) — it hands off
  // via localStorage instead, since gadget and globalPage share the app's origin.
  const [activeTab, setActiveTab] = useState(() => {
    let openTab = null;
    try {
      openTab = localStorage.getItem('cpw:openTab');
      if (openTab) localStorage.removeItem('cpw:openTab');
    } catch { /* localStorage unavailable */ }
    return openTab || routeToTabId(history?.location?.pathname) || visibleTabs[0]?.id;
  });
  const [savingCount, setSavingCount] = useState(0);

  const openConfig = () => {
    if (!admin) return;
    setConfigMode(true);
    setActiveTab(CONFIG_TABS[0]?.id);
    onRefresh?.();
  };

  const closeConfig = () => {
    setConfigMode(false);
    setActiveTab(NORMAL_TABS[0]?.id);
    onRefresh?.();
  };

  useEffect(() => {
    const handler = e => setSavingCount(c => Math.max(0, c + e.detail));
    window.addEventListener('cpw-saving', handler);
    return () => window.removeEventListener('cpw-saving', handler);
  }, []);

  // Sidebar sub-item clicks only move the Forge history location — listen so the
  // in-app tab state follows along (and stays correct across browser back/forward).
  // Only NORMAL_TABS have routes, so any match here means the user picked a sidebar
  // item — exit Config mode if it was active so the picked tab actually becomes visible.
  useEffect(() => {
    if (!history?.listen) return;
    const unlisten = history.listen(location => {
      const id = routeToTabId(location?.pathname);
      if (id) {
        setConfigMode(false);
        setActiveTab(id);
      }
    });
    return () => unlisten?.();
  }, [history]);

  const goToTab = id => {
    if (id === activeTab) return;
    setActiveTab(id);
    const route = ALL_TABS.find(t => t.id === id)?.route;
    if (route && history?.push) history.push('/' + route);
    // Refresh data on every tab switch so changes made in one tab are immediately
    // visible in another without requiring a manual Refresh click.
    onRefresh?.();
  };

  const visibleIds = new Set(visibleTabs.map(t => t.id));
  const safeActive = visibleIds.has(activeTab) ? activeTab : visibleTabs[0]?.id;
  const ActiveComponent = visibleTabs.find(t => t.id === safeActive)?.component;

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-wordmark">
          <span className="app-badge">RCP</span>
          Release Capacity Planning
        </div>
        {visibleTabs.map(tab => (
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

          {/* Settings gear (admin-only) swaps into Config mode; hidden entirely for non-admins */}
          {admin && !configMode && (
            <button
              onClick={openConfig}
              title="App settings"
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--text-subtle)', fontSize: 16, padding: '0 4px',
                display: 'flex', alignItems: 'center',
              }}
            >
              ⚙
            </button>
          )}
          {configMode && (
            <button
              onClick={closeConfig}
              style={{
                background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6,
                padding: '6px 14px', fontSize: 13, fontWeight: 700, color: 'var(--text)',
                cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
              }}
            >
              Close Config
            </button>
          )}
        </div>
      </header>
      <main className="tab-content">
        {ActiveComponent && <ActiveComponent data={initialData} onRefresh={onRefresh} />}
      </main>
    </div>
  );
}
