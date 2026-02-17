# ABIB JOBS - Replit Agent Guide

## Overview

ABIB JOBS is a Nigerian job marketplace web application where users can post and accept quick jobs (cleaning, AC repair, phone repair, escorts, etc.). The platform features an escrow-based payment system through an in-app wallet, identity verification via ID card uploads, and Replit Auth for user management. Users can post jobs, accept available jobs, and get paid through the wallet system when jobs are completed.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Full-Stack Structure
The project follows a monorepo pattern with three main directories:
- `client/` — React frontend (Vite-powered SPA)
- `server/` — Express.js backend API
- `shared/` — Shared types, schemas, and route definitions used by both client and server

### Frontend Architecture
- **Framework**: React with TypeScript
- **Routing**: Wouter (lightweight client-side router)
- **State Management**: TanStack React Query for server state; no global client state library
- **UI Components**: shadcn/ui (new-york style) with Radix UI primitives, styled with Tailwind CSS
- **Forms**: React Hook Form with Zod validation via `@hookform/resolvers`
- **File Uploads**: Uppy with AWS S3-compatible presigned URL flow (backed by Replit Object Storage)
- **Build Tool**: Vite with HMR in development
- **Path Aliases**: `@/` maps to `client/src/`, `@shared/` maps to `shared/`

### Backend Architecture
- **Framework**: Express.js with TypeScript, run via `tsx` in development
- **Database ORM**: Drizzle ORM with PostgreSQL dialect
- **Database**: PostgreSQL (connection via `DATABASE_URL` environment variable)
- **Schema Location**: `shared/schema.ts` (main app tables) and `shared/models/auth.ts` (auth tables)
- **Storage Pattern**: Repository pattern via `IStorage` interface in `server/storage.ts` with `DatabaseStorage` implementation
- **Build**: esbuild bundles server for production into `dist/index.cjs`; Vite builds client into `dist/public/`

### Database Schema
Main tables:
1. **users** — Managed by Replit Auth (id, email, name, profile image). Do NOT modify this table structure.
2. **sessions** — Managed by Replit Auth for session storage. Do NOT modify this table structure.
3. **profiles** — App-specific user data (wallet balance, bio, verification status, ID card URL, phone, location, role)
4. **jobs** — Job listings (title, description, price, location, category, status, poster/worker references, workersNeeded, workersAccepted, priceType)
5. **transactions** — Wallet transaction log (userId, amount, type, status, jobId reference)
6. **offers** — Price negotiation offers (jobId, senderId, amount, status: pending/accepted/declined/countered, message)
9. **admin_payments** — Admin salary payment records (adminId, amount, bank info snapshot, note, paidBy, status)
7. **notifications** — In-app notifications (userId, title, message, type: info/warning/error/success, isRead, jobId)
8. **site_visits** — Page visit tracking (visitorId, page, userAgent, createdAt)
9. **support_tickets** — Live support chat tickets (ticketNumber, userId, userName, subject, status: waiting/active/resolved/closed, assignedAdminId, assignedAdminName)
10. **support_messages** — Chat messages within support tickets (ticketId, senderId, senderName, senderType: user/admin/system, message)

Schema changes use `drizzle-kit push` (not migrations). Run `npm run db:push` to sync schema to database.

### Authentication (Dual Auth System)
- **Two login methods**: Replit Auth (OIDC email login) OR Manual signup/login with email+password
- Auth page at `/auth` presents users with choice: "Continue with Email" (OIDC), "Sign Up Manually", or "Log In Manually"
- **Replit Auth** via OpenID Connect (OIDC) — handles email-based login/logout/session management
- **Manual Auth** — users register with firstName, lastName, email, password; stored in users table with `authMethod='manual'` and `passwordHash`
- Manual login enforces `authMethod === 'manual'` to prevent cross-auth method access
- Sessions stored in PostgreSQL via `connect-pg-simple`
- Auth middleware: `isAuthenticated` guard supports both OIDC and manual sessions (checks `req.session.manualUserId` first)
- `ensureProfile` middleware auto-creates a profile record for newly authenticated users (both auth methods)
- Routes: POST `/api/auth/register` (manual signup), POST `/api/auth/login-manual` (manual login), GET `/api/auth/user` (current user), GET `/api/logout` (logout both methods)
- All frontend CTA buttons link to `/auth` instead of `/api/login`

### API Design
- Routes defined declaratively in `shared/routes.ts` with Zod schemas for input/output validation
- RESTful endpoints under `/api/` prefix
- Key endpoint groups: jobs (CRUD + accept/complete/cancel), profile (get/update), wallet (get/deposit/withdraw/transactions)
- The `shared/routes.ts` `api` object serves as a single source of truth for paths, methods, and schemas used by both frontend hooks and backend handlers

### Worker Progress Tracking
- After a job is accepted (single-worker jobs only), the worker can update their progress through 3 stages: Getting Ready → On the Way → At Location
- Once worker marks "On the Way", the job poster can no longer cancel the job (escrow funds locked)
- When worker marks "At Location", the poster gets a "Confirm Worker Has Arrived" button
- Progress is stored in `workerProgress` column on jobs table; poster confirmation in `posterConfirmedArrival`
- Routes: POST /api/jobs/:id/progress (worker), POST /api/jobs/:id/confirm-arrival (poster)
- Multi-worker jobs do not use progress tracking (only single-worker jobs)

### No-Show System
- Poster can report "Worker Didn't Show Up" on in_progress jobs (with confirmation dialog)
- Reports increment worker's `noShowCount` in profiles; at 3 no-shows, worker is suspended (`isSuspended = true`)
- Suspended workers cannot accept new jobs (blocked in accept route)
- Each no-show creates an in-app notification warning the worker about remaining chances
- No-show cancels the job and refunds escrow to poster
- Routes: POST /api/jobs/:id/no-show (poster only)

### Job History
- Dedicated /my-jobs page shows user's complete job history across all statuses
- Three tabs: "All Jobs", "Jobs I Posted", "Jobs I Accepted"
- API: GET /api/jobs/history?role=posted|accepted (optional filter)
- Worker ID matching uses exact comma-delimited matching to avoid false positives
- Nav link "My Jobs" added between "Find Jobs" and "Wallet"

### In-App Notifications
- Notifications stored in `notifications` table with types: info, warning, error, success
- Bell icon in navbar shows unread count badge; links to /notifications page
- Routes: GET /api/notifications, GET /api/notifications/unread-count, POST /api/notifications/:id/read, POST /api/notifications/read-all
- Unread count auto-refreshes every 30 seconds

### Cancellation Penalty System
- Poster can cancel a job at any stage (open, in_progress, even when worker is en route)
- If worker has NOT started traveling (no progress or only getting_ready): full escrow refund to poster
- If worker IS en route (on_the_way or at_location): 10% cancellation penalty applies
  - Poster receives 90% refund immediately
  - Worker receives 10% compensation within 24 hours via scheduled_payments table
  - Worker gets notification about pending compensation
- Scheduled payment processor runs hourly to process due payments
- For multi-worker jobs, penalty is split equally among workers (with remainder to last worker)
- Transaction type: cancellation_compensation

### Escrow / Wallet System
- Users have a wallet balance stored in `profiles.walletBalance`
- Job payments go through escrow: poster's funds are held when posting, released to worker(s) on completion
- Jobs support multiple workers (workersNeeded field); payment is split equally among all workers
- Poster can cancel a job (open or in_progress) to get escrow refund
- Transaction types: deposit, withdrawal, escrow_hold, escrow_refund, job_earning, fee, cancellation_compensation

### Admin Dashboard Analytics
- Dashboard at /admin/dashboard accessible to both owner and staff admins
- Stats: total visitors (unique), total sign-ups, total user top-ups (deposits), total paid out (earnings + withdrawals)
- Mini bar charts showing 30-day trends for visitors and sign-ups
- Per-admin hours worked displayed for owner view
- Date range calendar picker for total platform hours worked (job completion time tracking)
- Visit tracking: every page load fires POST /api/track-visit with unique visitor ID stored in localStorage
- API: GET /api/admin/dashboard (admin/owner), GET /api/admin/hours-worked (admin/owner), POST /api/track-visit (public)

### Admin Profile & Payroll System
- Staff admins have a "My Profile" page at /admin/profile showing their work hours and salary account
- Each admin can set up and update their salary bank account (Nigerian banks list)
- Admin payment history visible on profile page
- Owner has a "Payroll" page at /admin/payroll to pay staff admins
- Payroll shows all active staff admins with their hours and bank account status
- Owner can select individual admins or "Select All" for batch payment
- Payment amounts entered per admin, with option to set same amount for all selected
- Payment records stored in admin_payments table with bank info snapshot
- API: GET/POST /api/admin/my-hours, POST /api/admin/my-bank, GET /api/admin/my-payments, GET /api/admin/payroll, POST /api/admin/payroll/pay, GET /api/admin/payroll/history

### Live Support Chat
- Floating chat widget (bottom-right) available to all authenticated users
- Users describe their query to create a support ticket with unique ticket number (TK-XXXX)
- Ticket starts in "waiting" status with animated spinner until a live agent joins
- Once admin joins, status changes to "active" and both parties can chat in real-time
- Messages polled every 3 seconds for near-real-time updates
- Users can end chat; admins can resolve tickets
- Admin support page at /admin/support shows all tickets with status filters
- Both owner and staff admins can view, join, and respond to support chats
- Waiting ticket count badge shown on admin support page
- Routes: POST /api/support/tickets, GET /api/support/active, GET/POST /api/support/tickets/:id/messages, POST /api/support/tickets/:id/close
- Admin routes: GET /api/admin/support/tickets, POST /api/admin/support/tickets/:id/assign, POST /api/admin/support/tickets/:id/messages, POST /api/admin/support/tickets/:id/close

### Key Environment Variables
- `DATABASE_URL` — PostgreSQL connection string (required)
- `SESSION_SECRET` — Express session secret (required for auth)
- `ISSUER_URL` — OIDC issuer URL (defaults to Replit's)
- `REPL_ID` — Set automatically by Replit
- `PUBLIC_OBJECT_SEARCH_PATHS` — Object storage public paths config

## External Dependencies

### Database
- **PostgreSQL** via `DATABASE_URL` — primary data store for all application data, sessions, and user records

### Authentication
- **Replit Auth (OIDC)** — OpenID Connect authentication flow managed through Replit's identity provider
- **Passport.js** with `openid-client/passport` Strategy

### File Storage
- **Replit Object Storage** — Google Cloud Storage-compatible service accessed via `@google-cloud/storage` through a local sidecar at `http://127.0.0.1:1106`
- Used for ID card uploads and potentially other file attachments
- Presigned URL upload pattern: client requests URL from backend, then uploads directly

### Frontend Libraries
- **@tanstack/react-query** — Server state management and caching
- **Uppy** (`@uppy/core`, `@uppy/dashboard`, `@uppy/aws-s3`, `@uppy/react`) — File upload UI and logic
- **date-fns** — Date formatting
- **Radix UI** — Accessible UI primitives (full suite of components)
- **Tailwind CSS** — Utility-first styling with CSS variables for theming (light/dark mode support)
- **Wouter** — Client-side routing
- **react-hook-form** + **zod** — Form handling and validation
- **lucide-react** — Icon library