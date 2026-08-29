-- Payment & Job Flow Restructure
-- Drops user wallet/escrow tables, adds posting fee / negotiation fee / appeal tables,
-- and adds suspension/ban + cancellation escalation columns.

-- New tables
CREATE TABLE IF NOT EXISTS "job_posting_fees" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "job_id" integer NOT NULL,
  "job_amount" numeric(10, 2) NOT NULL,
  "fee_amount" numeric(10, 2) NOT NULL,
  "paystack_reference" text,
  "status" text DEFAULT 'pending' NOT NULL,
  "created_at" timestamp DEFAULT now(),
  "paid_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "negotiation_fee_adjustments" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "job_id" integer NOT NULL,
  "offer_id" integer NOT NULL,
  "previous_amount" numeric(10, 2) NOT NULL,
  "new_amount" numeric(10, 2) NOT NULL,
  "additional_fee" numeric(10, 2) NOT NULL,
  "paystack_reference" text,
  "status" text DEFAULT 'pending' NOT NULL,
  "created_at" timestamp DEFAULT now(),
  "paid_at" timestamp,
  "completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "suspension_appeals" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "reason" text NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "admin_note" text,
  "reviewed_by" text,
  "created_at" timestamp DEFAULT now(),
  "reviewed_at" timestamp
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "job_posting_fees_job_id_index" ON "job_posting_fees" ("job_id");
CREATE INDEX IF NOT EXISTS "negotiation_fee_adjustments_job_id_index" ON "negotiation_fee_adjustments" ("job_id");
CREATE INDEX IF NOT EXISTS "suspension_appeals_user_id_index" ON "suspension_appeals" ("user_id");

-- profiles: drop wallet balance, add suspension/ban detail columns
ALTER TABLE "profiles" DROP COLUMN IF EXISTS "wallet_balance";
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "is_suspended" boolean DEFAULT false NOT NULL;
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "suspended_reason" text;
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "suspended_at" timestamp;
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "suspension_duration" text;
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "is_banned" boolean DEFAULT false NOT NULL;
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "banned_reason" text;
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "banned_at" timestamp;

-- jobs: cancellation escalation + reason columns, default status now pending_payment
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "cancellation_escalated" boolean DEFAULT false;
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "cancellation_escalated_at" timestamp;
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "cancellation_reason" text;

-- disputes: replace escrow-oriented fields with mediation fields
ALTER TABLE "disputes" DROP COLUMN IF EXISTS "proposed_amount";
ALTER TABLE "disputes" DROP COLUMN IF EXISTS "resolved_amount";
ALTER TABLE "disputes" ADD COLUMN IF NOT EXISTS "raised_by" text;
ALTER TABLE "disputes" ADD COLUMN IF NOT EXISTS "resolution" text;
ALTER TABLE "disputes" ADD COLUMN IF NOT EXISTS "resolved_note" text;

-- User wallet tables are no longer used.
DROP TABLE IF EXISTS "job_escrows";
DROP TABLE IF EXISTS "withdrawal_requests";
DROP TABLE IF EXISTS "user_beneficiaries";
DROP TABLE IF EXISTS "scheduled_payments";