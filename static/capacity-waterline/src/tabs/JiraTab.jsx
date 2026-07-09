import React, { useState, useEffect, useCallback } from 'react';
import { invoke } from '@forge/bridge';
import Select from '@atlaskit/select';
import Button from '../components/Button';
import Spinner from '@atlaskit/spinner';

const JPD_DEFAULTS = {
  reachField: 'customfield_10056',
  impactField: 'customfield_10053',
  effortField: 'customfield_10064',
  confidenceField: 'customfield_10066',
};

const LIFECYCLE = ['New', 'Backlog', 'ToDo', 'Doing', 'Done'];
const DEFAULT_STATUS_MAP = { New: 'New', Backlog: 'Backlog', ToDo: 'Selected for Development', Doing: 'In Progress', Done: 'Done' };

function toOption(key, label) { return { value: key, label: label ?? key }; }
function fieldOpts(fields, types) {
  return (fields ?? [])
    .filter(f => !types || types.includes(f.type))
    .map(f => toOption(f.key, `${f.name} (${f.key})`));
}
function findOpt(opts, val) { return opts.find(o => o.value === val) ?? null; }

export default function JiraTab({ data }) {
  const [setup, setSetup] = useState(null);
  const [loadingSetup, setLoadingSetup] = useState(true);
  const [details, setDetails] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [form, setForm] = useState(() => ({
    ideaSpace: '', projectType: '', releaseField: '', sizeField: '',
    reachField: '', impactField: '', effortField: '', confidenceField: '',
    statusMap: { ...DEFAULT_STATUS_MAP },
    ...(data?.config?.jiraCfg ?? {}),
  }));
  const [validation, setValidation] = useState(null);
  const [validating, setValidating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedOk, setSavedOk] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    invoke('getJiraSetup').then(setSetup).finally(() => setLoadingSetup(false));
  }, []);

  useEffect(() => {
    if (!form.ideaSpace) { setDetails(null); return; }
    setLoadingDetails(true);
    setDetails(null);
    setValidation(null);
    invoke('getProjectDetails', { projectKey: form.ideaSpace }).then(d => {
      setDetails(d);
      if (d.projectType === 'product_discovery') {
        setForm(f => ({ ...f, projectType: 'product_discovery', ...JPD_DEFAULTS }));
      } else {
        setForm(f => ({ ...f, projectType: d.projectType ?? 'software' }));
      }
    }).finally(() => setLoadingDetails(false));
  }, [form.ideaSpace]);

  const set = useCallback((key, val) => {
    setForm(f => ({ ...f, [key]: val }));
    setDirty(true); setValidation(null); setSavedOk(false);
  }, []);

  const setStatus = useCallback((lifecycle, val) => {
    setForm(f => ({ ...f, statusMap: { ...f.statusMap, [lifecycle]: val } }));
    setDirty(true); setValidation(null); setSavedOk(false);
  }, []);

  const validate = async () => {
    setValidating(true);
    try { setValidation(await invoke('validateJiraCfg', form)); }
    finally { setValidating(false); }
  };

  const save = async () => {
    setSaving(true);
    try { await invoke('saveJiraCfg', form); setSavedOk(true); setDirty(false); }
    finally { setSaving(false); }
  };

  if (loadingSetup) return <div className="center-msg"><Spinner size="medium" /> &nbsp; Loading…</div>;

  const isJPD = details?.projectType === 'product_discovery';
  const hasIdea = details?.hasIdeaType;
  const ideaFields = details?.ideaFields ?? [];
  const statuses = (details?.statuses ?? []).map(s => toOption(s));
  const projectOpts = (setup?.projects ?? []).map(p => toOption(p.key, `${p.name} (${p.key})`));
  const allFieldOpts = fieldOpts(setup?.allFields ?? []);
  const ideaFieldOpts = fieldOpts(ideaFields);
  const numericOpts = fieldOpts(ideaFields, ['number', 'float']);
  const releaseOpts = fieldOpts(ideaFields, ['option', 'array', 'string', 'any']);

  const canSave = validation?.valid === true;

  return (
    <div className="card">
      <h2 className="card-title">Jira Integration</h2>
      <p className="card-desc">
        Map your Jira space and fields to the app. Save is disabled until validation passes.
      </p>

      {/* SECTION 1 — Idea Space */}
      <div className="section">
        <div className="section-heading">Idea Space</div>
        <div className="field-group">
          <label className="field-label">
            Project
            {details && (
              <span className={`type-badge ${isJPD ? 'jpd' : 'software'}`}>
                {isJPD ? 'Jira Product Discovery' : 'Jira Software'}
              </span>
            )}
          </label>
          <Select
            options={projectOpts}
            value={findOpt(projectOpts, form.ideaSpace)}
            onChange={opt => set('ideaSpace', opt?.value ?? '')}
            placeholder="Select a Jira project…"
            isLoading={loadingSetup}
          />
          <div className="field-hint">The project where Idea issues live.</div>
        </div>

        {loadingDetails && <div className="loading-row"><Spinner size="small" /> Loading project details…</div>}

        {details && !hasIdea && (
          <div className="instr instr-error">
            <strong>This project has no Idea issue type.</strong> Go to project settings → Issue types and add the Idea type.
            If using a software project, you can add a custom issue type named <code>Idea</code>.
          </div>
        )}
      </div>

      {details && hasIdea && (
        <>
          <hr className="divider" />

          {/* SECTION 2 — Release Field */}
          <div className="section">
            <div className="section-heading">Release Field</div>
            {isJPD ? (
              <div className="instr">
                <strong>JPD projects don't have Fix Versions.</strong> Create a <strong>Select</strong> field called <code>Target Release</code>
                on the Idea issue type in your JPD project settings, add your release names as options, then refresh and select it here.
              </div>
            ) : (
              <div className="instr">
                Create a <strong>Select</strong> field called <code>Planned Version</code> on the Idea issue type
                in your project settings, add your release names as options, then refresh and select it here.
                Alternatively you can use <code>Fix versions</code> if already configured.
              </div>
            )}
            <div className="field-group">
              <label className="field-label">Release field</label>
              <Select
                options={ideaFieldOpts}
                value={findOpt(ideaFieldOpts, form.releaseField)}
                onChange={opt => set('releaseField', opt?.value ?? '')}
                placeholder="Select field…"
                isClearable
              />
              <div className="field-hint">The field on Idea issues that identifies which release they belong to.</div>
            </div>
          </div>

          <hr className="divider" />

          {/* SECTION 3 — Size Field */}
          <div className="section">
            <div className="section-heading">T-shirt Size Field</div>
            <div className="instr">
              Neither JPD nor Jira Software has a built-in T-shirt size field.
              Add a <strong>Number</strong> field (e.g. <code>Story points</code> or <code>T-shirt size</code>)
              to the Idea issue type, then select it here.
              The app writes numeric values (XS=1, S=3, M=8, L=13, XL=21) and maps them to size labels.
            </div>
            <div className="field-group">
              <label className="field-label">Size field <span style={{ color: '#DE350B' }}>*</span></label>
              <Select
                options={numericOpts.length ? numericOpts : ideaFieldOpts}
                value={findOpt(ideaFieldOpts, form.sizeField)}
                onChange={opt => set('sizeField', opt?.value ?? '')}
                placeholder="Select number field…"
                isClearable
              />
              <div className="field-hint">Must be a number field on the Idea issue type.</div>
            </div>
          </div>

          <hr className="divider" />

          {/* SECTION 4 — RICE Fields */}
          <div className="section">
            <div className="section-heading">RICE Fields</div>
            {isJPD ? (
              <div className="instr instr-info">
                These fields are built into JPD and have been auto-mapped. You can override them if your project uses different fields.
              </div>
            ) : (
              <div className="instr">
                Jira Software doesn't include RICE fields. Add four <strong>Number</strong> fields to the Idea issue type:
                <br />
                <code>Reach</code> (0–5) · <code>Impact</code> (0–5) · <code>Effort</code> (1–5) · <code>Confidence</code> (0–100)
                <br /><br />
                Then refresh and map them below. You can skip RICE and use manual prioritisation instead.
              </div>
            )}
            <div className="two-col">
              {[
                { label: 'Reach', key: 'reachField', hint: '0–5' },
                { label: 'Impact', key: 'impactField', hint: '0–5' },
                { label: 'Effort', key: 'effortField', hint: '1–5' },
                { label: 'Confidence', key: 'confidenceField', hint: '0–100 (%)' },
              ].map(({ label, key, hint }) => (
                <div className="field-group" key={key}>
                  <label className="field-label">{label} <span className="field-hint" style={{ display: 'inline' }}>({hint})</span></label>
                  <Select
                    options={numericOpts.length ? numericOpts : ideaFieldOpts}
                    value={findOpt(ideaFieldOpts, form[key])}
                    onChange={opt => set(key, opt?.value ?? '')}
                    placeholder="Select field…"
                    isClearable
                  />
                </div>
              ))}
            </div>
          </div>

          <hr className="divider" />

          {/* SECTION 5 — Status Mapping */}
          <div className="section">
            <div className="section-heading">Status Mapping</div>
            <p className="field-hint" style={{ marginBottom: 16 }}>
              Map each app lifecycle status to a Jira status in the <strong>{form.ideaSpace}</strong> project.
            </p>
            {LIFECYCLE.map(lc => (
              <div className="status-map-row" key={lc}>
                <span className="status-map-label">{lc}</span>
                <span className="status-map-arrow">→</span>
                <div className="status-map-select">
                  <Select
                    options={statuses}
                    value={findOpt(statuses, form.statusMap[lc])}
                    onChange={opt => setStatus(lc, opt?.value ?? '')}
                    placeholder="Select Jira status…"
                    isClearable
                  />
                </div>
              </div>
            ))}
          </div>

          <hr className="divider" />

          {/* SECTION 6 — Actions */}
          <div className="action-row">
            <Button
              appearance="default"
              onClick={validate}
              isLoading={validating}
              isDisabled={!form.ideaSpace}
            >
              Validate configuration
            </Button>
            <Button
              appearance="primary"
              onClick={save}
              isLoading={saving}
              isDisabled={!canSave}
            >
              Save
            </Button>

            {savedOk && <span className="action-status saved">✓ Saved</span>}

            {validation && !validation.valid && (
              <span className="action-status error">{validation.errors?.length} error{validation.errors?.length !== 1 ? 's' : ''}</span>
            )}
            {validation?.valid && !savedOk && (
              <span className="action-status saved">✓ Valid — ready to save</span>
            )}
          </div>

          {validation && !validation.valid && validation.errors?.length > 0 && (
            <div className="instr instr-error" style={{ marginTop: 12 }}>
              <ul className="error-list">
                {validation.errors.map(e => <li key={e}>{e}</li>)}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}
