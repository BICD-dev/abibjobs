import { pgTable, text, serial, integer, boolean, timestamp, numeric, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export * from "./models/auth";

// === TABLE DEFINITIONS ===

export const profiles = pgTable("profiles", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().unique(),
  bio: text("bio"),
  role: text("role").default("user"),
  walletBalance: numeric("wallet_balance", { precision: 10, scale: 2 }).default("0").notNull(),
  isVerified: boolean("is_verified").default(false).notNull(),
  verificationStatus: text("verification_status").default("unverified").notNull(),
  idCardUrl: text("id_card_url"),
  faceScanUrl: text("face_scan_url"),
  verificationNote: text("verification_note"),
  verificationIp: text("verification_ip"),
  verificationSubmittedAt: timestamp("verification_submitted_at"),
  phoneNumber: text("phone_number"),
  location: text("location"),
  profilePictureUrl: text("profile_picture_url"),
  noShowCount: integer("no_show_count").default(0).notNull(),
  isSuspended: boolean("is_suspended").default(false).notNull(),
});

export const jobs = pgTable("jobs", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  price: numeric("price", { precision: 10, scale: 2 }).notNull(),
  location: text("location").notNull(),
  category: text("category").notNull(),
  status: text("status").default("open").notNull(),
  posterId: text("poster_id").notNull(),
  workerId: text("worker_id"),
  priceType: text("price_type").default("total").notNull(),
  workersNeeded: integer("workers_needed").default(1).notNull(),
  workersAccepted: integer("workers_accepted").default(0).notNull(),
  images: text("images").array(),
  workerProgress: text("worker_progress"),
  posterConfirmedArrival: boolean("poster_confirmed_arrival").default(false),
  posterMarkedComplete: boolean("poster_marked_complete").default(false),
  workerMarkedComplete: boolean("worker_marked_complete").default(false),
  latitude: numeric("latitude", { precision: 10, scale: 7 }),
  longitude: numeric("longitude", { precision: 10, scale: 7 }),
  workerLatitude: numeric("worker_latitude", { precision: 10, scale: 7 }),
  workerLongitude: numeric("worker_longitude", { precision: 10, scale: 7 }),
  workerLocationUpdatedAt: timestamp("worker_location_updated_at"),
  scheduledDate: timestamp("scheduled_date"),
  acceptedAt: timestamp("accepted_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const transactions = pgTable("transactions", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  type: text("type").notNull(),
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
  type: text("type").notNull(),
  jobId: integer("job_id"),
  jobTitle: text("job_title"),
  bankName: text("bank_name"),
  bankCode: text("bank_code"),
  accountNumber: text("account_number"),
  accountName: text("account_name"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const offers = pgTable("offers", {
  id: serial("id").primaryKey(),
  jobId: integer("job_id").notNull(),
  senderId: text("sender_id").notNull(),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  status: text("status").default("pending").notNull(),
  message: text("message"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const disputes = pgTable("disputes", {
  id: serial("id").primaryKey(),
  jobId: integer("job_id").notNull(),
  posterId: text("poster_id").notNull(),
  workerId: text("worker_id").notNull(),
  status: text("status").default("open").notNull(),
  proposedAmount: numeric("proposed_amount", { precision: 10, scale: 2 }),
  resolvedAmount: numeric("resolved_amount", { precision: 10, scale: 2 }),
  resolvedBy: text("resolved_by"),
  assignedAdminId: text("assigned_admin_id"),
  assignedAdminName: text("assigned_admin_name"),
  assignedAt: timestamp("assigned_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const disputeMessages = pgTable("dispute_messages", {
  id: serial("id").primaryKey(),
  disputeId: integer("dispute_id").notNull(),
  senderId: text("sender_id").notNull(),
  message: text("message").notNull(),
  type: text("type").default("message").notNull(),
  amount: numeric("amount", { precision: 10, scale: 2 }),
  imageUrl: text("image_url"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const adminUsers = pgTable("admin_users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  role: text("role").default("staff").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  bankName: text("bank_name"),
  bankCode: text("bank_code"),
  accountNumber: text("account_number"),
  accountName: text("account_name"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const adminPayments = pgTable("admin_payments", {
  id: serial("id").primaryKey(),
  adminId: integer("admin_id").notNull(),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  periodStart: text("period_start"),
  periodEnd: text("period_end"),
  hoursWorked: numeric("hours_worked", { precision: 10, scale: 2 }),
  bankName: text("bank_name"),
  bankCode: text("bank_code"),
  accountNumber: text("account_number"),
  accountName: text("account_name"),
  status: text("status").default("completed").notNull(),
  note: text("note"),
  paidBy: text("paid_by"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const adminActivity = pgTable("admin_activity", {
  id: serial("id").primaryKey(),
  adminId: integer("admin_id").notNull(),
  date: text("date").notNull(),
  secondsWorked: integer("seconds_worked").default(0).notNull(),
  lastActiveAt: timestamp("last_active_at"),
});

export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  type: text("type").default("info").notNull(),
  isRead: boolean("is_read").default(false).notNull(),
  jobId: integer("job_id"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const scheduledPayments = pgTable("scheduled_payments", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  jobId: integer("job_id"),
  reason: text("reason").notNull(),
  status: text("status").default("pending").notNull(),
  scheduledFor: timestamp("scheduled_for").notNull(),
  processedAt: timestamp("processed_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const lagosAddresses = pgTable("lagos_addresses", {
  id: serial("id").primaryKey(),
  area: text("area").notNull(),
  lga: text("lga").notNull(),
  state: text("state").notNull().default("Lagos"),
});

export const siteVisits = pgTable("site_visits", {
  id: serial("id").primaryKey(),
  visitorId: text("visitor_id").notNull(),
  page: text("page").notNull(),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const ownerSettings = pgTable("owner_settings", {
  id: serial("id").primaryKey(),
  passcodeHash: text("passcode_hash"),
  ownerEmail: text("owner_email").default("abeebakeem265@gmail.com").notNull(),
  resetToken: text("reset_token"),
  resetTokenExpiresAt: timestamp("reset_token_expires_at"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const supportTickets = pgTable("support_tickets", {
  id: serial("id").primaryKey(),
  ticketNumber: text("ticket_number").notNull().unique(),
  userId: text("user_id").notNull(),
  userName: text("user_name").notNull(),
  subject: text("subject").notNull(),
  status: text("status").default("waiting").notNull(),
  assignedAdminId: integer("assigned_admin_id"),
  assignedAdminName: text("assigned_admin_name"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  closedAt: timestamp("closed_at"),
});

export const supportMessages = pgTable("support_messages", {
  id: serial("id").primaryKey(),
  ticketId: integer("ticket_id").notNull(),
  senderId: text("sender_id").notNull(),
  senderName: text("sender_name").notNull(),
  senderType: text("sender_type").notNull(),
  message: text("message").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const withdrawalRequests = pgTable("withdrawal_requests", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  userName: text("user_name").notNull(),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  bankName: text("bank_name").notNull(),
  bankCode: text("bank_code"),
  accountNumber: text("account_number").notNull(),
  accountName: text("account_name"),
  reason: text("reason"),
  status: text("status").default("pending").notNull(),
  adminNote: text("admin_note"),
  processedBy: integer("processed_by"),
  processedAt: timestamp("processed_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

// === SCHEMAS ===

export const insertProfileSchema = createInsertSchema(profiles).omit({ id: true });
export const insertJobSchema = createInsertSchema(jobs).omit({ id: true, createdAt: true, updatedAt: true, workerId: true, status: true, workersAccepted: true, workerProgress: true, posterConfirmedArrival: true, completedAt: true }).extend({
  scheduledDate: z.union([z.string(), z.date()]).optional().nullable(),
});
export const createJobSchema = insertJobSchema.omit({ posterId: true });

export const adminNotifications = pgTable("admin_notifications", {
  id: serial("id").primaryKey(),
  adminId: integer("admin_id").notNull(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  type: text("type").default("info").notNull(),
  isRead: boolean("is_read").default(false).notNull(),
  disputeId: integer("dispute_id"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertAdminNotificationSchema = createInsertSchema(adminNotifications).omit({ id: true, createdAt: true });

export const insertTransactionSchema = createInsertSchema(transactions).omit({ id: true, createdAt: true });
export const insertOfferSchema = createInsertSchema(offers).omit({ id: true, createdAt: true });
export const createOfferSchema = insertOfferSchema.omit({ senderId: true, status: true });
export const insertDisputeSchema = createInsertSchema(disputes).omit({ id: true, createdAt: true, updatedAt: true });
export const insertDisputeMessageSchema = createInsertSchema(disputeMessages).omit({ id: true, createdAt: true });
export const insertAdminUserSchema = createInsertSchema(adminUsers).omit({ id: true, createdAt: true });
export const insertAdminPaymentSchema = createInsertSchema(adminPayments).omit({ id: true, createdAt: true });
export const insertNotificationSchema = createInsertSchema(notifications).omit({ id: true, createdAt: true });
export const insertScheduledPaymentSchema = createInsertSchema(scheduledPayments).omit({ id: true, createdAt: true, processedAt: true });
export const insertSupportTicketSchema = createInsertSchema(supportTickets).omit({ id: true, createdAt: true, updatedAt: true, closedAt: true });
export const insertSupportMessageSchema = createInsertSchema(supportMessages).omit({ id: true, createdAt: true });
export const insertWithdrawalRequestSchema = createInsertSchema(withdrawalRequests).omit({ id: true, createdAt: true, processedAt: true });

// === TYPES ===

export type Profile = typeof profiles.$inferSelect;
export type Job = typeof jobs.$inferSelect;
export type Transaction = typeof transactions.$inferSelect;
export type PlatformEarning = typeof platformEarnings.$inferSelect;
export type PlatformTransaction = typeof platformTransactions.$inferSelect;
export type Offer = typeof offers.$inferSelect;
export type Dispute = typeof disputes.$inferSelect;
export type DisputeMessage = typeof disputeMessages.$inferSelect;
export type AdminUser = typeof adminUsers.$inferSelect;
export type AdminActivity = typeof adminActivity.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type AdminPayment = typeof adminPayments.$inferSelect;
export type AdminNotification = typeof adminNotifications.$inferSelect;
export type ScheduledPayment = typeof scheduledPayments.$inferSelect;
export type LagosAddress = typeof lagosAddresses.$inferSelect;
export type SiteVisit = typeof siteVisits.$inferSelect;
export type OwnerSettings = typeof ownerSettings.$inferSelect;
export type SupportTicket = typeof supportTickets.$inferSelect;
export type SupportMessage = typeof supportMessages.$inferSelect;
export type WithdrawalRequest = typeof withdrawalRequests.$inferSelect;

export type CreateJobInput = z.infer<typeof createJobSchema>;
export type VerificationStatus = 'unverified' | 'pending' | 'verified' | 'declined' | 'redo_requested';
export type CreateOfferInput = z.infer<typeof createOfferSchema>;

export type UserRole = "user" | "admin";
export type JobStatus = "open" | "in_progress" | "completed" | "cancelled" | "disputed";
export type DisputeStatus = "open" | "negotiating" | "escalated" | "awaiting_payment" | "resolved";

// === API CONTRACT TYPES ===

export interface JobWithDetails extends Job {
  poster?: {
    firstName: string | null;
    lastName: string | null;
    profileImageUrl: string | null;
  };
}

export interface OfferWithSender extends Offer {
  sender?: {
    firstName: string | null;
    lastName: string | null;
    profileImageUrl: string | null;
  };
}

export interface DisputeWithDetails extends Dispute {
  poster?: {
    firstName: string | null;
    lastName: string | null;
    profileImageUrl: string | null;
  };
  worker?: {
    firstName: string | null;
    lastName: string | null;
    profileImageUrl: string | null;
  };
  job?: {
    title: string;
    price: string;
    priceType?: string;
    workersNeeded?: number;
  };
  messages?: DisputeMessageWithSender[];
}

export interface DisputeMessageWithSender extends DisputeMessage {
  sender?: {
    firstName: string | null;
    lastName: string | null;
    profileImageUrl: string | null;
  };
}

export interface WalletState {
  balance: string;
  transactions: Transaction[];
}
