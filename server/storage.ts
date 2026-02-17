import { db } from "./db";
import { eq, desc, and, sql, gte, lte, count, isNotNull } from "drizzle-orm";
import {
  users,
  profiles,
  jobs,
  transactions,
  platformEarnings,
  platformTransactions,
  offers,
  disputes,
  disputeMessages,
  adminUsers,
  adminActivity,
  adminPayments,
  adminNotifications,
  notifications,
  scheduledPayments,
  lagosAddresses,
  ownerSettings,
  siteVisits,
  type Profile,
  type Job,
  type Transaction,
  type Offer,
  type Dispute,
  type DisputeMessage,
  type AdminUser,
  type AdminActivity,
  type AdminPayment,
  type AdminNotification,
  type Notification,
  type ScheduledPayment,
  type LagosAddress,
  type CreateJobInput,
  type JobWithDetails,
  type OfferWithSender,
  type DisputeWithDetails,
  type DisputeMessageWithSender,
  type PlatformEarning,
  type PlatformTransaction,
} from "@shared/schema";

export interface IStorage {
  // Manual Auth
  getUserByEmail(email: string): Promise<any | undefined>;
  createManualUser(data: { email: string; firstName: string; lastName: string; passwordHash: string }): Promise<any>;

  // Profiles
  getProfile(userId: string): Promise<Profile | undefined>;
  createProfile(userId: string): Promise<Profile>;
  updateProfile(userId: string, data: Partial<Profile>): Promise<Profile>;

  // Jobs
  getJobs(filters?: { category?: string; search?: string; status?: string }): Promise<JobWithDetails[]>;
  getJob(id: number): Promise<JobWithDetails | undefined>;
  createJob(job: CreateJobInput & { posterId: string }): Promise<Job>;
  updateJob(id: number, data: Partial<Job>): Promise<Job>;

  // My Jobs
  getMyJobs(userId: string): Promise<JobWithDetails[]>;
  getJobHistory(userId: string, role?: 'posted' | 'accepted'): Promise<JobWithDetails[]>;

  // Wallet & Transactions
  getTransactions(userId: string): Promise<Transaction[]>;
  createTransaction(tx: { userId: string; amount: string; type: string; jobId?: number; bankName?: string | null; bankCode?: string | null; accountNumber?: string | null; accountName?: string | null }): Promise<Transaction>;
  updateWalletBalance(userId: string, amountChange: number): Promise<Profile>;

  // Offers
  getOffersByJob(jobId: number): Promise<OfferWithSender[]>;
  getOffer(id: number): Promise<Offer | undefined>;
  createOffer(data: { jobId: number; senderId: string; amount: string; message?: string }): Promise<Offer>;
  updateOffer(id: number, data: Partial<Offer>): Promise<Offer>;

  // Disputes
  createDispute(data: { jobId: number; posterId: string; workerId: string }): Promise<Dispute>;
  getDispute(id: number): Promise<DisputeWithDetails | undefined>;
  getDisputeByJob(jobId: number): Promise<Dispute | undefined>;
  getDisputes(filters?: { status?: string }): Promise<DisputeWithDetails[]>;
  updateDispute(id: number, data: Partial<Dispute>): Promise<Dispute>;
  createDisputeMessage(data: { disputeId: number; senderId: string; message: string; type: string; amount?: string; imageUrl?: string }): Promise<DisputeMessage>;
  getDisputeMessages(disputeId: number): Promise<DisputeMessageWithSender[]>;

  // Platform Earnings (Admin)
  getPlatformEarnings(): Promise<PlatformEarning>;
  getPlatformTransactions(): Promise<PlatformTransaction[]>;
  addPlatformEarning(amount: number, jobId: number, jobTitle: string): Promise<void>;
  withdrawPlatformEarnings(amount: number, bankInfo: { bankName: string; bankCode: string; accountNumber: string; accountName?: string }): Promise<PlatformEarning>;
  updatePlatformBankInfo(bankInfo: { bankName: string; bankCode: string; accountNumber: string; accountName?: string }): Promise<PlatformEarning>;

  // Admin Users
  getAdminUser(id: number): Promise<AdminUser | undefined>;
  getAdminUserByEmail(email: string): Promise<AdminUser | undefined>;
  getAdminUsers(): Promise<AdminUser[]>;
  createAdminUser(data: { email: string; passwordHash: string; name: string; role?: string }): Promise<AdminUser>;
  updateAdminUser(id: number, data: Partial<AdminUser>): Promise<AdminUser>;
  deleteAdminUser(id: number): Promise<void>;

  // Admin Activity
  getAdminActivity(adminId: number, date: string): Promise<AdminActivity | undefined>;
  upsertAdminActivity(adminId: number, date: string, secondsToAdd: number): Promise<AdminActivity>;
  getAdminHours(date?: string): Promise<{ adminId: number; name: string; email: string; date: string; secondsWorked: number }[]>;
  getAdminHoursAggregated(startDate?: string, endDate?: string): Promise<{ adminId: number; name: string; email: string; totalSeconds: number }[]>;
  getMyAdminHours(adminId: number, startDate?: string, endDate?: string): Promise<{ date: string; secondsWorked: number }[]>;

  // Admin Bank Account
  updateAdminBankInfo(adminId: number, data: { bankName: string; bankCode: string; accountNumber: string; accountName: string }): Promise<AdminUser>;

  // Admin Payments
  createAdminPayment(data: { adminId: number; amount: string; periodStart?: string; periodEnd?: string; hoursWorked?: string; bankName?: string; bankCode?: string; accountNumber?: string; accountName?: string; note?: string; paidBy?: string }): Promise<AdminPayment>;
  getAdminPayments(adminId?: number): Promise<(AdminPayment & { adminName?: string })[]>;
  getAdminsPayrollSummary(startDate?: string, endDate?: string): Promise<{ adminId: number; name: string; email: string; bankName: string | null; accountNumber: string | null; accountName: string | null; bankCode: string | null; totalSeconds: number; isActive: boolean }[]>;

  // Notifications
  createNotification(data: { userId: string; title: string; message: string; type: string; jobId?: number }): Promise<Notification>;
  broadcastNotificationToAll(data: { title: string; message: string; type: string; jobId?: number; excludeUserId?: string }): Promise<void>;
  getNotifications(userId: string): Promise<Notification[]>;
  markNotificationRead(id: number, userId: string): Promise<void>;
  markAllNotificationsRead(userId: string): Promise<void>;
  getUnreadNotificationCount(userId: string): Promise<number>;

  // Admin Notifications
  createAdminNotification(data: { adminId: number; title: string; message: string; type: string; disputeId?: number }): Promise<AdminNotification>;
  createAdminNotificationForAll(data: { title: string; message: string; type: string; disputeId?: number }): Promise<void>;
  getAdminNotifications(adminId: number): Promise<AdminNotification[]>;
  markAdminNotificationRead(id: number, adminId: number): Promise<void>;
  markAllAdminNotificationsRead(adminId: number): Promise<void>;
  getUnreadAdminNotificationCount(adminId: number): Promise<number>;

  // Scheduled Payments
  createScheduledPayment(data: { userId: string; amount: string; jobId?: number; reason: string; scheduledFor: Date }): Promise<ScheduledPayment>;
  getPendingScheduledPayments(): Promise<ScheduledPayment[]>;
  processScheduledPayment(id: number): Promise<void>;

  // Lagos Addresses
  searchAddresses(query: string): Promise<LagosAddress[]>;
  getAddressCount(): Promise<number>;
  seedAddresses(addresses: { area: string; lga: string }[]): Promise<void>;

  // Verification
  getPendingVerifications(): Promise<(Profile & { userName?: string; userEmail?: string })[]>;
  submitVerification(userId: string, idCardUrl: string, faceScanUrl: string): Promise<Profile>;
  reviewVerification(userId: string, action: 'approve' | 'decline' | 'redo', note?: string): Promise<Profile>;

  // Owner Settings
  getOwnerSettings(): Promise<{ passcodeHash: string | null; ownerEmail: string; id: number } | undefined>;
  setOwnerPasscode(hash: string): Promise<void>;
  updateOwnerEmail(newEmail: string): Promise<void>;
  setResetToken(token: string, expiresAt: Date): Promise<void>;
  getResetToken(): Promise<{ resetToken: string | null; resetTokenExpiresAt: Date | null; ownerEmail: string } | undefined>;
  clearResetToken(): Promise<void>;

  // Site Visits & Analytics
  trackVisit(visitorId: string, page: string, userAgent?: string): Promise<void>;
  getDashboardAnalytics(): Promise<{
    totalVisitors: number;
    totalSignUps: number;
    totalTopUps: string;
    totalPaidOut: string;
    todayVisitors: number;
    todaySignUps: number;
    recentVisitsByDay: { date: string; count: number }[];
    recentSignUpsByDay: { date: string; count: number }[];
  }>;
  getHoursWorked(startDate: Date, endDate: Date): Promise<{
    totalHours: number;
    totalJobs: number;
    jobBreakdown: { jobId: number; title: string; hours: number; worker: string; completedAt: string }[];
  }>;
}

export class DatabaseStorage implements IStorage {
  async getUserByEmail(email: string): Promise<any | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async createManualUser(data: { email: string; firstName: string; lastName: string; passwordHash: string }): Promise<any> {
    const [user] = await db.insert(users).values({
      email: data.email,
      firstName: data.firstName,
      lastName: data.lastName,
      passwordHash: data.passwordHash,
      authMethod: 'manual',
    }).returning();
    await db.insert(profiles).values({ userId: user.id });
    return user;
  }

  async getProfile(userId: string): Promise<Profile | undefined> {
    const [profile] = await db.select().from(profiles).where(eq(profiles.userId, userId));
    return profile;
  }

  async createProfile(userId: string): Promise<Profile> {
    const existing = await this.getProfile(userId);
    if (existing) return existing;
    const [profile] = await db.insert(profiles).values({ userId }).returning();
    return profile;
  }

  async updateProfile(userId: string, data: Partial<Profile>): Promise<Profile> {
    const [updated] = await db
      .update(profiles)
      .set(data)
      .where(eq(profiles.userId, userId))
      .returning();
    return updated;
  }

  async getJobs(filters?: { category?: string; search?: string; status?: string }): Promise<JobWithDetails[]> {
    let query = db.select({
      job: jobs,
      poster: {
        firstName: users.firstName,
        lastName: users.lastName,
        profileImageUrl: users.profileImageUrl,
      },
      posterProfile: {
        profilePictureUrl: profiles.profilePictureUrl,
      }
    })
    .from(jobs)
    .leftJoin(users, eq(jobs.posterId, users.id))
    .leftJoin(profiles, eq(jobs.posterId, profiles.userId))
    .orderBy(desc(jobs.createdAt));

    const results = await query;
    
    let mapped = results.map(r => ({
      ...r.job,
      poster: {
        firstName: r.poster?.firstName || 'Unknown',
        lastName: r.poster?.lastName || '',
        profileImageUrl: r.posterProfile?.profilePictureUrl || r.poster?.profileImageUrl || null,
      }
    }));

    if (filters) {
      if (filters.category) {
        mapped = mapped.filter(j => j.category === filters.category);
      }
      if (filters.status) {
        mapped = mapped.filter(j => j.status === filters.status);
      }
      if (filters.search) {
        const lowerSearch = filters.search.toLowerCase();
        mapped = mapped.filter(j => j.title.toLowerCase().includes(lowerSearch) || j.description.toLowerCase().includes(lowerSearch));
      }
    }

    return mapped;
  }

  async getJob(id: number): Promise<JobWithDetails | undefined> {
    const [result] = await db.select({
      job: jobs,
      poster: {
        firstName: users.firstName,
        lastName: users.lastName,
        profileImageUrl: users.profileImageUrl,
      },
      posterProfile: {
        profilePictureUrl: profiles.profilePictureUrl,
      }
    })
    .from(jobs)
    .leftJoin(users, eq(jobs.posterId, users.id))
    .leftJoin(profiles, eq(jobs.posterId, profiles.userId))
    .where(eq(jobs.id, id));

    if (!result) return undefined;

    return {
      ...result.job,
      poster: {
        firstName: result.poster?.firstName || 'Unknown',
        lastName: result.poster?.lastName || '',
        profileImageUrl: result.posterProfile?.profilePictureUrl || result.poster?.profileImageUrl || null,
      }
    };
  }

  async getMyJobs(userId: string): Promise<JobWithDetails[]> {
    const workerMatch = sql`(${jobs.workerId} = ${userId} OR ${jobs.workerId} LIKE ${userId + ',%'} OR ${jobs.workerId} LIKE ${'%,' + userId + ',%'} OR ${jobs.workerId} LIKE ${'%,' + userId})`;
    const results = await db.select({
      job: jobs,
      poster: {
        firstName: users.firstName,
        lastName: users.lastName,
        profileImageUrl: users.profileImageUrl,
      },
      posterProfile: {
        profilePictureUrl: profiles.profilePictureUrl,
      }
    })
    .from(jobs)
    .leftJoin(users, eq(jobs.posterId, users.id))
    .leftJoin(profiles, eq(jobs.posterId, profiles.userId))
    .where(
      sql`(${jobs.posterId} = ${userId} OR ${workerMatch}) AND ${jobs.status} IN ('open', 'in_progress')`
    )
    .orderBy(desc(jobs.updatedAt));

    return results.map(r => ({
      ...r.job,
      poster: {
        firstName: r.poster?.firstName || 'Unknown',
        lastName: r.poster?.lastName || '',
        profileImageUrl: r.posterProfile?.profilePictureUrl || r.poster?.profileImageUrl || null,
      }
    }));
  }

  async getJobHistory(userId: string, role?: 'posted' | 'accepted'): Promise<JobWithDetails[]> {
    const workerMatch = sql`(${jobs.workerId} = ${userId} OR ${jobs.workerId} LIKE ${userId + ',%'} OR ${jobs.workerId} LIKE ${'%,' + userId + ',%'} OR ${jobs.workerId} LIKE ${'%,' + userId})`;
    let condition;
    if (role === 'posted') {
      condition = sql`${jobs.posterId} = ${userId}`;
    } else if (role === 'accepted') {
      condition = workerMatch;
    } else {
      condition = sql`(${jobs.posterId} = ${userId} OR ${workerMatch})`;
    }

    const results = await db.select({
      job: jobs,
      poster: {
        firstName: users.firstName,
        lastName: users.lastName,
        profileImageUrl: users.profileImageUrl,
      },
      posterProfile: {
        profilePictureUrl: profiles.profilePictureUrl,
      }
    })
    .from(jobs)
    .leftJoin(users, eq(jobs.posterId, users.id))
    .leftJoin(profiles, eq(jobs.posterId, profiles.userId))
    .where(condition)
    .orderBy(desc(jobs.updatedAt));

    return results.map(r => ({
      ...r.job,
      poster: {
        firstName: r.poster?.firstName || 'Unknown',
        lastName: r.poster?.lastName || '',
        profileImageUrl: r.posterProfile?.profilePictureUrl || r.poster?.profileImageUrl || null,
      }
    }));
  }

  async createJob(job: CreateJobInput & { posterId: string }): Promise<Job> {
    const [newJob] = await db.insert(jobs).values(job).returning();
    return newJob;
  }

  async updateJob(id: number, data: Partial<Job>): Promise<Job> {
    const [updated] = await db.update(jobs).set(data).where(eq(jobs.id, id)).returning();
    return updated;
  }

  async getTransactions(userId: string): Promise<Transaction[]> {
    return await db.select().from(transactions)
      .where(eq(transactions.userId, userId))
      .orderBy(desc(transactions.createdAt));
  }

  async createTransaction(tx: { userId: string; amount: string; type: string; jobId?: number; bankName?: string | null; bankCode?: string | null; accountNumber?: string | null; accountName?: string | null }): Promise<Transaction> {
    const [newTx] = await db.insert(transactions).values(tx).returning();
    return newTx;
  }

  async updateWalletBalance(userId: string, amountChange: number): Promise<Profile> {
    const profile = await this.getProfile(userId);
    if (!profile) throw new Error("Profile not found");

    const currentBalance = parseFloat(profile.walletBalance);
    const newBalance = currentBalance + amountChange;

    const [updated] = await db.update(profiles)
      .set({ walletBalance: newBalance.toFixed(2) })
      .where(eq(profiles.userId, userId))
      .returning();
    
    return updated;
  }

  async getOffersByJob(jobId: number): Promise<OfferWithSender[]> {
    const results = await db.select({
      offer: offers,
      sender: {
        firstName: users.firstName,
        lastName: users.lastName,
        profileImageUrl: users.profileImageUrl,
      },
      senderProfile: {
        profilePictureUrl: profiles.profilePictureUrl,
      }
    })
    .from(offers)
    .leftJoin(users, eq(offers.senderId, users.id))
    .leftJoin(profiles, eq(offers.senderId, profiles.userId))
    .where(eq(offers.jobId, jobId))
    .orderBy(desc(offers.createdAt));

    return results.map(r => ({
      ...r.offer,
      sender: {
        firstName: r.sender?.firstName || 'Unknown',
        lastName: r.sender?.lastName || '',
        profileImageUrl: r.senderProfile?.profilePictureUrl || r.sender?.profileImageUrl || null,
      }
    }));
  }

  async getOffer(id: number): Promise<Offer | undefined> {
    const [offer] = await db.select().from(offers).where(eq(offers.id, id));
    return offer;
  }

  async createOffer(data: { jobId: number; senderId: string; amount: string; message?: string }): Promise<Offer> {
    const [offer] = await db.insert(offers).values(data).returning();
    return offer;
  }

  async updateOffer(id: number, data: Partial<Offer>): Promise<Offer> {
    const [updated] = await db.update(offers).set(data).where(eq(offers.id, id)).returning();
    return updated;
  }

  async createDispute(data: { jobId: number; posterId: string; workerId: string }): Promise<Dispute> {
    const [dispute] = await db.insert(disputes).values(data).returning();
    return dispute;
  }

  async getDispute(id: number): Promise<DisputeWithDetails | undefined> {
    const [result] = await db.select({
      dispute: disputes,
      poster: {
        firstName: users.firstName,
        lastName: users.lastName,
        profileImageUrl: users.profileImageUrl,
      }
    })
    .from(disputes)
    .leftJoin(users, eq(disputes.posterId, users.id))
    .where(eq(disputes.id, id));

    if (!result) return undefined;

    const workerAlias = db.select({
      firstName: users.firstName,
      lastName: users.lastName,
      profileImageUrl: users.profileImageUrl,
    }).from(users).where(eq(users.id, result.dispute.workerId));
    const [workerInfo] = await workerAlias;

    const [jobInfo] = await db.select({
      title: jobs.title,
      price: jobs.price,
      priceType: jobs.priceType,
      workersNeeded: jobs.workersNeeded,
    }).from(jobs).where(eq(jobs.id, result.dispute.jobId));

    const messages = await this.getDisputeMessages(id);

    return {
      ...result.dispute,
      poster: result.poster || { firstName: 'Unknown', lastName: '', profileImageUrl: null },
      worker: workerInfo || { firstName: 'Unknown', lastName: '', profileImageUrl: null },
      job: jobInfo || { title: 'Unknown', price: '0' },
      messages,
    };
  }

  async getDisputeByJob(jobId: number): Promise<Dispute | undefined> {
    const [dispute] = await db.select().from(disputes).where(eq(disputes.jobId, jobId));
    return dispute;
  }

  async getDisputes(filters?: { status?: string }): Promise<DisputeWithDetails[]> {
    const results = await db.select({
      dispute: disputes,
      poster: {
        firstName: users.firstName,
        lastName: users.lastName,
        profileImageUrl: users.profileImageUrl,
      }
    })
    .from(disputes)
    .leftJoin(users, eq(disputes.posterId, users.id))
    .orderBy(desc(disputes.createdAt));

    const mapped: DisputeWithDetails[] = [];
    for (const r of results) {
      const [workerInfo] = await db.select({
        firstName: users.firstName,
        lastName: users.lastName,
        profileImageUrl: users.profileImageUrl,
      }).from(users).where(eq(users.id, r.dispute.workerId));

      const [jobInfo] = await db.select({
        title: jobs.title,
        price: jobs.price,
        priceType: jobs.priceType,
        workersNeeded: jobs.workersNeeded,
      }).from(jobs).where(eq(jobs.id, r.dispute.jobId));

      mapped.push({
        ...r.dispute,
        poster: r.poster || { firstName: 'Unknown', lastName: '', profileImageUrl: null },
        worker: workerInfo || { firstName: 'Unknown', lastName: '', profileImageUrl: null },
        job: jobInfo || { title: 'Unknown', price: '0' },
      });
    }

    if (filters?.status) {
      return mapped.filter(d => d.status === filters.status);
    }
    return mapped;
  }

  async updateDispute(id: number, data: Partial<Dispute>): Promise<Dispute> {
    const [updated] = await db.update(disputes).set({ ...data, updatedAt: new Date() }).where(eq(disputes.id, id)).returning();
    return updated;
  }

  async createDisputeMessage(data: { disputeId: number; senderId: string; message: string; type: string; amount?: string; imageUrl?: string }): Promise<DisputeMessage> {
    const [msg] = await db.insert(disputeMessages).values(data).returning();
    return msg;
  }

  async getDisputeMessages(disputeId: number): Promise<DisputeMessageWithSender[]> {
    const results = await db.select({
      msg: disputeMessages,
      sender: {
        firstName: users.firstName,
        lastName: users.lastName,
        profileImageUrl: users.profileImageUrl,
      }
    })
    .from(disputeMessages)
    .leftJoin(users, eq(disputeMessages.senderId, users.id))
    .where(eq(disputeMessages.disputeId, disputeId))
    .orderBy(disputeMessages.createdAt);

    return results.map(r => ({
      ...r.msg,
      sender: r.sender || { firstName: 'Unknown', lastName: '', profileImageUrl: null },
    }));
  }

  async getPlatformEarnings(): Promise<PlatformEarning> {
    const [earnings] = await db.select().from(platformEarnings);
    if (!earnings) {
      const [created] = await db.insert(platformEarnings).values({ totalBalance: "0" }).returning();
      return created;
    }
    return earnings;
  }

  async getPlatformTransactions(): Promise<PlatformTransaction[]> {
    return await db.select().from(platformTransactions).orderBy(desc(platformTransactions.createdAt));
  }

  async addPlatformEarning(amount: number, jobId: number, jobTitle: string): Promise<void> {
    const earnings = await this.getPlatformEarnings();
    const newBalance = parseFloat(earnings.totalBalance) + amount;
    await db.update(platformEarnings).set({ totalBalance: newBalance.toFixed(2) }).where(eq(platformEarnings.id, earnings.id));
    await db.insert(platformTransactions).values({
      amount: amount.toFixed(2),
      type: 'fee_earned',
      jobId,
      jobTitle,
    });
  }

  async withdrawPlatformEarnings(amount: number, bankInfo: { bankName: string; bankCode: string; accountNumber: string; accountName?: string }): Promise<PlatformEarning> {
    const earnings = await this.getPlatformEarnings();
    const currentBalance = parseFloat(earnings.totalBalance);
    if (currentBalance < amount) throw new Error("Insufficient platform balance");

    const newBalance = currentBalance - amount;
    const [updated] = await db.update(platformEarnings)
      .set({ totalBalance: newBalance.toFixed(2) })
      .where(eq(platformEarnings.id, earnings.id))
      .returning();

    await db.insert(platformTransactions).values({
      amount: (-amount).toFixed(2),
      type: 'withdrawal',
      bankName: bankInfo.bankName,
      bankCode: bankInfo.bankCode,
      accountNumber: bankInfo.accountNumber,
      accountName: bankInfo.accountName || null,
    });

    return updated;
  }

  async updatePlatformBankInfo(bankInfo: { bankName: string; bankCode: string; accountNumber: string; accountName?: string }): Promise<PlatformEarning> {
    const earnings = await this.getPlatformEarnings();
    const [updated] = await db.update(platformEarnings)
      .set({
        bankName: bankInfo.bankName,
        bankCode: bankInfo.bankCode,
        accountNumber: bankInfo.accountNumber,
        accountName: bankInfo.accountName || null,
      })
      .where(eq(platformEarnings.id, earnings.id))
      .returning();
    return updated;
  }

  async deductPlatformSalary(amount: number, description: string): Promise<void> {
    const earnings = await this.getPlatformEarnings();
    const currentBalance = parseFloat(earnings.totalBalance);
    if (currentBalance < amount) throw new Error("Insufficient platform balance");
    const newBalance = currentBalance - amount;
    await db.update(platformEarnings).set({ totalBalance: newBalance.toFixed(2) }).where(eq(platformEarnings.id, earnings.id));
    await db.insert(platformTransactions).values({
      amount: (-amount).toFixed(2),
      type: 'salary_payment',
      jobTitle: description,
    });
  }

  async getAdminUser(id: number): Promise<AdminUser | undefined> {
    const [admin] = await db.select().from(adminUsers).where(eq(adminUsers.id, id));
    return admin;
  }

  async getAdminUserByEmail(email: string): Promise<AdminUser | undefined> {
    const [admin] = await db.select().from(adminUsers).where(eq(adminUsers.email, email.toLowerCase()));
    return admin;
  }

  async getAdminUsers(): Promise<AdminUser[]> {
    return await db.select().from(adminUsers).orderBy(desc(adminUsers.createdAt));
  }

  async createAdminUser(data: { email: string; passwordHash: string; name: string; role?: string }): Promise<AdminUser> {
    const [admin] = await db.insert(adminUsers).values({
      email: data.email.toLowerCase(),
      passwordHash: data.passwordHash,
      name: data.name,
      role: data.role || 'staff',
    }).returning();
    return admin;
  }

  async updateAdminUser(id: number, data: Partial<AdminUser>): Promise<AdminUser> {
    const [updated] = await db.update(adminUsers).set(data).where(eq(adminUsers.id, id)).returning();
    return updated;
  }

  async deleteAdminUser(id: number): Promise<void> {
    await db.delete(adminUsers).where(eq(adminUsers.id, id));
  }

  async getAdminActivity(adminId: number, date: string): Promise<AdminActivity | undefined> {
    const [activity] = await db.select().from(adminActivity)
      .where(and(eq(adminActivity.adminId, adminId), eq(adminActivity.date, date)));
    return activity;
  }

  async upsertAdminActivity(adminId: number, date: string, secondsToAdd: number): Promise<AdminActivity> {
    const existing = await this.getAdminActivity(adminId, date);
    if (existing) {
      const [updated] = await db.update(adminActivity)
        .set({
          secondsWorked: existing.secondsWorked + secondsToAdd,
          lastActiveAt: new Date(),
        })
        .where(eq(adminActivity.id, existing.id))
        .returning();
      return updated;
    } else {
      const [created] = await db.insert(adminActivity).values({
        adminId,
        date,
        secondsWorked: secondsToAdd,
        lastActiveAt: new Date(),
      }).returning();
      return created;
    }
  }

  async getAdminHours(date?: string): Promise<{ adminId: number; name: string; email: string; date: string; secondsWorked: number }[]> {
    let query = db.select({
      adminId: adminActivity.adminId,
      name: adminUsers.name,
      email: adminUsers.email,
      date: adminActivity.date,
      secondsWorked: adminActivity.secondsWorked,
    })
    .from(adminActivity)
    .innerJoin(adminUsers, eq(adminActivity.adminId, adminUsers.id))
    .orderBy(desc(adminActivity.date));

    const results = await query;
    if (date) {
      return results.filter(r => r.date === date);
    }
    return results;
  }

  async getAdminHoursAggregated(startDate?: string, endDate?: string): Promise<{ adminId: number; name: string; email: string; totalSeconds: number }[]> {
    const conditions = [];
    if (startDate) conditions.push(gte(adminActivity.date, startDate));
    if (endDate) conditions.push(lte(adminActivity.date, endDate));

    const results = await db.select({
      adminId: adminActivity.adminId,
      name: adminUsers.name,
      email: adminUsers.email,
      totalSeconds: sql<number>`COALESCE(SUM(${adminActivity.secondsWorked}), 0)`.as('total_seconds'),
    })
    .from(adminActivity)
    .innerJoin(adminUsers, eq(adminActivity.adminId, adminUsers.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .groupBy(adminActivity.adminId, adminUsers.name, adminUsers.email);

    return results;
  }

  async getMyAdminHours(adminId: number, startDate?: string, endDate?: string): Promise<{ date: string; secondsWorked: number }[]> {
    const conditions = [eq(adminActivity.adminId, adminId)];
    if (startDate) conditions.push(gte(adminActivity.date, startDate));
    if (endDate) conditions.push(lte(adminActivity.date, endDate));

    return await db.select({
      date: adminActivity.date,
      secondsWorked: adminActivity.secondsWorked,
    })
    .from(adminActivity)
    .where(and(...conditions))
    .orderBy(desc(adminActivity.date));
  }

  async updateAdminBankInfo(adminId: number, data: { bankName: string; bankCode: string; accountNumber: string; accountName: string }): Promise<AdminUser> {
    const [updated] = await db.update(adminUsers)
      .set({
        bankName: data.bankName,
        bankCode: data.bankCode,
        accountNumber: data.accountNumber,
        accountName: data.accountName,
      })
      .where(eq(adminUsers.id, adminId))
      .returning();
    return updated;
  }

  async createAdminPayment(data: { adminId: number; amount: string; periodStart?: string; periodEnd?: string; hoursWorked?: string; bankName?: string; bankCode?: string; accountNumber?: string; accountName?: string; note?: string; paidBy?: string }): Promise<AdminPayment> {
    const [payment] = await db.insert(adminPayments).values(data).returning();
    return payment;
  }

  async getAdminPayments(adminId?: number): Promise<(AdminPayment & { adminName?: string })[]> {
    const results = await db.select({
      id: adminPayments.id,
      adminId: adminPayments.adminId,
      amount: adminPayments.amount,
      periodStart: adminPayments.periodStart,
      periodEnd: adminPayments.periodEnd,
      hoursWorked: adminPayments.hoursWorked,
      bankName: adminPayments.bankName,
      bankCode: adminPayments.bankCode,
      accountNumber: adminPayments.accountNumber,
      accountName: adminPayments.accountName,
      status: adminPayments.status,
      note: adminPayments.note,
      paidBy: adminPayments.paidBy,
      createdAt: adminPayments.createdAt,
      adminName: adminUsers.name,
    })
    .from(adminPayments)
    .innerJoin(adminUsers, eq(adminPayments.adminId, adminUsers.id))
    .where(adminId ? eq(adminPayments.adminId, adminId) : undefined)
    .orderBy(desc(adminPayments.createdAt));

    return results;
  }

  async getAdminsPayrollSummary(startDate?: string, endDate?: string): Promise<{ adminId: number; name: string; email: string; bankName: string | null; accountNumber: string | null; accountName: string | null; bankCode: string | null; totalSeconds: number; isActive: boolean }[]> {
    const admins = await db.select().from(adminUsers).where(eq(adminUsers.role, 'staff'));

    const result = [];
    for (const admin of admins) {
      const conditions = [eq(adminActivity.adminId, admin.id)];
      if (startDate) conditions.push(gte(adminActivity.date, startDate));
      if (endDate) conditions.push(lte(adminActivity.date, endDate));

      const [hoursRow] = await db.select({
        totalSeconds: sql<number>`COALESCE(SUM(${adminActivity.secondsWorked}), 0)`.as('total_seconds'),
      })
      .from(adminActivity)
      .where(and(...conditions));

      result.push({
        adminId: admin.id,
        name: admin.name,
        email: admin.email,
        bankName: admin.bankName,
        accountNumber: admin.accountNumber,
        accountName: admin.accountName,
        bankCode: admin.bankCode,
        totalSeconds: Number(hoursRow?.totalSeconds || 0),
        isActive: admin.isActive,
      });
    }

    return result;
  }

  async createNotification(data: { userId: string; title: string; message: string; type: string; jobId?: number }): Promise<Notification> {
    const [notification] = await db.insert(notifications).values(data).returning();
    return notification;
  }

  async broadcastNotificationToAll(data: { title: string; message: string; type: string; jobId?: number; excludeUserId?: string }): Promise<void> {
    const allProfiles = await db.select({ userId: profiles.userId }).from(profiles);
    const userIds = allProfiles.map(p => p.userId).filter(id => id !== data.excludeUserId);
    if (userIds.length === 0) return;
    const { excludeUserId, ...notifData } = data;
    const values = userIds.map(userId => ({ ...notifData, userId }));
    await db.insert(notifications).values(values);
  }

  async getNotifications(userId: string): Promise<Notification[]> {
    return await db.select().from(notifications).where(eq(notifications.userId, userId)).orderBy(desc(notifications.createdAt));
  }

  async markNotificationRead(id: number, userId: string): Promise<void> {
    await db.update(notifications).set({ isRead: true }).where(and(eq(notifications.id, id), eq(notifications.userId, userId)));
  }

  async markAllNotificationsRead(userId: string): Promise<void> {
    await db.update(notifications).set({ isRead: true }).where(eq(notifications.userId, userId));
  }

  async getUnreadNotificationCount(userId: string): Promise<number> {
    const result = await db.select({ count: sql<number>`count(*)` }).from(notifications).where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)));
    return Number(result[0]?.count || 0);
  }

  async createAdminNotification(data: { adminId: number; title: string; message: string; type: string; disputeId?: number }): Promise<AdminNotification> {
    const [notif] = await db.insert(adminNotifications).values(data).returning();
    return notif;
  }

  async createAdminNotificationForAll(data: { title: string; message: string; type: string; disputeId?: number }): Promise<void> {
    const allAdmins = await db.select({ id: adminUsers.id }).from(adminUsers).where(eq(adminUsers.isActive, true));
    for (const admin of allAdmins) {
      await db.insert(adminNotifications).values({ ...data, adminId: admin.id });
    }
    await db.insert(adminNotifications).values({ ...data, adminId: 0 });
  }

  async getAdminNotifications(adminId: number): Promise<AdminNotification[]> {
    return await db.select().from(adminNotifications).where(eq(adminNotifications.adminId, adminId)).orderBy(desc(adminNotifications.createdAt));
  }

  async markAdminNotificationRead(id: number, adminId: number): Promise<void> {
    await db.update(adminNotifications).set({ isRead: true }).where(and(eq(adminNotifications.id, id), eq(adminNotifications.adminId, adminId)));
  }

  async markAllAdminNotificationsRead(adminId: number): Promise<void> {
    await db.update(adminNotifications).set({ isRead: true }).where(eq(adminNotifications.adminId, adminId));
  }

  async getUnreadAdminNotificationCount(adminId: number): Promise<number> {
    const result = await db.select({ count: sql<number>`count(*)` }).from(adminNotifications).where(and(eq(adminNotifications.adminId, adminId), eq(adminNotifications.isRead, false)));
    return Number(result[0]?.count || 0);
  }

  async searchAddresses(query: string): Promise<LagosAddress[]> {
    if (!query || query.length < 2) return [];
    const pattern = `%${query}%`;
    return await db.select().from(lagosAddresses)
      .where(sql`${lagosAddresses.area} ILIKE ${pattern} OR ${lagosAddresses.lga} ILIKE ${pattern}`)
      .limit(15);
  }

  async getAddressCount(): Promise<number> {
    const result = await db.select({ count: sql<number>`count(*)` }).from(lagosAddresses);
    return Number(result[0]?.count || 0);
  }

  async seedAddresses(addresses: { area: string; lga: string }[]): Promise<void> {
    const batchSize = 100;
    for (let i = 0; i < addresses.length; i += batchSize) {
      const batch = addresses.slice(i, i + batchSize);
      await db.insert(lagosAddresses).values(batch);
    }
  }

  async createScheduledPayment(data: { userId: string; amount: string; jobId?: number; reason: string; scheduledFor: Date }): Promise<ScheduledPayment> {
    const [payment] = await db.insert(scheduledPayments).values(data).returning();
    return payment;
  }

  async getPendingScheduledPayments(): Promise<ScheduledPayment[]> {
    return await db.select().from(scheduledPayments)
      .where(and(
        eq(scheduledPayments.status, "pending"),
        sql`${scheduledPayments.scheduledFor} <= NOW()`
      ));
  }

  async processScheduledPayment(id: number): Promise<void> {
    const [payment] = await db.select().from(scheduledPayments).where(eq(scheduledPayments.id, id));
    if (!payment || payment.status !== "pending") return;

    const amount = parseFloat(payment.amount);
    await this.updateWalletBalance(payment.userId, amount);
    await this.createTransaction({
      userId: payment.userId,
      amount: payment.amount,
      type: "cancellation_compensation",
      jobId: payment.jobId ?? undefined,
    });

    await db.update(scheduledPayments)
      .set({ status: "completed", processedAt: new Date() })
      .where(eq(scheduledPayments.id, id));

    await this.createNotification({
      userId: payment.userId,
      title: "Compensation Received",
      message: `You received ₦${amount.toLocaleString()} compensation for a cancelled job.`,
      type: "success",
      jobId: payment.jobId ?? undefined,
    });
  }
  async getPendingVerifications(): Promise<(Profile & { userName?: string; userEmail?: string })[]> {
    const results = await db.select({
      profile: profiles,
      userName: sql<string>`COALESCE(${users.firstName} || ' ' || ${users.lastName}, 'Unknown')`,
      userEmail: users.email,
    })
    .from(profiles)
    .leftJoin(users, eq(profiles.userId, users.id))
    .where(eq(profiles.verificationStatus, 'pending'))
    .orderBy(desc(profiles.id));

    return results.map(r => ({
      ...r.profile,
      userName: r.userName || undefined,
      userEmail: r.userEmail || undefined,
    }));
  }

  async submitVerification(userId: string, idCardUrl: string, faceScanUrl: string): Promise<Profile> {
    const [updated] = await db.update(profiles)
      .set({
        idCardUrl,
        faceScanUrl,
        verificationStatus: 'pending',
        verificationNote: null,
        isVerified: false,
      })
      .where(eq(profiles.userId, userId))
      .returning();
    return updated;
  }

  async reviewVerification(userId: string, action: 'approve' | 'decline' | 'redo', note?: string): Promise<Profile> {
    const updates: Partial<Profile> = { verificationNote: note || null };
    if (action === 'approve') {
      updates.verificationStatus = 'verified';
      updates.isVerified = true;
    } else if (action === 'decline') {
      updates.verificationStatus = 'declined';
      updates.isVerified = false;
    } else {
      updates.verificationStatus = 'redo_requested';
      updates.isVerified = false;
      updates.idCardUrl = null;
      updates.faceScanUrl = null;
    }
    const [updated] = await db.update(profiles)
      .set(updates)
      .where(eq(profiles.userId, userId))
      .returning();
    return updated;
  }

  async getOwnerSettings(): Promise<{ passcodeHash: string | null; ownerEmail: string; id: number } | undefined> {
    const [settings] = await db.select().from(ownerSettings).limit(1);
    if (!settings) {
      const [created] = await db.insert(ownerSettings).values({ ownerEmail: 'abeebakeem265@gmail.com' }).returning();
      return created;
    }
    return settings;
  }

  async setOwnerPasscode(hash: string): Promise<void> {
    const settings = await this.getOwnerSettings();
    if (settings) {
      await db.update(ownerSettings).set({ passcodeHash: hash, updatedAt: new Date() }).where(eq(ownerSettings.id, settings.id));
    }
  }

  async updateOwnerEmail(newEmail: string): Promise<void> {
    const settings = await this.getOwnerSettings();
    if (settings) {
      await db.update(ownerSettings).set({ ownerEmail: newEmail, updatedAt: new Date() }).where(eq(ownerSettings.id, settings.id));
    }
  }

  async setResetToken(token: string, expiresAt: Date): Promise<void> {
    const settings = await this.getOwnerSettings();
    if (settings) {
      await db.update(ownerSettings).set({ resetToken: token, resetTokenExpiresAt: expiresAt, updatedAt: new Date() }).where(eq(ownerSettings.id, settings.id));
    }
  }

  async getResetToken(): Promise<{ resetToken: string | null; resetTokenExpiresAt: Date | null; ownerEmail: string } | undefined> {
    const settings = await this.getOwnerSettings();
    if (!settings) return undefined;
    return { resetToken: settings.passcodeHash ? null : null, resetTokenExpiresAt: null, ownerEmail: settings.ownerEmail };
  }

  async clearResetToken(): Promise<void> {
    const settings = await this.getOwnerSettings();
    if (settings) {
      await db.update(ownerSettings).set({ resetToken: null, resetTokenExpiresAt: null, updatedAt: new Date() }).where(eq(ownerSettings.id, settings.id));
    }
  }

  async trackVisit(visitorId: string, page: string, userAgent?: string): Promise<void> {
    await db.insert(siteVisits).values({ visitorId, page, userAgent });
  }

  async getDashboardAnalytics() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [totalVisitorsResult] = await db
      .select({ count: sql<number>`count(distinct ${siteVisits.visitorId})` })
      .from(siteVisits);

    const [todayVisitorsResult] = await db
      .select({ count: sql<number>`count(distinct ${siteVisits.visitorId})` })
      .from(siteVisits)
      .where(gte(siteVisits.createdAt, today));

    const [totalSignUpsResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(users);

    const [todaySignUpsResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(users)
      .where(gte(users.createdAt, today));

    const [totalTopUpsResult] = await db
      .select({ total: sql<string>`coalesce(sum(${transactions.amount}), '0')` })
      .from(transactions)
      .where(eq(transactions.type, 'deposit'));

    const [totalPaidOutResult] = await db
      .select({ total: sql<string>`coalesce(sum(${transactions.amount}), '0')` })
      .from(transactions)
      .where(sql`${transactions.type} IN ('job_earning', 'withdrawal', 'cancellation_compensation')`);

    const recentVisitsByDay = await db
      .select({
        date: sql<string>`to_char(${siteVisits.createdAt}, 'YYYY-MM-DD')`,
        count: sql<number>`count(distinct ${siteVisits.visitorId})`,
      })
      .from(siteVisits)
      .where(gte(siteVisits.createdAt, sql`now() - interval '30 days'`))
      .groupBy(sql`to_char(${siteVisits.createdAt}, 'YYYY-MM-DD')`)
      .orderBy(sql`to_char(${siteVisits.createdAt}, 'YYYY-MM-DD')`);

    const recentSignUpsByDay = await db
      .select({
        date: sql<string>`to_char(${users.createdAt}, 'YYYY-MM-DD')`,
        count: sql<number>`count(*)`,
      })
      .from(users)
      .where(gte(users.createdAt, sql`now() - interval '30 days'`))
      .groupBy(sql`to_char(${users.createdAt}, 'YYYY-MM-DD')`)
      .orderBy(sql`to_char(${users.createdAt}, 'YYYY-MM-DD')`);

    return {
      totalVisitors: Number(totalVisitorsResult?.count || 0),
      totalSignUps: Number(totalSignUpsResult?.count || 0),
      totalTopUps: totalTopUpsResult?.total || '0',
      totalPaidOut: totalPaidOutResult?.total || '0',
      todayVisitors: Number(todayVisitorsResult?.count || 0),
      todaySignUps: Number(todaySignUpsResult?.count || 0),
      recentVisitsByDay: recentVisitsByDay.map(r => ({ date: r.date, count: Number(r.count) })),
      recentSignUpsByDay: recentSignUpsByDay.map(r => ({ date: r.date, count: Number(r.count) })),
    };
  }

  async getHoursWorked(startDate: Date, endDate: Date) {
    const completedJobs = await db
      .select({
        id: jobs.id,
        title: jobs.title,
        workerId: jobs.workerId,
        acceptedAt: jobs.acceptedAt,
        completedAt: jobs.completedAt,
      })
      .from(jobs)
      .where(
        and(
          eq(jobs.status, 'completed'),
          isNotNull(jobs.acceptedAt),
          isNotNull(jobs.completedAt),
          gte(jobs.completedAt, startDate),
          lte(jobs.completedAt, endDate),
        )
      )
      .orderBy(desc(jobs.completedAt));

    let totalHours = 0;
    const jobBreakdown: { jobId: number; title: string; hours: number; worker: string; completedAt: string }[] = [];

    for (const job of completedJobs) {
      if (job.acceptedAt && job.completedAt) {
        const diffMs = new Date(job.completedAt).getTime() - new Date(job.acceptedAt).getTime();
        const hours = Math.max(diffMs / (1000 * 60 * 60), 0);
        totalHours += hours;
        jobBreakdown.push({
          jobId: job.id,
          title: job.title,
          hours: Math.round(hours * 100) / 100,
          worker: job.workerId || 'Unknown',
          completedAt: new Date(job.completedAt).toISOString(),
        });
      }
    }

    return {
      totalHours: Math.round(totalHours * 100) / 100,
      totalJobs: completedJobs.length,
      jobBreakdown,
    };
  }
}

export const storage = new DatabaseStorage();
