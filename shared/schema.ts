import { pgTable, text, serial, integer, boolean, timestamp, numeric, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export * from "./models/auth";

// === TABLE DEFINITIONS ===

// Users table (Extends the basic auth schema if needed, or we use a separate profile table)
// Since Replit Auth uses `users` table defined in `shared/models/auth.ts`, we might need to extend it
// or create a separate `profiles` table linked by `id` or `userId`.
// However, the `shared/models/auth.ts` is imported in `server/replit_integrations/auth/index.ts`.
// To keep things simple and unified, let's assume we can join or just use a `profiles` table
// for app-specific data like wallet balance and role.
// Actually, looking at the auth blueprint, it creates a `users` table.
// I will create a `profiles` table to hold the wallet balance and verification info
// to avoid conflicts with the auth blueprint's table definition which might be rigid.

export const profiles = pgTable("profiles", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().unique(), // Links to auth.users.id
  bio: text("bio"),
  role: text("role").default("user"), // 'user' or 'admin'
  walletBalance: numeric("wallet_balance", { precision: 10, scale: 2 }).default("0").notNull(),
  isVerified: boolean("is_verified").default(false).notNull(),
  idCardUrl: text("id_card_url"),
  phoneNumber: text("phone_number"),
  location: text("location"),
});

export const jobs = pgTable("jobs", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  price: numeric("price", { precision: 10, scale: 2 }).notNull(),
  location: text("location").notNull(),
  category: text("category").notNull(), // 'cleaning', 'ac_repair', 'phone_repair', 'other'
  status: text("status").default("open").notNull(), // 'open', 'in_progress', 'completed', 'cancelled'
  posterId: text("poster_id").notNull(), // Links to auth.users.id
  workerId: text("worker_id"), // Links to auth.users.id
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const transactions = pgTable("transactions", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  type: text("type").notNull(), // 'deposit', 'withdrawal', 'job_payment', 'job_earning', 'fee'
  status: text("status").default("completed").notNull(),
  jobId: integer("job_id"),
  bankName: text("bank_name"),
  bankCode: text("bank_code"),
  accountNumber: text("account_number"),
  accountName: text("account_name"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const platformEarnings = pgTable("platform_earnings", {
  id: serial("id").primaryKey(),
  totalBalance: numeric("total_balance", { precision: 12, scale: 2 }).default("0").notNull(),
  bankName: text("bank_name"),
  bankCode: text("bank_code"),
  accountNumber: text("account_number"),
  accountName: text("account_name"),
});

export const platformTransactions = pgTable("platform_transactions", {
  id: serial("id").primaryKey(),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  type: text("type").notNull(), // 'fee_earned', 'withdrawal'
  jobId: integer("job_id"),
  jobTitle: text("job_title"),
  bankName: text("bank_name"),
  bankCode: text("bank_code"),
  accountNumber: text("account_number"),
  accountName: text("account_name"),
  createdAt: timestamp("created_at").defaultNow(),
});

// === SCHEMAS ===

export const insertProfileSchema = createInsertSchema(profiles).omit({ id: true });
export const insertJobSchema = createInsertSchema(jobs).omit({ id: true, createdAt: true, updatedAt: true, workerId: true, status: true });
// For API input where we don't expect posterId (inferred from session)
export const createJobSchema = insertJobSchema.omit({ posterId: true });

export const insertTransactionSchema = createInsertSchema(transactions).omit({ id: true, createdAt: true });

// === TYPES ===

export type Profile = typeof profiles.$inferSelect;
export type Job = typeof jobs.$inferSelect;
export type Transaction = typeof transactions.$inferSelect;
export type PlatformEarning = typeof platformEarnings.$inferSelect;
export type PlatformTransaction = typeof platformTransactions.$inferSelect;

export type CreateJobInput = z.infer<typeof createJobSchema>;

export type UserRole = "user" | "admin";
export type JobStatus = "open" | "in_progress" | "completed" | "cancelled";

// === API CONTRACT TYPES ===

export interface JobWithDetails extends Job {
  poster?: {
    firstName: string | null;
    lastName: string | null;
    profileImageUrl: string | null;
  };
}

export interface WalletState {
  balance: string; // Numeric returns string from DB usually
  transactions: Transaction[];
}

