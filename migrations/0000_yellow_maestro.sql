CREATE TABLE "admin_activity" (
	"id" serial PRIMARY KEY NOT NULL,
	"admin_id" integer NOT NULL,
	"date" text NOT NULL,
	"seconds_worked" integer DEFAULT 0 NOT NULL,
	"last_active_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "admin_notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"admin_id" integer NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"type" text DEFAULT 'info' NOT NULL,
	"is_read" boolean DEFAULT false NOT NULL,
	"dispute_id" integer,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "admin_payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"admin_id" integer NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"period_start" text,
	"period_end" text,
	"hours_worked" numeric(10, 2),
	"bank_name" text,
	"bank_code" text,
	"account_number" text,
	"account_name" text,
	"status" text DEFAULT 'completed' NOT NULL,
	"note" text,
	"paid_by" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "admin_users" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"name" text NOT NULL,
	"role" text DEFAULT 'staff' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"wallet_balance" numeric(10, 2) DEFAULT '0' NOT NULL,
	"bank_name" text,
	"bank_code" text,
	"account_number" text,
	"account_name" text,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "admin_users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "admin_withdrawals" (
	"id" serial PRIMARY KEY NOT NULL,
	"admin_id" integer NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"bank_name" text NOT NULL,
	"bank_code" text,
	"account_number" text NOT NULL,
	"account_name" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"admin_note" text,
	"processed_by" integer,
	"processed_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "dispute_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"dispute_id" integer NOT NULL,
	"sender_id" text NOT NULL,
	"message" text NOT NULL,
	"type" text DEFAULT 'message' NOT NULL,
	"amount" numeric(10, 2),
	"image_url" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "disputes" (
	"id" serial PRIMARY KEY NOT NULL,
	"job_id" integer NOT NULL,
	"poster_id" text NOT NULL,
	"worker_id" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"proposed_amount" numeric(10, 2),
	"resolved_amount" numeric(10, 2),
	"resolved_by" text,
	"assigned_admin_id" text,
	"assigned_admin_name" text,
	"assigned_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "job_escrows" (
	"id" serial PRIMARY KEY NOT NULL,
	"job_id" integer NOT NULL,
	"poster_id" text NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"status" text DEFAULT 'held' NOT NULL,
	"refunded_amount" numeric(10, 2),
	"released_amount" numeric(10, 2),
	"created_at" timestamp DEFAULT now(),
	"resolved_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"price" numeric(10, 2) NOT NULL,
	"location" text NOT NULL,
	"category" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"poster_id" text NOT NULL,
	"worker_id" text,
	"price_type" text DEFAULT 'total' NOT NULL,
	"workers_needed" integer DEFAULT 1 NOT NULL,
	"workers_accepted" integer DEFAULT 0 NOT NULL,
	"images" text[],
	"worker_progress" text,
	"poster_confirmed_arrival" boolean DEFAULT false,
	"poster_marked_complete" boolean DEFAULT false,
	"worker_marked_complete" boolean DEFAULT false,
	"latitude" numeric(10, 7),
	"longitude" numeric(10, 7),
	"worker_latitude" numeric(10, 7),
	"worker_longitude" numeric(10, 7),
	"worker_location_updated_at" timestamp,
	"scheduled_date" timestamp,
	"accepted_at" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "lagos_addresses" (
	"id" serial PRIMARY KEY NOT NULL,
	"area" text NOT NULL,
	"lga" text NOT NULL,
	"state" text DEFAULT 'Lagos' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"type" text DEFAULT 'info' NOT NULL,
	"is_read" boolean DEFAULT false NOT NULL,
	"job_id" integer,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "offers" (
	"id" serial PRIMARY KEY NOT NULL,
	"job_id" integer NOT NULL,
	"sender_id" text NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"message" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "owner_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"passcode_hash" text,
	"owner_email" text DEFAULT 'abeebakeem265@gmail.com' NOT NULL,
	"reset_token" text,
	"reset_token_expires_at" timestamp,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "platform_earnings" (
	"id" serial PRIMARY KEY NOT NULL,
	"total_balance" numeric(12, 2) DEFAULT '0' NOT NULL,
	"bank_name" text,
	"bank_code" text,
	"account_number" text,
	"account_name" text
);
--> statement-breakpoint
CREATE TABLE "platform_transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"type" text NOT NULL,
	"job_id" integer,
	"job_title" text,
	"bank_name" text,
	"bank_code" text,
	"account_number" text,
	"account_name" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"bio" text,
	"role" text DEFAULT 'user',
	"wallet_balance" numeric(10, 2) DEFAULT '0' NOT NULL,
	"is_verified" boolean DEFAULT false NOT NULL,
	"verification_status" text DEFAULT 'unverified' NOT NULL,
	"id_card_url" text,
	"face_scan_url" text,
	"verification_note" text,
	"verification_ip" text,
	"verification_submitted_at" timestamp,
	"phone_number" text,
	"location" text,
	"profile_picture_url" text,
	"no_show_count" integer DEFAULT 0 NOT NULL,
	"is_suspended" boolean DEFAULT false NOT NULL,
	"last_seen_at" timestamp,
	"last_seen_page" text,
	"last_seen_ip" text,
	CONSTRAINT "profiles_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "scheduled_payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"job_id" integer,
	"reason" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"scheduled_for" timestamp NOT NULL,
	"processed_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "site_visits" (
	"id" serial PRIMARY KEY NOT NULL,
	"visitor_id" text NOT NULL,
	"page" text NOT NULL,
	"user_agent" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "support_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"ticket_id" integer NOT NULL,
	"sender_id" text NOT NULL,
	"sender_name" text NOT NULL,
	"sender_type" text NOT NULL,
	"message" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "support_tickets" (
	"id" serial PRIMARY KEY NOT NULL,
	"ticket_number" text NOT NULL,
	"user_id" text NOT NULL,
	"user_name" text NOT NULL,
	"subject" text NOT NULL,
	"status" text DEFAULT 'waiting' NOT NULL,
	"assigned_admin_id" integer,
	"assigned_admin_name" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"closed_at" timestamp,
	CONSTRAINT "support_tickets_ticket_number_unique" UNIQUE("ticket_number")
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"type" text NOT NULL,
	"status" text DEFAULT 'completed' NOT NULL,
	"job_id" integer,
	"bank_name" text,
	"bank_code" text,
	"account_number" text,
	"account_name" text,
	"reference" text,
	"fee" numeric(10, 2),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "user_beneficiaries" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"bank_name" text NOT NULL,
	"bank_code" text,
	"account_number" text NOT NULL,
	"account_name" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "withdrawal_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"user_name" text NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"bank_name" text NOT NULL,
	"bank_code" text,
	"account_number" text NOT NULL,
	"account_name" text,
	"reason" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"admin_note" text,
	"processed_by" integer,
	"processed_at" timestamp,
	"otp_code" text,
	"otp_expires_at" timestamp,
	"reference" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"sid" varchar PRIMARY KEY NOT NULL,
	"sess" jsonb NOT NULL,
	"expire" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar,
	"first_name" varchar,
	"last_name" varchar,
	"profile_image_url" varchar,
	"password_hash" varchar,
	"auth_method" varchar DEFAULT 'replit',
	"password_reset_token" varchar,
	"password_reset_expiry" timestamp,
	"registration_ip" varchar,
	"last_login_ip" varchar,
	"last_login_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "job_escrows" ADD CONSTRAINT "job_escrows_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "IDX_session_expire" ON "sessions" USING btree ("expire");