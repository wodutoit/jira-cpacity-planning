---
name: project-build-progress
description: "Build progress for Capacity Waterline Forge app — what's shipped, what's next, key decisions"
metadata: 
  node_type: memory
  type: project
  originSessionId: d08b294d-11da-443d-81b0-6bc6908a8756
---

## What's shipped (as of 2026-07-09)

### Phase 0 — Forge scaffold ✅
- manifest.yml: jira:globalPage, all required scopes, storage:app
- src/index.js: Forge resolver (CommonJS, @forge/resolver, @forge/kvs, @forge/api asUser())
- static/capacity-waterline/: Vite + React frontend with @atlaskit/*
- Deployed to prediktivity.atlassian.net, development environment

### Spike #1a ✅ — 756ms getAll latency (acceptable, skeleton loader covers it)

### Spike #2 ✅ — Jira API confirmed
- asUser() required for ALL requestJira calls (app context has zero project access on team-managed projects)
- Search API GET /rest/api/3/search returns 410 on this dev instance (1001.0.0-SNAPSHOT) — standard endpoint, production will work
- Teams API dead (auth error even with asUser) — teams derived from ideas + manual Config entry
- DISC (product_discovery) project key: Idea type native, RICE fields confirmed
- KAN (software next-gen) project key: Idea type added manually, has fixVersions
- Cloud ID: e8106b0c-d2ab-4588-8029-cb68f4a113dc

### Field keys confirmed
- Team: customfield_10001 (both project types)
- Reach: customfield_10056 (JPD native)
- Impact: customfield_10053 (JPD native)
- Effort: customfield_10064 (JPD native)
- Confidence: customfield_10066 (JPD native)
- RICE score: customfield_10068 (JPD native, read-only/computed — NOT mapped, app derives it)
- Roadmap: customfield_10055 (JPD, select: Now/Next/Later/Won't do — NOT suitable for releases)
- T-shirt size: user-selected custom field (not native to either type)
- Release field: user-selected (NOT fixVersions or Roadmap — user creates "Target Release" for JPD, "Planned Version" for software)

### Phase 1 — Jira Config screen ✅
- Project picker (lists all accessible projects, detects JPD vs software)
- Release field picker with type-specific instructions
- Size field picker with instructions to add a number field
- RICE field mapping (auto-filled for JPD, manual for software)
- Status mapping (5 lifecycle statuses → Jira status names)
- Validate → Save flow (validateJiraCfg resolver)

### Config tab ✅
- Teams table: name, sprint weeks, sprint cap, sprints/release, derived release cap
- T-shirt scale: XS/S/M/L/XL numeric values (default 1/3/8/13/21)
- Default threshold %: default 70
- Access Control — Admins (UserPicker, gates Config/Jira tab visibility) and Editors (gates planning board saves)
- Custom Button component (replaces @atlaskit/button — Forge CSP blocks emotion CSS-in-JS)
- Custom UserPicker component (search-as-you-type, chip display, debounced invoke to searchUsers resolver)

### Key architecture decisions
- All Jira API calls: asUser() always
- Teams: manual Config entry + derived from idea customfield_10001 values on getAll
- T-shirt size: user-selected number field, app reads/writes numeric values
- Release field: configurable (not hardcoded to fixVersions)
- Admins empty → all users have full access (safe default)
- Forge CSP blocks inline styles and emotion (CSS-in-JS) — use CSS classes only

### Forge deploy quirk
- forge lint embedded in forge deploy has Windows path normalization bug
- Workaround: forge deploy --no-verify (forge lint standalone confirms clean)
- handler: index.handler in manifest (Forge bundler auto-prepends src/, file lives at src/index.js)

## What's next

### Phase 2 — Planning board (Release Planning tab)
- Version picker + localStorage session restore (cpw:lastVersionId)
- Waterline chart: 5 bars (4 teams + Total), threshold line, state colours (ok/filling/over/nocap), state labels
- Capacity NumberField editors per team, sticky Save button, threshold editor, dirty-state banner
- Idea table grouped by team: rank, RICE pill, size, team assign (auto-transitions), version, status lozenge
- getAll wired with real Jira data (ideas + versions from configured ideaSpace)

### Phase 3 — Intake tab
### Phase 4 — Delivery mode
