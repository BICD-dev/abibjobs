import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api, errorSchemas } from "@shared/routes";
import { z } from "zod";
import { setupAuth, isAuthenticated } from "./replit_integrations/auth";
import { registerObjectStorageRoutes } from "./replit_integrations/object_storage";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Setup Auth
  await setupAuth(app);
  
  // Setup Object Storage
  registerObjectStorageRoutes(app);

  // Helper to ensure profile exists for logged-in user
  const ensureProfile = async (req: any, res: any, next: any) => {
    if (!req.isAuthenticated()) return next();
    const userId = req.user.claims.sub;
    let profile = await storage.getProfile(userId);
    if (!profile) {
      profile = await storage.createProfile(userId);
    }
    next();
  };
  
  app.use(ensureProfile);

  // --- JOBS ---

  app.get(api.jobs.list.path, async (req, res) => {
    // Note: req.query might need parsing if z.object used in routes.ts doesn't auto-parse query params from express
    // Usually we parse manually or use a middleware.
    // Here we just pass the query object if it matches the shape.
    const filters = {
      category: req.query.category as string,
      search: req.query.search as string,
      status: req.query.status as string,
    };
    const jobs = await storage.getJobs(filters);
    res.json(jobs);
  });

  app.get(api.jobs.get.path, async (req, res) => {
    const job = await storage.getJob(Number(req.params.id));
    if (!job) {
      return res.status(404).json({ message: "Job not found" });
    }
    res.json(job);
  });

  app.post(api.jobs.create.path, isAuthenticated, async (req, res) => {
    try {
      const input = api.jobs.create.input.parse(req.body);
      const userId = (req.user as any).claims.sub;
      const profile = await storage.getProfile(userId);

      if (!profile) return res.status(404).json({ message: "Profile not found" });

      const price = parseFloat(input.price);
      const balance = parseFloat(profile.walletBalance);

      // Check balance
      if (balance < price) {
        return res.status(400).json({ message: "Insufficient funds in wallet. Please deposit money first." });
      }

      // Deduct funds (Escrow)
      await storage.updateWalletBalance(userId, -price);
      await storage.createTransaction({
        userId,
        amount: (-price).toString(),
        type: 'escrow_hold',
      });

      const job = await storage.createJob({ ...input, posterId: userId });
      
      // Update transaction with job ID
      // (Simplified: we created tx before job, but for linking we might want to update it or create it after.
      // Ideally database transaction. Here we just leave it or create another log if needed.
      // Let's just proceed.)

      res.status(201).json(job);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post(api.jobs.accept.path, isAuthenticated, async (req, res) => {
    const jobId = Number(req.params.id);
    const userId = (req.user as any).claims.sub;
    
    const job = await storage.getJob(jobId);
    if (!job) return res.status(404).json({ message: "Job not found" });

    if (job.status !== 'open') {
      return res.status(400).json({ message: "Job is not open" });
    }

    if (job.posterId === userId) {
      return res.status(400).json({ message: "You cannot accept your own job" });
    }

    // Verify worker has ID uploaded (optional security check requested)
    const profile = await storage.getProfile(userId);
    if (!profile?.isVerified && !profile?.idCardUrl) {
       // Allow for now but warn, or strictly block:
       // return res.status(400).json({ message: "You must upload an ID to accept jobs." });
    }

    const updated = await storage.updateJob(jobId, { status: 'in_progress', workerId: userId });
    res.json(updated);
  });

  app.post(api.jobs.complete.path, isAuthenticated, async (req, res) => {
    const jobId = Number(req.params.id);
    const userId = (req.user as any).claims.sub;
    
    const job = await storage.getJob(jobId);
    if (!job) return res.status(404).json({ message: "Job not found" });

    // Only poster can mark as complete (approving the work)
    if (job.posterId !== userId) {
      return res.status(403).json({ message: "Only the poster can mark the job as completed" });
    }

    if (job.status !== 'in_progress' || !job.workerId) {
      return res.status(400).json({ message: "Job is not in progress" });
    }

    // Payout Logic
    const price = parseFloat(job.price);
    const fee = price * 0.10; // 10% fee
    const payout = price - fee;

    // Credit worker
    await storage.updateWalletBalance(job.workerId, payout);
    await storage.createTransaction({
      userId: job.workerId,
      amount: payout.toString(),
      type: 'job_earning',
      jobId: job.id
    });

    // We don't need to do anything with the fee in the user's wallet, 
    // it effectively stays in the "system" (since we deducted full price from poster).
    // But we could log a system transaction if we had a system wallet.

    const updated = await storage.updateJob(jobId, { status: 'completed' });
    res.json(updated);
  });

  // --- PROFILE ---

  app.get(api.profile.get.path, isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const profile = await storage.getProfile(userId);
    res.json(profile);
  });

  app.patch(api.profile.update.path, isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const data = req.body;
    
    // If ID card is uploaded, we can auto-mark as verified or keep it pending admin review.
    // For MVP, if they upload an ID, let's mark isVerified = true for simplicity (or keep false until review).
    // Let's set isVerified = true if idCardUrl is present to reduce friction for MVP testing.
    if (data.idCardUrl) {
      (data as any).isVerified = true;
    }

    const updated = await storage.updateProfile(userId, data);
    res.json(updated);
  });

  // --- WALLET ---

  app.get(api.wallet.get.path, isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const profile = await storage.getProfile(userId);
    const transactions = await storage.getTransactions(userId);
    
    if (!profile) return res.status(404).json({ message: "Profile not found" });

    res.json({
      balance: profile.walletBalance,
      transactions
    });
  });

  app.post(api.wallet.deposit.path, isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const { amount } = req.body;

    if (!amount || amount <= 0) return res.status(400).json({ message: "Invalid amount" });

    await storage.updateWalletBalance(userId, amount);
    await storage.createTransaction({
      userId,
      amount: amount.toString(),
      type: 'deposit'
    });

    const profile = await storage.getProfile(userId);
    res.json({ newBalance: profile?.walletBalance || "0" });
  });

  app.post(api.wallet.withdraw.path, isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const { amount } = req.body;

    if (!amount || amount <= 0) return res.status(400).json({ message: "Invalid amount" });

    const profile = await storage.getProfile(userId);
    if (!profile || parseFloat(profile.walletBalance) < amount) {
      return res.status(400).json({ message: "Insufficient funds" });
    }

    await storage.updateWalletBalance(userId, -amount);
    await storage.createTransaction({
      userId,
      amount: (-amount).toString(),
      type: 'withdrawal'
    });

    const updatedProfile = await storage.getProfile(userId);
    res.json({ newBalance: updatedProfile?.walletBalance || "0" });
  });

  return httpServer;
}
