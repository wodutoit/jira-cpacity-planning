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

async function fetchIdeas(jiraCfg) {
  if (!jiraCfg?.ideaSpace) return [];

  const { sizeField, releaseField, reachField, impactField, effortField, confidenceField } = jiraCfg;
  const extraFields = [sizeField, releaseField, reachField, impactField, effortField, confidenceField]
    .filter(Boolean)
    .filter(f => !JIRA_FIELDS.includes(f));
  const fields = [...JIRA_FIELDS, ...extraFields];

  const jql = encodeURIComponent(`project = "${jiraCfg.ideaSpace}" AND issuetype = Idea ORDER BY rank ASC`);
  const res = await asUser().requestJira(
    route`/rest/api/3/search?jql=${jql}&maxResults=200&fields=${fields.join(',')}`,
    { headers: { Accept: 'application/json' } }
  );
  if (!res.ok) return [];
  const body = await res.json();
  return (body.issues || []).map(i => ({
    id: i.id,
    key: i.key,
    title: i.fields.summary,
    status: i.fields.status?.name ?? null,
    team: i.fields.customfield_10001?.id ?? null,
    teamName: i.fields.customfield_10001?.name ?? null,
    release: extractRelease(i.fields, releaseField),
    size: sizeField ? (i.fields[sizeField] ?? null) : null,
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
  const [releaseRecord, configRecord] = await Promise.all([
    versionId ? kvs.get(`release:${versionId}`) : Promise.resolve(null),
    kvs.get('config'),
  ]);

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
    fetchIdeas(config.jiraCfg),
    fetchVersions(config.jiraCfg),
  ]);

  return { ideas, teams: config.teams ?? [], versions, release, config };
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

// Spike handlers removed — all spike findings documented above.

exports.handler = resolver.getDefinitions();
