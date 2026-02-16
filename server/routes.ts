import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api, errorSchemas } from "@shared/routes";
import { z } from "zod";
import { setupAuth, isAuthenticated, registerAuthRoutes } from "./replit_integrations/auth";
import { registerObjectStorageRoutes } from "./replit_integrations/object_storage";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Setup Auth
  await setupAuth(app);
  registerAuthRoutes(app);
  
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
      try {
        await storage.updateWalletBalance(userId, -price);
      } catch (err) {
        return res.status(400).json({ message: "Payment failed. Please check your balance." });
      }

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
      return res.status(400).json({ message: "Job is not open for new workers" });
    }

    if (job.posterId === userId) {
      return res.status(400).json({ message: "You cannot accept your own job" });
    }

    const currentWorkers = job.workerId ? job.workerId.split(',') : [];
    if (currentWorkers.includes(userId)) {
      return res.status(400).json({ message: "You have already accepted this job" });
    }

    const newWorkers = [...currentWorkers, userId];
    const newAccepted = newWorkers.length;
    const newStatus = newAccepted >= job.workersNeeded ? 'in_progress' : 'open';

    const updated = await storage.updateJob(jobId, { 
      workerId: newWorkers.join(','), 
      workersAccepted: newAccepted,
      status: newStatus,
    });
    res.json(updated);
  });

  app.post(api.jobs.complete.path, isAuthenticated, async (req, res) => {
    const jobId = Number(req.params.id);
    const userId = (req.user as any).claims.sub;
    
    const job = await storage.getJob(jobId);
    if (!job) return res.status(404).json({ message: "Job not found" });

    if (job.posterId !== userId) {
      return res.status(403).json({ message: "Only the poster can mark the job as completed" });
    }

    if (job.status !== 'in_progress' || !job.workerId) {
      return res.status(400).json({ message: "Job is not in progress" });
    }

    const price = parseFloat(job.price);
    const fee = price * 0.22;
    const totalPayout = price - fee;

    const workerIds = job.workerId.split(',').filter(Boolean);
    const payoutPerWorker = totalPayout / workerIds.length;

    for (const wId of workerIds) {
      await storage.updateWalletBalance(wId, payoutPerWorker);
      await storage.createTransaction({
        userId: wId,
        amount: payoutPerWorker.toFixed(2),
        type: 'job_earning',
        jobId: job.id
      });
    }

    await storage.addPlatformEarning(fee, job.id, job.title);

    const updated = await storage.updateJob(jobId, { status: 'completed' });
    res.json(updated);
  });

  app.post(api.jobs.cancel.path, isAuthenticated, async (req, res) => {
    const jobId = Number(req.params.id);
    const userId = (req.user as any).claims.sub;
    
    const job = await storage.getJob(jobId);
    if (!job) return res.status(404).json({ message: "Job not found" });

    if (job.posterId !== userId) {
      return res.status(403).json({ message: "Only the poster can cancel this job" });
    }

    if (job.status === 'completed' || job.status === 'cancelled') {
      return res.status(400).json({ message: "Job is already " + job.status });
    }

    const price = parseFloat(job.price);
    await storage.updateWalletBalance(userId, price);
    await storage.createTransaction({
      userId,
      amount: price.toString(),
      type: 'escrow_refund',
      jobId: job.id,
    });

    const updated = await storage.updateJob(jobId, { status: 'cancelled' });
    res.json(updated);
  });

  // --- OFFERS ---

  app.get('/api/jobs/:id/offers', isAuthenticated, async (req, res) => {
    const jobId = Number(req.params.id);
    const userId = (req.user as any).claims.sub;

    const job = await storage.getJob(jobId);
    if (!job) return res.status(404).json({ message: "Job not found" });

    const offersList = await storage.getOffersByJob(jobId);
    const isPoster = job.posterId === userId;
    const isParticipant = isPoster || offersList.some(o => o.senderId === userId);

    if (!isPoster && !isParticipant) {
      return res.status(403).json({ message: "You don't have access to these offers" });
    }

    res.json(offersList);
  });

  app.post('/api/jobs/:id/offers', isAuthenticated, async (req, res) => {
    try {
      const jobId = Number(req.params.id);
      const userId = (req.user as any).claims.sub;
      const parsed = api.offers.create.input.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid input" });

      const job = await storage.getJob(jobId);
      if (!job) return res.status(404).json({ message: "Job not found" });
      if (job.status !== 'open') return res.status(400).json({ message: "Job is not open for offers" });
      if (job.posterId === userId) return res.status(400).json({ message: "You cannot make an offer on your own job" });

      const offer = await storage.createOffer({
        jobId,
        senderId: userId,
        amount: parsed.data.amount.toFixed(2),
        message: parsed.data.message,
      });

      res.status(201).json(offer);
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post('/api/offers/:id/accept', isAuthenticated, async (req, res) => {
    try {
      const offerId = Number(req.params.id);
      const userId = (req.user as any).claims.sub;

      const offer = await storage.getOffer(offerId);
      if (!offer) return res.status(404).json({ message: "Offer not found" });
      if (offer.status !== 'pending') return res.status(400).json({ message: "Offer is no longer pending" });

      const job = await storage.getJob(offer.jobId);
      if (!job) return res.status(404).json({ message: "Job not found" });
      if (job.status !== 'open') return res.status(400).json({ message: "Job is no longer open for negotiation" });

      const isPoster = job.posterId === userId;
      const isSender = offer.senderId === userId;

      if (isSender) {
        return res.status(400).json({ message: "You cannot accept your own offer" });
      }

      const allOffers = await storage.getOffersByJob(job.id);
      const isParticipant = isPoster || allOffers.some(o => o.senderId === userId);

      if (!isParticipant) {
        return res.status(403).json({ message: "You are not part of this negotiation" });
      }

      const newPrice = parseFloat(offer.amount);
      const oldPrice = parseFloat(job.price);
      const priceDiff = newPrice - oldPrice;

      if (isPoster && priceDiff > 0) {
        const profile = await storage.getProfile(userId);
        if (!profile) return res.status(404).json({ message: "Profile not found" });
        const balance = parseFloat(profile.walletBalance);

        if (balance < priceDiff) {
          return res.json({
            offer,
            job,
            insufficientFunds: true,
            shortfall: priceDiff - balance,
          });
        }

        await storage.updateWalletBalance(userId, -priceDiff);
        await storage.createTransaction({
          userId,
          amount: (-priceDiff).toString(),
          type: 'escrow_hold',
          jobId: job.id,
        });
      } else if (isPoster && priceDiff < 0) {
        await storage.updateWalletBalance(userId, Math.abs(priceDiff));
        await storage.createTransaction({
          userId,
          amount: Math.abs(priceDiff).toString(),
          type: 'escrow_refund',
          jobId: job.id,
        });
      }

      const updatedOffer = await storage.updateOffer(offerId, { status: 'accepted' });
      const updatedJob = await storage.updateJob(job.id, { price: newPrice.toFixed(2) });

      const remainingOffers = await storage.getOffersByJob(job.id);
      for (const o of remainingOffers) {
        if (o.id !== offerId && o.status === 'pending') {
          await storage.updateOffer(o.id, { status: 'declined' });
        }
      }

      res.json({ offer: updatedOffer, job: updatedJob });
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post('/api/offers/:id/decline', isAuthenticated, async (req, res) => {
    try {
      const offerId = Number(req.params.id);
      const userId = (req.user as any).claims.sub;

      const offer = await storage.getOffer(offerId);
      if (!offer) return res.status(404).json({ message: "Offer not found" });
      if (offer.status !== 'pending') return res.status(400).json({ message: "Offer is no longer pending" });

      const job = await storage.getJob(offer.jobId);
      if (!job) return res.status(404).json({ message: "Job not found" });
      if (job.status !== 'open') return res.status(400).json({ message: "Job is no longer open for negotiation" });

      const isPoster = job.posterId === userId;
      const isSender = offer.senderId === userId;

      if (isSender) {
        return res.status(400).json({ message: "You cannot decline your own offer. Withdraw it instead." });
      }

      const allOffersDecline = await storage.getOffersByJob(job.id);
      const isParticipantDecline = isPoster || allOffersDecline.some(o => o.senderId === userId);

      if (!isParticipantDecline) {
        return res.status(403).json({ message: "You are not part of this negotiation" });
      }

      const updated = await storage.updateOffer(offerId, { status: 'declined' });
      res.json(updated);
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post('/api/offers/:id/counter', isAuthenticated, async (req, res) => {
    try {
      const offerId = Number(req.params.id);
      const userId = (req.user as any).claims.sub;
      const parsed = api.offers.counter.input.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid input" });

      const offer = await storage.getOffer(offerId);
      if (!offer) return res.status(404).json({ message: "Offer not found" });
      if (offer.status !== 'pending') return res.status(400).json({ message: "Offer is no longer pending" });

      const job = await storage.getJob(offer.jobId);
      if (!job) return res.status(404).json({ message: "Job not found" });
      if (job.status !== 'open') return res.status(400).json({ message: "Job is no longer open for negotiation" });

      const isPoster = job.posterId === userId;
      const isSender = offer.senderId === userId;

      if (isSender) {
        return res.status(400).json({ message: "You cannot counter your own offer" });
      }

      const allOffersCounter = await storage.getOffersByJob(job.id);
      const isParticipantCounter = isPoster || allOffersCounter.some(o => o.senderId === userId);

      if (!isParticipantCounter) {
        return res.status(403).json({ message: "You are not part of this negotiation" });
      }

      await storage.updateOffer(offerId, { status: 'countered' });

      const counterOffer = await storage.createOffer({
        jobId: job.id,
        senderId: userId,
        amount: parsed.data.amount.toFixed(2),
        message: parsed.data.message,
      });

      res.json(counterOffer);
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // --- PROFILE ---

  app.get(api.profile.get.path, isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    let profile = await storage.getProfile(userId);
    if (!profile) {
      profile = await storage.createProfile(userId);
    }
    res.json(profile);
  });

  app.patch(api.profile.update.path, isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const data = req.body;
    
    delete data.role;
    delete data.userId;
    delete data.id;
    delete data.walletBalance;

    if (data.idCardUrl) {
      (data as any).isVerified = true;
    }

    const updated = await storage.updateProfile(userId, data);
    res.json(updated);
  });

  // --- ADMIN ---

  const ADMIN_EMAILS = ['abeebakeem265@gmail.com'];

  const isAdmin = async (req: any, res: any, next: any) => {
    const email = (req.user as any).claims.email;
    if (!email || !ADMIN_EMAILS.includes(email.toLowerCase())) {
      return res.status(403).json({ message: "Admin access required" });
    }
    next();
  };

  app.get(api.admin.earnings.path, isAuthenticated, isAdmin, async (_req, res) => {
    const earnings = await storage.getPlatformEarnings();
    const txns = await storage.getPlatformTransactions();
    res.json({
      balance: earnings.totalBalance,
      bankName: earnings.bankName,
      bankCode: earnings.bankCode,
      accountNumber: earnings.accountNumber,
      accountName: earnings.accountName,
      transactions: txns,
    });
  });

  app.post(api.admin.withdraw.path, isAuthenticated, isAdmin, async (_req, res) => {
    const parsed = api.admin.withdraw.input.safeParse(_req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid input" });
    const { amount, bankCode, bankName, accountNumber, accountName } = parsed.data;

    try {
      const updated = await storage.withdrawPlatformEarnings(amount, { bankName, bankCode, accountNumber, accountName });
      res.json({ newBalance: updated.totalBalance });
    } catch (err: any) {
      res.status(400).json({ message: err.message || "Withdrawal failed" });
    }
  });

  app.post(api.admin.updateBank.path, isAuthenticated, isAdmin, async (_req, res) => {
    const parsed = api.admin.updateBank.input.safeParse(_req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid input" });
    const { bankCode, bankName, accountNumber, accountName } = parsed.data;

    await storage.updatePlatformBankInfo({ bankName, bankCode, accountNumber, accountName });
    res.json({ message: "Bank info updated" });
  });

  // --- DISPUTES ---

  app.post('/api/jobs/:id/dispute', isAuthenticated, async (req, res) => {
    try {
      const jobId = Number(req.params.id);
      const userId = (req.user as any).claims.sub;
      const parsed = api.disputes.create.input.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid input" });

      const job = await storage.getJob(jobId);
      if (!job) return res.status(404).json({ message: "Job not found" });

      if (job.posterId !== userId) {
        return res.status(403).json({ message: "Only the job poster can raise a dispute" });
      }

      if (job.status !== 'in_progress' && job.status !== 'completed') {
        return res.status(400).json({ message: "Disputes can only be raised for in-progress or completed jobs" });
      }

      const existingDispute = await storage.getDisputeByJob(jobId);
      if (existingDispute) {
        return res.status(400).json({ message: "A dispute already exists for this job" });
      }

      const workerIds = job.workerId ? job.workerId.split(',') : [];
      if (!workerIds.includes(parsed.data.workerId)) {
        return res.status(400).json({ message: "The specified worker is not assigned to this job" });
      }

      const dispute = await storage.createDispute({
        jobId,
        posterId: userId,
        workerId: parsed.data.workerId,
      });

      await storage.createDisputeMessage({
        disputeId: dispute.id,
        senderId: userId,
        message: parsed.data.message,
        type: 'message',
      });

      await storage.updateJob(jobId, { status: 'disputed' });

      const full = await storage.getDispute(dispute.id);
      res.status(201).json(full);
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get('/api/jobs/:id/dispute', isAuthenticated, async (req, res) => {
    try {
      const jobId = Number(req.params.id);
      const userId = (req.user as any).claims.sub;

      const dispute = await storage.getDisputeByJob(jobId);
      if (!dispute) return res.status(404).json({ message: "No dispute found for this job" });

      const job = await storage.getJob(jobId);
      const workerIds = job?.workerId ? job.workerId.split(',') : [];
      const email = (req.user as any).claims.email;
      const isAdminUser = email && ADMIN_EMAILS.includes(email.toLowerCase());

      if (dispute.posterId !== userId && !workerIds.includes(userId) && !isAdminUser) {
        return res.status(403).json({ message: "You don't have access to this dispute" });
      }

      const full = await storage.getDispute(dispute.id);
      res.json(full);
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get('/api/disputes/:id', isAuthenticated, async (req, res) => {
    try {
      const disputeId = Number(req.params.id);
      const userId = (req.user as any).claims.sub;
      const email = (req.user as any).claims.email;
      const isAdminUser = email && ADMIN_EMAILS.includes(email.toLowerCase());

      const dispute = await storage.getDispute(disputeId);
      if (!dispute) return res.status(404).json({ message: "Dispute not found" });

      if (dispute.posterId !== userId && dispute.workerId !== userId && !isAdminUser) {
        return res.status(403).json({ message: "You don't have access to this dispute" });
      }

      res.json(dispute);
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post('/api/disputes/:id/message', isAuthenticated, async (req, res) => {
    try {
      const disputeId = Number(req.params.id);
      const userId = (req.user as any).claims.sub;
      const parsed = api.disputes.message.input.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid input" });

      const dispute = await storage.getDispute(disputeId);
      if (!dispute) return res.status(404).json({ message: "Dispute not found" });

      if (dispute.status === 'resolved') {
        return res.status(400).json({ message: "This dispute has already been resolved" });
      }

      const email = (req.user as any).claims.email;
      const isAdminUser = email && ADMIN_EMAILS.includes(email.toLowerCase());

      if (dispute.posterId !== userId && dispute.workerId !== userId && !isAdminUser) {
        return res.status(403).json({ message: "You are not part of this dispute" });
      }

      if (parsed.data.type === 'proposal' && !parsed.data.amount) {
        return res.status(400).json({ message: "A proposal must include an amount" });
      }

      const msg = await storage.createDisputeMessage({
        disputeId,
        senderId: userId,
        message: parsed.data.message,
        type: parsed.data.type,
        amount: parsed.data.amount?.toFixed(2),
      });

      if (parsed.data.type === 'proposal') {
        await storage.updateDispute(disputeId, {
          status: 'negotiating',
          proposedAmount: parsed.data.amount!.toFixed(2),
        });
      }

      const full = await storage.getDispute(disputeId);
      res.status(201).json(full);
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post('/api/disputes/:id/accept-proposal', isAuthenticated, async (req, res) => {
    try {
      const disputeId = Number(req.params.id);
      const userId = (req.user as any).claims.sub;

      const dispute = await storage.getDispute(disputeId);
      if (!dispute) return res.status(404).json({ message: "Dispute not found" });

      if (dispute.status === 'resolved') {
        return res.status(400).json({ message: "This dispute has already been resolved" });
      }

      if (dispute.workerId !== userId) {
        return res.status(403).json({ message: "Only the worker can accept a proposal" });
      }

      if (!dispute.proposedAmount) {
        return res.status(400).json({ message: "No proposal to accept" });
      }

      const job = await storage.getJob(dispute.jobId);
      if (!job) return res.status(404).json({ message: "Job not found" });

      const resolvedAmount = parseFloat(dispute.proposedAmount);
      const originalPrice = parseFloat(job.price);
      const fee = resolvedAmount * 0.22;
      const workerPayout = resolvedAmount - fee;
      const refundToPoster = originalPrice - resolvedAmount;

      const workerIds = job.workerId ? job.workerId.split(',').filter(Boolean) : [];
      const payoutPerWorker = workerPayout / workerIds.length;

      for (const wId of workerIds) {
        await storage.updateWalletBalance(wId, payoutPerWorker);
        await storage.createTransaction({
          userId: wId,
          amount: payoutPerWorker.toFixed(2),
          type: 'job_earning',
          jobId: job.id,
        });
      }

      if (refundToPoster > 0) {
        await storage.updateWalletBalance(dispute.posterId, refundToPoster);
        await storage.createTransaction({
          userId: dispute.posterId,
          amount: refundToPoster.toFixed(2),
          type: 'escrow_refund',
          jobId: job.id,
        });
      }

      await storage.addPlatformEarning(fee, job.id, job.title);

      await storage.createDisputeMessage({
        disputeId,
        senderId: userId,
        message: `Accepted the proposed amount of \u20A6${resolvedAmount.toLocaleString()}`,
        type: 'acceptance',
        amount: resolvedAmount.toFixed(2),
      });

      await storage.updateDispute(disputeId, {
        status: 'resolved',
        resolvedAmount: resolvedAmount.toFixed(2),
        resolvedBy: 'agreement',
      });

      await storage.updateJob(dispute.jobId, { status: 'completed' });

      const full = await storage.getDispute(disputeId);
      res.json(full);
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post('/api/disputes/:id/escalate', isAuthenticated, async (req, res) => {
    try {
      const disputeId = Number(req.params.id);
      const userId = (req.user as any).claims.sub;

      const dispute = await storage.getDispute(disputeId);
      if (!dispute) return res.status(404).json({ message: "Dispute not found" });

      if (dispute.posterId !== userId && dispute.workerId !== userId) {
        return res.status(403).json({ message: "Only dispute participants can escalate" });
      }

      if (dispute.status === 'resolved') {
        return res.status(400).json({ message: "This dispute has already been resolved" });
      }

      await storage.updateDispute(disputeId, { status: 'escalated' });

      await storage.createDisputeMessage({
        disputeId,
        senderId: userId,
        message: 'This dispute has been escalated to admin for resolution.',
        type: 'message',
      });

      const full = await storage.getDispute(disputeId);
      res.json(full);
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get('/api/admin/disputes', isAuthenticated, isAdmin, async (req, res) => {
    try {
      const status = req.query.status as string | undefined;
      const allDisputes = await storage.getDisputes(status ? { status } : undefined);
      res.json(allDisputes);
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post('/api/disputes/:id/resolve', isAuthenticated, isAdmin, async (req, res) => {
    try {
      const disputeId = Number(req.params.id);
      const userId = (req.user as any).claims.sub;
      const parsed = api.disputes.resolve.input.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid input" });

      const dispute = await storage.getDispute(disputeId);
      if (!dispute) return res.status(404).json({ message: "Dispute not found" });

      if (dispute.status === 'resolved') {
        return res.status(400).json({ message: "This dispute has already been resolved" });
      }

      const job = await storage.getJob(dispute.jobId);
      if (!job) return res.status(404).json({ message: "Job not found" });

      const resolvedAmount = parsed.data.resolvedAmount;
      const originalPrice = parseFloat(job.price);
      const fee = resolvedAmount * 0.22;
      const workerPayout = resolvedAmount - fee;
      const refundToPoster = originalPrice - resolvedAmount;

      const workerIds = job.workerId ? job.workerId.split(',').filter(Boolean) : [];
      const payoutPerWorker = workerPayout / workerIds.length;

      for (const wId of workerIds) {
        await storage.updateWalletBalance(wId, payoutPerWorker);
        await storage.createTransaction({
          userId: wId,
          amount: payoutPerWorker.toFixed(2),
          type: 'job_earning',
          jobId: job.id,
        });
      }

      if (refundToPoster > 0) {
        await storage.updateWalletBalance(dispute.posterId, refundToPoster);
        await storage.createTransaction({
          userId: dispute.posterId,
          amount: refundToPoster.toFixed(2),
          type: 'escrow_refund',
          jobId: job.id,
        });
      }

      await storage.addPlatformEarning(fee, job.id, job.title);

      if (parsed.data.message) {
        await storage.createDisputeMessage({
          disputeId,
          senderId: userId,
          message: parsed.data.message,
          type: 'message',
        });
      }

      await storage.createDisputeMessage({
        disputeId,
        senderId: userId,
        message: `Admin resolved dispute. Final amount: \u20A6${resolvedAmount.toLocaleString()}`,
        type: 'acceptance',
        amount: resolvedAmount.toFixed(2),
      });

      await storage.updateDispute(disputeId, {
        status: 'resolved',
        resolvedAmount: resolvedAmount.toFixed(2),
        resolvedBy: 'admin',
      });

      await storage.updateJob(dispute.jobId, { status: 'completed' });

      const full = await storage.getDispute(disputeId);
      res.json(full);
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
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
    const parsed = api.wallet.deposit.input.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid input" });
    const { amount, bankCode, bankName, accountNumber, accountName } = parsed.data;

    await storage.updateWalletBalance(userId, amount);
    await storage.createTransaction({
      userId,
      amount: amount.toString(),
      type: 'deposit',
      bankName: bankName || null,
      bankCode: bankCode || null,
      accountNumber: accountNumber || null,
      accountName: accountName || null,
    });

    const profile = await storage.getProfile(userId);
    res.json({ newBalance: profile?.walletBalance || "0" });
  });

  app.post(api.wallet.withdraw.path, isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const parsed = api.wallet.withdraw.input.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid input" });
    const { amount, bankCode, bankName, accountNumber, accountName } = parsed.data;

    const profile = await storage.getProfile(userId);
    if (!profile || parseFloat(profile.walletBalance) < amount) {
      return res.status(400).json({ message: "Insufficient funds" });
    }

    await storage.updateWalletBalance(userId, -amount);
    await storage.createTransaction({
      userId,
      amount: (-amount).toString(),
      type: 'withdrawal',
      bankName: bankName || null,
      bankCode: bankCode || null,
      accountNumber: accountNumber || null,
      accountName: accountName || null,
    });

    const updatedProfile = await storage.getProfile(userId);
    res.json({ newBalance: updatedProfile?.walletBalance || "0" });
  });

  return httpServer;
}
