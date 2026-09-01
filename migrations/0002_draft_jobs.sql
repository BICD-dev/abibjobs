-- Draft jobs: jobs must not be visible until their posting fee is paid.

-- The original schema defaulted jobs.status to 'open', which silently
-- published every new job before its Paystack fee was confirmed. Future
-- inserts should default to draft (pending_payment).
ALTER TABLE "jobs" ALTER COLUMN "status" SET DEFAULT 'pending_payment';
--> statement-breakpoint

-- Backfill: flip any job that was opened without a paid posting fee back to
-- draft. Jobs with a paid fee (or no fee row at all — pre-fee legacy jobs)
-- remain published.
UPDATE "jobs" SET "status" = 'pending_payment'
WHERE "status" = 'open'
  AND id IN (SELECT job_id FROM job_posting_fees WHERE status <> 'paid');