---
name: dependency security fixes
description: How transitive/breaking dependency vulnerabilities were resolved and why those choices are safe for this repo.
---

# Dependency vulnerability fixes

## uuid transitive vuln via @google-cloud/storage
Fix the uuid advisory (GHSA-w5hq-g745-h8pq) with an npm `overrides` entry
`"uuid": "^11.1.1"` in package.json — do NOT accept npm's suggested
@google-cloud/storage downgrade to 5.18.3.
**Why:** the downgrade would break the object-storage integration; there is no
patched uuid in the v8/v9 line, only >=11.1.1. The override is safe because the
only consumers (gaxios, teeny-request) call `uuid.v4()` via named export (still
present in v11) and nothing in the tree uses deprecated `uuid/vX` subpath
imports.
**How to apply:** the override is global, so if a future package misbehaves with
uuid, suspect it is silently getting v11 instead of the version it expected.

## drizzle-orm major bump 0.39 -> 0.45
The SQL-injection fix (GHSA-gpj5-g38j-94v9) requires drizzle-orm >=0.45.2.
The 0.39->0.45 major bump was safe for this codebase.
**Why:** the fix only changed escaping of dynamic SQL identifiers
(`sql.identifier` / `sql.raw` / dynamically built aliases). This app uses none —
all `sql` template interpolations are static column refs or parameterized
values. drizzle-zod@0.7.0 (peer `drizzle-orm >=0.36.0`) and drizzle-kit@0.31.x
stay compatible; `db:push` ran clean ("No changes detected").
**How to apply:** if a future drizzle bump fails, check for newly introduced
dynamic identifier usage before assuming the upgrade itself is the problem.
