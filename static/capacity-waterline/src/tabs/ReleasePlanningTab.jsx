import React, { useState, useEffect, useCallback } from 'react';
import { invoke } from '@forge/bridge';
import NativeSelect from '../components/NativeSelect';
import WaterlineChart from '../components/WaterlineChart';
import IdeaTable from '../components/IdeaTable';
import Button from '../components/Button';

const SESSION_KEY = 'cpw:lastVersionId';

export default function ReleasePlanningTab({ data }) {
  const { ideas = [], teams = [], versions = [], config = {}, currentUser } = data ?? {};
  const scale = config.scale ?? { XS: 1, S: 3, M: 8, L: 13, XL: 21 };

  // Version selection — restore from session
  const [versionId, setVersionId] = useState(() => {
    const stored = localStorage.getItem(SESSION_KEY);
    return stored && versions.some(v => v.id === stored) ? stored : (versions[0]?.id ?? null);
  });

  useEffect(() => {
    if (versionId) localStorage.setItem(SESSION_KEY, versionId);
  }, [versionId]);

  // Release record (capacity + threshold per version)
  const [release, setRelease] = useState(() => data?.release ?? { capacityByTeam: {}, threshold: config.threshold ?? 70 });
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');

  // Local idea state for optimistic team/version reassignment
  const [localIdeas, setLocalIdeas] = useState(ideas);
  useEffect(() => { setLocalIdeas(ideas); }, [ideas]);

  // Check if user is an editor
  const editors = config.editors ?? [];
  const admins = config.admins ?? [];
  const accountId = currentUser?.accountId;
  const canEdit = !editors.length || editors.some(e => e.accountId === accountId)
    || !admins.length || admins.some(a => a.accountId === accountId);

  const handleCapacityChange = useCallback((teamId, value) => {
    if (!canEdit) return;
    setRelease(r => ({ ...r, capacityByTeam: { ...r.capacityByTeam, [teamId]: value } }));
    setDirty(true);
    setSavedMsg('');
  }, [canEdit]);

  const handleThresholdChange = useCallback((value) => {
    if (!canEdit) return;
    setRelease(r => ({ ...r, threshold: value }));
    setDirty(true);
    setSavedMsg('');
  }, [canEdit]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await invoke('saveCapacity', {
        versionId,
        capacityByTeam: release.capacityByTeam,
        threshold: release.threshold,
      });
      setDirty(false);
      setSavedMsg('Saved');
      setTimeout(() => setSavedMsg(''), 3000);
    } finally {
      setSaving(false);
    }
  };

  const handleTeamChange = useCallback((ideaKey, teamId) => {
    if (!canEdit) return;
    setLocalIdeas(prev => prev.map(i => i.key === ideaKey ? { ...i, team: teamId || null } : i));
    // Write to Jira asynchronously (no save button for team reassignment)
    invoke('updateIdeaTeam', { issueKey: ideaKey, teamId: teamId || null }).catch(console.error);
  }, [canEdit]);

  const handleVersionChange = useCallback((ideaKey, newVersionId) => {
    if (!canEdit) return;
    setLocalIdeas(prev => prev.map(i => i.key === ideaKey ? { ...i, release: newVersionId || null } : i));
    invoke('updateIdeaRelease', { issueKey: ideaKey, versionId: newVersionId || null }).catch(console.error);
  }, [canEdit]);

  const versionOpts = versions.map(v => ({ value: v.id, label: v.name }));
  const selectedVersion = versions.find(v => v.id === versionId);
  const untaggedCount = localIdeas.filter(i => !i.release).length;
  const unsizedCount = localIdeas.filter(i => i.release === versionId && i.size == null).length;

  return (
    <div>
      {/* Top bar */}
      <div className="rp-topbar">
        <div className="rp-version-wrap">
          <NativeSelect
            options={versionOpts}
            value={versionId}
            onChange={v => { setVersionId(v); setDirty(false); setSavedMsg(''); }}
            placeholder="Select a version…"
          />
        </div>

        {dirty && (
          <div className="rp-banner">
            <span>Unsaved capacity changes — save to keep your edits.</span>
            <div className="rp-banner__actions">
              <Button appearance="primary" onClick={handleSave} isLoading={saving} size="sm">Save</Button>
              <Button appearance="default" onClick={() => { setRelease(data?.release ?? {}); setDirty(false); }} size="sm">Discard</Button>
            </div>
          </div>
        )}
        {savedMsg && <span className="action-status saved">✓ {savedMsg}</span>}
      </div>

      {/* Meta counts */}
      {versionId && (
        <div className="wl-meta">
          {selectedVersion?.name && <strong>{selectedVersion.name}</strong>}
          {untaggedCount > 0 && <span style={{ marginLeft: 12, color: '#974F0C' }}>⚠ {untaggedCount} idea{untaggedCount !== 1 ? 's' : ''} untagged</span>}
          {unsizedCount > 0 && <span style={{ marginLeft: 12, color: '#97A0AF' }}>{unsizedCount} unsized</span>}
        </div>
      )}

      {/* Waterline chart */}
      <WaterlineChart
        teams={teams}
        ideas={localIdeas}
        scale={scale}
        versionId={versionId}
        release={release}
        onCapacityChange={handleCapacityChange}
        onThresholdChange={handleThresholdChange}
        onSave={handleSave}
        saving={saving}
        dirty={dirty}
      />

      {/* Idea table */}
      {versionId && (
        <IdeaTable
          ideas={localIdeas}
          teams={teams}
          versions={versions}
          scale={scale}
          versionId={versionId}
          onTeamChange={handleTeamChange}
          onVersionChange={handleVersionChange}
        />
      )}

      {!versionId && versions.length === 0 && (
        <div className="wl-empty">
          No versions found. Create releases in your Jira project, then configure the release field on the Jira tab.
        </div>
      )}
    </div>
  );
}
