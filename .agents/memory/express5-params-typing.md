---
name: Express 5 req.params widening
description: Why parseInt(req.params.id) sometimes type-errors on only some routes in this repo
---

In this repo (Express 5 + @types/express v5), a route handler registered with MORE THAN ONE
middleware (e.g. `app.post(path, isAuthenticated, isOwner, handler)`) makes TypeScript pick a
different overload where `req.params` widens to `string | string[]`. Then `parseInt(req.params.id)`
fails with TS2345 ("string | string[]" not assignable to "string").

Routes with a SINGLE middleware (e.g. `app.post(path, isAdminOrOwner, handler)`) keep `req.params`
as `string`, so the same `parseInt(req.params.id)` line compiles fine. This is why only some
otherwise-identical routes flag the error.

**Fix:** wrap with `String()` — `parseInt(String(req.params.id))`. Harmless and resolves the type.

**Why:** noticed because a new multi-middleware route errored while ~9 identical single-middleware
lines did not. A couple of pre-existing multi-middleware routes in `server/routes.ts` carry this
same (intentionally unfixed) error.
