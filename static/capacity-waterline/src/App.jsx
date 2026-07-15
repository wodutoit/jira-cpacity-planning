import React, { useState, useEffect, useCallback, useRef } from 'react';
import { invoke, view } from '@forge/bridge';
import TabShell from './components/TabShell';

export default function App() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [historyReady, setHistoryReady] = useState(false);
  const historyRef = useRef(null);

  const load = useCallback((isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    const lastVersionId = localStorage.getItem('cpw:lastVersionId');
    return Promise.all([
      invoke('getAll', { versionId: lastVersionId }),
      view.getContext().catch(() => ({})),
    ])
      .then(([result, ctx]) => setData({ ...result, siteUrl: ctx.siteUrl ?? '' }))
      .catch(err => setError(String(err)))
      .finally(() => { setLoading(false); setRefreshing(false); });
  }, []);

  useEffect(() => { load(); }, []);

  // Sync with Jira's own theme (light/dark) rather than a manual toggle — Forge sets
  // data-color-mode on the document element, which styles.css's dark block reacts to.
  useEffect(() => { view.theme.enable().catch(() => {}); }, []);

  // Sidebar sub-items (manifest `pages`) only change the global page URL — the app owns
  // routing. Read the initial route before first render so we don't flash the wrong tab.
  useEffect(() => {
    view.createHistory()
      .then(h => { historyRef.current = h; })
      .catch(() => {})
      .finally(() => setHistoryReady(true));
  }, []);

  if (loading || !historyReady) {
    return (
      <div className="center-msg">Loading Release Capacity Planning…</div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 32, color: 'var(--over-text)', fontSize: 14 }}>
        <strong>Failed to load:</strong> {error}
      </div>
    );
  }

  return <TabShell initialData={data} onRefresh={() => load(true)} refreshing={refreshing} history={historyRef.current} />;
}
