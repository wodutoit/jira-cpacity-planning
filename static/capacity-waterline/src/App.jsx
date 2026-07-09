import React, { useState, useEffect } from 'react';
import { invoke } from '@forge/bridge';
import TabShell from './components/TabShell';

export default function App() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Spike #1a: measure bridge round-trip latency
    const t0 = performance.now();
    const lastVersionId = localStorage.getItem('cpw:lastVersionId');

    invoke('getAll', { versionId: lastVersionId })
      .then((result) => {
        const latency = Math.round(performance.now() - t0);
        console.info(`[spike-1a] getAll latency: ${latency}ms`);
        setData(result);
      })
      .catch((err) => setError(String(err)))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: '#6B778C', fontSize: 14 }}>
        Loading Capacity Waterline…
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 32, color: '#DE350B', fontSize: 14 }}>
        <strong>Failed to load:</strong> {error}
      </div>
    );
  }

  return <TabShell initialData={data} />;
}
