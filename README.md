# Release Capacity Planning

An Atlassian Forge app for Jira that plans and tracks release delivery across teams: idea intake and prioritization (RICE), release capacity planning against team sprint capacity, and delivery execution (converting ideas into Epics/Stories, allocating them to sprints, and tracking actuals against plan).

Currently a **proof of concept** — no automated test suite yet; see [Status](#status) below.

## Stack

- **Backend**: Node.js Forge resolver (`src/index.js`), using `@forge/resolver`, `@forge/kvs` (app storage), `@forge/api` (Jira REST calls via `asUser()` / `asApp()`)
- **Frontend**: React + Vite Custom UI app (`static/capacity-waterline/`), served from a single `jira:globalPage` module with sidebar sub-pages for Intake, Release Planning, and Delivery Planning
- **Data**: reads/writes real Jira issues, sprints, and Versions via REST; app-specific config (teams, field mappings, capacity) lives in Forge Storage
- **Export**: a Forge Web Trigger exposes capacity data as JSON for external BI tools (EazyBI, etc.)

## Prerequisites

- Node.js (see `manifest.yml` — currently targets the `nodejs22.x` runtime)
- [Forge CLI](https://developer.atlassian.com/platform/forge/getting-started/) installed and logged in (`forge login`)
- Access to the target Jira Cloud site

## Project layout

```text
manifest.yml                  Forge app manifest (modules, scopes, resource)
src/index.js                  Resolver + web trigger — all backend logic and Jira API calls
static/capacity-waterline/    React frontend (Vite)
  src/                        Components, tabs
  build/                      Built output (what the manifest's `resources` points at)
```

## Local development

The frontend must be built before every deploy — Forge serves the static `build/` output, it doesn't build it for you.

```bash
cd static/capacity-waterline
npm install
npm run build
```

To iterate on the resolver against a live Jira site without redeploying each time, run a tunnel (development environment only):

```bash
forge tunnel
```

## Deploying

From the repo root, after building the frontend:

```bash
forge lint                                   # check manifest/resolver for scope & API issues
forge deploy --no-verify                     # --no-verify works around a Windows pre-deploy lint bug
```

`forge deploy` defaults to the `development` environment. To deploy elsewhere:

```bash
forge deploy -e staging --no-verify
forge deploy -e production --no-verify
```

### Installing on a site

A fresh environment (or a site the app has never been installed on) needs an explicit install. This can be run non-interactively:

```bash
forge install -e staging -s <your-site>.atlassian.net -p jira --confirm-scopes --non-interactive
```

If the manifest's `permissions.scopes` changes (new scope added), existing installs need an upgrade — this also runs non-interactively, despite Forge's docs implying otherwise:

```bash
forge install --upgrade -e <environment> -s <your-site>.atlassian.net -p jira --confirm-scopes --non-interactive
```

Check current installs with:

```bash
forge install list
```

### Environments are isolated

`development`, `staging`, and `production` each have **completely separate Forge Storage** — even when installed on the same site. Config (teams, Jira field mappings, Idea/Release space setup, admins/editors) does not carry over between environments; each one needs to be configured from scratch via the app's own Config and Jira Config tabs after install. In Jira's sidebar, multiple environments installed on the same site show as separate entries with the same name — distinguish them by whether their Config tab is populated.

---

## App configuration

After installing the app on a Jira site, open it from the sidebar and complete the following steps in order. All configuration is per-environment.

### 1 — Jira Config tab

Maps the app to your Jira projects and fields. Requires Jira admin access on the target site.

| Setting | Description |
| --- | --- |
| **Idea Space** | The Jira project where `Idea` issue types live. Can be a JPD or Software project. |
| **Release Space** | The Jira Software project whose Versions (name + target date) are used as releases. Leave blank to use the Idea Space itself. |
| **Release Space Field** | The field on ideas that stores which version they target — almost always `fixVersions`. |
| **Idea Release Field** | The field on Idea issues that records which release the idea is targeting. |
| **Team Field** | The Jira field used to assign a team to an idea (defaults to Jira's built-in Atlas Team picker `customfield_10001`). |
| **Size Field** | A number field on Idea issues used for T-shirt size (XS=1, S=3, M=8, L=13, XL=21). |
| **RICE Fields** | Four number fields for Reach, Impact, Effort, Confidence. JPD projects auto-map these. |
| **Status Mapping** | Maps each app lifecycle stage (New → Backlog → ToDo → Doing → Done) to a real Jira status in the Idea project. |

Click **Validate configuration**, then **Save** once validation passes.

### 2 — Config tab

Sets up teams and app-level settings.

| Setting | Description |
| --- | --- |
| **Admins** | Jira users who can change configuration. If left empty, all users are treated as admins. |
| **Editors** | Jira users who can create/edit ideas and delivery plans. If left empty, all users can edit. |
| **Scale** | Point values for each T-shirt size (XS/S/M/L/XL). |
| **Threshold** | Waterline fill percentage at which a sprint cell is shown as "Filling" rather than "OK" (default 70%). |
| **Teams** | Add one entry per delivery team. Each team needs: a name (selected from the Team Field's allowed values), a Jira Scrum board, sprint length (weeks), sprint capacity (story points), and sprints per release. |

### 3 — Tabs overview

| Tab | Purpose |
| --- | --- |
| **Intake** | View, create, prioritize (RICE), size, and assign ideas to teams and releases. |
| **Release Planning** | Drag ideas onto the waterline per release; set capacity targets per team. |
| **Delivery Planning → Sprints & Capacity** | Select sprints from each team's board; record capacity, committed SP, and velocity per sprint; view release coverage. |
| **Delivery Planning → Convert Ideas** | Convert prioritized ideas into Jira Epics or Stories allocated to selected sprints. |
| **Delivery Planning → Waterline** | Live grid of allocated vs capacity across all teams and sprints. |

---

## EazyBI / external BI integration

The app exposes a **Web Trigger** endpoint that returns all capacity planning data as JSON. This is how you connect EazyBI (or any REST-capable BI tool) to the app's data.

### Step 1 — Generate an API token

1. Open the app → **Jira Config** tab → **API Access** section.
2. Click **Generate** to create a random token, or paste your own.
3. Click **Save token**.

Keep this token secret — anyone who has it can read all capacity planning data for this environment.

### Step 2 — Copy the endpoint URL

The **Data endpoint URL** field in the same section shows the full Forge Web Trigger URL for this environment. Click **Copy**.

The URL looks like:

```text
https://api.atlassian.com/webtrigger/.../<environment>/<trigger-key>
```

### Step 3 — Configure EazyBI

1. In EazyBI go to **Manage account → Source data → REST API**.
2. Create a new REST API source:
   - **URL**: paste the endpoint URL from step 2
   - **Method**: `GET`
   - **Authentication**: Custom header → `Authorization: Bearer <your-token>`
3. Set the **Data path** to `records`.
4. Map fields as needed — each record contains:

| Field | Type | Description |
| --- | --- | --- |
| `versionName` | string | Jira release/version name |
| `releaseDate` | date | Target release date |
| `versionReleased` | boolean | Whether the version is marked released |
| `teamName` | string | Delivery team name |
| `sprintName` | string | Sprint name |
| `sprintState` | string | `active`, `future`, or `closed` |
| `sprintStartDate` | date | Sprint start date |
| `sprintEndDate` | date | Sprint end date |
| `baseCapacity` | number | Team's default sprint capacity (story points) |
| `capacity` | number | Planned capacity for this sprint (overridden or base) |
| `committed` | number | Story points committed at sprint start (`null` if not captured) |
| `velocity` | number | Actual velocity achieved (`null` if not captured) |

The response envelope also includes `generatedAt` (ISO timestamp) and `recordCount` for diagnostics.

### Alternative: token in query string

If your BI tool doesn't support custom headers, you can pass the token as a query parameter instead:

```text
<endpoint-url>?token=<your-token>
```

### Testing the endpoint without EazyBI

**Browser (quickest)** — paste directly into the address bar and hit Enter:

```text
<endpoint-url>?token=<your-token>
```

The raw JSON response renders immediately. Copy the URL from the app's Jira Config → API Access section, append `?token=` and your token.

**curl:**

```bash
curl -H "Authorization: Bearer <your-token>" "<endpoint-url>"
```

Pretty-print the output with `| python -m json.tool` or `| jq .` if either is available.

**PowerShell:**

```powershell
Invoke-RestMethod -Uri "<endpoint-url>?token=<your-token>" | ConvertTo-Json -Depth 5
```

**Postman / Insomnia:**

- Method: `GET`
- URL: the endpoint URL
- Header: `Authorization: Bearer <your-token>`

A successful response looks like:

```json
{
  "generatedAt": "2025-07-17T10:00:00.000Z",
  "recordCount": 12,
  "records": [
    {
      "versionName": "7.0.27R1",
      "releaseDate": "2025-10-07",
      "teamName": "PRK",
      "sprintName": "Sprint 1",
      "sprintState": "closed",
      "sprintStartDate": "2025-07-01",
      "sprintEndDate": "2025-07-15",
      "baseCapacity": 40,
      "capacity": 40,
      "committed": 38,
      "velocity": 35
    }
  ]
}
```

A 401 response means the token is missing, wrong, or not yet saved. A 400 response means no Jira project is configured in the app yet.

---

## Status

- All planned tabs (Intake, Release Planning, Delivery Planning, Config, Jira Config) are built and functional.
- EazyBI / REST export endpoint is implemented and available in all environments.
- No automated tests or CI exist yet — deliberate, since this is still a POC. Revisit if/when it moves to ongoing production use.
- See `.claude/memory/project_build_progress.md` for detailed build history, architecture decisions, and known limitations.
