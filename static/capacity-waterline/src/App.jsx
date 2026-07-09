import React, { useState, useEffect, useCallback } from 'react';
import { invoke } from '@forge/bridge';
import TabShell from './components/TabShell';

export default function App() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback((isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    const lastVersionId = localStorage.getItem('cpw:lastVersionId');
    return invoke('getAll', { versionId: lastVersionId })
      .then(setData)
      .catch(err => setError(String(err)))
      .finally(() => { setLoading(false); setRefreshing(false); });
  }, []);

  useEffect(() => { load(); }, []);

  if (loading) {
    return (
      <div className="center-msg">Loading Capacity Waterline…</div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 32, color: '#DE350B', fontSize: 14 }}>
        <strong>Failed to load:</strong> {error}
      </div>
    );
  }

  return <TabShell initialData={data} onRefresh={() => load(true)} refreshing={refreshing} />;
}
