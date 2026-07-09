import Resolver from '@forge/resolver';
import { storage } from '@forge/api';

const resolver = new Resolver();

// Spike #1a target: log latency from the frontend console.
// Returns the full data shape the UI needs on load.
resolver.define('getAll', async ({ payload, context }) => {
  const versionId = payload?.versionId ?? null;

  // TODO Spike #2: replace with live Jira API calls
  // - ideas:   GET /rest/api/3/search (JQL: project = <ideaSpace>)
  // - teams:   GET /rest/teams/1.0/teams/ (hard gate — spike must confirm accessible)
  // - versions: GET /rest/api/3/project/<ideaSpace>/versions
  const [releaseRecord, configRecord] = await Promise.all([
    versionId ? storage.get(`release:${versionId}`) : Promise.resolve(null),
    storage.get('config'),
  ]);

  const config = configRecord ?? {
    scale: { XS: 1, S: 3, M: 8, L: 13, XL: 21 },
    threshold: 70,
    editors: [],
    jiraCfg: null,
  };

  const release = releaseRecord ?? {
    capacityByTeam: {},
    threshold: config.threshold,
    sprintSelectionByTeam: {},
  };

  return {
    ideas: [],
    teams: [],
    versions: [],
    release,
    config,
  };
});

resolver.define('saveCapacity', async ({ payload }) => {
  const { versionId, capacityByTeam, threshold } = payload;
  const existing = (await storage.get(`release:${versionId}`)) ?? {};
  await storage.set(`release:${versionId}`, {
    ...existing,
    capacityByTeam,
    threshold,
  });
  return { ok: true };
});

resolver.define('saveConfig', async ({ payload }) => {
  await storage.set('config', payload);
  return { ok: true };
});

resolver.define('saveJiraCfg', async ({ payload }) => {
  const config = (await storage.get('config')) ?? {};
  await storage.set('config', { ...config, jiraCfg: payload });
  return { ok: true };
});

export const handler = resolver.getDefinitions();
