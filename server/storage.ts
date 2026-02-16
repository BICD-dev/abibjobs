import { db } from "./db";
import { eq, desc } from "drizzle-orm";
import {
  users,
  profiles,
  jobs,
  transactions,
  platformEarnings,
  platformTransactions,
  type Profile,
  type Job,
  type Transaction,
  type CreateJobInput,
  type JobWithDetails,
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

  // Platform Earnings (Admin)
  getPlatformEarnings(): Promise<PlatformEarning>;
  getPlatformTransactions(): Promise<PlatformTransaction[]>;
  addPlatformEarning(amount: number, jobId: number, jobTitle: string): Promise<void>;
  withdrawPlatformEarnings(amount: number, bankInfo: { bankName: string; bankCode: string; accountNumber: string; accountName?: string }): Promise<PlatformEarning>;
  updatePlatformBankInfo(bankInfo: { bankName: string; bankCode: string; accountNumber: string; accountName?: string }): Promise<PlatformEarning>;
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
}

export const storage = new DatabaseStorage();
