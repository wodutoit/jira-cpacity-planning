const Resolver = require('@forge/resolver').default;
const { kvs } = require('@forge/kvs');
const { route, asUser, asApp, webTrigger } = require('@forge/api');

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
  'customfield_10001', // Team (Atlas team picker default)
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
//   releaseSpace: string,        // project key of the space with REAL Jira Versions
//                                //   (dates, released/archived) — must be non-JPD.
//                                //   Falls back to ideaSpace if unset (simple same-project setups).
//   releaseSpaceField: string,   // almost always "fixVersions" — kept editable for rare
//                                //   projects that track releases some other way.
//   releaseField: string,        // field key on the IDEA that stores its target release.
//                                //   software default: "fixVersions" (works directly when
//                                //   ideaSpace === releaseSpace). Otherwise written/read by
//                                //   NAME, since the version id belongs to the release
//                                //   space's project, not the idea's own — this applies
//                                //   both to a JPD "Target Release" select field AND to a
//                                //   real Version Picker custom field on a software idea
//                                //   space (see extractRelease/getFieldSchema/resolveVersionName).
//   teamField: string,           // field key on the IDEA that stores its team assignment.
//                                //   Defaults to "customfield_10001" (Atlas Team picker).
//                                //   Written when a team is assigned via updateIdeaTeam.
//   sizeField: string | null,    // field key for T-shirt size (user-added number field)
//   statusMap: object,           // { New, Backlog, ToDo, Doing, Done } → Jira status names
//   reachField: string,          // default: customfield_10056 (JPD native) or user-added
//   impactField: string,         // default: customfield_10053
//   effortField: string,         // default: customfield_10064
//   confidenceField: string,     // default: customfield_10066
// }

// Resolve a raw idea-side release-field value to a REAL Jira Version id from the
// configured release space. Same-project fixVersions already carries a real version
// id directly. Everywhere else (a JPD "Target Release" select field, or any idea-side
// field that isn't fixVersions on the release space's own project) only carries a
// label/name — those are matched by NAME against the release space's version list so
// the rest of the app can keep treating `idea.release` as a real version id uniformly.
function extractRelease(fields, releaseField, versionsByName, versionIds) {
  if (!releaseField) return null;
  const val = fields[releaseField];
  if (!val) return null;
  let rawId = null, rawName = null;
  if (Array.isArray(val)) { rawId = val[0]?.id ?? null; rawName = val[0]?.name ?? null; }
  else if (typeof val === 'object') { rawId = val.id ?? null; rawName = val.value ?? val.name ?? null; }
  else { rawName = String(val); }

  if (rawId && versionIds?.has(rawId)) return rawId;
  if (rawName && versionsByName?.has(rawName)) return versionsByName.get(rawName);
  return rawId ?? rawName ?? null;
}

async function fetchIdeas(jiraCfg, ideaTeams = {}, ideaSizes = {}, ideaOrder = [], versions = [], teams = []) {
  if (!jiraCfg?.ideaSpace) return [];
  const versionsByName = new Map(versions.map(v => [v.name, v.id]));
  const versionIds = new Set(versions.map(v => v.id));

  const teamField = jiraCfg.teamField || 'customfield_10001';
  // Jira team field → app team id lookups. Support both:
  // - ID match (Atlas team picker): jiraIdToAppId
  // - Name match (Select field): teamNameToAppId — for Select fields the value is {value: "Team Name"}
  const jiraIdToAppId = new Map(teams.filter(t => t.teamJiraId).map(t => [t.teamJiraId, t.id]));
  const teamNameToAppId = new Map(teams.map(t => [t.name.toLowerCase(), t.id]));

  const { sizeField, releaseField, reachField, impactField, effortField, confidenceField } = jiraCfg;
  const extraFields = [sizeField, releaseField, reachField, impactField, effortField, confidenceField, teamField]
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
  const orderMap = Object.fromEntries(ideaOrder.map((k, i) => [k, i]));
  const mapped = (body.issues || []).map(i => ({
    id: i.id,
    key: i.key,
    title: i.fields.summary,
    status: i.fields.status?.name ?? null,
    // Jira is the source of truth for team assignment.
    // raw === null  → field exists, explicitly empty → no team (don't fall back to stale KVS)
    // raw === undefined → field wasn't in the response → fall back to KVS only in this case
    // raw === object → extract team from field value
    team: (() => {
      const raw = i.fields[teamField];
      if (raw === undefined) return ideaTeams[i.key] ?? null; // field not fetched — KVS fallback
      if (!raw) return null; // field empty — explicitly no team, ignore any stale KVS entry
      // Select field: {value: "Team Name", id: "option-id"} — match by value/name
      if (raw.value != null) return teamNameToAppId.get(String(raw.value).toLowerCase()) ?? null;
      // Atlas team picker / other: match by ID then name
      const id = raw?.id ?? raw?.teamId;
      if (id) { const byId = jiraIdToAppId.get(id); if (byId) return byId; }
      const name = raw?.displayName ?? raw?.name;
      if (name) { const byName = teamNameToAppId.get(name.toLowerCase()); if (byName) return byName; }
      return null;
    })(),
    teamName: (() => {
      const raw = i.fields[teamField];
      if (raw) return raw?.value ?? raw?.displayName ?? raw?.name ?? null;
      return null;
    })(),
    size: ideaSizes[i.key] !== undefined ? ideaSizes[i.key] : (sizeField ? (i.fields[sizeField] ?? null) : null),
    release: extractRelease(i.fields, releaseField, versionsByName, versionIds),
    reach: i.fields[reachField ?? 'customfield_10056'] ?? null,
    impact: i.fields[impactField ?? 'customfield_10053'] ?? null,
    effort: i.fields[effortField ?? 'customfield_10064'] ?? null,
    confidence: i.fields[confidenceField ?? 'customfield_10066'] ?? null,
    riceScore: i.fields.customfield_10068 ?? null,
    _rank: orderMap[i.key] ?? 99999,
  }));
  return mapped.sort((a, b) => a._rank - b._rank);
}

// Releases/versions come from the configured "release space" — a real project with
// native Jira Versions (dates, released/archived state). Falls back to the idea space
// itself for setups where that project already IS a suitable non-JPD release tracker.
async function fetchVersions(jiraCfg) {
  const projectKey = jiraCfg?.releaseSpace || jiraCfg?.ideaSpace;
  if (!projectKey) return [];
  const res = await asUser().requestJira(
    route`/rest/api/3/project/${projectKey}/versions`,
    { headers: { Accept: 'application/json' } }
  );
  if (!res.ok) return [];
  const body = await res.json();
  return (body || []).map(v => ({ id: v.id, name: v.name, released: v.released, archived: v.archived, releaseDate: v.releaseDate ?? null }));
}

// Single-version lookup (by id, no project key needed) — used to resolve a version's
// NAME when writing the idea-side release field on a project that isn't the release
// space itself (JPD select fields write by label, not by the release space's version id).
async function resolveVersionName(versionId) {
  const res = await asUser().requestJira(route`/rest/api/3/version/${versionId}`, { headers: { Accept: 'application/json' } });
  if (!res.ok) return null;
  const body = await res.json();
  return body.name ?? null;
}

// The idea-side release field can be a genuine Jira "version" field (a Version Picker
// custom field, or fixVersions itself) or a plain option/select field (JPD's "Target
// Release"). Both are written by NAME so Jira resolves the version within the ISSUE's
// own project — but the two field kinds expect different JSON shapes, so the field's
// schema has to be checked rather than assumed.
async function getFieldSchema(fieldKey) {
  if (!fieldKey || fieldKey === 'fixVersions') return { type: 'array', items: 'version' };
  const res = await asUser().requestJira(route`/rest/api/3/field`, { headers: { Accept: 'application/json' } });
  if (!res.ok) return null;
  const fields = await res.json();
  const field = (fields || []).find(f => f.key === fieldKey || f.id === fieldKey);
  return field?.schema ?? null;
}

function buildReleaseFieldValue(schema, name) {
  if (schema?.type === 'array' && schema?.items === 'version') return name ? [{ name }] : [];
  if (schema?.type === 'version') return name ? { name } : null;
  return name ? { value: name } : null;
}

resolver.define('getAll', async ({ payload }) => {
  const versionId = payload?.versionId ?? null;
  const [myselfRes, releaseRecord, configRecord, ideaTeams, ideaSizes, ideaOrder] = await Promise.all([
    asUser().requestJira(route`/rest/api/3/myself`, { headers: { Accept: 'application/json' } }),
    versionId ? kvs.get(`release:${versionId}`) : Promise.resolve(null),
    kvs.get('config'),
    kvs.get('ideaTeams'),
    kvs.get('ideaSizes'),
    kvs.get('ideaOrder'),
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

  // Versions must be fetched first — fetchIdeas needs the release space's version
  // list to resolve idea-side release-field values (which may be names, not ids) to
  // real version ids.
  const versions = await fetchVersions(config.jiraCfg);
  const ideas = await fetchIdeas(config.jiraCfg, ideaTeams ?? {}, ideaSizes ?? {}, ideaOrder ?? [], versions, config.teams ?? []);

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
  const { ideaSpace, releaseSpace, releaseSpaceField, sizeField, statusMap } = payload;
  const errors = [];

  if (!releaseSpaceField) errors.push('Release space field is required.');

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

  // Release space is optional (falls back to the idea space) — only validate it if set
  if (releaseSpace) {
    try {
      const res = await asUser().requestJira(
        route`/rest/api/3/project/${releaseSpace}`,
        { headers: { Accept: 'application/json' } }
      );
      if (!res.ok) {
        errors.push(`Release space "${releaseSpace}" not found or not accessible.`);
      } else {
        const body = await res.json();
        if (body.projectTypeKey === 'product_discovery') {
          errors.push(`Release space "${releaseSpace}" is a Jira Product Discovery project — it can't manage real Jira Versions. Pick a Jira Software or Business project.`);
        }
      }
    } catch (e) {
      errors.push(`Could not reach release space "${releaseSpace}": ${e.message}`);
    }
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

// Returns the field schema available on a project, merged across all its issue types —
// unlike getProjectDetails' ideaFields, this isn't scoped to the "Idea" issue type, since
// the release space project usually has no Idea type at all (fixVersions still applies).
resolver.define('getProjectFields', async ({ payload }) => {
  const { projectKey } = payload;
  const metaRes = await asUser().requestJira(
    route`/rest/api/3/issue/createmeta?projectKeys=${projectKey}&expand=projects.issuetypes.fields`,
    { headers: { Accept: 'application/json' } }
  );
  const metaBody = metaRes.ok ? await metaRes.json() : {};
  const issueTypes = metaBody.projects?.[0]?.issuetypes ?? [];
  const fieldsByKey = new Map();
  for (const it of issueTypes) {
    for (const [key, f] of Object.entries(it.fields ?? {})) {
      if (!fieldsByKey.has(key)) fieldsByKey.set(key, { key, name: f.name, type: f.schema?.type });
    }
  }
  return { fields: [...fieldsByKey.values()] };
});

// Assign a team to an idea — stored in Forge Storage AND written to Jira's team field.
// Assign a team to an idea — updates both app storage and Jira's team field.
// If the team has no teamJiraId cached, we search existing ideas for a matching team
// name and extract the ID on the fly, then cache it for future writes.
resolver.define('updateIdeaTeam', async ({ payload }) => {
  const { issueKey, teamId } = payload;

  // Always update app storage first — the planning UI is authoritative regardless.
  const existing = (await kvs.get('ideaTeams')) ?? {};
  if (teamId) { existing[issueKey] = teamId; }
  else { delete existing[issueKey]; }
  await kvs.set('ideaTeams', existing);

  const configRecord = await kvs.get('config');
  const teamField = configRecord?.jiraCfg?.teamField || 'customfield_10001';
  const ideaSpace = configRecord?.jiraCfg?.ideaSpace;
  const teams = configRecord?.teams ?? [];
  const team = teams.find(t => t.id === teamId);

  // Clearing the team
  if (!teamId) {
    try {
      const res = await asUser().requestJira(route`/rest/api/3/issue/${issueKey}`, {
        method: 'PUT',
        headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: { [teamField]: null } }),
      });
      return { ok: true, jiraUpdated: res.ok };
    } catch (e) {
      return { ok: true, jiraUpdated: false, jiraError: e.message };
    }
  }

  let teamJiraId = team?.teamJiraId ?? null;

  // If no cached teamJiraId, search existing ideas for a team with a matching name
  // and extract the real ID from the Jira field — cache it on the team for next time.
  if (!teamJiraId && team?.name && ideaSpace) {
    try {
      const jqlRaw = `project = "${ideaSpace}" AND issuetype = Idea`;
      const jql = encodeURIComponent(jqlRaw);
      const res = await asUser().requestJira(
        route`/rest/api/3/search?jql=${jql}&maxResults=200&fields=${teamField}`,
        { headers: { Accept: 'application/json' } }
      );
      if (res.ok) {
        const body = await res.json();
        outer: for (const issue of body.issues ?? []) {
          const raw = issue.fields?.[teamField];
          const vals = Array.isArray(raw) ? raw : (raw ? [raw] : []);
          for (const val of vals) {
            const id = val?.teamId ?? val?.id;
            const name = val?.displayName ?? val?.name;
            if (id && name && name.toLowerCase() === team.name.toLowerCase()) {
              teamJiraId = id;
              // Cache on the team config so future writes skip this search.
              const updatedTeams = teams.map(t => t.id === teamId ? { ...t, teamJiraId: id } : t);
              await kvs.set('config', { ...configRecord, teams: updatedTeams });
              break outer;
            }
          }
        }
      }
    } catch { /* best effort */ }
  }

  // Determine write value from field schema:
  // - Select (option): write {value: teamName} — always works, no ID needed.
  // - Array of options: write [{value: teamName}].
  // - Team picker: requires the canonical Atlas team ID from the Teams API, which Forge
  //   blocks. Falls back to ID attempt if available; advise using a Select field instead.
  // - Unknown/string: write name as string.
  let fieldValue;
  const schema = await getFieldSchema(teamField).catch(() => null);
  const schemaType = schema?.type;
  const schemaItems = schema?.items;

  if (schemaType === 'option') {
    fieldValue = { value: team?.name ?? teamId };
  } else if (schemaType === 'array' && schemaItems === 'option') {
    fieldValue = [{ value: team?.name ?? teamId }];
  } else if (schemaType === 'string') {
    fieldValue = team?.name ?? teamId;
  } else if (teamJiraId) {
    // Atlas Team picker or unknown — attempt by ID (fails if it's the Atlas picker without
    // a proper Atlas team UUID; see jiraError for details and suggested fix).
    const ari = teamJiraId.startsWith('ari:') ? teamJiraId : `ari:cloud:identity::team/${teamJiraId}`;
    fieldValue = { id: ari };
  } else {
    return {
      ok: true, jiraUpdated: false,
      jiraError: `Cannot write to field "${teamField}" (type: ${schemaType ?? 'unknown'}). The Atlas Team picker requires an Atlas team ID that Forge cannot retrieve. Switch the Team Field in Jira Config to a Select List custom field with team names as options.`,
    };
  }

  try {
    const res = await asUser().requestJira(route`/rest/api/3/issue/${issueKey}`, {
      method: 'PUT',
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: { [teamField]: fieldValue } }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return { ok: true, jiraUpdated: false, jiraError: `Jira returned ${res.status}: ${text.slice(0, 200)}` };
    }
    return { ok: true, jiraUpdated: true };
  } catch (e) {
    return { ok: true, jiraUpdated: false, jiraError: e.message };
  }
});

// Tag an idea to a release version — async, no save button
resolver.define('updateIdeaRelease', async ({ payload }) => {
  const { issueKey, versionId } = payload;
  const configRecord = await kvs.get('config');
  const releaseField = configRecord?.jiraCfg?.releaseField;
  if (!releaseField) return { ok: false, error: 'No release field configured' };

  // fixVersions on the release space's own project accepts a real version id directly.
  // Any other field — a Version Picker custom field or a JPD "Target Release" select —
  // writes by NAME, since the version id belongs to a different project's version list;
  // the exact JSON shape depends on the field's schema (see buildReleaseFieldValue).
  let fieldValue;
  if (releaseField === 'fixVersions') {
    fieldValue = versionId ? [{ id: versionId }] : [];
  } else {
    const schema = await getFieldSchema(releaseField);
    if (versionId) {
      const name = await resolveVersionName(versionId);
      if (!name) return { ok: false, error: 'Could not resolve the selected release.' };
      fieldValue = buildReleaseFieldValue(schema, name);
    } else {
      fieldValue = buildReleaseFieldValue(schema, null);
    }
  }

  const res = await asUser().requestJira(route`/rest/api/3/issue/${issueKey}`, {
    method: 'PUT',
    headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: { [releaseField]: fieldValue } }),
  });
  return { ok: res.ok, status: res.status };
});

// Change a release's target date directly on the real Jira Version (release space).
// Surfaced from the "target date is later than the final sprint" conflict banner.
resolver.define('updateVersionReleaseDate', async ({ payload }) => {
  const { versionId, releaseDate } = payload;
  if (!versionId) return { ok: false, error: 'No version specified' };
  const res = await asUser().requestJira(route`/rest/api/3/version/${versionId}`, {
    method: 'PUT',
    headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ releaseDate: releaseDate || null }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    return { ok: false, error: `${res.status} ${text.slice(0, 200)}` };
  }
  return { ok: true };
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
    if (jiraCfg.releaseField === 'fixVersions') {
      fields[jiraCfg.releaseField] = [{ id: releaseId }];
    } else {
      const name = await resolveVersionName(releaseId);
      if (name) {
        const schema = await getFieldSchema(jiraCfg.releaseField);
        const value = buildReleaseFieldValue(schema, name);
        if (value != null && (!Array.isArray(value) || value.length)) fields[jiraCfg.releaseField] = value;
      }
    }
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

// Persist idea display order
resolver.define('updateIdeaOrder', async ({ payload }) => {
  await kvs.set('ideaOrder', payload.order ?? []);
  return { ok: true };
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

// Shared: move an issue to the Jira status with the given name (used by transitionIdea
// and by convertIdea, which auto-advances an idea to "Doing" on conversion).
async function transitionIssueTo(issueKey, jiraStatusName) {
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
}

// Transition an idea's status
resolver.define('transitionIdea', async ({ payload }) => {
  const { issueKey, targetStatus } = payload;
  const configRecord = await kvs.get('config');
  const jiraCfg = configRecord?.jiraCfg;
  const statusMap = jiraCfg?.statusMap ?? {};
  const jiraStatusName = statusMap[targetStatus] ?? targetStatus;
  return transitionIssueTo(issueKey, jiraStatusName);
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

// Fetch all boards the current user can access (used by Config tab board mapping).
// No type filter — Next-gen and team-managed boards report as "software" not "scrum".
resolver.define('getBoards', async () => {
  try {
    const res = await asUser().requestJira(
      route`/rest/agile/1.0/board?maxResults=50`,
      { headers: { Accept: 'application/json' } }
    );
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return { boards: [], error: `${res.status} ${text.slice(0, 120)}` };
    }
    const body = await res.json();
    return {
      boards: (body.values || []).map(b => ({
        id: b.id,
        name: b.name,
        type: b.type || '',
        projectKey: b.location?.projectKey || '',
        projectName: b.location?.projectName || '',
      })),
    };
  } catch (e) {
    return { boards: [], error: String(e.message || e) };
  }
});

// Search for Jira Atlas teams — used by the Config tab's team picker.
// Strategy:
// 1. Public Teams API: GET /gateway/api/public/teams/v1/org/{orgId}/teams?size=300
//    The orgId is retrieved via /rest/api/3/serverInfo (cloudId). Response has
//    entities[].{teamId, displayName}.
// Returns the allowed values (options) for the configured team Select field.
// These are the values users can pick when adding teams in the Config tab.
// Reads from the Idea issue type's field metadata — the same source used by getProjectDetails.
resolver.define('getJiraTeams', async () => {
  const configRecord = await kvs.get('config');
  const ideaSpace = configRecord?.jiraCfg?.ideaSpace;
  const teamField = configRecord?.jiraCfg?.teamField || 'customfield_10001';
  if (!ideaSpace) return { teams: [], error: 'No Idea Space configured in Jira Config.' };
  try {
    const metaRes = await asUser().requestJira(
      route`/rest/api/3/issue/createmeta?projectKeys=${ideaSpace}&issuetypeNames=Idea&expand=projects.issuetypes.fields`,
      { headers: { Accept: 'application/json' } }
    );
    if (!metaRes.ok) return { teams: [], error: `Could not load field metadata (${metaRes.status}).` };
    const meta = await metaRes.json();
    const ideaType = (meta.projects?.[0]?.issuetypes ?? []).find(t => t.name === 'Idea');
    const field = ideaType?.fields?.[teamField];
    if (!field) return { teams: [], error: `Field "${teamField}" not found on the Idea issue type.` };
    const allowedValues = field.allowedValues ?? [];
    if (!allowedValues.length) return { teams: [], error: `Field "${teamField}" has no configured options. Add team names as options in Jira's field configuration, then retry.` };
    const teams = allowedValues.map(v => ({ id: v.id, name: v.value ?? v.name }));
    return { teams };
  } catch (e) {
    return { teams: [], error: String(e.message || e) };
  }
});

// Load delivery planning data: sprints are ALWAYS fetched live from Jira — we never
// cache sprint objects in app storage, only the selection (team -> [sprintId]) and
// per-sprint capacity overrides (team:sprintId -> {pts, note}). Sprints in `selection`
// that no longer exist on the team's board are reported back as `missingByTeam` so the
// frontend can offer "recreate" or "remove from plan".
resolver.define('getDelivery', async ({ payload }) => {
  const { versionId } = payload;
  const config = (await kvs.get('config')) ?? {};
  const teams = config.teams ?? [];
  const stored = (await kvs.get(`delivery:${versionId}`)) ?? { selection: {}, overrides: {} };
  const selection = stored.selection || {};

  const sprintsByTeam = {};
  const teamsWithBoards = teams.filter(t => t.boardId);

  await Promise.all(teamsWithBoards.map(async team => {
    sprintsByTeam[team.id] = [];
    try {
      const sprintRes = await asUser().requestJira(
        route`/rest/agile/1.0/board/${team.boardId}/sprint?state=active,future,closed&maxResults=50`,
        { headers: { Accept: 'application/json' } }
      );
      if (sprintRes.ok) {
        const sprintData = await sprintRes.json();
        (sprintData.values || []).forEach(sp => {
          sprintsByTeam[team.id].push({
            id: sp.id,
            name: sp.name,
            goal: sp.goal || '',
            state: sp.state,
            startDate: sp.startDate || null,
            endDate: sp.endDate || null,
          });
        });
      }
    } catch (e) {
      console.error('Sprint fetch failed for team', team.id, e);
    }
  }));

  // For teams without a board, populate with empty array
  teams.forEach(t => { if (!sprintsByTeam[t.id]) sprintsByTeam[t.id] = []; });

  // Detect selected sprint IDs that no longer exist on the team's board
  const missingByTeam = {};
  teams.forEach(t => {
    const selIds = selection[t.id] || [];
    const liveIds = new Set((sprintsByTeam[t.id] || []).map(sp => sp.id));
    const missing = selIds.filter(id => !liveIds.has(id));
    if (missing.length) missingByTeam[t.id] = missing;
  });

  const noBoards = teamsWithBoards.length === 0;

  // Also load the release capacity for this version (used by coverage card)
  const releaseRecord = (await kvs.get(`release:${versionId}`)) ?? {};

  return {
    sprintsByTeam,
    selection,
    overrides: stored.overrides || {},
    missingByTeam,
    boardError: noBoards ? 'no_team_board' : null,
    releaseCapacity: releaseRecord.capacityByTeam || {},
  };
});

// Persist sprint selection + capacity overrides for a version. No sprint objects are stored —
// only IDs (selection) and pts/note keyed by team:sprintId (overrides).
resolver.define('saveDelivery', async ({ payload }) => {
  const { versionId, selection, overrides } = payload;
  const existing = (await kvs.get(`delivery:${versionId}`)) ?? {};
  await kvs.set(`delivery:${versionId}`, { ...existing, selection, overrides });
  return { ok: true };
});

// Returns a map of sprintId → versionId for all sprints allocated across ALL versions.
// Used to mark sprints in the sprint picker as readonly when they belong to another release.
resolver.define('getSprintAllocations', async ({ payload }) => {
  const { versionIds = [], currentVersionId } = payload;
  const allocations = {}; // sprintId → versionId
  await Promise.all(versionIds.map(async vId => {
    if (vId === currentVersionId) return; // skip the current version
    const data = await kvs.get(`delivery:${vId}`);
    if (!data?.selection) return;
    for (const sprintIds of Object.values(data.selection)) {
      for (const sid of (sprintIds || [])) {
        if (!allocations[sid]) allocations[sid] = vId;
      }
    }
  }));
  return { allocations };
});

// Edit a sprint's name/goal/dates via the Agile API (write:sprint:jira-software scope).
resolver.define('updateSprint', async ({ payload }) => {
  const { sprintId, name, goal, startDate, endDate } = payload;

  const body = { name };
  if (goal != null) body.goal = goal;
  if (startDate) body.startDate = new Date(startDate + 'T00:00:00.000Z').toISOString();
  if (endDate) body.endDate = new Date(endDate + 'T00:00:00.000Z').toISOString();

  // POST = partial update (only provided fields change). PUT is a full replace and
  // requires every field including `state`, which fails with "Sprint state is required".
  const res = await asUser().requestJira(route`/rest/agile/1.0/sprint/${sprintId}`, {
    method: 'POST',
    headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    return { ok: false, error: `${res.status} ${text.slice(0, 200)}` };
  }
  const sp = await res.json();
  return {
    ok: true,
    sprint: { id: sp.id, name: sp.name, goal: sp.goal || '', state: sp.state, startDate: sp.startDate || null, endDate: sp.endDate || null },
  };
});

// Create a real sprint on the team's Jira board (write:sprint:jira-software scope).
resolver.define('createSprint', async ({ payload }) => {
  const { boardId, name, goal, startDate, endDate } = payload;
  const body = { name, originBoardId: boardId };
  if (goal) body.goal = goal;
  if (startDate) body.startDate = new Date(startDate + 'T00:00:00.000Z').toISOString();
  if (endDate) body.endDate = new Date(endDate + 'T00:00:00.000Z').toISOString();

  const res = await asUser().requestJira(route`/rest/agile/1.0/sprint`, {
    method: 'POST',
    headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    return { ok: false, error: `${res.status} ${text.slice(0, 200)}` };
  }
  const sp = await res.json();
  return {
    ok: true,
    sprint: { id: sp.id, name: sp.name, goal: sp.goal || '', state: sp.state, startDate: sp.startDate || null, endDate: sp.endDate || null },
  };
});

// Delete a sprint if it has no issues. If it has issues, refuse and let the
// frontend point the user at the board instead (we don't silently bulk-move issues).
resolver.define('deleteSprint', async ({ payload }) => {
  const { sprintId } = payload;

  const issueRes = await asUser().requestJira(
    route`/rest/agile/1.0/sprint/${sprintId}/issue?maxResults=1&fields=key`,
    { headers: { Accept: 'application/json' } }
  );
  if (issueRes.ok) {
    const body = await issueRes.json();
    const count = body.total ?? (body.issues || []).length;
    if (count > 0) return { ok: false, nonEmpty: true, count };
  } else if (issueRes.status !== 404) {
    const text = await issueRes.text().catch(() => '');
    return { ok: false, error: `${issueRes.status} ${text.slice(0, 200)}` };
  }

  const delRes = await asUser().requestJira(route`/rest/agile/1.0/sprint/${sprintId}`, { method: 'DELETE' });
  if (!delRes.ok && delRes.status !== 404) {
    const text = await delRes.text().catch(() => '');
    return { ok: false, error: `${delRes.status} ${text.slice(0, 200)}` };
  }
  return { ok: true };
});

function adfDoc(text) {
  return {
    type: 'doc', version: 1,
    content: [{ type: 'paragraph', content: text ? [{ type: 'text', text }] : [] }],
  };
}

// Best-effort story-points write — field key varies per project/instance, so try the
// app's configured size field first, then Jira Cloud's common default, and swallow failures.
async function tryWritePoints(issueKey, points, sizeField) {
  const candidates = [sizeField, 'customfield_10016'].filter(Boolean);
  for (const field of candidates) {
    try {
      const res = await asUser().requestJira(route`/rest/api/3/issue/${issueKey}`, {
        method: 'PUT',
        headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: { [field]: points } }),
      });
      if (res.ok) return;
    } catch { /* try next candidate */ }
  }
}

// Load per-idea conversion status (flat map keyed by idea issue key — conversion state
// belongs to the idea, not to a specific release view).
resolver.define('getConversion', async () => {
  const conversion = (await kvs.get('conversion')) ?? {};
  return { conversion };
});

// Convert an idea into a real Jira Epic (+ child Stories split across sprints) or a
// single Story. Points are divided evenly across selected sprints (remainder to the
// earliest sprints), each story moved into its sprint via the Agile API.
resolver.define('convertIdea', async ({ payload }) => {
  const { ideaKey, boardId, issueType, name, description, sprintIds = [], points = 0 } = payload;
  const configRecord = await kvs.get('config');
  const jiraCfg = configRecord?.jiraCfg ?? {};

  if (!boardId) return { ok: false, error: 'This team has no Jira board linked. Set one on the Config page.' };

  // Resolve the project live from the board rather than trusting a cached team.projectKey,
  // which can be stale/missing for teams configured before board-mapping existed.
  const boardRes = await asUser().requestJira(route`/rest/agile/1.0/board/${boardId}`, { headers: { Accept: 'application/json' } });
  if (!boardRes.ok) return { ok: false, error: `Could not look up the linked board (${boardRes.status}).` };
  const boardBody = await boardRes.json();
  const projectKey = boardBody.location?.projectKey;
  if (!projectKey) return { ok: false, error: 'The linked board has no associated project.' };

  const createIssue = async (summary, parentKey) => {
    const fields = {
      project: { key: projectKey },
      issuetype: { name: parentKey ? 'Story' : issueType },
      summary,
      description: adfDoc(description),
    };
    if (parentKey) fields.parent = { key: parentKey };
    const res = await asUser().requestJira(route`/rest/api/3/issue`, {
      method: 'POST',
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields }),
    });
    const body = await res.json();
    if (!res.ok) {
      const fieldError = body.errors && Object.values(body.errors)[0];
      return { ok: false, error: body.errorMessages?.[0] ?? fieldError ?? `${res.status}` };
    }
    return { ok: true, key: body.key };
  };

  const moveToSprint = (issueKey, sprintId) =>
    asUser().requestJira(route`/rest/agile/1.0/sprint/${sprintId}/issue`, {
      method: 'POST',
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ issues: [issueKey] }),
    }).catch(() => {});

  let epicKey = null;
  const storyKeys = [];

  if (issueType === 'Epic') {
    const epic = await createIssue(name, null);
    if (!epic.ok) return { ok: false, error: epic.error };
    epicKey = epic.key;

    if (sprintIds.length) {
      const per = Math.floor(points / sprintIds.length);
      const rem = points - per * sprintIds.length;
      for (let i = 0; i < sprintIds.length; i++) {
        const story = await createIssue(`${name} — part ${i + 1}`, epicKey);
        if (!story.ok) continue; // best-effort — one failed child shouldn't block the rest
        const storyPts = per + (i < rem ? 1 : 0);
        await tryWritePoints(story.key, storyPts, jiraCfg.sizeField);
        await moveToSprint(story.key, sprintIds[i]);
        storyKeys.push(story.key);
      }
    }
  } else {
    const story = await createIssue(name, null);
    if (!story.ok) return { ok: false, error: story.error };
    await tryWritePoints(story.key, points, jiraCfg.sizeField);
    if (sprintIds.length) await moveToSprint(story.key, sprintIds[0]);
    storyKeys.push(story.key);
  }

  const conversion = (await kvs.get('conversion')) ?? {};
  conversion[ideaKey] = {
    status: 'converted', epicKey, storyKeys, sprintIds, project: projectKey, type: issueType, name, desc: description, pts: points,
  };
  await kvs.set('conversion', conversion);

  // Auto-advance the idea's lifecycle status to Doing
  const doingStatus = jiraCfg.statusMap?.Doing;
  if (doingStatus) await transitionIssueTo(ideaKey, doingStatus).catch(() => {});

  return { ok: true, epicKey, storyKeys, project: projectKey };
});

// Unlink a converted idea. Only clears OUR tracking — the real Jira issues are left
// exactly as they are; this is a link removal, not a delete.
resolver.define('undoConvert', async ({ payload }) => {
  const { ideaKey } = payload;
  const conversion = (await kvs.get('conversion')) ?? {};
  const allocPts = conversion[ideaKey]?.pts ?? 0;
  conversion[ideaKey] = { status: 'not' };
  await kvs.set('conversion', conversion);
  return { ok: true, allocPts };
});

// Live "Waterline" data for a release. Never cached — walks each team's Stage-1
// selected sprints and asks Jira (via the Agile sprint-issue endpoint, authoritative
// for "what's in this sprint right now") what's actually placed there, then classifies
// against our `conversion` records (epic/story key -> idea key) to build:
//   - `alloc`: "{teamId}:{sprintId}" -> committed points (epics with fetched children
//     contribute 0 — their points roll up into the children instead)
//   - `execByTeam`: per-team flat list of epics+children+unplanned work for the audit table
//   - `unpointed`: count of non-epic sprint items with no story-point estimate
resolver.define('getWaterline', async ({ payload }) => {
  const { versionId } = payload;
  const config = (await kvs.get('config')) ?? {};
  const teams = config.teams ?? [];
  const jiraCfg = config.jiraCfg ?? {};
  const sizeFields = [jiraCfg.sizeField, 'customfield_10016'].filter(Boolean);

  const delivery = (await kvs.get(`delivery:${versionId}`)) ?? { selection: {}, overrides: {} };
  const selection = delivery.selection || {};

  const conversion = (await kvs.get('conversion')) ?? {};
  const ideaByIssueKey = {};
  Object.entries(conversion).forEach(([ideaKey, c]) => {
    if (c.status !== 'converted') return;
    if (c.epicKey) ideaByIssueKey[c.epicKey] = ideaKey;
    (c.storyKeys || []).forEach(k => { ideaByIssueKey[k] = ideaKey; });
  });
  const epicKeys = Object.values(conversion).filter(c => c.status === 'converted' && c.epicKey).map(c => c.epicKey);

  const fieldsParam = ['summary', 'issuetype', 'status', 'parent', ...sizeFields].join(',');
  const itemsByKey = {};   // issueKey -> normalized item
  const sprintOfKey = {};  // issueKey -> { teamId, sprintId }

  for (const team of teams) {
    for (const sprintId of (selection[team.id] || [])) {
      let startAt = 0;
      for (;;) {
        const res = await asUser().requestJira(
          route`/rest/agile/1.0/sprint/${sprintId}/issue?fields=${fieldsParam}&maxResults=100&startAt=${startAt}`,
          { headers: { Accept: 'application/json' } }
        );
        if (!res.ok) break;
        const body = await res.json();
        const issues = body.issues || [];
        issues.forEach(iss => {
          const pts = sizeFields.map(f => iss.fields[f]).find(v => v != null) ?? null;
          itemsByKey[iss.key] = {
            key: iss.key,
            summary: iss.fields.summary,
            type: (iss.fields.issuetype?.name || '').toLowerCase(),
            status: iss.fields.status?.name || '',
            parentKey: iss.fields.parent?.key || null,
            estimate: pts,
          };
          sprintOfKey[iss.key] = { teamId: team.id, sprintId };
        });
        startAt += issues.length;
        if (!issues.length || startAt >= (body.total ?? 0)) break;
      }
    }
  }

  // Epics are never themselves moved into a sprint (see convertIdea) — fetch them
  // separately so the execution table can show the epic row even though only its
  // children showed up in the sprint-issue fetch above.
  const epicByKey = {};
  if (epicKeys.length) {
    const jql = encodeURIComponent(`key in (${epicKeys.join(',')})`);
    let res = await asUser().requestJira(
      route`/rest/api/3/search?jql=${jql}&maxResults=${epicKeys.length}&fields=summary,status`,
      { headers: { Accept: 'application/json' } }
    );
    if (res.status === 410 || res.status === 404) {
      res = await asUser().requestJira(route`/rest/api/3/search/jql`, {
        method: 'POST',
        headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ jql: `key in (${epicKeys.join(',')})`, maxResults: epicKeys.length, fields: ['summary', 'status'] }),
      });
    }
    if (res.ok) {
      const body = await res.json();
      (body.issues || []).forEach(iss => {
        epicByKey[iss.key] = { key: iss.key, summary: iss.fields.summary, status: iss.fields.status?.name || '' };
      });
    }
  }

  const childrenOf = {}; // epicKey -> [childKey,...]
  Object.values(itemsByKey).forEach(it => {
    if (it.parentKey) (childrenOf[it.parentKey] = childrenOf[it.parentKey] || []).push(it.key);
  });
  const contribution = item => (item.type === 'epic' && childrenOf[item.key]?.length) ? 0 : (item.estimate || 0);

  const alloc = {};
  Object.entries(sprintOfKey).forEach(([key, { teamId, sprintId }]) => {
    const item = itemsByKey[key];
    if (!item) return;
    const k = `${teamId}:${sprintId}`;
    alloc[k] = (alloc[k] || 0) + contribution(item);
  });

  const execByTeam = {};
  teams.forEach(t => { execByTeam[t.id] = []; });
  const consumedAsChild = new Set(Object.values(childrenOf).flat());

  Object.entries(epicByKey).forEach(([epicKey, epic]) => {
    const kids = (childrenOf[epicKey] || []).map(k => itemsByKey[k]).filter(Boolean);
    const teamId = kids.length ? sprintOfKey[kids[0].key]?.teamId : null;
    if (!teamId || !execByTeam[teamId]) return; // no children placed in this release's sprints — nothing to show
    const ideaKey = ideaByIssueKey[epicKey] || null;
    execByTeam[teamId].push({
      key: epicKey, type: 'epic', title: epic.summary, status: epic.status,
      estimate: kids.reduce((a, k) => a + contribution(k), 0), sprintId: null, ideaKey, isChild: false,
    });
    kids.forEach(k => {
      execByTeam[teamId].push({
        key: k.key, type: k.type, title: k.summary, status: k.status,
        estimate: contribution(k), sprintId: sprintOfKey[k.key]?.sprintId,
        ideaKey: ideaByIssueKey[k.key] || ideaKey, isChild: true,
      });
    });
  });

  Object.values(itemsByKey).forEach(item => {
    if (consumedAsChild.has(item.key) || epicByKey[item.key]) return;
    const loc = sprintOfKey[item.key];
    if (!loc || !execByTeam[loc.teamId]) return;
    execByTeam[loc.teamId].push({
      key: item.key, type: item.type, title: item.summary, status: item.status,
      estimate: contribution(item), sprintId: loc.sprintId, ideaKey: ideaByIssueKey[item.key] || null, isChild: false,
    });
  });

  const unpointed = Object.values(itemsByKey).filter(it => it.type !== 'epic' && !it.estimate).length;

  return { alloc, execByTeam, unpointed };
});

// Move a Jira item that's part of the Waterline. Same team = a plain sprint move
// (one Agile API call). Different team = a cross-project move, since a team maps
// 1:1 to a Jira project here — there's no lightweight "change project" field edit,
// so this uses Jira's async Bulk Issue Move API and polls briefly for completion.
// This is the least-proven part of the integration: cross-project moves depend on
// the target project having a matching issue type and satisfying its required
// fields, which we can't fully control for. Errors are surfaced verbatim so the
// user can finish the move by hand in Jira if it fails.
resolver.define('moveWaterlineItem', async ({ payload }) => {
  const { issueKey, toTeamId, toSprintId } = payload;
  const config = (await kvs.get('config')) ?? {};
  const teams = config.teams ?? [];
  const toTeam = teams.find(t => t.id === toTeamId);
  if (!toTeam?.boardId) return { ok: false, error: 'Target team has no Jira board linked.' };

  const [issueRes, boardRes] = await Promise.all([
    asUser().requestJira(route`/rest/api/3/issue/${issueKey}?fields=project,issuetype`, { headers: { Accept: 'application/json' } }),
    asUser().requestJira(route`/rest/agile/1.0/board/${toTeam.boardId}`, { headers: { Accept: 'application/json' } }),
  ]);
  if (!issueRes.ok) return { ok: false, error: `Could not read ${issueKey} (${issueRes.status}).` };
  if (!boardRes.ok) return { ok: false, error: `Could not resolve the target board (${boardRes.status}).` };
  const issueBody = await issueRes.json();
  const boardBody = await boardRes.json();
  const currentProjectKey = issueBody.fields.project?.key;
  const targetProjectKey = boardBody.location?.projectKey;
  if (!targetProjectKey) return { ok: false, error: 'Target board has no associated project.' };

  if (currentProjectKey === targetProjectKey) {
    if (toSprintId) {
      const res = await asUser().requestJira(route`/rest/agile/1.0/sprint/${toSprintId}/issue`, {
        method: 'POST',
        headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ issues: [issueKey] }),
      });
      if (!res.ok) return { ok: false, error: `Could not move ${issueKey} to that sprint (${res.status}).` };
    }
    return { ok: true, moved: 'sprint' };
  }

  const targetProjRes = await asUser().requestJira(route`/rest/api/3/project/${targetProjectKey}`, { headers: { Accept: 'application/json' } });
  if (!targetProjRes.ok) return { ok: false, error: `Could not read target project ${targetProjectKey} (${targetProjRes.status}).` };
  const targetProj = await targetProjRes.json();
  const issueTypeName = issueBody.fields.issuetype?.name;
  const targetType = (targetProj.issueTypes || []).find(t => t.name === issueTypeName);
  if (!targetType) {
    return { ok: false, error: `${targetProjectKey} has no "${issueTypeName}" issue type — move ${issueKey} manually in Jira.` };
  }

  const moveRes = await asUser().requestJira(route`/rest/api/3/bulk/issues/move`, {
    method: 'POST',
    headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sendBulkNotification: false,
      targetToSourcesMapping: {
        [`${targetProj.id},${targetType.id}`]: {
          inferFieldDefaults: true,
          inferStatusDefaults: true,
          inferSubtaskTypeDefault: true,
          issueIdsOrKeys: [issueKey],
        },
      },
    }),
  });
  if (!moveRes.ok) {
    const text = await moveRes.text().catch(() => '');
    return { ok: false, error: `Jira rejected the move of ${issueKey} to ${targetProjectKey} (${moveRes.status}). ${text.slice(0, 200)} — move it manually in Jira instead.` };
  }
  const moveBody = await moveRes.json().catch(() => ({}));
  const taskId = moveBody.taskId;

  let status = 'pending';
  if (taskId) {
    for (let i = 0; i < 3; i++) {
      const taskRes = await asUser().requestJira(route`/rest/api/3/task/${taskId}`, { headers: { Accept: 'application/json' } });
      if (taskRes.ok) {
        const taskBody = await taskRes.json();
        if (taskBody.status === 'COMPLETE') { status = 'complete'; break; }
        if (taskBody.status === 'FAILED' || taskBody.status === 'CANCELLED') {
          return { ok: false, error: `Jira's move task ${taskBody.status.toLowerCase()} for ${issueKey} — check the issue in Jira.` };
        }
      }
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  if (toSprintId) {
    await asUser().requestJira(route`/rest/agile/1.0/sprint/${toSprintId}/issue`, {
      method: 'POST',
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ issues: [issueKey] }),
    }).catch(() => {});
  }

  return { ok: true, moved: 'project', status };
});

// Lightweight version list for the dashboard gadget — avoids the full idea fetch
// that getAll() does, since the gadget's edit view (and its "auto" resolution)
// only need version metadata and team capacities, not every idea.
resolver.define('getGadgetVersions', async () => {
  const config = (await kvs.get('config')) ?? {};
  const versions = await fetchVersions(config.jiraCfg);
  return { versions, teams: config.teams ?? [] };
});

// Returns the web trigger URL for the EazyBI export endpoint.
resolver.define('getWebTriggerUrl', async () => {
  const url = await webTrigger.getUrl('easybi-export');
  return { url };
});

// Save the API token used to authenticate the EazyBI export web trigger.
resolver.define('saveApiToken', async ({ payload }) => {
  const { apiToken } = payload;
  const config = (await kvs.get('config')) ?? {};
  await kvs.set('config', { ...config, apiToken });
  return { ok: true };
});

// Sum ALL story points currently in a sprint (committed scope, regardless of status).
resolver.define('getSprintCommitted', async ({ payload }) => {
  const { sprintId } = payload;
  const config = (await kvs.get('config')) ?? {};
  const sizeField = config.jiraCfg?.sizeField;
  const fieldsParam = [sizeField, 'customfield_10016'].filter(Boolean).join(',');

  let committed = 0;
  let startAt = 0;

  for (;;) {
    const res = await asUser().requestJira(
      route`/rest/agile/1.0/sprint/${sprintId}/issue?fields=${fieldsParam}&maxResults=100&startAt=${startAt}`,
      { headers: { Accept: 'application/json' } }
    );
    if (!res.ok) return { ok: false, error: `Jira returned ${res.status}` };
    const data = await res.json();
    const issues = data.issues || [];
    for (const issue of issues) {
      const pts = (sizeField && issue.fields[sizeField] != null)
        ? issue.fields[sizeField]
        : (issue.fields?.customfield_10016 ?? 0);
      committed += typeof pts === 'number' ? pts : 0;
    }
    startAt += issues.length;
    if (!issues.length || startAt >= (data.total ?? 0)) break;
  }
  return { ok: true, committed: Math.round(committed) };
});

// Sum completed (Done status category) story points for a closed sprint — velocity capture.
resolver.define('getSprintVelocity', async ({ payload }) => {
  const { sprintId } = payload;
  const config = (await kvs.get('config')) ?? {};
  const sizeField = config.jiraCfg?.sizeField;
  const fieldsParam = [sizeField, 'customfield_10016', 'status'].filter(Boolean).join(',');

  let velocity = 0;
  let startAt = 0;

  for (;;) {
    const res = await asUser().requestJira(
      route`/rest/agile/1.0/sprint/${sprintId}/issue?fields=${fieldsParam}&maxResults=100&startAt=${startAt}`,
      { headers: { Accept: 'application/json' } }
    );
    if (!res.ok) return { ok: false, error: `Jira returned ${res.status}` };
    const data = await res.json();
    const issues = data.issues || [];
    for (const issue of issues) {
      if (issue.fields?.status?.statusCategory?.key === 'done') {
        const pts = (sizeField && issue.fields[sizeField] != null)
          ? issue.fields[sizeField]
          : (issue.fields?.customfield_10016 ?? 0);
        velocity += typeof pts === 'number' ? pts : 0;
      }
    }
    startAt += issues.length;
    if (!issues.length || startAt >= (data.total ?? 0)) break;
  }
  return { ok: true, velocity: Math.round(velocity) };
});

// ── EazyBI / REST export web trigger ──────────────────────────────────────────
// Returns a flat JSON array of all sprint-capacity records across every version.
// Secured by a Bearer token stored in the app config. Configure in Jira Config → API Access.
const easybiExportFn = async (req) => {
  const respond = (status, body) => ({
    statusCode: status,
    headers: { 'Content-Type': ['application/json'] },
    body: JSON.stringify(body),
  });

  try {
    const config = (await kvs.get('config')) ?? {};
    const apiToken = config.apiToken;

    if (!apiToken) {
      return respond(401, { error: 'No API token configured. Set one in the app\'s Jira Config tab → API Access.' });
    }

    const authHeader = ([].concat(req.headers?.authorization ?? req.headers?.Authorization ?? []))[0] ?? '';
    const queryToken = ([].concat(req.queryParameters?.token ?? []))[0] ?? '';
    const provided = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : queryToken;

    if (!provided || provided !== apiToken) {
      return respond(401, { error: 'Invalid or missing API token. Pass it as: Authorization: Bearer <token>' });
    }

    const teams = config.teams ?? [];
    const jiraCfg = config.jiraCfg ?? {};
    const projectKey = jiraCfg.releaseSpace || jiraCfg.ideaSpace;

    if (!projectKey) {
      return respond(400, { error: 'No Jira project configured. Complete Jira Config in the app first.' });
    }

    // All versions from the configured project
    const vRes = await asApp().requestJira(
      route`/rest/api/3/project/${projectKey}/versions`,
      { headers: { Accept: 'application/json' } }
    );
    const versions = vRes.ok ? await vRes.json() : [];

    // Sprint details keyed by sprint ID across all team boards
    const sprintDetails = {};
    for (const team of teams) {
      if (!team.boardId) continue;
      let startAt = 0;
      for (;;) {
        const sRes = await asApp().requestJira(
          route`/rest/agile/1.0/board/${team.boardId}/sprint?maxResults=100&startAt=${startAt}&state=active,future,closed`,
          { headers: { Accept: 'application/json' } }
        );
        if (!sRes.ok) break;
        const sData = await sRes.json();
        const sprints = sData.values ?? [];
        sprints.forEach(sp => { sprintDetails[sp.id] = sp; });
        startAt += sprints.length;
        if (!sprints.length || sData.isLast) break;
      }
    }

    // Build one record per version × team × selected sprint
    const records = [];
    for (const version of versions) {
      const delivery = (await kvs.get(`delivery:${version.id}`)) ?? {};
      const selection = delivery.selection ?? {};
      const overrides = delivery.overrides ?? {};

      for (const team of teams) {
        for (const sprintId of (selection[team.id] ?? [])) {
          const sp = sprintDetails[sprintId];
          const ov = overrides[`${team.id}:${sprintId}`] ?? {};
          records.push({
            versionId: version.id,
            versionName: version.name,
            releaseDate: version.releaseDate ?? null,
            versionReleased: version.released ?? false,
            versionArchived: version.archived ?? false,
            teamId: team.id,
            teamName: team.name,
            sprintId,
            sprintName: sp?.name ?? String(sprintId),
            sprintState: sp?.state ?? 'unknown',
            sprintStartDate: sp?.startDate ? sp.startDate.slice(0, 10) : null,
            sprintEndDate: sp?.endDate ? sp.endDate.slice(0, 10) : null,
            baseCapacity: team.sprintCap ?? 0,
            capacity: ov.pts != null ? ov.pts : (team.sprintCap ?? 0),
            committed: ov.committed ?? null,
            velocity: ov.velocity ?? null,
          });
        }
      }
    }

    return respond(200, {
      generatedAt: new Date().toISOString(),
      recordCount: records.length,
      records,
    });
  } catch (err) {
    return respond(500, { error: String(err.message || err) });
  }
};

exports.easybiExport = easybiExportFn;
exports.handler = resolver.getDefinitions();
