---
name: project-build-progress
description: Build progress for Capacity Waterline Forge app — what's shipped, architecture decisions, field keys, resolvers, what's next
metadata:
  type: project
---

## What's shipped (as of 2026-07-10, updated)

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
  - teams[]: {id, name, sprintWeeks, sprintCap, sprintsPerRelease, boardId, boardName, projectKey}
- ideaTeams: {[issueKey]: teamId}
- ideaSizes: {[issueKey]: points}
- ideaOrder: string[] of issue keys
- release:{versionId}: {capacityByTeam, threshold}
- delivery:{versionId}: {selection: {[teamId]: [sprintId]}, overrides: {["teamId:sprintId"]: {pts, note}}}
  - **No sprint objects are ever cached here** — only IDs and capacity overrides. Sprints are always fetched live from Jira (see architecture decisions below).

### Key architecture decisions
- All Jira API calls: asUser() always
- Teams: manual Config entry only (Teams API dead); each team now optionally mapped to a real Jira Scrum board (boardId/boardName/projectKey) for sprint sync
- idea.size is numeric points — never look it up via scale object
- Forge CSP blocks emotion/inline styles — use CSS classes + CSS variables only
- Custom components: Button, NativeSelect, UserPicker, IssueKey (replace @atlaskit)
- siteUrl from view.getContext() powers issue key links
- Global saving indicator: window event system (notifySaving ±1)
- **Plain `<a target="_blank">` is blocked by the Forge sandboxed iframe** — use `router.open(href)` from `@forge/bridge` instead (IssueKey component, delete-sprint "Open board in Jira" link)
- **No local sprint caching**: Delivery Planning never stores sprint name/dates/goal in app storage. Only sprint IDs (selection) and per-sprint capacity overrides are persisted. Sprints are fetched live from Jira on every `getDelivery` call, keyed by team board.
- **Stale sprint detection**: `getDelivery` diffs stored `selection` IDs against the live sprint list per team and returns `missingByTeam`. Frontend offers "↺ Recreate" (opens Add Sprint dialog) or "✕ Remove from plan" per stale reference.
- **Jira Agile API PUT vs POST**: PUT /rest/agile/1.0/sprint/{id} is a full replace and requires every field including `state` (fails with "Sprint state is required" if omitted). Always use POST for partial sprint updates.
- **Sprint delete is guarded**: `deleteSprint` resolver checks issue count first (`GET .../sprint/{id}/issue`); only deletes if empty. If non-empty, refuses and returns a count so the frontend can point the user at the real board instead of silently moving issues to backlog.
- **Date handling for Jira sprint dates**: Jira returns full ISO datetimes that can cross midnight in UTC vs local (e.g. `2026-07-28T14:00:00.000Z` = `2026-07-29` local in UTC+10). Never slice the raw ISO string for a date-only value — parse with `new Date(iso)` and read local `getFullYear()/getMonth()/getDate()`.
- **App data is loaded once per session, not per tab**: `App.jsx` calls `getAll` on mount only; `TabShell` never refetches on tab switch, so every tab reads the same in-memory `data` snapshot until the header "Refresh" button (or `onRefresh` prop) is invoked. Any resolver that mutates shared config/teams data and expects OTHER tabs to see it immediately (e.g. Config's board mapping affecting Delivery Planning's Convert Ideas team list) must explicitly call the `onRefresh` prop (now threaded `App → TabShell → tab component`) after its save succeeds — ConfigTab's `save()` does this. If a future tab adds a save that other tabs depend on, wire `onRefresh` there too rather than assuming data is fresh.
- **Convert Ideas resolves the team's Jira project live from `boardId`** (`GET /rest/agile/1.0/board/{boardId}`) rather than trusting a cached `team.projectKey`, since that cache can be stale/absent for teams configured before board-mapping existed. Display labels in the Team column should key off `team.boardId` (is a board linked at all) not `team.projectKey` (a display nicety that can lag) — conflating the two previously caused "no board linked" to show even when a board genuinely was linked.

### Design tokens
- CSS variables in styles.css matching prototype exactly:
  --ok, --filling, --over, --threshold, --brand, --surface*, --text*, --border*, --info*, --lz-n-*
- wl-pulse keyframes for over-capacity bars

### Forge deploy quirk
- forge deploy has Windows lint bug → use --no-verify always
- handler: index.handler in manifest (Forge prepends src/)
- `forge install --upgrade` requires an interactive TTY (site picker) — can't be run non-interactively; ask the user to run it themselves after adding new scopes

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
- Issue keys: clickable links → new Jira tab (router.open)

### Config tab ✅
- Teams table: name, **Jira board** (dropdown from getBoards, sets boardId/boardName/projectKey), sprint weeks, sprint cap, sprints/release, derived release cap
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

### Delivery Planning tab — Stage 1 "Sprints & Capacity" ✅ fully built
- Single-column layout (matches stepper bar width): Release coverage → Base capacity → Sprint selection
- **Sprint selection card**: per-team collapsible sections; sprint rows show checkbox, name, date range, state lozenge (active/future/completed)
  - **✎ Edit** — opens Add/Edit dialog (shared `SprintDialog` component), pre-filled with name/goal/dates; saves via `updateSprint` (Jira Agile API POST partial update)
  - **🗑 Delete** — confirmation dialog; checks emptiness server-side; empty → deletes for real; non-empty → refuses, shows count, offers "Open board in Jira" (router.open)
  - **＋ Add sprint** — disabled/tooltip if team has no board mapped; opens dialog pre-filled with computed defaults (name increments team's own numbering e.g. "Sprint 2"→"Sprint 3"; start = previous sprint's end date; end = start + team's sprintWeeks); creates a REAL sprint via `createSprint` (Jira Agile API POST /sprint with originBoardId)
  - **Inline capacity editor** — appears under a checked sprint row; pre-populated from team's base capacity; typing a different value creates a per-sprint override (brand-colored border) with a reason note + "↺ reset to base"
  - **Missing sprint banner** — per stale selected ID no longer on the board: "↺ Recreate" (removes stale ref + opens Add dialog) / "✕ Remove from plan"
- **Release coverage card**: per-team row — avatar, progress bar, sprints linked/planned, capacity available/planned, status chip (No capacity / Covered / Under-linked), "link N more sprints" detail. Logic matches prototype exactly: `cap` = ONLY explicit release capacity from Release Planning (no fallback), `covered = availableCap >= cap OR addedSprints >= plannedSprints`
- **Base capacity card**: per-team number input, syncs back to Config teams via saveConfig

### Delivery Planning tab — Stage 2 "Convert Ideas" ✅ fully built
- Ideas eligible = `idea.release === versionId && idea.team` (matches prototype's simple filter — no RICE/status re-check, since a team-assigned idea has already cleared Intake)
- Grouped by team (collapsible), rows sorted by the idea's global rank (`localIdeas` is the full unfiltered app-wide list, same "reorder within the full array + push whole order" pattern as ReleasePlanningTab's `handleReorder`, so idea order stays consistent across tabs)
- Row: drag handle (locked to 🔒 once converted — reorder-within-team only, can't cross teams), rank, IssueKey + title, RICE pill (local `RicePopover`, same shape as IdeaTable's non-exported one), Size+pts, **Team select** (options = all teams; changing it reassigns the idea's team via `updateIdeaTeam`; shows the team's linked project key underneath, or "no board linked" — was originally a "Target project" select filtered to teams with a cached `projectKey`, but that cache is stale/absent for teams configured before board-mapping existed, which made the list empty and made Convert silently no-op; fixed by always listing teams and resolving the project **live** from `team.boardId` at conversion time), Type select (Epic/Story, row-local ephemeral state `pendingType`, shared with the dialog exactly like the prototype's `dConvStatus[id].type` single source of truth), Status cell (Convert button / issue key link + mismatch button + undo link)
- **Convert dialog**: Size (editable select, XS–XL, recomputes Points from the T-shirt scale; on create, if changed from the idea's stored size, best-effort persists via `updateIdeaSize` and updates local state) + Points (derived, read-only), sprint checkboxes = ONLY that team's Stage-1 *selected* sprints (shows capacity, not live allocation — Waterline/live-issue-fetch isn't built yet so "committed points read live from Jira" from the prototype is deferred to Stage 3), Name (defaults to idea title), Description, Create disabled until name + ≥1 sprint chosen + team has a linked board (shows inline warning if not)
- **convertIdea resolver**: payload now sends `boardId` (not `projectKey`) — resolver resolves the project live via `GET /rest/agile/1.0/board/{boardId}` and fails fast with a clear error if the board is missing/unlinked, rather than the old silent no-op when a cached `team.projectKey` was absent. Creates a real Epic (or single Story) via `POST /rest/api/3/issue` (ADF-wrapped description); if Epic + sprints selected, creates one child Story per sprint with `parent: {key: epicKey}` (team-managed hierarchy — **not verified on company-managed classic projects**, known limitation), points split evenly with remainder to earliest sprints, each story moved into its sprint via `POST /rest/agile/1.0/sprint/{id}/issue`; story points written best-effort (`jiraCfg.sizeField` then `customfield_10016` fallback, try/catch swallowed); auto-transitions the idea to `statusMap.Doing` via a new shared `transitionIssueTo()` helper (refactored out of `transitionIdea`); create-issue error messages now also check Jira's `errors` field-map (not just `errorMessages`), since required-field validation errors land there
- **Undo link**: `undoConvert` resolver — clears OUR `conversion` storage entry only, never touches the real Jira issues (matches prototype's own description: "unlinks... the Jira issue itself is not deleted")
- **Mismatch detection**: `getConversion` resolver batch-JQLs all converted epics' current project and compares to the idea's mapped team; shows "Epic moved to {project} in Jira" + "Move to {team}" button that reassigns the idea's team to match
- Storage: flat `conversion` map keyed by **idea issue key** (not per-version — conversion state belongs to the idea): `{ [ideaKey]: { status, epicKey, storyKeys: [], sprintIds: [], project, type, name, desc, pts } }`
- New resolvers: `getConversion`, `convertIdea`, `undoConvert`; refactored `transitionIssueTo()` shared helper

### Delivery Planning tab — Stages 3-4 (stubs, not started)
- Waterline, Reconcile — each a `StageStub` describing planned functionality

### Global features ✅
- Global "Saving…" spinner in header (window cpw-saving events)
- ↻ Refresh button (reloads data)
- Admin-gated tabs (Config, Jira hidden for non-admins)
- App badge: CW, Favicon: SVG CW blue square
- Issue keys: clickable → new Jira tab (router.open, siteUrl from view.getContext())
- Size selects: "XS · 1" format everywhere

## Resolvers (src/index.js)
getAll, saveCapacity, saveConfig, saveJiraCfg, validateJiraCfg, getJiraSetup, getProjectDetails,
updateIdeaTeam (storage only), updateIdeaSize (storage + Jira), updateIdeaRelease, updateIdeaOrder,
updateIdeaRice, updateIdeaSummary, transitionIdea, createIdea, deleteIdea, searchUsers, resolveUsers,
getBoards (all Scrum boards, no type filter — team-managed boards report type="software"),
getDelivery (live sprints per team + missingByTeam + releaseCapacity), saveDelivery (selection+overrides only),
updateSprint (POST partial update), createSprint (POST /sprint with originBoardId), deleteSprint (checks emptiness, then DELETE)

## Manifest scopes (permissions.scopes)
read:jira-work, read:jira-user, write:jira-work, read:issue:jira, read:project:jira, read:issue-type:jira,
read:field:jira, write:issue:jira, read:board-scope:jira-software, read:sprint:jira-software,
write:sprint:jira-software, delete:sprint:jira-software, read:issue-details:jira, read:jql:jira, storage:app
- delete:sprint:jira-software / read:issue-details:jira / read:jql:jira added for sprint-issue-count check + delete
- **New scopes require `forge install --upgrade` on the target site** (interactive-only command) before they take effect

## What's next

### Delivery Planning tab (Stages 2-4 — not started)
1. Convert Ideas — release ideas → Jira epics, per-sprint story creation, mismatch warnings
2. Waterline — sprint × team grid, drill-in drawer, "Mark idea Done"
3. Reconcile — planned vs actual per team

### Known limitations / gaps
- Teams API dead: no Jira sync for team identity, Config-only
- Drag-and-drop: within-group reorder works; cross-group team change not wired via DnD
- RICE popover: only in Release Planning (not in Intake dots → they write directly)
- By version mode: idea table works but shows all versions' ideas when no filter selected
- Delivery board link (delete dialog) assumes `/jira/software/projects/{key}/boards/{id}` URL pattern — not verified across all Jira Cloud tiers
