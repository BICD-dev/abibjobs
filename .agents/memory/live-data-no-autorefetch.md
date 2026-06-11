---
name: Live/cross-user UI must opt into polling
description: Global react-query config disables ALL auto-refetch, so any UI reflecting another user's changes needs explicit refetchInterval.
---

# Cross-user "live" UI must opt into refetchInterval

`client/src/lib/queryClient.ts` sets the global query defaults to
`refetchInterval: false`, `refetchOnWindowFocus: false`, `staleTime: Infinity`,
`retry: false`. So once a query resolves, it **never** auto-refetches — data only
changes via an explicit `queryClient.invalidateQueries` (triggered by a mutation
on *this* client) or a full page reload.

**Why:** This bites any feature that must reflect a change made by *another* user
(chat messages, disputes, job status, offers). Example bug: a worker sitting on an
in-progress job page never saw the dispute chat appear after the poster raised a
concern — `useDisputeByJob` had cached its initial 404 (`null`) and nothing on the
worker's client ever refetched it. Auth/data were all correct; the cache was frozen.

**How to apply:** For anything that needs to stay live across users, add an explicit
`refetchInterval` (the v5 callback form `(query) => number | false` works and ignores
`staleTime`). `SupportChat.tsx` is the reference pattern (polls ticket 5s, messages
3s). Gate polling on relevant state and stop it when terminal (e.g. dispute
`status === 'resolved'`) to avoid indefinite background polling.
