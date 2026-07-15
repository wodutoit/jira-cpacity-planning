# Release Capacity Planning

An Atlassian Forge app for Jira that plans and tracks release delivery across teams: idea intake and prioritization (RICE), release capacity planning against team sprint capacity, and delivery execution (converting ideas into Epics/Stories, allocating them to sprints, and tracking actuals against plan).

Currently a **proof of concept** — no automated test suite yet; see [Status](#status) below.

## Stack

- **Backend**: Node.js Forge resolver (`src/index.js`), using `@forge/resolver`, `@forge/kvs` (app storage), `@forge/api` (Jira REST calls, always `asUser()`)
- **Frontend**: React + Vite Custom UI app (`static/capacity-waterline/`), served from a single `jira:globalPage` module with sidebar sub-pages for Intake, Release Planning, and Delivery Planning
- **Data**: reads/writes real Jira issues, sprints, and Versions via REST; app-specific config (teams, field mappings, capacity) lives in Forge Storage

## Prerequisites

- Node.js (see `manifest.yml` — currently targets the `nodejs22.x` runtime)
- [Forge CLI](https://developer.atlassian.com/platform/forge/getting-started/) installed and logged in (`forge login`)
- Access to the target Jira Cloud site

## Project layout

```text
manifest.yml                  Forge app manifest (modules, scopes, resource)
src/index.js                  Resolver — all backend logic and Jira API calls
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

## Status

- All planned tabs (Intake, Release Planning, Delivery Planning, Config, Jira Config) are built and functional.
- No automated tests or CI exist yet — deliberate, since this is still a POC. Revisit if/when it moves to ongoing production use.
- See `.claude/memory/project_build_progress.md` for detailed build history, architecture decisions, and known limitations.
