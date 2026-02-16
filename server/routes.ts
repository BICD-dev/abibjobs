import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api, errorSchemas } from "@shared/routes";
import { z } from "zod";
import bcrypt from "bcryptjs";
import crypto from "crypto";
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

  app.get(api.jobs.myJobs.path, isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const myJobs = await storage.getMyJobs(userId);
    res.json(myJobs);
  });

  app.get(api.jobs.history.path, isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const role = req.query.role as 'posted' | 'accepted' | undefined;
    const history = await storage.getJobHistory(userId, role);
    res.json(history);
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
      if (profile.verificationStatus !== 'verified') {
        return res.status(403).json({ message: "You must complete identity verification before posting a job." });
      }

      const price = parseFloat(input.price);
      const workersNeeded = input.workersNeeded || 1;
      const priceType = input.priceType || 'total';
      const escrowAmount = priceType === 'per_person' ? price * workersNeeded : price;
      const balance = parseFloat(profile.walletBalance);

      if (balance < escrowAmount) {
        return res.status(400).json({ message: `Insufficient funds. You need ₦${escrowAmount.toLocaleString()} in your wallet${priceType === 'per_person' ? ` (₦${price.toLocaleString()} × ${workersNeeded} workers)` : ''}.` });
      }

      try {
        await storage.updateWalletBalance(userId, -escrowAmount);
      } catch (err) {
        return res.status(400).json({ message: "Payment failed. Please check your balance." });
      }

      await storage.createTransaction({
        userId,
        amount: (-escrowAmount).toString(),
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

    const acceptorProfile = await storage.getProfile(userId);
    if (acceptorProfile && acceptorProfile.verificationStatus !== 'verified') {
      return res.status(403).json({ message: "You must complete identity verification before accepting a job." });
    }
    
    const job = await storage.getJob(jobId);
    if (!job) return res.status(404).json({ message: "Job not found" });

    if (job.status !== 'open') {
      return res.status(400).json({ message: "Job is not open for new workers" });
    }

    if (job.posterId === userId) {
      return res.status(400).json({ message: "You cannot accept your own job" });
    }

    const workerProfile = await storage.getProfile(userId);
    if (workerProfile?.isSuspended) {
      return res.status(403).json({ message: "Your account is suspended due to multiple no-shows. You cannot accept jobs at this time." });
    }

    const currentWorkers = job.workerId ? job.workerId.split(',') : [];
    if (currentWorkers.includes(userId)) {
      return res.status(400).json({ message: "You have already accepted this job" });
    }

    const newWorkers = [...currentWorkers, userId];
    const newAccepted = newWorkers.length;
    const newStatus = newAccepted >= job.workersNeeded ? 'in_progress' : 'open';

    const updateData: any = { 
      workerId: newWorkers.join(','), 
      workersAccepted: newAccepted,
      status: newStatus,
    };
    if (!job.acceptedAt) {
      updateData.acceptedAt = new Date();
    }

    const updated = await storage.updateJob(jobId, updateData);
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
    const workerIds = job.workerId.split(',').filter(Boolean);
    const totalEscrow = job.priceType === 'per_person' ? price * job.workersNeeded : price;
    const fee = totalEscrow * 0.22;
    const totalPayout = totalEscrow - fee;
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
    const escrowAmount = job.priceType === 'per_person' ? price * job.workersNeeded : price;
    const workerIsEnRoute = job.workerProgress === 'on_the_way' || job.workerProgress === 'at_location';

    if (workerIsEnRoute && job.workerId) {
      const penalty = Math.round(escrowAmount * 0.1 * 100) / 100;
      const posterRefund = escrowAmount - penalty;

      await storage.updateWalletBalance(userId, posterRefund);
      await storage.createTransaction({
        userId,
        amount: posterRefund.toString(),
        type: 'escrow_refund',
        jobId: job.id,
      });

      const paymentTime = new Date(Date.now() + 24 * 60 * 60 * 1000);

      const workerIds = job.workerId.includes(',') ? job.workerId.split(',').map(id => id.trim()) : [job.workerId];
      let remaining = penalty;
      for (let i = 0; i < workerIds.length; i++) {
        const isLast = i === workerIds.length - 1;
        const share = isLast ? remaining : Math.floor((penalty / workerIds.length) * 100) / 100;
        remaining = Math.round((remaining - share) * 100) / 100;

        await storage.createScheduledPayment({
          userId: workerIds[i],
          amount: share.toString(),
          jobId: job.id,
          reason: 'cancellation_compensation',
          scheduledFor: paymentTime,
        });

        await storage.createNotification({
          userId: workerIds[i],
          title: "Job Cancelled - Compensation Pending",
          message: `The poster cancelled "${job.title}" while you were en route. You will receive ₦${share.toLocaleString()} compensation within 24 hours.`,
          type: "warning",
          jobId: job.id,
        });
      }
    } else {
      await storage.updateWalletBalance(userId, escrowAmount);
      await storage.createTransaction({
        userId,
        amount: escrowAmount.toString(),
        type: 'escrow_refund',
        jobId: job.id,
      });
    }

    const updated = await storage.updateJob(jobId, { status: 'cancelled' });
    res.json(updated);
  });

  // --- WORKER PROGRESS ---

  app.post(api.jobs.updateProgress.path, isAuthenticated, async (req, res) => {
    try {
      const jobId = Number(req.params.id);
      const userId = (req.user as any).claims.sub;
      const { progress } = req.body;

      if (!['getting_ready', 'on_the_way', 'at_location'].includes(progress)) {
        return res.status(400).json({ message: "Invalid progress value" });
      }

      const job = await storage.getJob(jobId);
      if (!job) return res.status(404).json({ message: "Job not found" });

      if (job.status !== 'in_progress') {
        return res.status(400).json({ message: "Job is not in progress" });
      }

      const workerIds = job.workerId ? job.workerId.split(',') : [];
      if (!workerIds.includes(userId)) {
        return res.status(403).json({ message: "Only a worker on this job can update progress" });
      }

      if (workerIds.length > 1) {
        return res.status(400).json({ message: "Progress tracking is only available for single-worker jobs" });
      }

      const progressOrder = ['getting_ready', 'on_the_way', 'at_location'];
      const currentIndex = job.workerProgress ? progressOrder.indexOf(job.workerProgress) : -1;
      const newIndex = progressOrder.indexOf(progress);
      if (newIndex <= currentIndex) {
        return res.status(400).json({ message: "Cannot go back to a previous step" });
      }

      const updated = await storage.updateJob(jobId, { workerProgress: progress });
      res.json(updated);
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post(api.jobs.confirmArrival.path, isAuthenticated, async (req, res) => {
    try {
      const jobId = Number(req.params.id);
      const userId = (req.user as any).claims.sub;

      const job = await storage.getJob(jobId);
      if (!job) return res.status(404).json({ message: "Job not found" });

      if (job.posterId !== userId) {
        return res.status(403).json({ message: "Only the job poster can confirm arrival" });
      }

      if (job.status !== 'in_progress') {
        return res.status(400).json({ message: "Job is not in progress" });
      }

      if (job.workerProgress !== 'at_location') {
        return res.status(400).json({ message: "Worker has not indicated they are at the location yet" });
      }

      const updated = await storage.updateJob(jobId, { posterConfirmedArrival: true });
      res.json(updated);
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post(api.jobs.noShow.path, isAuthenticated, async (req, res) => {
    try {
      const jobId = Number(req.params.id);
      const userId = (req.user as any).claims.sub;
      const action = req.body?.action as string | undefined;
      if (!action || !['repost', 'delete'].includes(action)) {
        return res.status(400).json({ message: "Please choose to repost or delete the job" });
      }

      const job = await storage.getJob(jobId);
      if (!job) return res.status(404).json({ message: "Job not found" });

      if (job.posterId !== userId) {
        return res.status(403).json({ message: "Only the job poster can report a no-show" });
      }

      if (job.status !== 'in_progress' || !job.workerId) {
        return res.status(400).json({ message: "Job must be in progress to report a no-show" });
      }

      const acceptedAt = job.acceptedAt ? new Date(job.acceptedAt).getTime() : null;
      const now = Date.now();
      const twelveHours = 12 * 60 * 60 * 1000;
      if (acceptedAt && (now - acceptedAt) < twelveHours) {
        const remainingMs = twelveHours - (now - acceptedAt);
        const remainingHours = Math.ceil(remainingMs / (60 * 60 * 1000));
        return res.status(400).json({ 
          message: `You can report a no-show after 12 hours from when the job was accepted. About ${remainingHours} hour${remainingHours === 1 ? '' : 's'} remaining.`,
          remainingMs,
        });
      }

      const workerIds = job.workerId.split(',').filter(Boolean);
      const price = parseFloat(job.price);
      const totalEscrow = job.priceType === 'per_person' ? price * job.workersNeeded : price;

      await storage.updateWalletBalance(job.posterId, totalEscrow);
      await storage.createTransaction({
        userId: job.posterId,
        amount: totalEscrow.toFixed(2),
        type: 'escrow_refund',
        jobId: job.id
      });

      for (const wId of workerIds) {
        const workerProfile = await storage.getProfile(wId);
        const currentNoShows = (workerProfile?.noShowCount || 0) + 1;
        const willBeSuspended = currentNoShows >= 3;

        await storage.updateProfile(wId, {
          noShowCount: currentNoShows,
          isSuspended: willBeSuspended,
        });

        const remainingChances = Math.max(0, 3 - currentNoShows);

        if (willBeSuspended) {
          await storage.createNotification({
            userId: wId,
            title: "Account Suspended",
            message: `You have been suspended from accepting jobs due to ${currentNoShows} no-show reports. You failed to show up for the job "${job.title}". Please contact support to resolve this.`,
            type: "error",
            jobId: job.id,
          });
        } else {
          await storage.createNotification({
            userId: wId,
            title: "No-Show Warning",
            message: `The poster of "${job.title}" reported that you didn't show up. You have ${remainingChances} chance${remainingChances === 1 ? '' : 's'} left before your account gets suspended from picking jobs.`,
            type: "warning",
            jobId: job.id,
          });
        }
      }

      if (action === 'repost') {
        await storage.updateJob(jobId, { 
          status: 'open', 
          workerId: null, 
          workersAccepted: 0, 
          workerProgress: null, 
          posterConfirmedArrival: false,
          acceptedAt: null,
        });
        res.json({ message: "No-show reported. Job has been reposted for new workers.", reposted: true });
      } else {
        await storage.updateJob(jobId, { status: 'cancelled' });
        res.json({ message: "No-show reported. Job has been deleted and escrow refunded.", reposted: false });
      }
    } catch (err) {
      console.error("No-show error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // --- NOTIFICATIONS ---

  app.get(api.notifications.list.path, isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const notificationsList = await storage.getNotifications(userId);
    res.json(notificationsList);
  });

  app.get(api.notifications.unreadCount.path, isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const count = await storage.getUnreadNotificationCount(userId);
    res.json({ count });
  });

  app.post(api.notifications.markRead.path, isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const notificationId = Number(req.params.id);
    await storage.markNotificationRead(notificationId, userId);
    res.json({ message: "Notification marked as read" });
  });

  app.post(api.notifications.markAllRead.path, isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    await storage.markAllNotificationsRead(userId);
    res.json({ message: "All notifications marked as read" });
  });

  // --- ADDRESSES ---

  app.get('/api/addresses/search', async (req, res) => {
    const query = String(req.query.q || '');
    const results = await storage.searchAddresses(query);
    res.json(results);
  });

  // Seed addresses on startup if empty
  (async () => {
    try {
      const count = await storage.getAddressCount();
      if (count === 0) {
        const lagosAreas = [
          { area: "Agege", lga: "Agege" },
          { area: "Ogba", lga: "Agege" },
          { area: "Mangoro", lga: "Agege" },
          { area: "Pen Cinema", lga: "Agege" },
          { area: "Dopemu", lga: "Agege" },
          { area: "Orile Agege", lga: "Agege" },
          { area: "Alagbado", lga: "Ifako-Ijaiye" },
          { area: "Ijaiye", lga: "Ifako-Ijaiye" },
          { area: "Ifako", lga: "Ifako-Ijaiye" },
          { area: "Abule Egba", lga: "Ifako-Ijaiye" },
          { area: "Alimosho", lga: "Alimosho" },
          { area: "Egbeda", lga: "Alimosho" },
          { area: "Idimu", lga: "Alimosho" },
          { area: "Igando", lga: "Alimosho" },
          { area: "Isheri Olofin", lga: "Alimosho" },
          { area: "Ikotun", lga: "Alimosho" },
          { area: "Iyana Ipaja", lga: "Alimosho" },
          { area: "Akowonjo", lga: "Alimosho" },
          { area: "Ipaja", lga: "Alimosho" },
          { area: "Ayobo", lga: "Alimosho" },
          { area: "Aboru", lga: "Alimosho" },
          { area: "Oshodi", lga: "Oshodi-Isolo" },
          { area: "Isolo", lga: "Oshodi-Isolo" },
          { area: "Ejigbo", lga: "Oshodi-Isolo" },
          { area: "Mafoluku", lga: "Oshodi-Isolo" },
          { area: "Ago Palace Way", lga: "Oshodi-Isolo" },
          { area: "Mushin", lga: "Mushin" },
          { area: "Idi Araba", lga: "Mushin" },
          { area: "Palm Avenue", lga: "Mushin" },
          { area: "Olateju", lga: "Mushin" },
          { area: "Ikeja", lga: "Ikeja" },
          { area: "Ikeja GRA", lga: "Ikeja" },
          { area: "Allen Avenue", lga: "Ikeja" },
          { area: "Alausa", lga: "Ikeja" },
          { area: "Adeniyi Jones", lga: "Ikeja" },
          { area: "Opebi", lga: "Ikeja" },
          { area: "Computer Village", lga: "Ikeja" },
          { area: "Toyin Street", lga: "Ikeja" },
          { area: "Maryland", lga: "Ikeja" },
          { area: "Ojota", lga: "Kosofe" },
          { area: "Ketu", lga: "Kosofe" },
          { area: "Mile 12", lga: "Kosofe" },
          { area: "Ogudu", lga: "Kosofe" },
          { area: "Alapere", lga: "Kosofe" },
          { area: "Magodo", lga: "Kosofe" },
          { area: "Isheri", lga: "Kosofe" },
          { area: "Surulere", lga: "Surulere" },
          { area: "Iponri", lga: "Surulere" },
          { area: "Bode Thomas", lga: "Surulere" },
          { area: "Aguda", lga: "Surulere" },
          { area: "Masha", lga: "Surulere" },
          { area: "Adeniran Ogunsanya", lga: "Surulere" },
          { area: "National Stadium", lga: "Surulere" },
          { area: "Victoria Island", lga: "Eti-Osa" },
          { area: "Lekki Phase 1", lga: "Eti-Osa" },
          { area: "Lekki Phase 2", lga: "Eti-Osa" },
          { area: "Ajah", lga: "Eti-Osa" },
          { area: "Ikoyi", lga: "Eti-Osa" },
          { area: "Oniru", lga: "Eti-Osa" },
          { area: "Banana Island", lga: "Eti-Osa" },
          { area: "Chevron", lga: "Eti-Osa" },
          { area: "Osapa London", lga: "Eti-Osa" },
          { area: "Ikate", lga: "Eti-Osa" },
          { area: "Sangotedo", lga: "Eti-Osa" },
          { area: "Abraham Adesanya", lga: "Eti-Osa" },
          { area: "Agungi", lga: "Eti-Osa" },
          { area: "Ilasan", lga: "Eti-Osa" },
          { area: "Marwa", lga: "Eti-Osa" },
          { area: "Lekki-Epe Expressway", lga: "Eti-Osa" },
          { area: "Lagos Island", lga: "Lagos Island" },
          { area: "Marina", lga: "Lagos Island" },
          { area: "Broad Street", lga: "Lagos Island" },
          { area: "Tinubu Square", lga: "Lagos Island" },
          { area: "CMS", lga: "Lagos Island" },
          { area: "Onikan", lga: "Lagos Island" },
          { area: "Apapa", lga: "Apapa" },
          { area: "Ajegunle", lga: "Apapa" },
          { area: "Wharf Road", lga: "Apapa" },
          { area: "Kirikiri", lga: "Apapa" },
          { area: "Tin Can Island", lga: "Apapa" },
          { area: "Yaba", lga: "Lagos Mainland" },
          { area: "Ebute Metta", lga: "Lagos Mainland" },
          { area: "Oyingbo", lga: "Lagos Mainland" },
          { area: "Makoko", lga: "Lagos Mainland" },
          { area: "Jibowu", lga: "Lagos Mainland" },
          { area: "Herbert Macaulay Way", lga: "Lagos Mainland" },
          { area: "Fadeyi", lga: "Lagos Mainland" },
          { area: "Somolu", lga: "Somolu" },
          { area: "Bariga", lga: "Somolu" },
          { area: "Gbagada", lga: "Somolu" },
          { area: "Pedro", lga: "Somolu" },
          { area: "Onipanu", lga: "Somolu" },
          { area: "Oworonsoki", lga: "Somolu" },
          { area: "Ikorodu", lga: "Ikorodu" },
          { area: "Ikorodu Town", lga: "Ikorodu" },
          { area: "Ijede", lga: "Ikorodu" },
          { area: "Imota", lga: "Ikorodu" },
          { area: "Igbogbo", lga: "Ikorodu" },
          { area: "Bayeku", lga: "Ikorodu" },
          { area: "Badagry", lga: "Badagry" },
          { area: "Badagry Town", lga: "Badagry" },
          { area: "Seme", lga: "Badagry" },
          { area: "Epe", lga: "Epe" },
          { area: "Epe Town", lga: "Epe" },
          { area: "Lekki Free Trade Zone", lga: "Epe" },
          { area: "Ibeju-Lekki", lga: "Ibeju-Lekki" },
          { area: "Eleko", lga: "Ibeju-Lekki" },
          { area: "Lakowe", lga: "Ibeju-Lekki" },
          { area: "Awoyaya", lga: "Ibeju-Lekki" },
          { area: "Bogije", lga: "Ibeju-Lekki" },
          { area: "Festac Town", lga: "Amuwo-Odofin" },
          { area: "Amuwo-Odofin", lga: "Amuwo-Odofin" },
          { area: "Mile 2", lga: "Amuwo-Odofin" },
          { area: "Satellite Town", lga: "Amuwo-Odofin" },
          { area: "Orile", lga: "Ajeromi-Ifelodun" },
          { area: "Ajeromi", lga: "Ajeromi-Ifelodun" },
          { area: "Boundary", lga: "Ajeromi-Ifelodun" },
          { area: "Ifelodun", lga: "Ajeromi-Ifelodun" },
          { area: "Berger", lga: "Ojodu" },
          { area: "Ojodu", lga: "Ojodu" },
          { area: "Omole Phase 1", lga: "Ojodu" },
          { area: "Omole Phase 2", lga: "Ojodu" },
          { area: "Isheri Magodo", lga: "Ojodu" },
          { area: "Anthony Village", lga: "Kosofe" },
          { area: "Gbagada Phase 1", lga: "Kosofe" },
          { area: "Gbagada Phase 2", lga: "Kosofe" },
          { area: "Ilupeju", lga: "Mushin" },
          { area: "Palmgrove", lga: "Somolu" },
          { area: "Oregun", lga: "Ikeja" },
          { area: "Ojuelegba", lga: "Surulere" },
          { area: "Lawanson", lga: "Surulere" },
          { area: "Itire", lga: "Surulere" },
          { area: "Ire Akari", lga: "Oshodi-Isolo" },
          { area: "Okota", lga: "Oshodi-Isolo" },
          { area: "Cele", lga: "Oshodi-Isolo" },
          { area: "Jakande Estate", lga: "Oshodi-Isolo" },
          { area: "Iyana Oworo", lga: "Kosofe" },
          { area: "Oworo", lga: "Kosofe" },
          { area: "Ojodu Berger", lga: "Ojodu" },
          { area: "Mowe", lga: "Ikorodu" },
          { area: "Magboro", lga: "Ikorodu" },
          { area: "Ibafo", lga: "Ikorodu" },
          { area: "Arepo", lga: "Ikorodu" },
          { area: "Opic Estate", lga: "Ikorodu" },
          { area: "Ajao Estate", lga: "Oshodi-Isolo" },
          { area: "Shogunle", lga: "Oshodi-Isolo" },
          { area: "Ladipo", lga: "Mushin" },
          { area: "Olodi Apapa", lga: "Apapa" },
          { area: "GRA Ikeja", lga: "Ikeja" },
          { area: "Airport Road", lga: "Ikeja" },
          { area: "Murtala Muhammed Airport", lga: "Ikeja" },
          { area: "Lekki Admiralty", lga: "Eti-Osa" },
          { area: "Freedom Way", lga: "Eti-Osa" },
          { area: "Adeola Odeku", lga: "Eti-Osa" },
          { area: "Ozumba Mbadiwe", lga: "Eti-Osa" },
          { area: "Bar Beach", lga: "Eti-Osa" },
          { area: "Falomo", lga: "Eti-Osa" },
          { area: "Obalende", lga: "Eti-Osa" },
          { area: "Dolphin Estate", lga: "Eti-Osa" },
          { area: "1004 Estate", lga: "Eti-Osa" },
        ];
        await storage.seedAddresses(lagosAreas);
        console.log(`Seeded ${lagosAreas.length} Lagos addresses`);
      }
    } catch (e) {
      console.error("Failed to seed addresses:", e);
    }
  })();

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
      const multiplier = job.priceType === 'per_person' ? job.workersNeeded : 1;
      const escrowDiff = (newPrice - oldPrice) * multiplier;

      if (isPoster && escrowDiff > 0) {
        const profile = await storage.getProfile(userId);
        if (!profile) return res.status(404).json({ message: "Profile not found" });
        const balance = parseFloat(profile.walletBalance);

        if (balance < escrowDiff) {
          return res.json({
            offer,
            job,
            insufficientFunds: true,
            shortfall: escrowDiff - balance,
          });
        }

        await storage.updateWalletBalance(userId, -escrowDiff);
        await storage.createTransaction({
          userId,
          amount: (-escrowDiff).toString(),
          type: 'escrow_hold',
          jobId: job.id,
        });
      } else if (isPoster && escrowDiff < 0) {
        await storage.updateWalletBalance(userId, Math.abs(escrowDiff));
        await storage.createTransaction({
          userId,
          amount: Math.abs(escrowDiff).toString(),
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

    delete data.isVerified;
    delete data.verificationStatus;
    delete data.faceScanUrl;
    delete data.verificationNote;
    delete data.idCardUrl;

    const updated = await storage.updateProfile(userId, data);
    res.json(updated);
  });

  // --- ADMIN ---

  const OWNER_EMAIL = 'abeebakeem265@gmail.com';

  const isOwner = async (req: any, res: any, next: any) => {
    const email = (req.user as any)?.claims?.email;
    if (email && email.toLowerCase() === OWNER_EMAIL) {
      (req as any).adminRole = 'owner';
      return next();
    }
    return res.status(403).json({ message: "Owner access required" });
  };

  const isAdminOrOwner = async (req: any, res: any, next: any) => {
    // Check if owner via Replit Auth
    const email = (req.user as any)?.claims?.email;
    if (email && email.toLowerCase() === OWNER_EMAIL) {
      (req as any).adminRole = 'owner';
      return next();
    }
    // Check if staff admin via session
    const adminId = (req.session as any)?.adminId;
    if (adminId) {
      const admin = await storage.getAdminUser(adminId);
      if (admin && admin.isActive) {
        (req as any).adminRole = 'staff';
        (req as any).adminUser = admin;
        return next();
      }
    }
    return res.status(403).json({ message: "Admin access required" });
  };

  // Staff admin auth routes
  app.post('/api/admin/login', async (req, res) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) return res.status(400).json({ message: "Email and password required" });

      const admin = await storage.getAdminUserByEmail(email);
      if (!admin || !admin.isActive) return res.status(401).json({ message: "Invalid credentials" });

      const valid = await bcrypt.compare(password, admin.passwordHash);
      if (!valid) return res.status(401).json({ message: "Invalid credentials" });

      (req.session as any).adminId = admin.id;
      (req.session as any).adminRole = admin.role;

      res.json({ id: admin.id, email: admin.email, name: admin.name, role: admin.role });
    } catch (err) {
      res.status(500).json({ message: "Login failed" });
    }
  });

  app.post('/api/admin/logout', (req, res) => {
    (req.session as any).adminId = null;
    (req.session as any).adminRole = null;
    res.json({ message: "Logged out" });
  });

  app.get('/api/admin/me', async (req, res) => {
    // Check owner via Replit Auth
    if (req.isAuthenticated && req.isAuthenticated()) {
      const email = (req.user as any)?.claims?.email;
      if (email && email.toLowerCase() === OWNER_EMAIL) {
        return res.json({ id: 0, email: OWNER_EMAIL, name: "Owner", role: "owner", isActive: true });
      }
    }
    // Check staff admin via session
    const adminId = (req.session as any)?.adminId;
    if (adminId) {
      const admin = await storage.getAdminUser(adminId);
      if (admin && admin.isActive) {
        return res.json({ id: admin.id, email: admin.email, name: admin.name, role: admin.role, isActive: admin.isActive });
      }
    }
    return res.status(401).json({ message: "Not authenticated as admin" });
  });

  // Staff admin password change
  app.post('/api/admin/change-password', async (req, res) => {
    try {
      const adminId = (req.session as any)?.adminId;
      if (!adminId) return res.status(401).json({ message: "Not authenticated" });

      const { currentPassword, newPassword } = req.body;
      if (!currentPassword || !newPassword) return res.status(400).json({ message: "Current and new password required" });
      if (newPassword.length < 6) return res.status(400).json({ message: "Password must be at least 6 characters" });

      const admin = await storage.getAdminUser(adminId);
      if (!admin) return res.status(404).json({ message: "Admin not found" });

      const valid = await bcrypt.compare(currentPassword, admin.passwordHash);
      if (!valid) return res.status(401).json({ message: "Current password is incorrect" });

      const hash = await bcrypt.hash(newPassword, 10);
      await storage.updateAdminUser(adminId, { passwordHash: hash });
      res.json({ message: "Password updated" });
    } catch (err) {
      res.status(500).json({ message: "Failed to change password" });
    }
  });

  // Owner-only: manage admin staff
  app.get('/api/admin/staff', isAuthenticated, isOwner, async (_req, res) => {
    const admins = await storage.getAdminUsers();
    res.json(admins.map(a => ({ id: a.id, email: a.email, name: a.name, role: a.role, isActive: a.isActive, createdAt: a.createdAt })));
  });

  app.post('/api/admin/staff', isAuthenticated, isOwner, async (req, res) => {
    try {
      const { email, name } = req.body;
      if (!email || !name) return res.status(400).json({ message: "Email and name required" });

      const existing = await storage.getAdminUserByEmail(email);
      if (existing) return res.status(400).json({ message: "An admin with this email already exists" });

      const generatedPassword = crypto.randomBytes(4).toString('hex');
      const hash = await bcrypt.hash(generatedPassword, 10);

      const admin = await storage.createAdminUser({ email, passwordHash: hash, name, role: 'staff' });
      res.status(201).json({ id: admin.id, email: admin.email, name: admin.name, generatedPassword });
    } catch (err) {
      res.status(500).json({ message: "Failed to create admin" });
    }
  });

  app.delete('/api/admin/staff/:id', isAuthenticated, isOwner, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const admin = await storage.getAdminUser(id);
      if (!admin) return res.status(404).json({ message: "Admin not found" });
      if (admin.role === 'owner') return res.status(403).json({ message: "Cannot remove owner" });

      await storage.deleteAdminUser(id);
      res.json({ message: "Admin removed" });
    } catch (err) {
      res.status(500).json({ message: "Failed to remove admin" });
    }
  });

  app.post('/api/admin/staff/:id/reset-password', isAuthenticated, isOwner, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const admin = await storage.getAdminUser(id);
      if (!admin) return res.status(404).json({ message: "Admin not found" });

      const generatedPassword = crypto.randomBytes(4).toString('hex');
      const hash = await bcrypt.hash(generatedPassword, 10);
      await storage.updateAdminUser(id, { passwordHash: hash });

      res.json({ generatedPassword });
    } catch (err) {
      res.status(500).json({ message: "Failed to reset password" });
    }
  });

  app.post('/api/admin/staff/:id/toggle', isAuthenticated, isOwner, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const admin = await storage.getAdminUser(id);
      if (!admin) return res.status(404).json({ message: "Admin not found" });
      if (admin.role === 'owner') return res.status(403).json({ message: "Cannot deactivate owner" });

      await storage.updateAdminUser(id, { isActive: !admin.isActive });
      res.json({ isActive: !admin.isActive });
    } catch (err) {
      res.status(500).json({ message: "Failed to toggle admin status" });
    }
  });

  // Activity tracking
  app.post('/api/admin/ping', async (req, res) => {
    try {
      let adminId: number | null = null;

      // Check owner via Replit Auth
      if (req.isAuthenticated && req.isAuthenticated()) {
        const email = (req.user as any)?.claims?.email;
        if (email && email.toLowerCase() === OWNER_EMAIL) {
          return res.json({ ok: true });
        }
      }

      adminId = (req.session as any)?.adminId;
      if (!adminId) return res.status(401).json({ message: "Not authenticated" });

      const admin = await storage.getAdminUser(adminId);
      if (!admin || !admin.isActive) return res.status(401).json({ message: "Not authenticated" });

      const today = new Date().toISOString().split('T')[0];
      const PING_INTERVAL = 60; // 60 seconds between pings
      await storage.upsertAdminActivity(adminId, today, PING_INTERVAL);

      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ message: "Ping failed" });
    }
  });

  // Owner-only: view admin hours
  app.get('/api/admin/hours', isAuthenticated, isOwner, async (req, res) => {
    try {
      const date = req.query.date as string | undefined;
      const hours = await storage.getAdminHours(date);
      res.json(hours);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch hours" });
    }
  });

  // Owner-only: Platform earnings
  app.get(api.admin.earnings.path, isAuthenticated, isOwner, async (_req, res) => {
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

  app.post(api.admin.withdraw.path, isAuthenticated, isOwner, async (_req, res) => {
    const parsed = api.admin.withdraw.input.safeParse(_req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid input" });
    const { amount, bankCode, bankName, accountNumber, accountName } = parsed.data;

    const passcode = _req.headers['x-owner-passcode'] as string;
    if (!passcode || passcode.length !== 6) {
      return res.status(403).json({ message: "6-digit passcode is required for withdrawals." });
    }
    const settings = await storage.getOwnerSettings();
    if (!settings?.passcodeHash) {
      return res.status(403).json({ message: "Please set up your 6-digit passcode first." });
    }
    const valid = await bcrypt.compare(passcode, settings.passcodeHash);
    if (!valid) {
      return res.status(403).json({ message: "Invalid passcode." });
    }

    try {
      const updated = await storage.withdrawPlatformEarnings(amount, { bankName, bankCode, accountNumber, accountName });
      res.json({ newBalance: updated.totalBalance });
    } catch (err: any) {
      res.status(400).json({ message: err.message || "Withdrawal failed" });
    }
  });

  app.post(api.admin.updateBank.path, isAuthenticated, isOwner, async (_req, res) => {
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
      const email = (req.user as any)?.claims?.email;
      const isAdminUser = (email && email.toLowerCase() === OWNER_EMAIL) || !!(req.session as any)?.adminId;

      if (dispute.posterId !== userId && !workerIds.includes(userId) && !isAdminUser) {
        return res.status(403).json({ message: "You don't have access to this dispute" });
      }

      const full = await storage.getDispute(dispute.id);
      res.json(full);
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get('/api/disputes/:id', async (req, res) => {
    try {
      const disputeId = Number(req.params.id);
      const userId = (req.user as any)?.claims?.sub;
      const email = (req.user as any)?.claims?.email;
      const isOwnerUser = email && email.toLowerCase() === OWNER_EMAIL;
      const adminId = (req.session as any)?.adminId;
      const isAdminUser = isOwnerUser || !!adminId;

      const dispute = await storage.getDispute(disputeId);
      if (!dispute) return res.status(404).json({ message: "Dispute not found" });

      if (!isAdminUser && dispute.posterId !== userId && dispute.workerId !== userId) {
        return res.status(403).json({ message: "You don't have access to this dispute" });
      }

      if (isAdminUser && dispute.status !== 'resolved') {
        let currentAdminId = 'owner';
        let currentAdminName = 'Owner';
        if (adminId) {
          const adminUser = await storage.getAdminUser(adminId);
          currentAdminId = `staff_${adminId}`;
          currentAdminName = adminUser?.name || 'Staff Admin';
        }

        if (!isOwnerUser) {
          const lockStatus = isDisputeLocked(dispute, currentAdminId);
          if (lockStatus.locked) {
            return res.status(423).json({
              message: `This dispute is being handled by ${lockStatus.assignedTo}. It will become available in ${lockStatus.daysRemaining} day(s) if still unresolved.`,
              lockedBy: lockStatus.assignedTo,
              daysRemaining: lockStatus.daysRemaining,
            });
          }
        }

        if (!dispute.assignedAdminId || dispute.assignedAdminId !== currentAdminId) {
          const lockCheck = isDisputeLocked(dispute, currentAdminId);
          if (!lockCheck.locked) {
            await storage.updateDispute(disputeId, {
              assignedAdminId: currentAdminId,
              assignedAdminName: currentAdminName,
              assignedAt: new Date(),
            });
          }
        }
      }

      const updatedDispute = await storage.getDispute(disputeId);
      res.json(updatedDispute);
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post('/api/disputes/:id/message', async (req, res) => {
    try {
      const disputeId = Number(req.params.id);
      const userId = (req.user as any)?.claims?.sub;
      const adminId = (req.session as any)?.adminId;
      const senderId = userId || (adminId ? `admin_${adminId}` : null);
      if (!senderId) return res.status(401).json({ message: "Not authenticated" });

      const parsed = api.disputes.message.input.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid input" });

      const dispute = await storage.getDispute(disputeId);
      if (!dispute) return res.status(404).json({ message: "Dispute not found" });

      if (dispute.status === 'resolved') {
        return res.status(400).json({ message: "This dispute has already been resolved" });
      }

      const email = (req.user as any)?.claims?.email;
      const isOwnerUser = email && email.toLowerCase() === OWNER_EMAIL;
      const isAdminUser = isOwnerUser || !!adminId;

      if (!isAdminUser && dispute.posterId !== userId && dispute.workerId !== userId) {
        return res.status(403).json({ message: "You are not part of this dispute" });
      }

      if (isAdminUser && !isOwnerUser && adminId) {
        const currentAdminId = `staff_${adminId}`;
        const lockStatus = isDisputeLocked(dispute, currentAdminId);
        if (lockStatus.locked) {
          return res.status(423).json({
            message: `This dispute is being handled by ${lockStatus.assignedTo}. You cannot send messages.`,
          });
        }
      }

      if (parsed.data.type === 'proposal' && !parsed.data.amount) {
        return res.status(400).json({ message: "A proposal must include an amount" });
      }

      const msg = await storage.createDisputeMessage({
        disputeId,
        senderId: senderId,
        message: parsed.data.message,
        type: parsed.data.type,
        amount: parsed.data.amount?.toFixed(2),
        imageUrl: parsed.data.imageUrl,
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
      const originalPrice = job.priceType === 'per_person' ? parseFloat(job.price) * job.workersNeeded : parseFloat(job.price);
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

  const DISPUTE_LOCK_DAYS = 7;

  function isDisputeLocked(dispute: any, currentAdminId: string): { locked: boolean; assignedTo?: string; daysRemaining?: number } {
    if (!dispute.assignedAdminId || dispute.status === 'resolved') {
      return { locked: false };
    }
    if (dispute.assignedAdminId === currentAdminId) {
      return { locked: false };
    }
    if (dispute.assignedAt) {
      const assignedDate = new Date(dispute.assignedAt);
      const daysSinceAssigned = (Date.now() - assignedDate.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceAssigned >= DISPUTE_LOCK_DAYS) {
        return { locked: false };
      }
      return { locked: true, assignedTo: dispute.assignedAdminName || dispute.assignedAdminId, daysRemaining: Math.ceil(DISPUTE_LOCK_DAYS - daysSinceAssigned) };
    }
    return { locked: true, assignedTo: dispute.assignedAdminName || dispute.assignedAdminId };
  }

  function getAdminIdentifier(req: any): { id: string; name: string } {
    const email = (req.user as any)?.claims?.email;
    if (email && email.toLowerCase() === OWNER_EMAIL) {
      return { id: 'owner', name: 'Owner' };
    }
    const admin = (req as any).adminUser;
    if (admin) {
      return { id: `staff_${admin.id}`, name: admin.name };
    }
    return { id: 'unknown', name: 'Unknown' };
  }

  app.get('/api/admin/disputes', isAdminOrOwner, async (req, res) => {
    try {
      const status = req.query.status as string | undefined;
      const allDisputes = await storage.getDisputes(status ? { status } : undefined);
      const adminInfo = getAdminIdentifier(req);
      const isOwnerUser = (req as any).adminRole === 'owner';

      const enriched = allDisputes.map(d => {
        const lockStatus = isOwnerUser ? { locked: false } : isDisputeLocked(d, adminInfo.id);
        return {
          ...d,
          isLockedByOther: lockStatus.locked,
          lockedByName: lockStatus.assignedTo,
          daysRemaining: lockStatus.daysRemaining,
        };
      });

      res.json(enriched);
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post('/api/disputes/:id/resolve', isAdminOrOwner, async (req, res) => {
    try {
      const disputeId = Number(req.params.id);
      const userId = (req.user as any)?.claims?.sub || `admin_${(req as any).adminUser?.id || 'owner'}`;
      const parsed = api.disputes.resolve.input.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid input" });

      const dispute = await storage.getDispute(disputeId);
      if (!dispute) return res.status(404).json({ message: "Dispute not found" });

      if (dispute.status === 'resolved') {
        return res.status(400).json({ message: "This dispute has already been resolved" });
      }

      const isOwnerUser = (req as any).adminRole === 'owner';
      const staffAdminId = (req.session as any)?.adminId;
      if (!isOwnerUser && staffAdminId) {
        const currentAdminId = `staff_${staffAdminId}`;
        const lockStatus = isDisputeLocked(dispute, currentAdminId);
        if (lockStatus.locked) {
          return res.status(423).json({
            message: `This dispute is being handled by ${lockStatus.assignedTo}. You cannot resolve it.`,
          });
        }
      }

      const job = await storage.getJob(dispute.jobId);
      if (!job) return res.status(404).json({ message: "Job not found" });

      const originalPrice = job.priceType === 'per_person' ? parseFloat(job.price) * job.workersNeeded : parseFloat(job.price);
      const workerIds = job.workerId ? job.workerId.split(',').filter(Boolean) : [];
      const { action } = parsed.data;

      let workerTotal = 0;
      let posterRefund = 0;
      let platformFee = 0;
      let summaryMsg = '';

      if (action === 'refund_poster') {
        posterRefund = originalPrice;
        workerTotal = 0;
        platformFee = 0;
        summaryMsg = `Admin refunded full amount (\u20A6${originalPrice.toLocaleString()}) to job poster.`;
      } else if (action === 'release_worker') {
        platformFee = originalPrice * 0.22;
        workerTotal = originalPrice - platformFee;
        posterRefund = 0;
        summaryMsg = `Admin released funds to worker(s). Worker receives \u20A6${workerTotal.toLocaleString()}, platform fee \u20A6${platformFee.toLocaleString()}.`;
      } else if (action === 'custom') {
        workerTotal = parsed.data.workerAmount ?? 0;
        posterRefund = parsed.data.posterRefund ?? 0;
        if (workerTotal + posterRefund > originalPrice) {
          return res.status(400).json({ message: `Total distribution (\u20A6${(workerTotal + posterRefund).toLocaleString()}) exceeds escrowed amount (\u20A6${originalPrice.toLocaleString()})` });
        }
        platformFee = originalPrice - workerTotal - posterRefund;
        summaryMsg = `Admin resolved with custom split: Worker \u20A6${workerTotal.toLocaleString()}, Poster refund \u20A6${posterRefund.toLocaleString()}, Platform \u20A6${platformFee.toLocaleString()}.`;
      }

      if (workerTotal > 0 && workerIds.length > 0) {
        const payoutPerWorker = workerTotal / workerIds.length;
        for (const wId of workerIds) {
          await storage.updateWalletBalance(wId, payoutPerWorker);
          await storage.createTransaction({
            userId: wId,
            amount: payoutPerWorker.toFixed(2),
            type: 'job_earning',
            jobId: job.id,
          });
        }
      }

      if (posterRefund > 0) {
        await storage.updateWalletBalance(dispute.posterId, posterRefund);
        await storage.createTransaction({
          userId: dispute.posterId,
          amount: posterRefund.toFixed(2),
          type: 'escrow_refund',
          jobId: job.id,
        });
      }

      if (platformFee > 0) {
        await storage.addPlatformEarning(platformFee, job.id, job.title);
      }

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
        message: summaryMsg,
        type: 'acceptance',
        amount: (action === 'refund_poster' ? posterRefund : workerTotal).toFixed(2),
      });

      await storage.updateDispute(disputeId, {
        status: 'resolved',
        resolvedAmount: (action === 'refund_poster' ? posterRefund : workerTotal).toFixed(2),
        resolvedBy: 'admin',
      });

      await storage.updateJob(dispute.jobId, { status: action === 'refund_poster' ? 'cancelled' : 'completed' });

      const full = await storage.getDispute(disputeId);
      res.json(full);
    } catch (err) {
      console.error("Error resolving dispute:", err);
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

  // --- VERIFICATION ---

  app.post(api.verification.submit.path, isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const parsed = api.verification.submit.input.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid input" });

    const profile = await storage.getProfile(userId);
    if (!profile) return res.status(404).json({ message: "Profile not found" });
    if (profile.verificationStatus === 'verified') {
      return res.status(400).json({ message: "You are already verified." });
    }
    if (profile.verificationStatus === 'pending') {
      return res.status(400).json({ message: "Your verification is already under review." });
    }

    const updated = await storage.submitVerification(userId, parsed.data.idCardUrl, parsed.data.faceScanUrl);
    res.json(updated);
  });

  app.get(api.verification.pending.path, async (req, res) => {
    const email = req.isAuthenticated() ? (req.user as any)?.claims?.email : null;
    const adminId = (req.session as any)?.adminId;
    const OWNER_EMAIL = 'abeebakeem265@gmail.com';
    const isOwnerUser = email && email.toLowerCase() === OWNER_EMAIL;
    const isStaffUser = !!adminId;

    if (!isOwnerUser && !isStaffUser) {
      return res.status(403).json({ message: "Admin access required" });
    }

    const pending = await storage.getPendingVerifications();
    res.json(pending);
  });

  app.post(api.verification.review.path, async (req, res) => {
    const email = req.isAuthenticated() ? (req.user as any)?.claims?.email : null;
    const adminId = (req.session as any)?.adminId;
    const OWNER_EMAIL = 'abeebakeem265@gmail.com';
    const isOwnerUser = email && email.toLowerCase() === OWNER_EMAIL;
    const isStaffUser = !!adminId;

    if (!isOwnerUser && !isStaffUser) {
      return res.status(403).json({ message: "Admin access required" });
    }

    const parsed = api.verification.review.input.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid input" });

    const targetUserId = req.params.userId;
    const { action, note } = parsed.data;

    const updated = await storage.reviewVerification(targetUserId, action, note);

    let notifTitle = '';
    let notifMessage = '';
    let notifType = 'info';
    if (action === 'approve') {
      notifTitle = 'Verification Approved';
      notifMessage = 'Your identity has been verified. You can now post and accept jobs.';
      notifType = 'success';
    } else if (action === 'decline') {
      notifTitle = 'Verification Declined';
      notifMessage = note ? `Your verification was declined: ${note}` : 'Your verification was declined. Please contact support.';
      notifType = 'error';
    } else {
      notifTitle = 'Verification: Redo Required';
      notifMessage = note ? `Please resubmit your verification: ${note}` : 'Please resubmit your verification documents.';
      notifType = 'warning';
    }

    await storage.createNotification({
      userId: targetUserId,
      title: notifTitle,
      message: notifMessage,
      type: notifType,
    });

    res.json(updated);
  });

  // --- OWNER PASSCODE ---

  app.get(api.ownerPasscode.status.path, isAuthenticated, isOwner, async (_req, res) => {
    const settings = await storage.getOwnerSettings();
    res.json({
      hasPasscode: !!settings?.passcodeHash,
      ownerEmail: settings?.ownerEmail || 'abeebakeem265@gmail.com',
    });
  });

  app.post(api.ownerPasscode.setup.path, isAuthenticated, isOwner, async (req, res) => {
    const parsed = api.ownerPasscode.setup.input.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Passcode must be exactly 6 digits." });

    if (!/^\d{6}$/.test(parsed.data.passcode)) {
      return res.status(400).json({ message: "Passcode must be exactly 6 digits (numbers only)." });
    }

    const hash = await bcrypt.hash(parsed.data.passcode, 10);
    await storage.setOwnerPasscode(hash);
    res.json({ message: "Passcode set successfully." });
  });

  app.post(api.ownerPasscode.verify.path, isAuthenticated, isOwner, async (req, res) => {
    const parsed = api.ownerPasscode.verify.input.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid input" });

    const settings = await storage.getOwnerSettings();
    if (!settings?.passcodeHash) return res.json({ valid: false });

    const valid = await bcrypt.compare(parsed.data.passcode, settings.passcodeHash);
    res.json({ valid });
  });

  app.post(api.ownerPasscode.requestReset.path, isAuthenticated, isOwner, async (_req, res) => {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    await storage.setResetToken(token, expiresAt);

    const settings = await storage.getOwnerSettings();
    console.log(`[PASSCODE RESET] Token: ${token} (sent to ${settings?.ownerEmail})`);

    res.json({ message: `A reset link has been sent to your email (${settings?.ownerEmail}). Check your email to reset your passcode.`, resetToken: token });
  });

  app.post(api.ownerPasscode.resetWithToken.path, async (req, res) => {
    const parsed = api.ownerPasscode.resetWithToken.input.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid input" });

    const settings = await storage.getOwnerSettings();
    if (!settings) return res.status(400).json({ message: "Settings not found" });

    const { ownerSettings: ownerSettingsTable } = await import("@shared/schema");
    const { db } = await import("./db");
    const storedToken = await db.select().from(ownerSettingsTable).limit(1);
    if (!storedToken[0]?.resetToken || storedToken[0].resetToken !== parsed.data.token) {
      return res.status(400).json({ message: "Invalid or expired reset token." });
    }
    if (storedToken[0].resetTokenExpiresAt && new Date() > storedToken[0].resetTokenExpiresAt) {
      return res.status(400).json({ message: "Reset token has expired." });
    }

    if (!/^\d{6}$/.test(parsed.data.newPasscode)) {
      return res.status(400).json({ message: "Passcode must be exactly 6 digits." });
    }

    const hash = await bcrypt.hash(parsed.data.newPasscode, 10);
    await storage.setOwnerPasscode(hash);
    await storage.clearResetToken();
    res.json({ message: "Passcode has been reset successfully." });
  });

  app.post(api.ownerPasscode.updateEmail.path, isAuthenticated, isOwner, async (req, res) => {
    const parsed = api.ownerPasscode.updateEmail.input.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid input" });

    const settings = await storage.getOwnerSettings();
    if (!settings?.passcodeHash) {
      return res.status(403).json({ message: "Please set up your 6-digit passcode first." });
    }

    const valid = await bcrypt.compare(parsed.data.passcode, settings.passcodeHash);
    if (!valid) {
      return res.status(403).json({ message: "Invalid passcode." });
    }

    await storage.updateOwnerEmail(parsed.data.newEmail);
    res.json({ message: `Owner email updated to ${parsed.data.newEmail}` });
  });

  return httpServer;
}
