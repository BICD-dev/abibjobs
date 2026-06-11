---
name: Dev vs Prod database separation
description: The published/deployed app uses a SEPARATE production database from the dev environment — they hold different rows.
---

# Dev and production use separate databases

When the app is published/deployed on Replit, the deployed app talks to a **separate production database** from the one the dev environment (and the agent's tools) use. The same logical user can exist as **different rows with different ids** in each DB.

**Real example:** the owner account existed in dev as id `owner-broadcast-test` and in prod as a numeric Replit-OIDC id — different `auth_method` and password state in each.

**Why this matters:** A DB fix applied in dev (via `executeSql` default `environment:"development"`, or a bash/pg script using the dev `DATABASE_URL`) does **NOT** affect the published app. "Works in dev but fails on the live site" with auth/data issues is the classic symptom.

**How to apply:**
- Check production state with `executeSql({ environment: "production" })` — but it is **READ-ONLY** (SELECT only). The agent cannot write to prod directly.
- To change production data, the change must flow through the app itself (a route/flow the user triggers on the live site), or the user runs it. Don't assume a dev-side script fixed production.
- For production schema changes, that happens automatically at Publish time (see database skill), not via custom scripts.

**Auth packages:** this project hashes with `bcryptjs` (NOT `bcrypt`); server imports `import bcrypt from "bcryptjs"`. In node scripts use `require('bcryptjs')`.
