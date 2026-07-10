---
name: feedback-prototype-first
description: Always read the prototype HTML before building or updating any screen in this project
metadata:
  type: feedback
---

Always read `.spec/design_handoff_jira_extension/Release Capacity Waterline.dc.html` before building or modifying any screen in this project.

**Why:** Screens built without consulting the prototype drifted significantly from the design — wrong layout, missing sections (e.g. base capacity card), wrong grouping logic. The prototype contains the authoritative JS data-model (`dVals()`) and HTML render (`renderVals()`) for every screen.

**How to apply:**
- Before implementing any new tab or stage, search the prototype for the relevant section and read the render markup verbatim.
- Use the `dVals()` function to understand the data shape and derived values (coverage, capacity, state chips, etc.).
- Match layout, card structure, column headers, and cell behaviour to the prototype exactly.
- If a screen already exists, compare the current implementation against the prototype and list gaps before touching code.
- The file is large (~3800 lines); use Read with `offset`/`limit` or Grep to target the right section rather than reading the whole file.
