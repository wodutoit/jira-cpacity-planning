# Handoff: Capacity Waterline — Jira Extension (full build)

> Developer handover for building the **Capacity Waterline** app as a Jira (Atlassian) extension.
> Audience: an engineer using Claude Code to implement this in a real codebase.

---

## 1. Overview

**Capacity Waterline** is a release‑planning tool that sits on top of Jira. It lets a product/engineering org:

1. **Intake** — capture new ideas and prioritise them with **RICE**.
2. **Release Planning** — decide which ideas go into which release, per team, against each team's **capacity** (the "waterline"), then
3. **Delivery** — pick the sprints that make up a release, **convert** planned ideas into Jira epics/stories, and track the resulting work on a **waterline** of sprints, reconciling planned vs. actual.

A single **idea record** flows through all of this via a status lifecycle: **New → Backlog → ToDo → Doing → Done**. The app reads ideas, teams, sprints and issues from Jira, and stores its own planning metadata (capacity settings, RICE, T‑shirt scale, mappings) in extension storage.

The **Jira** settings screen is the integration contract: it maps every app concept to a Jira space/field.

---

## 2. About the design files & fidelity

- The bundled file **`Release Capacity Waterline.dc.html`** is a **high‑fidelity, fully interactive design reference** built in HTML/JS. It is **not** production code to ship. Recreate its screens and behaviour in the target stack using that stack's own component library, state management and styling.
- **Fidelity: high.** Colours, type, spacing, layout and interactions are final. Reproduce them faithfully, mapping the prototype's CSS custom properties to your design system's tokens.
- The prototype is one big component with a logic class (state + handlers + a `renderVals()` that feeds an HTML template). Treat the logic class as a view‑model/controller and split it into your app's normal structure (routes/pages/stores/components).
- **`Sample Data` tab is a prototype‑only harness** for editing the mock Jira tickets that drive the demo. In production this data comes from Jira — do **not** build the Sample Data tab; use it only to understand the issue shape.

Screenshots are included in `screenshots/` for reference (Intake, Jira mapping, validation).

---

## 3. Target architecture

Recommended: an **Atlassian Forge** app (custom UI, React) — or Connect if that's your platform. Structure:

- **Frontend**: a React SPA with the tabs below. Reuse Atlassian's design system (`@atlaskit`) for parity with Jira, but the layouts/interactions here are the spec.
- **Jira data (read, and write on delivery)** — via Jira REST / Forge bridge:
  - **Ideas** live in the **Idea Space** (a Jira project). Read/create/update idea issues there.
  - **Teams** come from **Jira Teams**.
  - **Sprints** come from each **team's mapped space** (board). Sprint create/edit happens on that space.
  - **Epics / Stories / Tasks / Bugs** live in each team's mapped space; conversion creates them there.
  - **Releases/versions** come from a configurable **field on the Idea Space** (default "Fix Version/s").
- **Extension storage** (Forge storage / app properties) holds everything Jira doesn't model:
  - Field & status **mappings** (the Jira settings screen)
  - Per‑team **Sprint weeks, Sprint cap, Sprints per release**
  - Team → space mapping
  - **T‑shirt scale** (size → story points)
  - Per‑release **capacity overrides** and per‑sprint capacity overrides (with notes, e.g. leave)
  - **RICE inputs** if your Jira instance doesn't have fields for them (else map to Jira fields)
  - Sprint **selection** per release/team, planning **threshold**, **editors/access control**

Everything the app computes (RICE score, allocation, waterline states) is **derived** — don't persist derived values.

---

## 4. Data model

### 4.1 Idea (from the Idea Space)
| App concept | Type | Notes |
|---|---|---|
| id | string | Jira issue id/key |
| title | string | maps to Jira **Summary** |
| size | `XS|S|M|L|XL|null` | app T‑shirt size → points via scale |
| team | teamId `| null` | assigned delivery team |
| release (`v`) | versionId `| null` | target release; `null` = untagged |
| status | `New|Backlog|ToDo|Doing|Done` | lifecycle (see §6) — maps to Jira statuses |
| reach | 0–5 | RICE |
| impact | 0–5 | RICE |
| effort | 1–5 (0 = unscored) | RICE denominator |
| confidence | 0–100 | RICE (%) |

### 4.2 Team (from Jira Teams + extension fields)
`{ id, name (Jira), sprintWeeks, sprintCap, sprintsPerRelease }` + **space** mapping. `sprintWeeks/sprintCap/sprintsPerRelease` are **extension‑owned**.

### 4.3 Version / Release
`{ id (name), targetDate, status: Released|Active|Pending }`. The set of releases is derived from the Idea Space's release field; name, target date, and released/archived status are read **live from the Jira Version object** (`releaseDate`, `released`, `archived`) — not duplicated into an app-owned table. The app only stores its own planning metadata against the version id (threshold, team assignments, sprint selection, etc.).

### 4.4 Sprint (from the team's space/board)
`{ id, name, goal, start, end, state: closed|active|future }`. Per team. Selection of which sprints belong to a release is per release+team (extension). Per‑sprint capacity **overrides** carry an optional note.

### 4.5 Issue (epic/story/task/bug, from the team's space)
`{ id, key, type, title, estimate (story points), team, sprint, parent (epic), ideaId (link to originating idea), status }`.

---

## 5. Jira integration & field mapping (the **Jira** settings screen)

This screen is the contract between the app and Jira. Sections:

1. **Idea Space** — select the Jira space where ideas live; **Releases field name** (the field on that space that supplies the release list; default "Fix Version/s"). Intake and Release Planning read ideas from here.
2. **Idea field mapping** — map each idea attribute to a Jira field: Summary/Title, T‑shirt size, Team, Target release, Status, Reach, Impact, Effort, Confidence, RICE score.
3. **Idea status mapping** — map lifecycle statuses to Jira status names (defaults: New→"New", Backlog→"Backlog", ToDo→"Selected for Development", Doing→"In Progress", Done→"Done").
4. **Teams** — names synced from Jira; per team, choose the **Space** (holds its epics/stories/bugs/tasks **and sprints**) and enter the extension fields (Sprint weeks/cap/per‑release).
5. **Delivery item mapping** — issue types (Epic/Story/Task/Bug → Jira type names) and fields (Estimate/Story points, Epic link/Parent, Sprint, Team).
6. **T‑shirt scale** — note that it's extension‑owned (set on Config), not read from Jira.
7. **Validate config** — verifies every referenced space and field exists before saving. **Save is disabled until validation passes**; editing any mapping clears the result and re‑arms validation. In production, validation should call Jira to confirm the space keys and field ids resolve (and that the mapped statuses exist in the relevant workflows); in the prototype it checks presence/among-known-spaces.

**Behaviour to preserve:** the team→space mapping is the single source of truth for where a team's issues and sprints live — it drives conversion issue keys, sprint pickers, and the capacity/waterline grids. (In the prototype it backs the `dProjects` lookup.)

---

## 6. Idea status lifecycle (core rules)

```
New  →  Backlog  →  ToDo  →  Doing  →  Done
```
| Status | Meaning | Trigger |
|---|---|---|
| **New** | Captured, being evaluated in Intake | default on create |
| **Backlog** | Scored & accepted into the prioritised pipeline | **manual** in Intake (New→Backlog) — allowed only once a RICE score exists |
| **ToDo** | Slotted to a team for a release | not automated by the app — team assignment alone does not change status; set manually in Jira if this state is needed |
| **Doing** | Converted to a Jira epic | **auto**: on convert‑to‑epic in Delivery |
| **Done** | Delivered | **manual/derived**: when the linked epic is Done, the "Mark idea Done" button on the waterline sets it |

Team assignment and team removal are **not** wired to status changes — this was in the original design reference but was deliberately dropped from the build.

**Visibility gates (must implement):**
- **Intake** shows only ideas with status **New** or **Backlog**.
- **Release Planning**'s idea board shows only ideas that have a RICE score **and** status ≠ New (i.e. Backlog/ToDo/Doing/Done). New/unscored ideas never appear there.

---

## 7. RICE model

- Ratings: **Reach, Impact, Effort** on a 0–5 scale (rendered as 5 clickable dots); **Confidence** 0–100%.
- **Score = Reach × Impact × Confidence / Effort**, rounded to 1 decimal. If Effort = 0 the score is 0 ("unscored"; shown as "—").
- "Has a RICE score" ⇔ score > 0. This gates promotion (New→Backlog) and Release‑Planning visibility.

---

## 8. Capacity & the waterline (the math)

- **Story points** per idea = T‑shirt size → scale. Default scale: `XS:1, S:3, M:8, L:13, XL:21` (editable on Config).
- **Team release capacity** = `sprintCap × sprintsPerRelease`, unless a **per‑release override** is set for that team. A team with no sprint cap = "no capacity".
- **Allocation** for a team in a release = Σ points of that release's ideas assigned to the team.
- **Fill %** = allocation / capacity × 100. Bar/state:
  - **over** — % > 100
  - **filling** — % > threshold (default **70%**, configurable) and ≤ 100
  - **ok** — ≤ threshold
  - **nocap** — team has no capacity set
- The planning chart plots each team's bar to a fixed top scale; it flags over‑capacity teams and suggests teams with headroom.

---

## 9. Screens / views

Tabs (in order): **Intake · Release Planning · Delivery Planning · Config · Jira · (Sample Data — prototype only)**. (The prototype also has an "Edge states" gallery — a design catalogue of loading/empty/error states to reproduce, not a user screen.)

Note: the original design reference combines Release Planning and Delivery into one screen behind a Planning/Delivery mode toggle. The build instead splits these into two separate top-level tabs — **Release Planning** and **Delivery Planning** — since that maps more naturally onto Jira's own tab-based navigation. This is an intentional deviation from the reference, not a gap.

### 9.1 Intake
Capture + RICE‑prioritise New/Backlog ideas. Layout: header with New/Backlog/ready counts → add‑idea form (summary, size, target release) → **Version** and **Team** multi‑select filter chip rows (each with All + Untagged/Unassigned) → RICE table.
**Table columns:** Summary (editable), Reach/Impact/Effort (clickable 5‑dot ratings), Conf. (0–100 number), **RICE** (sortable header ↓/↑; per‑row score pill), Team (select), Target release (select incl. "Unassigned"), Status (New/Backlog — **disabled until a RICE score exists**, with a "needs RICE to promote" hint), delete. Backlog rows are tinted; New rows plain. Rows sort by RICE (default desc).

### 9.2 Release Planning
Built as its own top-level tab covering the reference's "Planning mode" content (see the note under §9 above on why this is split from Delivery).

**Idea board:** the capacity waterline chart (per team, or a by‑version roadmap view) + an idea table grouped by team (plus an Unassigned group), each row: rank (drag to reorder / across teams), title, RICE pill (opens editor), size, team, version, status (Backlog/ToDo/Doing/Done). A version target‑date panel flags date/sprint conflicts.

### 9.3 Delivery Planning
Built as its own top-level tab covering the reference's "Delivery mode" content — a stepper-driven flow with four stages:
1. **Sprints & capacity** — pick which sprints (from each team's mapped space) belong to this release; shows release coverage (available vs planned), base capacity per team, and a per‑sprint capacity grid with overrides (+ reason, e.g. leave). Creating/editing a sprint happens on the team's space.
2. **Convert ideas** — the release's team‑assigned ideas become Jira epics (+ stories per selected sprint); converting sets the idea to **Doing**. Handles epics that were moved to another team's project in Jira (mismatch warning + "move" action).
3. **Waterline** — the resulting Jira items grouped by team; the **Linked idea** column shows the originating idea, and when an epic is **Done** but its idea isn't, a **"✓ Mark idea Done"** button sets the idea to Done.
4. **Reconcile** — planned (config) vs actual (converted) points per team.

### 9.4 Config
App‑owned settings: Teams (name + sprint weeks/cap/per‑release + derived release cap + Jira board mapping), Access control (editors), Planning defaults (threshold, warn statuses), **T‑shirt scale**. Save with dirty/saved state. Releases/versions are **not** an app-owned table here — they're read live from the Idea Space's release field, with name/date/status coming directly from the Jira Version object (see §4.3). This is a deliberate improvement over the original design reference: one less place for release data to drift out of sync with Jira.

### 9.5 Jira
The integration mapping + validation described in §5.

---

## 10. Interactions & behaviour (notable)

- **RICE dots**: click dot *k* sets the value to *k*; changing any RICE input recomputes the score live.
- **Filters/sort** (Intake): multi‑select chips (empty/All = show all); RICE header toggles sort direction.
- **Drag & drop** (planning board): reorder ideas within a team and drag across teams (converted epics are locked to their team); drop onto a team group header to move to the bottom.
- **Auto‑transitions**: convert → Doing; epic Done → offer Done. (The reference's team‑assigned→ToDo / team‑cleared→Backlog auto‑transitions were deliberately not built — team assignment never changes idea status.)
- **Guards**: New→Backlog only with a score; unselecting a sprint that has allocation prompts confirmation; release target date later than last sprint end flags a conflict.
- **Validation gate** (Jira): Save disabled until Validate passes; edits re‑arm it.
- **Theme**: light/dark toggle.
- **Undo**: unlinking a converted idea has an undo‑confirm dialog.

## 11. State management inventory

Persist (extension storage): mappings (`jiraCfg`), teams' extension fields + team→space, versions + dates/status, T‑shirt `scale`, threshold/defaults, editors, per‑release & per‑sprint capacity overrides (+notes), sprint selection per release/team, idea ordering/priority.
Read from Jira: ideas (Idea Space), teams, sprints (team spaces), issues/epics (team spaces), release field values.
UI‑only/derived: active tab, delivery stage, current version, filters, sort, drag state, dialogs/popovers, validation result, RICE scores, allocations, waterline states, dirty/saved flags.

## 12. Design tokens

The prototype themes everything with CSS variables (light + dark). Map to your tokens:
- Surfaces `--surface / -sunken / -hover / -raised`; text `--text / -subtle / -subtlest`; lines `--border / -subtle`.
- `--brand` (primary action, active tab/chip, links).
- Status lozenges: neutral `--lz-n-*`, blue `--lz-b-*`, green `--lz-g-*`. Mapping: Doing/In Progress→blue, Done→green, New/Backlog/ToDo→neutral.
- Semantic: `--ok*` (positive/scored), `--over*` (over‑capacity/error), `--filling*` (warning), `--info*`.
- Shadow `--shadow-sm`.
- **Literal hex (no token):** RICE dots Reach `#E0A800`, Impact `#6E93F5`, Effort `#EE8C86`; planned/linked purple `#6D4BD8` and tints `rgba(124,92,246,0.06–0.14)`.
- Geometry: cards radius 8px; controls 4px; chips/pills 5–13px; dots 13px; system font stack, monospace for numbers/keys.

No image assets; icons are Unicode glyphs (`↓ ↑ ✓ ✕ × ★ ▸ ▾ 👕`) — swap for your icon set.

## 13. Jira APIs & permissions (Forge)

You'll need scopes to: read projects/issues/fields/statuses; read Jira Teams; read agile boards & sprints for team spaces; create/update issues (conversion), create/update sprints (delivery); read/write the release field on ideas. Use Forge storage for extension data. Validate‑config should resolve space keys, field ids, issue types and status names against the Jira API.

## 14. Build guidance

- Start from the **data contract** (§4–5): implement the Jira settings + validation first so real data can flow.
- Then **Intake** (§9.1) and the **lifecycle/gates** (§6), then the **planning board + capacity math** (§8, §9.2), then **Delivery Planning** (§9.3) which depends on team→space + sprints.
- Keep RICE, allocation and waterline state **derived**.
- Reproduce the light/dark theming and the status‑lozenge palette for visual parity with Jira.

## 15. Files & code anchors

`Release Capacity Waterline.dc.html` — full working reference. Useful search anchors:
- Lifecycle & gate: `planVisible`, `statusInfo`, `onReassign` (team→ToDo/Backlog), `_doConvert` / `onConvDialogCreate` (→Doing), `showIdeaDone` / `onMarkIdeaDone`.
- Intake: `isIntake` (template), `intakeRows`, `onAddIdea`, `onIntakeStatus`, `intakeVerChips` / `intakeTeamChips`, `onIntakeSort`.
- Jira mapping: `isJira` (template), `jiraCfg` (state/defaults), `onJiraCfg`, `onTeamSpace`, `_validateJira` / `onValidateJira`, `jiraSpaces`, `get dProjects()`.
- Capacity/waterline: `buildBar`, `relCapOf`, `capOf`, `alloc`, `computeRowStates`, `wlGroups`, `dGridCells`, `dSprintSel`, `dOverrides`.
- Config: `isConfig`, `scaleFields`, `teamTableRows`, `versionTableRows`.

`screenshots/` — Intake, Jira mapping, and validation states for visual reference.
