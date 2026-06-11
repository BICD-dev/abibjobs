---
name: WebSocket server + Vite HMR coexistence
description: How to add a WebSocket server on the shared httpServer without breaking Vite's HMR websocket in dev.
---

# Adding a WebSocket server alongside Vite HMR

The dev server runs Vite in middleware mode on the SAME Node `httpServer` that
Express uses. Vite attaches its own `httpServer.on('upgrade')` handler for its
HMR websocket. This creates two traps:

**Rule:** never create a `new WebSocketServer({ server: httpServer })`. That
takes over ALL upgrade events and silently kills Vite HMR (the page shows
"server connection lost. Polling for restart..." and never hot-reloads).

**How to apply:** use `new WebSocketServer({ noServer: true })` and register your
own `httpServer.on('upgrade', ...)` that parses the URL pathname and only calls
`wss.handleUpgrade(...)` for YOUR path (e.g. `/ws/call`). For any other
pathname, `return` WITHOUT destroying the socket in dev — Vite's upgrade
listener also fires and needs the untouched socket to handle HMR.

**Production caveat:** in production there is no Vite, so unmatched upgrades leak
sockets (Node won't auto-destroy once any 'upgrade' listener exists). Destroy
non-matching upgrade sockets only when `NODE_ENV === 'production'`.

**Why:** verified empirically — scoping the upgrade handler by pathname keeps HMR
hot-updating while the app's own websocket authenticates and runs on its path.

## Sharing auth/session between HTTP and the WS upgrade
- Memoize the express-session middleware into a module singleton so HTTP and the
  WS upgrade share ONE pg session store; run it on the upgrade `req` with a `{}`
  mock `res` to populate `req.session` (safe: session/on-headers only wrap
  `res.end`/`res.writeHead`, never invoked on a read path).
- Resolve userId from the session the same way the app does elsewhere:
  `session.manualUserId || session.passport.user.claims.sub` (dual auth: manual + OIDC).

## React Fast Refresh gotcha
- A file that exports BOTH a component and a hook (e.g. `CallProvider` + `useCall`)
  trips Vite's "consistent components exports" rule, so edits force a full page
  reload instead of fast-refresh. Harmless in production; split the hook into its
  own file if fast-refresh on that file matters.
