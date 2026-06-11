---
name: Admin and user sessions are independent and coexist
description: This app has two separate session identities (regular user vs staff-admin) that can be logged in simultaneously in the same browser; profiles.role is NOT an admin gate.
---

# Two independent auth layers that coexist

This app has **two separate login systems** that live in the same session/cookie and can both be active at once:

1. **Regular user session** — OIDC (`req.user.claims`) or manual (`req.session.manualUserId`). Surfaced by `GET /api/auth/user`.
2. **Staff-admin session** — `req.session.adminId`, set only by `POST /api/admin/login` against an `admin_users` row. Surfaced by `GET /api/admin/me`.

Because they are independent, the **same browser can be user X and admin Y at the same time**: `/api/auth/user` and `/api/admin/me` can legitimately return *different people*. Classic confusion: "I'm logged in and functioning as an admin, but my account isn't in the Staff Management list" — the admin powers are coming from a *different* admin login (e.g. logged into the app as a worker, and into the admin panel as Lisa).

**Admin access is granted ONLY by:**
- email === `OWNER_EMAIL` (hardcoded owner), OR
- a valid `admin_users` row logged in via `/api/admin/login` (sets `session.adminId`).

**`profiles.role` is decorative — NOT an auth gate.** A regular user with `profiles.role = 'admin'` does **not** get admin access; nothing in the server checks `profiles.role` for admin gating. Do not assume it does.

**Staff admins are separate credentials from the user account**, even with the same email. "Add New Admin" (owner-only, `POST /api/admin/staff`) creates a brand-new `admin_users` row with its own generated password; it does not link to or read the user's regular password. To make an existing regular user an admin, the owner must add them via that flow — the person then logs into the admin login page with the generated password, separate from their normal user login.

**How to apply:** When a user reports "X is/isn't an admin" confusion, check both identities separately (`/api/auth/user` vs `/api/admin/me`), and check `admin_users` (not `profiles.role`) for who is actually an admin.
