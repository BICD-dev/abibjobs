---
name: Mixed snake_case/camelCase API responses
description: Admin endpoints mix raw-SQL (snake_case) and Drizzle-select (camelCase) result keys; frontend must match each source or fields silently show "—".
---

The rule: in this codebase, endpoints built on raw `db.execute(sql\`...\`)` return snake_case keys, while endpoints built on Drizzle `db.select()` return camelCase keys. A single page can consume both (e.g. a list from raw SQL and a detail view from Drizzle selects), so the frontend must use the right casing per endpoint.

**Why:** A detail modal read snake_case keys (`registration_ip`, `poster_id`, `created_at`) from a Drizzle-select endpoint and every affected field silently rendered "—" — no error, just missing data. Found only by inspecting the real JSON with curl.

**How to apply:** When wiring frontend to any admin/aggregate endpoint, curl the endpoint first and copy key names from the actual response instead of assuming. When adding fields to both list (raw SQL) and detail (Drizzle) endpoints, expect two different casings for the same column.

Also: any endpoint that returns a full Drizzle `users` row must strip `passwordHash`, `passwordResetToken`, `passwordResetExpiry` before `res.json` — leaking reset tokens to staff admins enables owner-account takeover via the forgot-password flow.
