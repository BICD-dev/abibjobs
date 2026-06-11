# Threat Model

## Project Overview

ABIB JOBS is a production Express + React marketplace where Nigerian users post and accept quick jobs, upload identity documents, chat with support, and move money through an in-app wallet and escrow system. Authentication is split between Replit OIDC and manual email/password accounts. The highest-risk production concerns are account recovery, wallet and escrow integrity, uploaded-document privacy, and separation between regular users, staff admins, and the owner.

This deployment is currently password-protected at the platform layer. That reduces unsolicited public internet traffic, but any user who can reach the app and authenticate must still be treated as a realistic attacker. Development-only tooling and Vite/HMR paths are out of scope unless a production route reaches them.

## Assets

- **User accounts and sessions** — manual-password accounts, OIDC-backed sessions, password-reset tokens, and admin sessions. Compromise allows impersonation and access to money, chats, and PII.
- **Wallet and escrow balances** — user wallet balances, escrowed job funds, withdrawals, deposits, and platform earnings. Integrity failures here translate directly into financial loss.
- **Identity and dispute evidence** — ID cards, face scans, profile images, dispute uploads, and related moderation notes. These contain sensitive personal information.
- **Job and support data** — job details, offers, worker assignments, notifications, dispute threads, and support ticket messages. Exposure can leak private user activity and operational data.
- **Secrets and service credentials** — database connection, session secret, OIDC settings, Paystack credentials, and object storage credentials.

## Trust Boundaries

- **Browser to API** — all client requests are untrusted. The server must enforce authentication, authorization, and business rules regardless of what the frontend shows or hides.
- **API to PostgreSQL** — the server can mutate balances, sessions, admin records, and user PII. Bugs here can become total compromise of integrity or confidentiality.
- **API to external identity and payments** — Replit OIDC and Paystack responses must be trusted only after explicit validation by the server.
- **API to object storage** — presigned upload issuance and object download routes cross into storage containing sensitive user uploads.
- **Authenticated user to admin/owner** — staff-admin and owner actions must be separated from normal-user capabilities server-side.
- **Production vs dev-only code** — `client/`, `server/`, and `shared/` are production scope. Local dev helpers, Vite-only behavior, and mockup/sandbox assumptions are out of scope unless reachable from production handlers.

## Scan Anchors

- Production entry points: `server/index.ts`, `server/routes.ts`, `server/replit_integrations/**`, `shared/routes.ts`.
- Highest-risk code areas: auth and password reset in `server/routes.ts`; wallet/escrow and job lifecycle in `server/routes.ts` + `server/storage.ts`; object storage upload/download routes in `server/replit_integrations/object_storage/`; admin/support flows in `server/routes.ts`.
- Public/authenticated/admin split: upload URL issuance and object reads are public unless explicitly guarded; most wallet/job/profile routes are authenticated; admin and owner routes live under `/api/admin/**` plus dispute-resolution helpers.
- Usually ignore unless production reachability changes: Vite/dev server paths, workflow tooling, and mockup-only sandbox behavior.

## Threat Categories

### Spoofing

This app supports both OIDC sessions and manual-password sessions, plus a separate staff-admin login path. The system must only let users act as the account actually bound to their session, and password-reset flows must never hand takeover secrets back to the requester. Admin and owner identity checks must be enforced on every privileged route server-side.

### Tampering

Users can submit job details, offers, uploads, support messages, and wallet actions from an untrusted client. The server must calculate escrow, fees, payouts, and role-based actions itself. Financial state changes must be atomic and tied to verified payment events; otherwise users can create money, double-spend balances, or alter job outcomes.

### Information Disclosure

The platform stores highly sensitive uploads such as ID cards and face scans, plus support and dispute evidence. Object downloads, API responses, and error messages must only disclose data to authorized users. Password-reset tokens, internal payment references, and admin-only records must never be exposed to regular users or unauthenticated callers.

### Denial of Service

Public and lightly protected routes include login, password reset, file-upload URL issuance, and object serving. These paths must avoid unbounded work and should resist abusive request volume, especially where storage, auth, or external-payment calls are involved.

### Elevation of Privilege

Regular users, staff admins, and the owner have materially different powers. The backend must enforce route-level and record-level authorization so users cannot read private uploads, resolve disputes, access admin dashboards, or force wallet transitions outside their permissions. Any path that relies on frontend behavior or non-atomic storage helpers is a priority review area.
