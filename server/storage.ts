import { db } from "./db";
import { eq, desc, and, sql } from "drizzle-orm";
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
  type Profile,
  type Job,
  type Transaction,
  type Offer,
  type Dispute,
  type DisputeMessage,
  type AdminUser,
  type AdminActivity,
  type CreateJobInput,
  type JobWithDetails,
  type OfferWithSender,
  type DisputeWithDetails,
  type DisputeMessageWithSender,
  type PlatformEarning,
  type PlatformTransaction,
} from "@shared/schema";

export interface IStorage {
  // Profiles
  getProfile(userId: string): Promise<Profile | undefined>;
  createProfile(userId: string): Promise<Profile>;
  updateProfile(userId: string, data: Partial<Profile>): Promise<Profile>;

  // Jobs
  getJobs(filters?: { category?: string; search?: string; status?: string }): Promise<JobWithDetails[]>;
  getJob(id: number): Promise<JobWithDetails | undefined>;
  createJob(job: CreateJobInput & { posterId: string }): Promise<Job>;
  updateJob(id: number, data: Partial<Job>): Promise<Job>;

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
}

export class DatabaseStorage implements IStorage {
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
      }
    })
    .from(jobs)
    .leftJoin(users, eq(jobs.posterId, users.id))
    .orderBy(desc(jobs.createdAt));

    // Simple in-memory filtering for now or basic where clauses
    // Ideally use dynamic where building
    const results = await query;
    
    // Map to JobWithDetails
    let mapped = results.map(r => ({
      ...r.job,
      poster: r.poster || { firstName: 'Unknown', lastName: '', profileImageUrl: null }
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
      }
    })
    .from(jobs)
    .leftJoin(users, eq(jobs.posterId, users.id))
    .where(eq(jobs.id, id));

    if (!result) return undefined;

    return {
      ...result.job,
      poster: result.poster || { firstName: 'Unknown', lastName: '', profileImageUrl: null }
    };
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
      }
    })
    .from(offers)
    .leftJoin(users, eq(offers.senderId, users.id))
    .where(eq(offers.jobId, jobId))
    .orderBy(desc(offers.createdAt));

    return results.map(r => ({
      ...r.offer,
      sender: r.sender || { firstName: 'Unknown', lastName: '', profileImageUrl: null }
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
}

export const storage = new DatabaseStorage();
