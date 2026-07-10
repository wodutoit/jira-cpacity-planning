---
name: project-build-progress
description: Build progress for Capacity Waterline Forge app — what's shipped, architecture decisions, field keys, what's next
metadata:
  type: project
---

## What's shipped (as of 2026-07-10)

### Phase 0 — Forge scaffold ✅
- manifest.yml: jira:globalPage, all required scopes, storage:app
- src/index.js: Forge resolver (CommonJS, @forge/resolver, @forge/kvs, @forge/api asUser())
- static/capacity-waterline/: Vite + React frontend
- Deployed to prediktivity.atlassian.net, development environment

### Spike #1a ✅ — 756ms getAll latency (acceptable)

### Spike #2 ✅ — Jira API confirmed
- asUser() required for ALL requestJira calls (app context has zero project access)
- Search API GET /rest/api/3/search returns 410 on this dev instance — fallback to POST /rest/api/3/search/jql
- Teams API dead — teams stored in Config + ideaTeams Forge Storage
- Cloud ID: e8106b0c-d2ab-4588-8029-cb68f4a113dc

### Field keys confirmed
- Team: customfield_10001 — stored in ideaTeams storage (NOT written to Jira, UUID mismatch)
- Reach: customfield_10056, Impact: customfield_10053, Effort: customfield_10064, Confidence: customfield_10066 (JPD native)
- RICE score: customfield_10068 (read-only in Jira, app computes it)
- T-shirt size: user-selected field — stored in ideaSizes storage + best-effort Jira write
- idea.size is numeric points (e.g. 8), NOT the label ('M')
- Release field: fully configurable by user
- Roadmap: customfield_10055 (Now/Next/Later/Won't do — NOT usable for releases)

### Forge Storage keys
- config: {scale, threshold, teams, editors, admins, jiraCfg}
- ideaTeams: {[issueKey]: teamId}
- ideaSizes: {[issueKey]: points}
- ideaOrder: string[] of issue keys
- release:{versionId}: {capacityByTeam, threshold}

### Key architecture decisions
- All Jira API calls: asUser() always
- Teams: manual Config entry only (Teams API dead)
- idea.size is numeric points — never look it up via scale object
- Forge CSP blocks emotion/inline styles — use CSS classes + CSS variables only
- Custom components: Button, NativeSelect, UserPicker, IssueKey (replace @atlaskit)
- siteUrl from view.getContext() powers issue key links
- Global saving indicator: window event system (notifySaving ±1)

### Design tokens
- CSS variables in styles.css matching prototype exactly:
  --ok, --filling, --over, --threshold, --brand, --surface*, --text*, --border*, --info*, --lz-n-*
- wl-pulse keyframes for over-capacity bars

### Forge deploy quirk
- forge deploy has Windows lint bug → use --no-verify always
- handler: index.handler in manifest (Forge prepends src/)

## Tabs shipped

### Intake tab ✅
- Header counts: New, Backlog, "scored & ready" (New+scored only, conditional)
- Add-idea form: Summary, Team, Size (XS·1 format), Version (version persists after add)
- Filter chips: Version | Team | Status (multi-select, Status defaults to [New, Backlog])
- RICE table: 5-dot inputs (Reach amber/Impact blue/Effort salmon), Confidence %, RICE computed live
- Inline editing: title (click), size, team, version, status (disabled if no score + "needs RICE" hint)
- Status: all lifecycle options, disabled select when New+no score
- Backlog rows: purple tint rgba(124,92,246,0.06)
- No confirm on delete (immediate)
- Issue keys: clickable links → new Jira tab

### Config tab ✅
- Teams table: name, sprint weeks, sprint cap, sprints/release, derived release cap
- T-shirt scale: XS/S/M/L/XL (default 1/3/8/13/21)
- Default threshold: 70%
- Access Control: Admins UserPicker (gates Config/Jira tabs), Editors UserPicker (gates saves)
- UserPicker: search-as-you-type, chip display, initials avatars

### Jira Config tab ✅ (admin only)
- Project picker (detects JPD vs software)
- Release, size, RICE field pickers with type-specific instructions
- Status mapping (lifecycle → Jira status names)
- Validate → Save (validateJiraCfg resolver)

### Release Planning tab ✅
- View tabs [By team | By version] at very top (above version picker)
- **By team:** version picker (only here, hidden on By version)
  - Unsaved/saved banners, low-tag banner
  - Empty states: no version (◔), no ideas (∅)
  - WaterlineChart: bars with fill, threshold dashed line, cap solid line, state chips (OK/FILLING/OVER/SET CAP)
  - Over-capacity: wl-pulse animation; click bar → filter idea table
  - Capacity inputs with ↺ reset, threshold+Save footer
  - IdeaTable: group headers (blue avatar+initials, collapse, pts), per-row waterline tint
  - Rank # + ⠿ drag handle, HTML5 DnD (persisted in ideaOrder)
  - RICE popover on pill click (4 dots + confidence + live score)
  - Status select colored by state; transitions via transitionIdea
  - Unassigned group with HR divider
- **By version:** VersionChart (stacked segments per team, colored by state)
  - Future versions 1-5 selector, CURRENT/FUTURE labels, Σ capacity line
  - Click version → filter idea table; version filter banner with ✕ Clear

### Delivery Planning tab ✅ (stub)
- 4-stage stepper: Sprints & Capacity → Convert Ideas → Waterline → Reconcile

### Global features ✅
- Global "Saving…" spinner in header (window cpw-saving events)
- ↻ Refresh button (reloads data)
- Admin-gated tabs (Config, Jira hidden for non-admins)
- App badge: CW, Favicon: SVG CW blue square
- Issue keys: clickable → new Jira tab (siteUrl from view.getContext())
- Size selects: "XS · 1" format everywhere

## Resolvers (src/index.js)
getAll, saveCapacity, saveConfig, saveJiraCfg, validateJiraCfg, getJiraSetup, getProjectDetails,
updateIdeaTeam (storage only), updateIdeaSize (storage + Jira), updateIdeaRelease, updateIdeaOrder,
updateIdeaRice, updateIdeaSummary, transitionIdea, createIdea, deleteIdea, searchUsers, resolveUsers

## What's next

### Delivery Planning tab (Phase 5 — not started)
1. Sprints & Capacity — sprint picker per team + per-sprint capacity overrides
2. Convert Ideas — release ideas → Jira epics
3. Waterline — delivery view + "Mark idea Done"
4. Reconcile — planned vs actual per team

### Known limitations / gaps
- Teams API dead: no Jira sync, Config-only
- Drag-and-drop: within-group reorder works; cross-group team change not wired via DnD
- RICE popover: only in Release Planning (not in Intake dots → they write directly)
- By version mode: idea table works but shows all versions' ideas when no filter selected
