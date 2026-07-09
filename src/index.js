const Resolver = require('@forge/resolver').default;
const { kvs } = require('@forge/kvs');
const { route, asUser } = require('@forge/api');

const resolver = new Resolver();

// All Jira API calls use asUser() — app context has no project access on team-managed projects.
// Field keys confirmed in Spike #2:
//   Team:       customfield_10001 (both JPD and software)
//   Reach:      customfield_10056 (JPD native)
//   Impact:     customfield_10053 (JPD native)
//   Effort:     customfield_10064 (JPD native)
//   Confidence: customfield_10066 (JPD native)
//   RICE score: customfield_10068 (JPD native, computed)
//   Fix version: fixVersions (software projects)
//   T-shirt size: user-selected field (not native to either type)

const JIRA_FIELDS = [
  'summary', 'status', 'issuetype', 'project', 'assignee',
  'fixVersions', 'labels',
  'customfield_10001', // Team
  'customfield_10053', // Impact
  'customfield_10056', // Reach
  'customfield_10064', // Effort
  'customfield_10066', // Confidence
  'customfield_10068', // RICE score
];

// jiraCfg shape:
// {
//   ideaSpace: string,           // project key (e.g. "DISC" or "KAN")
//   projectType: string,         // "product_discovery" | "software"
//   releaseField: string,        // field key for release tagging
//                                //   software default: "fixVersions"
//                                //   JPD default: "customfield_10055" (Roadmap) or user-created "Target Release"
//   sizeField: string | null,    // field key for T-shirt size (user-added number field)
//   statusMap: object,           // { New, Backlog, ToDo, Doing, Done } → Jira status names
//   reachField: string,          // default: customfield_10056 (JPD native) or user-added
//   impactField: string,         // default: customfield_10053
//   effortField: string,         // default: customfield_10064
//   confidenceField: string,     // default: customfield_10066
// }

function extractRelease(fields, releaseField) {
  if (!releaseField) return null;
  const val = fields[releaseField];
  if (!val) return null;
  // fixVersions → array of {id, name}
  if (Array.isArray(val)) return val[0]?.id ?? null;
  // option field (Roadmap, Target Release) → {id, value}
  if (typeof val === 'object') return val.id ?? val.value ?? null;
  return String(val);
}

async function fetchIdeas(jiraCfg, ideaTeams = {}, ideaSizes = {}) {
  if (!jiraCfg?.ideaSpace) return [];

  const { sizeField, releaseField, reachField, impactField, effortField, confidenceField } = jiraCfg;
  const extraFields = [sizeField, releaseField, reachField, impactField, effortField, confidenceField]
    .filter(Boolean)
    .filter(f => !JIRA_FIELDS.includes(f));
  const fields = [...JIRA_FIELDS, ...extraFields];
  const jqlRaw = `project = "${jiraCfg.ideaSpace}" AND issuetype = Idea ORDER BY rank ASC`;
  const jql = encodeURIComponent(jqlRaw);

  // Try GET search first (standard), fall back to POST if 410 Gone (newer Jira builds)
  let res = await asUser().requestJira(
    route`/rest/api/3/search?jql=${jql}&maxResults=200&fields=${fields.join(',')}`,
    { headers: { Accept: 'application/json' } }
  );

  if (res.status === 410 || res.status === 404) {
    // Newer Jira: POST /rest/api/3/search/jql
    res = await asUser().requestJira(route`/rest/api/3/search/jql`, {
      method: 'POST',
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ jql: jqlRaw, maxResults: 200, fields }),
    });
  }

  if (!res.ok) return [];
  const body = await res.json();
  return (body.issues || []).map(i => ({
    id: i.id,
    key: i.key,
    title: i.fields.summary,
    status: i.fields.status?.name ?? null,
    // App-stored overrides take precedence over Jira field values
    team: ideaTeams[i.key] ?? (i.fields.customfield_10001?.id ?? null),
    teamName: ideaTeams[i.key] ? null : (i.fields.customfield_10001?.name ?? null),
    size: ideaSizes[i.key] !== undefined ? ideaSizes[i.key] : (sizeField ? (i.fields[sizeField] ?? null) : null),
    release: extractRelease(i.fields, releaseField),
    reach: i.fields[reachField ?? 'customfield_10056'] ?? null,
    impact: i.fields[impactField ?? 'customfield_10053'] ?? null,
    effort: i.fields[effortField ?? 'customfield_10064'] ?? null,
    confidence: i.fields[confidenceField ?? 'customfield_10066'] ?? null,
    riceScore: i.fields.customfield_10068 ?? null,
  }));
}

async function fetchVersions(jiraCfg) {
  if (!jiraCfg?.ideaSpace) return [];
  const res = await asUser().requestJira(
    route`/rest/api/3/project/${jiraCfg.ideaSpace}/versions`,
    { headers: { Accept: 'application/json' } }
  );
  if (!res.ok) return [];
  const body = await res.json();
  return (body || []).map(v => ({ id: v.id, name: v.name, released: v.released, archived: v.archived }));
}

resolver.define('getAll', async ({ payload }) => {
  const versionId = payload?.versionId ?? null;
  const [myselfRes, releaseRecord, configRecord, ideaTeams, ideaSizes] = await Promise.all([
    asUser().requestJira(route`/rest/api/3/myself`, { headers: { Accept: 'application/json' } }),
    versionId ? kvs.get(`release:${versionId}`) : Promise.resolve(null),
    kvs.get('config'),
    kvs.get('ideaTeams'),
    kvs.get('ideaSizes'),
  ]);
  const myself = myselfRes.ok ? await myselfRes.json() : {};
  const currentUser = { accountId: myself.accountId ?? null, displayName: myself.displayName ?? null };

  const config = configRecord ?? {
    scale: { XS: 1, S: 3, M: 8, L: 13, XL: 21 },
    threshold: 70,
    editors: [],
    teams: [],    // [{id, name, sprintWeeks, sprintCap, sprintsPerRelease}] — manual, no Teams API
    jiraCfg: null,
  };

  const release = releaseRecord ?? {
    capacityByTeam: {},
    threshold: config.threshold,
    sprintSelectionByTeam: {},
  };

  const [ideas, versions] = await Promise.all([
    fetchIdeas(config.jiraCfg, ideaTeams ?? {}, ideaSizes ?? {}),
    fetchVersions(config.jiraCfg),
  ]);

  return { ideas, teams: config.teams ?? [], versions, release, config, currentUser };
});

resolver.define('saveCapacity', async ({ payload }) => {
  const { versionId, capacityByTeam, threshold } = payload;
  const existing = (await kvs.get(`release:${versionId}`)) ?? {};
  await kvs.set(`release:${versionId}`, { ...existing, capacityByTeam, threshold });
  return { ok: true };
});

resolver.define('saveConfig', async ({ payload }) => {
  await kvs.set('config', payload);
  return { ok: true };
});

resolver.define('saveJiraCfg', async ({ payload }) => {
  const config = (await kvs.get('config')) ?? {};
  await kvs.set('config', { ...config, jiraCfg: payload });
  return { ok: true };
});

// Validate Jira config — called by the Jira tab before enabling Save
resolver.define('validateJiraCfg', async ({ payload }) => {
  const { ideaSpace, sizeField, statusMap } = payload;
  const errors = [];

  // Check project exists and has Idea issue type
  try {
    const res = await asUser().requestJira(
      route`/rest/api/3/project/${ideaSpace}`,
      { headers: { Accept: 'application/json' } }
    );
    if (!res.ok) {
      errors.push(`Space "${ideaSpace}" not found or not accessible.`);
    } else {
      const body = await res.json();
      const hasIdea = (body.issueTypes || []).some(t => t.name === 'Idea');
      if (!hasIdea) errors.push(`Space "${ideaSpace}" does not have an Idea issue type.`);
    }
  } catch (e) {
    errors.push(`Could not reach space "${ideaSpace}": ${e.message}`);
  }

  // Check size field exists (if configured)
  if (sizeField) {
    try {
      const res = await asUser().requestJira(
        route`/rest/api/3/field`,
        { headers: { Accept: 'application/json' } }
      );
      const fields = await res.json();
      const found = (fields || []).some(f => f.key === sizeField || f.id === sizeField);
      if (!found) errors.push(`Size field "${sizeField}" not found in this Jira instance.`);
    } catch (e) {
      errors.push(`Could not verify size field: ${e.message}`);
    }
  }

  return { valid: errors.length === 0, errors };
});

// Returns everything the Jira Config screen needs on load
resolver.define('getJiraSetup', async () => {
  const [projectsRes, fieldsRes, configRecord] = await Promise.all([
    asUser().requestJira(route`/rest/api/3/project`, { headers: { Accept: 'application/json' } }),
    asUser().requestJira(route`/rest/api/3/field`, { headers: { Accept: 'application/json' } }),
    kvs.get('config'),
  ]);
  const projects = projectsRes.ok ? await projectsRes.json() : [];
  const fields = fieldsRes.ok ? await fieldsRes.json() : [];
  const config = configRecord ?? {};
  return {
    projects: projects.map(p => ({ key: p.key, name: p.name, type: p.projectTypeKey, style: p.style })),
    allFields: fields.filter(f => f.custom).map(f => ({ key: f.key || f.id, name: f.name, type: f.schema?.type })),
    jiraCfg: config.jiraCfg ?? null,
  };
});

// Returns issue types, statuses, and Idea field schema for a specific project
resolver.define('getProjectDetails', async ({ payload }) => {
  const { projectKey } = payload;
  const [projRes, statusRes, metaRes] = await Promise.all([
    asUser().requestJira(route`/rest/api/3/project/${projectKey}`, { headers: { Accept: 'application/json' } }),
    asUser().requestJira(route`/rest/api/3/project/${projectKey}/statuses`, { headers: { Accept: 'application/json' } }),
    asUser().requestJira(
      route`/rest/api/3/issue/createmeta?projectKeys=${projectKey}&issuetypeNames=Idea&expand=projects.issuetypes.fields`,
      { headers: { Accept: 'application/json' } }
    ),
  ]);
  const proj = projRes.ok ? await projRes.json() : {};
  const statusBody = statusRes.ok ? await statusRes.json() : [];
  const metaBody = metaRes.ok ? await metaRes.json() : {};
  const ideaType = (metaBody.projects?.[0]?.issuetypes || []).find(t => t.name === 'Idea');
  const ideaFields = Object.entries(ideaType?.fields || {}).map(([k, f]) => ({
    key: k, name: f.name, type: f.schema?.type,
  }));
  const statuses = [...new Set((statusBody || []).flatMap(t => (t.statuses || []).map(s => s.name)))];
  return {
    projectType: proj.projectTypeKey,
    hasIdeaType: (proj.issueTypes || []).some(t => t.name === 'Idea'),
    statuses,
    ideaFields,
  };
});

// Assign a team to an idea — stored in Forge Storage (not Jira's team field).
// Jira's customfield_10001 requires real Atlassian team UUIDs; our config teams
// use app-generated IDs, so we own team assignment here and overlay on getAll.
resolver.define('updateIdeaTeam', async ({ payload }) => {
  const { issueKey, teamId } = payload;
  const existing = (await kvs.get('ideaTeams')) ?? {};
  if (teamId) {
    existing[issueKey] = teamId;
  } else {
    delete existing[issueKey];
  }
  await kvs.set('ideaTeams', existing);
  return { ok: true };
});

// Tag an idea to a release version — async, no save button
resolver.define('updateIdeaRelease', async ({ payload }) => {
  const { issueKey, versionId } = payload;
  const configRecord = await kvs.get('config');
  const releaseField = configRecord?.jiraCfg?.releaseField;
  if (!releaseField) return { ok: false, error: 'No release field configured' };

  // Build field value based on field type (fixVersions = array, option = object)
  let fieldValue;
  if (releaseField === 'fixVersions') {
    fieldValue = versionId ? [{ id: versionId }] : [];
  } else {
    // Option/select field
    fieldValue = versionId ? { id: versionId } : null;
  }

  const res = await asUser().requestJira(route`/rest/api/3/issue/${issueKey}`, {
    method: 'PUT',
    headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: { [releaseField]: fieldValue } }),
  });
  return { ok: res.ok, status: res.status };
});

// Create a new Idea in the configured idea space
resolver.define('createIdea', async ({ payload }) => {
  const configRecord = await kvs.get('config');
  const jiraCfg = configRecord?.jiraCfg;
  if (!jiraCfg?.ideaSpace) return { ok: false, error: 'No idea space configured' };
  const { title, size, releaseId, teamId } = payload;
  const fields = {
    project: { key: jiraCfg.ideaSpace },
    issuetype: { name: 'Idea' },
    summary: title,
  };
  if (size != null && jiraCfg.sizeField) fields[jiraCfg.sizeField] = size;
  if (releaseId && jiraCfg.releaseField) {
    fields[jiraCfg.releaseField] = jiraCfg.releaseField === 'fixVersions'
      ? [{ id: releaseId }]
      : { id: releaseId };
  }
  if (teamId) fields['customfield_10001'] = { id: teamId };
  const res = await asUser().requestJira(route`/rest/api/3/issue`, {
    method: 'POST',
    headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields }),
  });
  const body = await res.json();
  return { ok: res.ok, key: body.key ?? null, error: body.errorMessages?.[0] ?? null };
});

// Update T-shirt size — stored in Forge Storage for guaranteed persistence,
// and also attempted as a Jira field write (best-effort).
resolver.define('updateIdeaSize', async ({ payload }) => {
  const { issueKey, points } = payload;

  // Always persist in Forge Storage first
  const existing = (await kvs.get('ideaSizes')) ?? {};
  if (points != null) {
    existing[issueKey] = points;
  } else {
    delete existing[issueKey];
  }
  await kvs.set('ideaSizes', existing);

  // Best-effort Jira write (no sizeField configured = silently skip)
  const configRecord = await kvs.get('config');
  const sizeField = configRecord?.jiraCfg?.sizeField;
  if (sizeField) {
    await asUser().requestJira(route`/rest/api/3/issue/${issueKey}`, {
      method: 'PUT',
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: { [sizeField]: points ?? null } }),
    }).catch(() => {}); // non-fatal
  }

  return { ok: true };
});

// Update summary (title) of an idea
resolver.define('updateIdeaSummary', async ({ payload }) => {
  const { issueKey, summary } = payload;
  const res = await asUser().requestJira(route`/rest/api/3/issue/${issueKey}`, {
    method: 'PUT',
    headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: { summary } }),
  });
  return { ok: res.ok };
});

// Delete an idea
resolver.define('deleteIdea', async ({ payload }) => {
  const { issueKey } = payload;
  const res = await asUser().requestJira(route`/rest/api/3/issue/${issueKey}`, {
    method: 'DELETE',
    headers: { Accept: 'application/json' },
  });
  return { ok: res.ok, status: res.status };
});

// Update RICE fields on an idea
resolver.define('updateIdeaRice', async ({ payload }) => {
  const { issueKey, reach, impact, effort, confidence } = payload;
  const configRecord = await kvs.get('config');
  const jiraCfg = configRecord?.jiraCfg;
  const fields = {};
  if (reach != null) fields[jiraCfg?.reachField ?? 'customfield_10056'] = reach;
  if (impact != null) fields[jiraCfg?.impactField ?? 'customfield_10053'] = impact;
  if (effort != null) fields[jiraCfg?.effortField ?? 'customfield_10064'] = effort;
  if (confidence != null) fields[jiraCfg?.confidenceField ?? 'customfield_10066'] = confidence;
  const res = await asUser().requestJira(route`/rest/api/3/issue/${issueKey}`, {
    method: 'PUT',
    headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields }),
  });
  return { ok: res.ok, status: res.status };
});

// Transition an idea's status
resolver.define('transitionIdea', async ({ payload }) => {
  const { issueKey, targetStatus } = payload;
  const configRecord = await kvs.get('config');
  const jiraCfg = configRecord?.jiraCfg;
  const statusMap = jiraCfg?.statusMap ?? {};
  const jiraStatusName = statusMap[targetStatus] ?? targetStatus;
  // Get available transitions
  const tRes = await asUser().requestJira(
    route`/rest/api/3/issue/${issueKey}/transitions`,
    { headers: { Accept: 'application/json' } }
  );
  const tBody = await tRes.json();
  const transition = (tBody.transitions || []).find(t => t.to?.name === jiraStatusName);
  if (!transition) return { ok: false, error: `No transition to "${jiraStatusName}"` };
  const res = await asUser().requestJira(route`/rest/api/3/issue/${issueKey}/transitions`, {
    method: 'POST',
    headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ transition: { id: transition.id } }),
  });
  return { ok: res.ok };
});

// User search for the Access Control picker
resolver.define('searchUsers', async ({ payload }) => {
  const q = encodeURIComponent((payload?.query ?? '').trim());
  if (!q) return [];
  const res = await asUser().requestJira(
    route`/rest/api/3/user/picker?query=${q}&maxResults=10`,
    { headers: { Accept: 'application/json' } }
  );
  if (!res.ok) return [];
  const body = await res.json();
  return (body.users || []).map(u => ({
    accountId: u.accountId,
    displayName: u.displayName,
    emailAddress: u.emailAddress ?? null,
    avatarUrl: u.avatarUrl ?? null,
  }));
});

// Resolve stored account IDs → display info on Config tab load
resolver.define('resolveUsers', async ({ payload }) => {
  const ids = payload?.accountIds ?? [];
  if (!ids.length) return [];
  const results = await Promise.all(ids.map(async id => {
    try {
      const res = await asUser().requestJira(
        route`/rest/api/3/user?accountId=${id}`,
        { headers: { Accept: 'application/json' } }
      );
      if (!res.ok) return null;
      const u = await res.json();
      return { accountId: u.accountId, displayName: u.displayName, emailAddress: u.emailAddress ?? null };
    } catch { return null; }
  }));
  return results.filter(Boolean);
});

exports.handler = resolver.getDefinitions();
