# Release & Sprint Capacity Planning — Extension Requirements (High-Level)

| Field | Value |
| --- | --- |
| Status | Draft v0.1 — for review |
| Platform | Atlassian Forge (cloud-native, Atlassian-hosted) |
| Instance | prediktivity.atlassian.net (prediktivity.atlassian.net) |
| Author | DM + Claude |
| Purpose | Close the gap between JPD (ideas/prioritisation) and Plans (delivery scheduling) with a release-level and sprint-level capacity waterline |

---

## 1. Problem statement

Jira does not handle release-level or sprint-level team capacity planning well. JPD is an ideas/prioritisation tool with no capacity concept. Plans holds a per-sprint capacity number but stores it *inside* the Plan (not on a queryable Jira surface), offers no leave modelling, no release-envelope threshold, and no waterline. The result today is a separate spreadsheet holding capacities — a parallel source of truth we want to eliminate.

This extension closes the loop: plan a release to a capacity threshold using T-shirt-sized ideas, then switch to the Delivery Planning tab and plan the same release across real sprints with per-team, leave-adjusted capacity — all with a dynamic waterline and all single-sourced inside Jira.

## 2. Core concept — two tabs, one release

The tool operates as two sequential top-level tabs against a single release — **Release Planning** and **Delivery Planning** — rather than one screen with an internal Planning/Delivery mode toggle (that was the original design reference's structure; the build uses two tabs instead, which fits Jira's own tab-based navigation better and is the intended structure going forward, not a gap). The release is anchored to a **Jira Version** (Roadmapped/Fix) as the durable object; JPD ideas are linked in, not trusted to hold the release.

**Release Planning tab (coarse):** general capacity per team per release. Add JPD ideas to a release, size them with T-shirts, set a threshold (e.g. 70%), assign each idea to a team. See whether the release is filled per team and in total; smooth over-allocation by re-assigning ideas between teams.

**Delivery Planning tab (fine):** once a release is planned, allocate a set of sprints to it, set expected per-team capacity across those sprints (base capacity by default, override per sprint for leave), convert ideas into epics/stories, and see a sprint-level waterline — one line per team plus a total — moving items between teams to smooth delivery.

## 3. Key entities (app-managed data model)

| Entity | Home | Notes |
| --- | --- | --- |
| Release | Jira Version + app record | App stores only its own planning metadata (threshold, team assignments, sprint selection); name, target date, and released status are read live from the Jira Version, not duplicated into an app-owned table |
| Team | App config | Maps to a squad (Apollo/Adama/Zenith/Cylon) and its board(s) |
| Idea | JPD idea (linked) | Planning-mode unit; carries T-shirt size + team assignment |
| T-shirt scale | App config | Configurable size→points map (e.g. XS=1, S=3, M=8, L=13, XL=21) |
| Release capacity | App storage | Expected total points per team per release |
| Sprint | Jira sprint (linked) | Delivery-mode unit; app links sprints to a release |
| Sprint capacity | App storage | Base capacity per team, overridable per sprint (leave, etc.) |
| Threshold | App config | Default target fill %, per release (e.g. 70%) |

**Storage principle:** all capacity numbers live in Forge storage (single source of truth, inside Atlassian cloud), *not* in a spreadsheet and *not* awkwardly stuffed into issue fields.

## 4. Release Planning tab — functional requirements

- **P1** — Select/create a release (backed by a Jira Version) and open its planning board.
- **P2** — Pull in JPD ideas; add ideas to the release (link, not copy).
- **P3** — Assign a T-shirt size to each idea; app converts to points via the configurable scale.
- **P4** — Assign each idea to a team.
- **P5** — Set expected release capacity per team (base number, editable).
- **P6** — Set a fill threshold for the release (default configurable, e.g. 70%).
- **P7** — **Release waterline:** per team, show assigned points vs. capacity vs. threshold line. Items/teams re-colour dynamically as ideas are added, removed, resized, or reassigned:
  - below threshold = headroom
  - between threshold and capacity = filling / caution
  - above capacity = over-allocated
- **P8** — Show a total-across-teams roll-up alongside the per-team lines.
- **P9** — Re-assign ideas between teams (drag or select) and see both teams' waterlines update live — the "smooth out over-allocation" action.
- **P10** — Flag when a team is over threshold/capacity while another has headroom (smoothing suggestion).

## 5. Delivery Planning tab — functional requirements

- **D1** — Switch to the Delivery Planning tab for a planned release.
- **D2** — Allocate a set of sprints to the release (per team; sprints are real Jira sprints). Optionally bulk-create future sprints (or integrate with an existing bulk-sprint capability).
- **D3** — Set a **base capacity** per team used by default for every sprint in the release.
- **D4** — Override capacity for any individual sprint (e.g. reduce for known leave). Overrides persist; un-overridden sprints inherit base.
- **D5** — Convert ideas into epics/stories in the relevant squad project(s), carrying the link back to the idea and the release Version.
- **D6** — **Sprint waterline:** one line per team plus a total, showing committed/assigned points vs. per-sprint capacity across the release's sprints, with the same dynamic re-colouring as in Release Planning.
- **D7** — Move work items between teams and/or sprints and see waterlines update live — the "smooth out delivery" action.
- **D8** — Reconcile: show planned (idea T-shirt) points vs. actual (story-pointed) points per team, so estimate drift at the release level is visible.

## 6. Capacity model (confirmed decisions)

- **Unit:** Story points (canonical).
- **Entry:** base capacity per team per sprint, with per-sprint overrides for leave. No per-person availability modelling in v1 (the DM enters the deflated team number; the *reason* can be captured as a note). Rationale: matches the real constraint (one-tester-per-team bottleneck is not a points problem) without over-engineering a person-level calendar.
- **Threshold:** the tool draws the threshold line explicitly (unlike Plans, where the buffer must be baked into the number invisibly). Capacity stays the raw expected figure; threshold % is a separate, visible line.
- **T-shirt → points:** fixed, configurable map. (Range/band sizing explicitly out of scope for v1.)

## 7. UI surfaces (Forge)

- **Global page**, tab-based: Intake · Release Planning · Delivery Planning · Config · Jira. Release Planning and Delivery Planning are separate top-level tabs (not a mode toggle within one screen) — each with its own waterline visualisation.
- **Config tab** — teams↔squads + Jira board mapping, T-shirt scale, default threshold, access control. Releases/versions are read live from Jira, not a Config-owned table.
- (Optional later) board/backlog panel showing the current sprint's team capacity fill.

## 8. Data & integration

- **R1** — Capacity, threshold, and fill data are held in Forge storage as the single source of truth. External reporting is *not* a v1 requirement; the app owns display of its own data via its UI (§7). If a downstream reporting need emerges later, exposing the numbers on a queryable surface (custom field, marker issue, or data endpoint) can be added — but it is out of scope for v1.
- **R2** — Release Version is the join key across the app, JPD ideas, epics/stories, and existing release-assembly JQL.
- **R3** — Committed and delivered points per sprint come from real Jira data (Sprint field + status); the app reads/joins to them for the delivery waterline rather than storing its own copy.

## 9. Non-functional / constraints

- Built on **Forge** (Atlassian-hosted; data stays in Atlassian cloud, honouring data residency).
- Self-contained: no dependency on external reporting tools or admins to operate.
- Waterline re-colouring must feel live (client-side recompute on edit), not a page reload.
- Respects existing model: **Planned Version lives at Epic level** — any release-assembly traversal reads version via the parent Epic, not the Story.
