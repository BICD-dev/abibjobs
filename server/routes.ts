import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api, errorSchemas } from "@shared/routes";
import { z } from "zod";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { setupAuth, isAuthenticated, registerAuthRoutes } from "./replit_integrations/auth";
import { registerObjectStorageRoutes } from "./replit_integrations/object_storage";
import { setupCallSignaling } from "./call";
import { db } from "./db";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";
import {
  sendWelcomeEmail,
  sendPasswordResetEmail,
  sendJobPostedEmail,
  sendJobAcceptedToPosterEmail,
  sendJobAcceptedToWorkerEmail,
  sendJobCompletedToPosterEmail,
  sendJobCompletedToWorkerEmail,
  sendCompletionRequestedEmail,
  sendJobCancelledToWorkerEmail,
  sendNoShowWarningEmail,
  sendWalletDepositEmail,
  sendWithdrawalEmail,
} from "./email";

interface PaystackSession {
  userId: string;
  amount: number;
  paymentMethod: 'card' | 'bank_account';
  paystackReference: string;
  maskedInfo: string;
  bankCode?: string;
  bankName?: string;
  accountNumber?: string;
  expiresAt: number;
  createdAt: number;
}

const paystackSessions = new Map<string, PaystackSession>();

function verificationBlockMessage(status: string | null | undefined, action: 'posting' | 'accepting'): string {
  const doing = action === 'posting' ? 'post a job' : 'accept a job';
  switch (status) {
    case 'pending':
      return `Your verification is still awaiting admin approval. Please wait for an admin to accept your verification before you can ${doing}.`;
    case 'declined':
      return `Your verification was declined. Please submit a new verification and wait for admin approval before you can ${doing}.`;
    case 'redo_requested':
      return `An admin asked you to redo your verification. Please resubmit it and wait for approval before you can ${doing}.`;
    default:
      return `You must complete identity verification before you can ${doing}. Go to your Profile to get verified.`;
  }
}

async function paystackRequest(method: string, path: string, body?: any): Promise<any> {
  const secretKey = process.env.PAYSTACK_SECRET_KEY;
  if (!secretKey) throw new Error("PAYSTACK_SECRET_KEY is not configured");
  const resp = await fetch(`https://api.paystack.co${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return resp.json();
}

function cleanExpiredSessions() {
  const now = Date.now();
  const keys = Array.from(paystackSessions.keys());
  for (const key of keys) {
    const session = paystackSessions.get(key);
    if (session && session.expiresAt < now) {
      paystackSessions.delete(key);
    }
  }
}

setInterval(cleanExpiredSessions, 60000);

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Setup Auth
  await setupAuth(app);
  registerAuthRoutes(app);
  
  // Setup Object Storage
  registerObjectStorageRoutes(app);

  // Setup in-app voice call signaling (WebSocket on /ws/call)
  setupCallSignaling(httpServer);

  // Helper to ensure profile exists for logged-in user
  const ensureProfile = async (req: any, res: any, next: any) => {
    if (req.session?.manualUserId) {
      const userId = req.session.manualUserId;
      let profile = await storage.getProfile(userId);
      if (!profile) {
        profile = await storage.createProfile(userId);
      }
      return next();
    }
    if (!req.isAuthenticated || !req.isAuthenticated()) return next();
    const userId = req.user?.claims?.sub;
    if (!userId) return next();
    let profile = await storage.getProfile(userId);
    if (!profile) {
      profile = await storage.createProfile(userId);
    }
    // Capture login IP for OIDC users (once per session to avoid overhead)
    if (!req.session?.loginIpCaptured) {
      const ip = ((req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()) || req.ip || req.socket?.remoteAddress || 'unknown';
      storage.updateUserLoginInfo(userId, ip).catch(() => {});
      req.session.loginIpCaptured = true;
    }
    next();
  };

  app.use(ensureProfile);

  // --- MANUAL AUTH ROUTES ---
  app.post('/api/auth/register', async (req, res) => {
    try {
      const { firstName, lastName, email, password, phoneNumber } = req.body;
      if (!firstName || !lastName || !email || !password) {
        return res.status(400).json({ message: "All fields are required" });
      }
      if (password.length < 6) {
        return res.status(400).json({ message: "Password must be at least 6 characters" });
      }
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({ message: "Please enter a valid email address" });
      }

      const existing = await storage.getUserByEmail(email.toLowerCase().trim());
      if (existing) {
        return res.status(409).json({ message: "An account with this email already exists. Please log in instead." });
      }

      const passwordHash = await bcrypt.hash(password, 10);
      const user = await storage.createManualUser({
        email: email.toLowerCase().trim(),
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        passwordHash,
      });

      if (phoneNumber) {
        const profile = await storage.getProfile(user.id);
        if (profile) {
          await storage.updateProfile(user.id, { phoneNumber: phoneNumber.trim() });
        }
      }

      const regIp = ((req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()) || req.ip || req.socket?.remoteAddress || 'unknown';
      storage.updateUserRegistrationIp(user.id, regIp).catch(() => {});
      storage.updateUserLoginInfo(user.id, regIp).catch(() => {});

      (req.session as any).manualUserId = user.id;
      sendWelcomeEmail(user.email, user.firstName || firstName.trim()).catch(() => {});
      res.json({ id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName });
    } catch (err: any) {
      console.error("Registration error:", err);
      res.status(500).json({ message: "Registration failed. Please try again." });
    }
  });

  app.post('/api/auth/login-manual', async (req, res) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ message: "Email and password are required" });
      }

      const user = await storage.getUserByEmail(email.toLowerCase().trim());
      if (!user || !user.passwordHash) {
        return res.status(401).json({ message: "Invalid email or password" });
      }

      const valid = await bcrypt.compare(password, user.passwordHash);
      if (!valid) {
        return res.status(401).json({ message: "Invalid email or password" });
      }

      if (req.isAuthenticated && req.isAuthenticated()) {
        req.logout(() => {});
      }
      (req.session as any).manualUserId = user.id;
      const loginIp = ((req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()) || req.ip || req.socket?.remoteAddress || 'unknown';
      storage.updateUserLoginInfo(user.id, loginIp).catch(() => {});
      res.json({ id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName });
    } catch (err) {
      console.error("Login error:", err);
      res.status(500).json({ message: "Login failed. Please try again." });
    }
  });

  app.post('/api/auth/forgot-password', async (req, res) => {
    try {
      const { email } = req.body;
      if (!email) return res.status(400).json({ message: "Email is required" });

      const user = await storage.getUserByEmail(email.toLowerCase().trim());
      const isOwnerAccount = user?.email?.toLowerCase() === 'abeebakeem265@gmail.com';
      if (!user || (user.authMethod !== 'manual' && !user.passwordHash && !isOwnerAccount)) {
        return res.json({ message: "If this email exists, a reset link has been generated below." });
      }

      const token = crypto.randomBytes(32).toString('hex');
      const expiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
      await storage.setUserResetToken(email.toLowerCase().trim(), token, expiry);

      sendPasswordResetEmail(user.email, user.firstName || email, token).catch(() => {});
      res.json({ message: "If this email is registered, a password reset link has been sent. Please check your inbox (and spam folder)." });
    } catch (err) {
      console.error("Forgot password error:", err);
      res.status(500).json({ message: "Something went wrong. Please try again." });
    }
  });

  app.post('/api/auth/reset-password', async (req, res) => {
    try {
      const { token, newPassword } = req.body;
      if (!token || !newPassword) return res.status(400).json({ message: "Token and new password are required" });
      if (newPassword.length < 6) return res.status(400).json({ message: "Password must be at least 6 characters" });

      const user = await storage.getUserByResetToken(token);
      if (!user) return res.status(400).json({ message: "Invalid or expired reset link. Please request a new one." });
      const isOwnerAccount = user.email?.toLowerCase() === 'abeebakeem265@gmail.com';
      if (user.authMethod !== 'manual' && !user.passwordHash && !isOwnerAccount) return res.status(400).json({ message: "This account does not use password login." });
      if (user.passwordResetExpiry && new Date(user.passwordResetExpiry) < new Date()) {
        return res.status(400).json({ message: "Reset link has expired. Please request a new one." });
      }

      const hash = await bcrypt.hash(newPassword, 10);
      await storage.updateUserPassword(user.id, hash);

      res.json({ message: "Password reset successfully. You can now log in." });
    } catch (err) {
      console.error("Reset password error:", err);
      res.status(500).json({ message: "Something went wrong. Please try again." });
    }
  });

  app.post('/api/auth/set-password', isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub || (req.session as any)?.manualUserId;
      const { currentPassword, newPassword } = req.body;
      if (!newPassword || typeof newPassword !== 'string') {
        return res.status(400).json({ message: "New password is required" });
      }
      if (newPassword.length < 6) {
        return res.status(400).json({ message: "Password must be at least 6 characters" });
      }

      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ message: "User not found" });

      if (user.passwordHash) {
        if (!currentPassword) {
          return res.status(400).json({ message: "Current password is required" });
        }
        const valid = await bcrypt.compare(currentPassword, user.passwordHash);
        if (!valid) {
          return res.status(401).json({ message: "Current password is incorrect" });
        }
      }

      const hash = await bcrypt.hash(newPassword, 10);
      await storage.updateUserPassword(user.id, hash);

      res.json({ message: "Password saved. You can now log in with your email and password too." });
    } catch (err) {
      console.error("Set password error:", err);
      res.status(500).json({ message: "Something went wrong. Please try again." });
    }
  });

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
    const userId = (req.user as any)?.claims?.sub || (req.session as any)?.manualUserId;
    const myJobs = await storage.getMyJobs(userId);
    res.json(myJobs);
  });

  app.get(api.jobs.history.path, isAuthenticated, async (req, res) => {
    const userId = (req.user as any)?.claims?.sub || (req.session as any)?.manualUserId;
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
      const userId = (req.user as any)?.claims?.sub || (req.session as any)?.manualUserId;
      const profile = await storage.getProfile(userId);

      if (!profile) return res.status(404).json({ message: "Profile not found" });
      if (profile.verificationStatus !== 'verified') {
        return res.status(403).json({ message: verificationBlockMessage(profile.verificationStatus, 'posting') });
      }

      const jobInput = {
        ...input,
        posterId: userId,
        scheduledDate: input.scheduledDate ? new Date(input.scheduledDate as any) : undefined,
      };
      const job = await storage.createJob(jobInput);

      await storage.createAdminNotification({
        adminId: 0,
        title: 'New Job Posted',
        message: `"${job.title}" posted in ${job.category} for ₦${parseFloat(job.price).toLocaleString()}${job.priceType === 'per_person' ? '/person' : ''} (${job.workersNeeded} worker${job.workersNeeded > 1 ? 's' : ''} needed).`,
        type: 'info'
      });

      storage.broadcastNotificationToAll({
        title: 'New Job Available',
        message: `"${job.title}" in ${job.location} for ₦${parseFloat(job.price).toLocaleString()}. Check it out!`,
        type: 'info',
        jobId: job.id,
        excludeUserId: userId,
      }).catch(() => {});

      // Email the poster a confirmation
      storage.getUser(userId).then(poster => {
        if (poster?.email) {
          const priceDisplay = `₦${parseFloat(job.price).toLocaleString()}${job.priceType === 'per_person' ? '/person' : ''}`;
          sendJobPostedEmail(poster.email, poster.firstName || poster.email, job.title, job.id, priceDisplay, job.location, job.category).catch(() => {});
        }
      }).catch(() => {});

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
    const userId = (req.user as any)?.claims?.sub || (req.session as any)?.manualUserId;

    const acceptorProfile = await storage.getProfile(userId);
    if (acceptorProfile && acceptorProfile.verificationStatus !== 'verified') {
      return res.status(403).json({ message: verificationBlockMessage(acceptorProfile.verificationStatus, 'accepting') });
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

    // Hold escrow from poster's wallet on first acceptance
    if (currentWorkers.length === 0) {
      const posterProfile = await storage.getProfile(job.posterId);
      const price = parseFloat(job.price);
      const escrowAmount = job.priceType === 'per_person' ? price * job.workersNeeded : price;
      const posterBalance = parseFloat(posterProfile?.walletBalance || '0');
      if (posterBalance < escrowAmount) {
        return res.status(400).json({ message: `The job poster has insufficient funds in their wallet to cover this job (₦${escrowAmount.toLocaleString()} required).` });
      }
      await storage.updateWalletBalance(job.posterId, -escrowAmount);
      await storage.createTransaction({
        userId: job.posterId,
        amount: (-escrowAmount).toString(),
        type: 'escrow_hold',
        jobId: job.id,
      });
    }

    const updated = await storage.updateJob(jobId, updateData);

    await storage.createAdminNotification({
      adminId: 0,
      title: 'Job Accepted',
      message: `A worker accepted "${job.title}" (${newAccepted}/${job.workersNeeded} workers).${newStatus === 'in_progress' ? ' Job is now in progress.' : ''}`,
      type: 'info'
    });

    await storage.createNotification({
      userId: job.posterId,
      title: 'Worker Accepted Your Job',
      message: `A worker has accepted your job "${job.title}" (${newAccepted}/${job.workersNeeded} workers).${newStatus === 'in_progress' ? ' Job is now in progress!' : ''}`,
      type: 'info',
      jobId: job.id,
    });

    // Email poster and worker about the acceptance
    Promise.all([
      storage.getUser(job.posterId),
      storage.getUser(userId),
    ]).then(([poster, worker]) => {
      if (poster?.email) {
        sendJobAcceptedToPosterEmail(poster.email, poster.firstName || poster.email, job.title, job.id, newAccepted, job.workersNeeded).catch(() => {});
      }
      if (worker?.email) {
        const priceDisplay = `₦${parseFloat(job.price).toLocaleString()}${job.priceType === 'per_person' ? '/person' : ''}`;
        sendJobAcceptedToWorkerEmail(worker.email, worker.firstName || worker.email, job.title, job.id, priceDisplay, job.location).catch(() => {});
      }
    }).catch(() => {});

    res.json(updated);
  });

  app.post(api.jobs.complete.path, isAuthenticated, async (req, res) => {
    const jobId = Number(req.params.id);
    const userId = (req.user as any)?.claims?.sub || (req.session as any)?.manualUserId;

    const job = await storage.getJob(jobId);
    if (!job) return res.status(404).json({ message: "Job not found" });

    if (job.status !== 'in_progress' || !job.workerId) {
      return res.status(400).json({ message: "Job is not in progress" });
    }

    const workerIds = job.workerId.split(',').filter(Boolean);
    const isPoster = job.posterId === userId;
    const isWorker = workerIds.includes(userId);

    if (!isPoster && !isWorker) {
      return res.status(403).json({ message: "Only the job poster or worker can mark this job as completed" });
    }

    let updateData: any = {};
    if (isPoster) updateData.posterMarkedComplete = true;
    if (isWorker) updateData.workerMarkedComplete = true;

    const updatedJob = await storage.updateJob(jobId, updateData);

    const posterDone = isPoster ? true : !!job.posterMarkedComplete;
    const workerDone = isWorker ? true : !!job.workerMarkedComplete;

    if (posterDone && workerDone) {
      const price = parseFloat(job.price);
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
      const completed = await storage.updateJob(jobId, { status: 'completed', completedAt: new Date() });

      await storage.createAdminNotification({
        adminId: 0,
        title: 'Job Completed',
        message: `"${job.title}" has been completed. Platform fee earned: ₦${fee.toFixed(2)}. Total payout to ${workerIds.length} worker(s): ₦${totalPayout.toFixed(2)}.`,
        type: 'success'
      });

      for (const wId of workerIds) {
        storage.createNotification({
          userId: wId,
          title: 'Job Completed — Payment Received!',
          message: `"${job.title}" is complete. ₦${payoutPerWorker.toLocaleString()} has been added to your wallet.`,
          type: 'success',
          jobId: job.id,
        }).catch(() => {});
      }

      storage.createNotification({
        userId: job.posterId,
        title: 'Job Completed',
        message: `"${job.title}" has been completed and payment released to the worker(s).`,
        type: 'success',
        jobId: job.id,
      }).catch(() => {});

      // Email all parties
      storage.getUser(job.posterId).then(poster => {
        if (poster?.email) sendJobCompletedToPosterEmail(poster.email, poster.firstName || poster.email, job.title, job.id, totalPayout).catch(() => {});
      }).catch(() => {});
      for (const wId of workerIds) {
        storage.getUser(wId).then(worker => {
          if (worker?.email) sendJobCompletedToWorkerEmail(worker.email, worker.firstName || worker.email, job.title, job.id, payoutPerWorker).catch(() => {});
        }).catch(() => {});
      }

      return res.json({ ...completed, bothConfirmed: true });
    }

    if (isPoster && !workerDone) {
      storage.createNotification({
        userId: workerIds[0],
        title: 'Job Completion Requested',
        message: `The poster has marked "${job.title}" as complete. Please confirm completion to receive your payment.`,
        type: 'info',
        jobId: job.id,
      }).catch(() => {});
      // Email worker
      storage.getUser(workerIds[0]).then(worker => {
        if (worker?.email) sendCompletionRequestedEmail(worker.email, worker.firstName || worker.email, job.title, job.id, 'poster').catch(() => {});
      }).catch(() => {});
    }

    if (isWorker && !posterDone) {
      storage.createNotification({
        userId: job.posterId,
        title: 'Worker Confirmed Completion',
        message: `The worker has confirmed "${job.title}" is done. Please mark it as complete to release their payment.`,
        type: 'info',
        jobId: job.id,
      }).catch(() => {});
      // Email poster
      storage.getUser(job.posterId).then(poster => {
        if (poster?.email) sendCompletionRequestedEmail(poster.email, poster.firstName || poster.email, job.title, job.id, 'worker').catch(() => {});
      }).catch(() => {});
    }

    return res.json({ ...updatedJob, bothConfirmed: false, posterMarkedComplete: posterDone, workerMarkedComplete: workerDone });
  });

  app.post(api.jobs.cancel.path, isAuthenticated, async (req, res) => {
    const jobId = Number(req.params.id);
    const userId = (req.user as any)?.claims?.sub || (req.session as any)?.manualUserId;
    
    const job = await storage.getJob(jobId);
    if (!job) return res.status(404).json({ message: "Job not found" });

    if (job.posterId !== userId) {
      return res.status(403).json({ message: "Only the poster can cancel this job" });
    }

    if (job.status === 'completed' || job.status === 'cancelled') {
      return res.status(400).json({ message: "Job is already " + job.status });
    }

    if (job.posterConfirmedArrival) {
      return res.status(403).json({ message: "You cannot cancel this job after confirming the worker has arrived on site." });
    }

    const price = parseFloat(job.price);
    const escrowAmount = job.priceType === 'per_person' ? price * job.workersNeeded : price;
    const workerIsEnRoute = job.workerProgress === 'on_the_way' || job.workerProgress === 'at_location';
    const escrowWasHeld = !!job.workerId; // escrow only held once first worker accepts

    if (escrowWasHeld) {
      if (workerIsEnRoute) {
        const penalty = Math.round(escrowAmount * 0.1 * 100) / 100;
        const posterRefund = escrowAmount - penalty;

        await storage.updateWalletBalance(userId, posterRefund);
        await storage.createTransaction({
          userId,
          amount: posterRefund.toString(),
          type: 'escrow_refund',
          jobId: job.id,
        });

        const workerIds = job.workerId!.includes(',') ? job.workerId!.split(',').map(id => id.trim()) : [job.workerId!];
        let remaining = penalty;
        for (let i = 0; i < workerIds.length; i++) {
          const isLast = i === workerIds.length - 1;
          const share = isLast ? remaining : Math.floor((penalty / workerIds.length) * 100) / 100;
          remaining = Math.round((remaining - share) * 100) / 100;

          // Pay worker immediately — no delay, owner gains nothing
          await storage.updateWalletBalance(workerIds[i], share);
          await storage.createTransaction({
            userId: workerIds[i],
            amount: share.toString(),
            type: 'cancellation_compensation',
            jobId: job.id,
          });

          await storage.createNotification({
            userId: workerIds[i],
            title: "Compensation Received",
            message: `The poster cancelled "${job.title}" while you were on the way. ₦${share.toLocaleString()} has been added to your wallet.`,
            type: "success",
            jobId: job.id,
          });

          // Email worker about compensation
          storage.getUser(workerIds[i]).then(worker => {
            if (worker?.email) sendJobCancelledToWorkerEmail(worker.email, worker.firstName || worker.email, job.title, share).catch(() => {});
          }).catch(() => {});
        }
      } else {
        await storage.updateWalletBalance(userId, escrowAmount);
        await storage.createTransaction({
          userId,
          amount: escrowAmount.toString(),
          type: 'escrow_refund',
          jobId: job.id,
        });

        // Email workers that job was cancelled (no compensation)
        if (job.workerId) {
          const wIds = job.workerId.split(',').filter(Boolean);
          for (const wId of wIds) {
            storage.getUser(wId).then(worker => {
              if (worker?.email) sendJobCancelledToWorkerEmail(worker.email, worker.firstName || worker.email, job.title, null).catch(() => {});
            }).catch(() => {});
          }
        }
      }
    }
    // If no worker has accepted yet, no escrow was held — nothing to refund

    const updated = await storage.updateJob(jobId, { status: 'cancelled' });

    await storage.createAdminNotification({
      adminId: 0,
      title: 'Job Cancelled',
      message: `"${job.title}" was cancelled by the poster.${workerIsEnRoute ? ` 10% cancellation fee (₦${(Math.round(escrowAmount * 0.1 * 100) / 100).toLocaleString()}) paid immediately to worker. Poster refunded 90%.` : ' Full escrow refunded to poster.'}`,
      type: 'warning'
    });

    res.json(updated);
  });

  // --- WORKER PROGRESS ---

  app.post(api.jobs.updateProgress.path, isAuthenticated, async (req, res) => {
    try {
      const jobId = Number(req.params.id);
      const userId = (req.user as any)?.claims?.sub || (req.session as any)?.manualUserId;
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
      const userId = (req.user as any)?.claims?.sub || (req.session as any)?.manualUserId;

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

  // --- WORKER LIVE LOCATION ---
  app.post('/api/jobs/:id/worker-location', isAuthenticated, async (req, res) => {
    try {
      const jobId = Number(req.params.id);
      const userId = (req.user as any)?.claims?.sub || (req.session as any)?.manualUserId;
      const { latitude, longitude } = req.body;

      if (!latitude || !longitude) {
        return res.status(400).json({ message: "Latitude and longitude are required" });
      }

      const job = await storage.getJob(jobId);
      if (!job) return res.status(404).json({ message: "Job not found" });

      const workerIds = job.workerId ? job.workerId.split(',') : [];
      if (!workerIds.includes(userId)) {
        return res.status(403).json({ message: "Only a worker on this job can share their location" });
      }

      const updated = await storage.updateJob(jobId, {
        workerLatitude: String(latitude),
        workerLongitude: String(longitude),
        workerLocationUpdatedAt: new Date(),
      });

      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post(api.jobs.noShow.path, isAuthenticated, async (req, res) => {
    try {
      const jobId = Number(req.params.id);
      const userId = (req.user as any)?.claims?.sub || (req.session as any)?.manualUserId;
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

        // Email the worker about the no-show
        storage.getUser(wId).then(worker => {
          if (worker?.email) sendNoShowWarningEmail(worker.email, worker.firstName || worker.email, job.title, remainingChances, willBeSuspended).catch(() => {});
        }).catch(() => {});
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
    const userId = (req.user as any)?.claims?.sub || (req.session as any)?.manualUserId;
    const notificationsList = await storage.getNotifications(userId);
    res.json(notificationsList);
  });

  app.get(api.notifications.unreadCount.path, isAuthenticated, async (req, res) => {
    const userId = (req.user as any)?.claims?.sub || (req.session as any)?.manualUserId;
    const count = await storage.getUnreadNotificationCount(userId);
    res.json({ count });
  });

  app.post(api.notifications.markRead.path, isAuthenticated, async (req, res) => {
    const userId = (req.user as any)?.claims?.sub || (req.session as any)?.manualUserId;
    const notificationId = Number(req.params.id);
    await storage.markNotificationRead(notificationId, userId);
    res.json({ message: "Notification marked as read" });
  });

  app.post(api.notifications.markAllRead.path, isAuthenticated, async (req, res) => {
    const userId = (req.user as any)?.claims?.sub || (req.session as any)?.manualUserId;
    await storage.markAllNotificationsRead(userId);
    res.json({ message: "All notifications marked as read" });
  });

  // --- ADDRESSES ---

  app.get('/api/addresses/search', async (req, res) => {
    const query = String(req.query.q || '');
    const results = await storage.searchAddresses(query);
    res.json(results);
  });

  // Seed all Nigerian addresses on startup (re-seeds if count < 500)
  (async () => {
    try {
      const count = await storage.getAddressCount();
      if (count < 500) {
        await storage.deleteAllAddresses();
        const nigerianAddresses = [
          // FCT - Abuja
          { area: "Garki", lga: "Abuja Municipal", state: "FCT" },
          { area: "Garki II", lga: "Abuja Municipal", state: "FCT" },
          { area: "Wuse", lga: "Abuja Municipal", state: "FCT" },
          { area: "Wuse II", lga: "Abuja Municipal", state: "FCT" },
          { area: "Maitama", lga: "Abuja Municipal", state: "FCT" },
          { area: "Asokoro", lga: "Abuja Municipal", state: "FCT" },
          { area: "Central Area", lga: "Abuja Municipal", state: "FCT" },
          { area: "Gudu", lga: "Abuja Municipal", state: "FCT" },
          { area: "Jabi", lga: "Abuja Municipal", state: "FCT" },
          { area: "Apo", lga: "Abuja Municipal", state: "FCT" },
          { area: "Utako", lga: "Abuja Municipal", state: "FCT" },
          { area: "Jahi", lga: "Abuja Municipal", state: "FCT" },
          { area: "Gwarinpa", lga: "Abuja Municipal", state: "FCT" },
          { area: "Nyanya", lga: "Abuja Municipal", state: "FCT" },
          { area: "Karu", lga: "Abuja Municipal", state: "FCT" },
          { area: "Lugbe", lga: "Abuja Municipal", state: "FCT" },
          { area: "Lokogoma", lga: "Abuja Municipal", state: "FCT" },
          { area: "Galadimawa", lga: "Abuja Municipal", state: "FCT" },
          { area: "Dawaki", lga: "Abuja Municipal", state: "FCT" },
          { area: "Life Camp", lga: "Abuja Municipal", state: "FCT" },
          { area: "Durumi", lga: "Abuja Municipal", state: "FCT" },
          { area: "Kubwa", lga: "Bwari", state: "FCT" },
          { area: "Bwari", lga: "Bwari", state: "FCT" },
          { area: "Gwagwalada", lga: "Gwagwalada", state: "FCT" },
          { area: "Kuje", lga: "Kuje", state: "FCT" },
          { area: "Abuja Ring Road", lga: "Abuja Municipal", state: "FCT" },
          // Abia
          { area: "Aba", lga: "Aba North", state: "Abia" },
          { area: "Ariaria", lga: "Aba North", state: "Abia" },
          { area: "Osisioma", lga: "Osisioma Ngwa", state: "Abia" },
          { area: "Aba South", lga: "Aba South", state: "Abia" },
          { area: "Umuahia", lga: "Umuahia North", state: "Abia" },
          { area: "Umuahia South", lga: "Umuahia South", state: "Abia" },
          { area: "Bende", lga: "Bende", state: "Abia" },
          { area: "Ohafia", lga: "Ohafia", state: "Abia" },
          { area: "Aba Mile 1", lga: "Aba North", state: "Abia" },
          // Adamawa
          { area: "Yola", lga: "Yola North", state: "Adamawa" },
          { area: "Jimeta", lga: "Yola North", state: "Adamawa" },
          { area: "Yola South", lga: "Yola South", state: "Adamawa" },
          { area: "Mubi", lga: "Mubi North", state: "Adamawa" },
          { area: "Numan", lga: "Numan", state: "Adamawa" },
          { area: "Ganye", lga: "Ganye", state: "Adamawa" },
          { area: "Hong", lga: "Hong", state: "Adamawa" },
          // Akwa Ibom
          { area: "Uyo", lga: "Uyo", state: "Akwa Ibom" },
          { area: "Eket", lga: "Eket", state: "Akwa Ibom" },
          { area: "Ikot Ekpene", lga: "Ikot Ekpene", state: "Akwa Ibom" },
          { area: "Oron", lga: "Oron", state: "Akwa Ibom" },
          { area: "Abak", lga: "Abak", state: "Akwa Ibom" },
          { area: "Ikot Abasi", lga: "Ikot Abasi", state: "Akwa Ibom" },
          { area: "Uruan", lga: "Uruan", state: "Akwa Ibom" },
          { area: "Etinan", lga: "Etinan", state: "Akwa Ibom" },
          // Anambra
          { area: "Awka", lga: "Awka South", state: "Anambra" },
          { area: "Onitsha", lga: "Onitsha North", state: "Anambra" },
          { area: "Onitsha South", lga: "Onitsha South", state: "Anambra" },
          { area: "Nnewi", lga: "Nnewi North", state: "Anambra" },
          { area: "Ekwulobia", lga: "Aguata", state: "Anambra" },
          { area: "Ogidi", lga: "Idemili North", state: "Anambra" },
          { area: "Ihiala", lga: "Ihiala", state: "Anambra" },
          { area: "Okija", lga: "Ihiala", state: "Anambra" },
          { area: "Aguleri", lga: "Anambra East", state: "Anambra" },
          { area: "Abagana", lga: "Njikoka", state: "Anambra" },
          { area: "Agulu", lga: "Anaocha", state: "Anambra" },
          { area: "Nnobi", lga: "Idemili South", state: "Anambra" },
          // Bauchi
          { area: "Bauchi", lga: "Bauchi", state: "Bauchi" },
          { area: "Azare", lga: "Katagum", state: "Bauchi" },
          { area: "Misau", lga: "Misau", state: "Bauchi" },
          { area: "Ningi", lga: "Ningi", state: "Bauchi" },
          { area: "Jamaare", lga: "Jamaare", state: "Bauchi" },
          // Bayelsa
          { area: "Yenagoa", lga: "Yenagoa", state: "Bayelsa" },
          { area: "Brass", lga: "Brass", state: "Bayelsa" },
          { area: "Ogbia", lga: "Ogbia", state: "Bayelsa" },
          { area: "Sagbama", lga: "Sagbama", state: "Bayelsa" },
          { area: "Oporoma", lga: "Southern Ijaw", state: "Bayelsa" },
          // Benue
          { area: "Makurdi", lga: "Makurdi", state: "Benue" },
          { area: "Gboko", lga: "Gboko", state: "Benue" },
          { area: "Katsina-Ala", lga: "Katsina-Ala", state: "Benue" },
          { area: "Otukpo", lga: "Otukpo", state: "Benue" },
          { area: "Vandeikya", lga: "Vandeikya", state: "Benue" },
          { area: "Zaki-Biam", lga: "Ukum", state: "Benue" },
          { area: "Aliade", lga: "Gwer East", state: "Benue" },
          // Borno
          { area: "Maiduguri", lga: "Maiduguri", state: "Borno" },
          { area: "Bama", lga: "Bama", state: "Borno" },
          { area: "Biu", lga: "Biu", state: "Borno" },
          { area: "Damboa", lga: "Damboa", state: "Borno" },
          { area: "Gwoza", lga: "Gwoza", state: "Borno" },
          { area: "Konduga", lga: "Konduga", state: "Borno" },
          { area: "Dikwa", lga: "Dikwa", state: "Borno" },
          // Cross River
          { area: "Calabar", lga: "Calabar Municipal", state: "Cross River" },
          { area: "Calabar South", lga: "Calabar South", state: "Cross River" },
          { area: "Ogoja", lga: "Ogoja", state: "Cross River" },
          { area: "Ikom", lga: "Ikom", state: "Cross River" },
          { area: "Obudu", lga: "Obudu", state: "Cross River" },
          { area: "Akamkpa", lga: "Akamkpa", state: "Cross River" },
          { area: "Ugep", lga: "Yakurr", state: "Cross River" },
          // Delta
          { area: "Asaba", lga: "Oshimili South", state: "Delta" },
          { area: "Warri", lga: "Warri South", state: "Delta" },
          { area: "Effurun", lga: "Uvwie", state: "Delta" },
          { area: "Ughelli", lga: "Ughelli North", state: "Delta" },
          { area: "Sapele", lga: "Sapele", state: "Delta" },
          { area: "Agbor", lga: "Ika South", state: "Delta" },
          { area: "Oghara", lga: "Ethiope West", state: "Delta" },
          { area: "Abraka", lga: "Ethiope East", state: "Delta" },
          { area: "Ozoro", lga: "Isoko North", state: "Delta" },
          { area: "Oleh", lga: "Isoko South", state: "Delta" },
          { area: "Kwale", lga: "Ndokwa West", state: "Delta" },
          { area: "Warri North", lga: "Warri North", state: "Delta" },
          // Ebonyi
          { area: "Abakaliki", lga: "Abakaliki", state: "Ebonyi" },
          { area: "Afikpo", lga: "Afikpo North", state: "Ebonyi" },
          { area: "Onueke", lga: "Ezza South", state: "Ebonyi" },
          { area: "Ezza North", lga: "Ezza North", state: "Ebonyi" },
          { area: "Ishielu", lga: "Ishielu", state: "Ebonyi" },
          // Edo
          { area: "Benin City", lga: "Oredo", state: "Edo" },
          { area: "GRA Benin", lga: "Oredo", state: "Edo" },
          { area: "Ekpoma", lga: "Esan West", state: "Edo" },
          { area: "Auchi", lga: "Etsako West", state: "Edo" },
          { area: "Uromi", lga: "Esan North-East", state: "Edo" },
          { area: "Igueben", lga: "Igueben", state: "Edo" },
          { area: "Irrua", lga: "Esan Central", state: "Edo" },
          { area: "Okada", lga: "Ovia North-East", state: "Edo" },
          { area: "Sapele Road Benin", lga: "Ikpoba-Okha", state: "Edo" },
          // Ekiti
          { area: "Ado-Ekiti", lga: "Ado-Ekiti", state: "Ekiti" },
          { area: "Ikere-Ekiti", lga: "Ikere", state: "Ekiti" },
          { area: "Ilawe-Ekiti", lga: "Ekiti South West", state: "Ekiti" },
          { area: "Oye-Ekiti", lga: "Oye", state: "Ekiti" },
          { area: "Ikole-Ekiti", lga: "Ikole", state: "Ekiti" },
          { area: "Aramoko-Ekiti", lga: "Ekiti West", state: "Ekiti" },
          // Enugu
          { area: "Enugu", lga: "Enugu North", state: "Enugu" },
          { area: "Enugu South", lga: "Enugu South", state: "Enugu" },
          { area: "Independence Layout", lga: "Enugu South", state: "Enugu" },
          { area: "GRA Enugu", lga: "Enugu North", state: "Enugu" },
          { area: "Trans-Ekulu", lga: "Enugu East", state: "Enugu" },
          { area: "Nsukka", lga: "Nsukka", state: "Enugu" },
          { area: "Agbani", lga: "Nkanu West", state: "Enugu" },
          { area: "Oji River", lga: "Oji River", state: "Enugu" },
          { area: "Awgu", lga: "Awgu", state: "Enugu" },
          { area: "Ogui", lga: "Enugu North", state: "Enugu" },
          // Gombe
          { area: "Gombe", lga: "Gombe", state: "Gombe" },
          { area: "Billiri", lga: "Billiri", state: "Gombe" },
          { area: "Kaltungo", lga: "Kaltungo", state: "Gombe" },
          { area: "Deba", lga: "Yamaltu-Deba", state: "Gombe" },
          { area: "Bajoga", lga: "Funakaye", state: "Gombe" },
          // Imo
          { area: "Owerri", lga: "Owerri Municipal", state: "Imo" },
          { area: "Owerri North", lga: "Owerri North", state: "Imo" },
          { area: "Owerri West", lga: "Owerri West", state: "Imo" },
          { area: "Orlu", lga: "Orlu", state: "Imo" },
          { area: "Okigwe", lga: "Okigwe", state: "Imo" },
          { area: "Oguta", lga: "Oguta", state: "Imo" },
          { area: "Nkwerre", lga: "Nkwerre", state: "Imo" },
          { area: "Urualla", lga: "Ideato North", state: "Imo" },
          { area: "Mbaise", lga: "Aboh Mbaise", state: "Imo" },
          // Jigawa
          { area: "Dutse", lga: "Dutse", state: "Jigawa" },
          { area: "Hadejia", lga: "Hadejia", state: "Jigawa" },
          { area: "Kazaure", lga: "Kazaure", state: "Jigawa" },
          { area: "Birnin Kudu", lga: "Birnin Kudu", state: "Jigawa" },
          { area: "Ringim", lga: "Ringim", state: "Jigawa" },
          { area: "Gumel", lga: "Gumel", state: "Jigawa" },
          // Kaduna
          { area: "Kaduna", lga: "Kaduna North", state: "Kaduna" },
          { area: "Kaduna South", lga: "Kaduna South", state: "Kaduna" },
          { area: "Zaria", lga: "Sabon Gari", state: "Kaduna" },
          { area: "Kafanchan", lga: "Jema'a", state: "Kaduna" },
          { area: "Kagoro", lga: "Jema'a", state: "Kaduna" },
          { area: "Soba", lga: "Soba", state: "Kaduna" },
          { area: "Lere", lga: "Lere", state: "Kaduna" },
          { area: "Tudun Wada Kaduna", lga: "Chikun", state: "Kaduna" },
          // Kano
          { area: "Kano", lga: "Kano Municipal", state: "Kano" },
          { area: "Fagge", lga: "Fagge", state: "Kano" },
          { area: "Nasarawa Kano", lga: "Nasarawa", state: "Kano" },
          { area: "Gwale", lga: "Gwale", state: "Kano" },
          { area: "Dala", lga: "Dala", state: "Kano" },
          { area: "Tarauni", lga: "Tarauni", state: "Kano" },
          { area: "Wudil", lga: "Wudil", state: "Kano" },
          { area: "Gwarzo", lga: "Gwarzo", state: "Kano" },
          { area: "Ungogo", lga: "Ungogo", state: "Kano" },
          { area: "Bichi", lga: "Bichi", state: "Kano" },
          { area: "Sharada", lga: "Kano Municipal", state: "Kano" },
          // Katsina
          { area: "Katsina", lga: "Katsina", state: "Katsina" },
          { area: "Daura", lga: "Daura", state: "Katsina" },
          { area: "Funtua", lga: "Funtua", state: "Katsina" },
          { area: "Mashi", lga: "Mashi", state: "Katsina" },
          { area: "Malumfashi", lga: "Malumfashi", state: "Katsina" },
          { area: "Dutsin-Ma", lga: "Dutsin-Ma", state: "Katsina" },
          // Kebbi
          { area: "Birnin Kebbi", lga: "Birnin Kebbi", state: "Kebbi" },
          { area: "Argungu", lga: "Argungu", state: "Kebbi" },
          { area: "Zuru", lga: "Zuru", state: "Kebbi" },
          { area: "Bagudo", lga: "Bagudo", state: "Kebbi" },
          // Kogi
          { area: "Lokoja", lga: "Lokoja", state: "Kogi" },
          { area: "Okene", lga: "Okene", state: "Kogi" },
          { area: "Kabba", lga: "Kabba/Bunu", state: "Kogi" },
          { area: "Ankpa", lga: "Ankpa", state: "Kogi" },
          { area: "Idah", lga: "Idah", state: "Kogi" },
          { area: "Ajaokuta", lga: "Ajaokuta", state: "Kogi" },
          { area: "Isanlu", lga: "Yagba East", state: "Kogi" },
          // Kwara
          { area: "Ilorin", lga: "Ilorin West", state: "Kwara" },
          { area: "Ilorin East", lga: "Ilorin East", state: "Kwara" },
          { area: "Ilorin South", lga: "Ilorin South", state: "Kwara" },
          { area: "Offa", lga: "Offa", state: "Kwara" },
          { area: "Jebba", lga: "Moro", state: "Kwara" },
          { area: "Omu-Aran", lga: "Irepodun", state: "Kwara" },
          { area: "Kaiama", lga: "Kaiama", state: "Kwara" },
          { area: "Erin-Ile", lga: "Oyun", state: "Kwara" },
          // Lagos
          { area: "Agege", lga: "Agege", state: "Lagos" },
          { area: "Ogba", lga: "Agege", state: "Lagos" },
          { area: "Mangoro", lga: "Agege", state: "Lagos" },
          { area: "Pen Cinema", lga: "Agege", state: "Lagos" },
          { area: "Dopemu", lga: "Agege", state: "Lagos" },
          { area: "Orile Agege", lga: "Agege", state: "Lagos" },
          { area: "Alagbado", lga: "Ifako-Ijaiye", state: "Lagos" },
          { area: "Ijaiye", lga: "Ifako-Ijaiye", state: "Lagos" },
          { area: "Ifako", lga: "Ifako-Ijaiye", state: "Lagos" },
          { area: "Abule Egba", lga: "Ifako-Ijaiye", state: "Lagos" },
          { area: "Alimosho", lga: "Alimosho", state: "Lagos" },
          { area: "Egbeda", lga: "Alimosho", state: "Lagos" },
          { area: "Idimu", lga: "Alimosho", state: "Lagos" },
          { area: "Igando", lga: "Alimosho", state: "Lagos" },
          { area: "Ikotun", lga: "Alimosho", state: "Lagos" },
          { area: "Iyana Ipaja", lga: "Alimosho", state: "Lagos" },
          { area: "Akowonjo", lga: "Alimosho", state: "Lagos" },
          { area: "Ipaja", lga: "Alimosho", state: "Lagos" },
          { area: "Ayobo", lga: "Alimosho", state: "Lagos" },
          { area: "Oshodi", lga: "Oshodi-Isolo", state: "Lagos" },
          { area: "Isolo", lga: "Oshodi-Isolo", state: "Lagos" },
          { area: "Ejigbo", lga: "Oshodi-Isolo", state: "Lagos" },
          { area: "Mafoluku", lga: "Oshodi-Isolo", state: "Lagos" },
          { area: "Ago Palace Way", lga: "Oshodi-Isolo", state: "Lagos" },
          { area: "Ire Akari", lga: "Oshodi-Isolo", state: "Lagos" },
          { area: "Okota", lga: "Oshodi-Isolo", state: "Lagos" },
          { area: "Cele", lga: "Oshodi-Isolo", state: "Lagos" },
          { area: "Jakande Estate", lga: "Oshodi-Isolo", state: "Lagos" },
          { area: "Ajao Estate", lga: "Oshodi-Isolo", state: "Lagos" },
          { area: "Shogunle", lga: "Oshodi-Isolo", state: "Lagos" },
          { area: "Mushin", lga: "Mushin", state: "Lagos" },
          { area: "Idi Araba", lga: "Mushin", state: "Lagos" },
          { area: "Palm Avenue", lga: "Mushin", state: "Lagos" },
          { area: "Ilupeju", lga: "Mushin", state: "Lagos" },
          { area: "Ladipo", lga: "Mushin", state: "Lagos" },
          { area: "Ikeja", lga: "Ikeja", state: "Lagos" },
          { area: "Ikeja GRA", lga: "Ikeja", state: "Lagos" },
          { area: "Allen Avenue", lga: "Ikeja", state: "Lagos" },
          { area: "Alausa", lga: "Ikeja", state: "Lagos" },
          { area: "Adeniyi Jones", lga: "Ikeja", state: "Lagos" },
          { area: "Opebi", lga: "Ikeja", state: "Lagos" },
          { area: "Computer Village", lga: "Ikeja", state: "Lagos" },
          { area: "Toyin Street", lga: "Ikeja", state: "Lagos" },
          { area: "Maryland", lga: "Ikeja", state: "Lagos" },
          { area: "Oregun", lga: "Ikeja", state: "Lagos" },
          { area: "GRA Ikeja", lga: "Ikeja", state: "Lagos" },
          { area: "Airport Road", lga: "Ikeja", state: "Lagos" },
          { area: "Ojota", lga: "Kosofe", state: "Lagos" },
          { area: "Ketu", lga: "Kosofe", state: "Lagos" },
          { area: "Mile 12", lga: "Kosofe", state: "Lagos" },
          { area: "Ogudu", lga: "Kosofe", state: "Lagos" },
          { area: "Alapere", lga: "Kosofe", state: "Lagos" },
          { area: "Magodo", lga: "Kosofe", state: "Lagos" },
          { area: "Isheri", lga: "Kosofe", state: "Lagos" },
          { area: "Anthony Village", lga: "Kosofe", state: "Lagos" },
          { area: "Gbagada Phase 1", lga: "Kosofe", state: "Lagos" },
          { area: "Gbagada Phase 2", lga: "Kosofe", state: "Lagos" },
          { area: "Iyana Oworo", lga: "Kosofe", state: "Lagos" },
          { area: "Oworo", lga: "Kosofe", state: "Lagos" },
          { area: "Surulere", lga: "Surulere", state: "Lagos" },
          { area: "Iponri", lga: "Surulere", state: "Lagos" },
          { area: "Bode Thomas", lga: "Surulere", state: "Lagos" },
          { area: "Aguda", lga: "Surulere", state: "Lagos" },
          { area: "Masha", lga: "Surulere", state: "Lagos" },
          { area: "Adeniran Ogunsanya", lga: "Surulere", state: "Lagos" },
          { area: "Ojuelegba", lga: "Surulere", state: "Lagos" },
          { area: "Lawanson", lga: "Surulere", state: "Lagos" },
          { area: "Itire", lga: "Surulere", state: "Lagos" },
          { area: "Victoria Island", lga: "Eti-Osa", state: "Lagos" },
          { area: "Lekki Phase 1", lga: "Eti-Osa", state: "Lagos" },
          { area: "Lekki Phase 2", lga: "Eti-Osa", state: "Lagos" },
          { area: "Ajah", lga: "Eti-Osa", state: "Lagos" },
          { area: "Ikoyi", lga: "Eti-Osa", state: "Lagos" },
          { area: "Oniru", lga: "Eti-Osa", state: "Lagos" },
          { area: "Banana Island", lga: "Eti-Osa", state: "Lagos" },
          { area: "Chevron", lga: "Eti-Osa", state: "Lagos" },
          { area: "Osapa London", lga: "Eti-Osa", state: "Lagos" },
          { area: "Ikate", lga: "Eti-Osa", state: "Lagos" },
          { area: "Sangotedo", lga: "Eti-Osa", state: "Lagos" },
          { area: "Abraham Adesanya", lga: "Eti-Osa", state: "Lagos" },
          { area: "Agungi", lga: "Eti-Osa", state: "Lagos" },
          { area: "Ilasan", lga: "Eti-Osa", state: "Lagos" },
          { area: "Lekki-Epe Expressway", lga: "Eti-Osa", state: "Lagos" },
          { area: "Obalende", lga: "Eti-Osa", state: "Lagos" },
          { area: "Dolphin Estate", lga: "Eti-Osa", state: "Lagos" },
          { area: "Lagos Island", lga: "Lagos Island", state: "Lagos" },
          { area: "Marina", lga: "Lagos Island", state: "Lagos" },
          { area: "Broad Street", lga: "Lagos Island", state: "Lagos" },
          { area: "Tinubu Square", lga: "Lagos Island", state: "Lagos" },
          { area: "CMS", lga: "Lagos Island", state: "Lagos" },
          { area: "Onikan", lga: "Lagos Island", state: "Lagos" },
          { area: "Apapa", lga: "Apapa", state: "Lagos" },
          { area: "Ajegunle", lga: "Apapa", state: "Lagos" },
          { area: "Wharf Road", lga: "Apapa", state: "Lagos" },
          { area: "Kirikiri", lga: "Apapa", state: "Lagos" },
          { area: "Tin Can Island", lga: "Apapa", state: "Lagos" },
          { area: "Yaba", lga: "Lagos Mainland", state: "Lagos" },
          { area: "Ebute Metta", lga: "Lagos Mainland", state: "Lagos" },
          { area: "Oyingbo", lga: "Lagos Mainland", state: "Lagos" },
          { area: "Makoko", lga: "Lagos Mainland", state: "Lagos" },
          { area: "Jibowu", lga: "Lagos Mainland", state: "Lagos" },
          { area: "Fadeyi", lga: "Lagos Mainland", state: "Lagos" },
          { area: "Somolu", lga: "Somolu", state: "Lagos" },
          { area: "Bariga", lga: "Somolu", state: "Lagos" },
          { area: "Gbagada", lga: "Somolu", state: "Lagos" },
          { area: "Pedro", lga: "Somolu", state: "Lagos" },
          { area: "Onipanu", lga: "Somolu", state: "Lagos" },
          { area: "Oworonsoki", lga: "Somolu", state: "Lagos" },
          { area: "Palmgrove", lga: "Somolu", state: "Lagos" },
          { area: "Ikorodu", lga: "Ikorodu", state: "Lagos" },
          { area: "Ijede", lga: "Ikorodu", state: "Lagos" },
          { area: "Imota", lga: "Ikorodu", state: "Lagos" },
          { area: "Igbogbo", lga: "Ikorodu", state: "Lagos" },
          { area: "Bayeku", lga: "Ikorodu", state: "Lagos" },
          { area: "Badagry", lga: "Badagry", state: "Lagos" },
          { area: "Seme Border", lga: "Badagry", state: "Lagos" },
          { area: "Epe", lga: "Epe", state: "Lagos" },
          { area: "Lekki Free Trade Zone", lga: "Epe", state: "Lagos" },
          { area: "Ibeju-Lekki", lga: "Ibeju-Lekki", state: "Lagos" },
          { area: "Eleko", lga: "Ibeju-Lekki", state: "Lagos" },
          { area: "Awoyaya", lga: "Ibeju-Lekki", state: "Lagos" },
          { area: "Festac Town", lga: "Amuwo-Odofin", state: "Lagos" },
          { area: "Mile 2", lga: "Amuwo-Odofin", state: "Lagos" },
          { area: "Satellite Town", lga: "Amuwo-Odofin", state: "Lagos" },
          { area: "Orile", lga: "Ajeromi-Ifelodun", state: "Lagos" },
          { area: "Ajeromi", lga: "Ajeromi-Ifelodun", state: "Lagos" },
          { area: "Berger", lga: "Ojodu", state: "Lagos" },
          { area: "Ojodu", lga: "Ojodu", state: "Lagos" },
          { area: "Omole Phase 1", lga: "Ojodu", state: "Lagos" },
          { area: "Omole Phase 2", lga: "Ojodu", state: "Lagos" },
          // Nasarawa
          { area: "Lafia", lga: "Lafia", state: "Nasarawa" },
          { area: "Nasarawa", lga: "Nasarawa", state: "Nasarawa" },
          { area: "Keffi", lga: "Keffi", state: "Nasarawa" },
          { area: "Akwanga", lga: "Akwanga", state: "Nasarawa" },
          { area: "Doma", lga: "Doma", state: "Nasarawa" },
          // Niger
          { area: "Minna", lga: "Bosso", state: "Niger" },
          { area: "Bida", lga: "Bida", state: "Niger" },
          { area: "Kontagora", lga: "Kontagora", state: "Niger" },
          { area: "Suleja", lga: "Suleja", state: "Niger" },
          { area: "Chanchaga", lga: "Chanchaga", state: "Niger" },
          { area: "New Bussa", lga: "Borgu", state: "Niger" },
          { area: "Lapai", lga: "Lapai", state: "Niger" },
          // Ogun
          { area: "Abeokuta", lga: "Abeokuta South", state: "Ogun" },
          { area: "Abeokuta North", lga: "Abeokuta North", state: "Ogun" },
          { area: "Sagamu", lga: "Sagamu", state: "Ogun" },
          { area: "Ijebu-Ode", lga: "Ijebu-Ode", state: "Ogun" },
          { area: "Ilaro", lga: "Yewa South", state: "Ogun" },
          { area: "Ota", lga: "Ado-Odo/Ota", state: "Ogun" },
          { area: "Mowe", lga: "Obafemi-Owode", state: "Ogun" },
          { area: "Ifo", lga: "Ifo", state: "Ogun" },
          { area: "Sango-Ota", lga: "Ado-Odo/Ota", state: "Ogun" },
          { area: "Ijebu-Igbo", lga: "Ijebu North", state: "Ogun" },
          { area: "Ayetoro", lga: "Yewa North", state: "Ogun" },
          { area: "Ibafo", lga: "Obafemi-Owode", state: "Ogun" },
          // Ondo
          { area: "Akure", lga: "Akure South", state: "Ondo" },
          { area: "Akure North", lga: "Akure North", state: "Ondo" },
          { area: "Ondo Town", lga: "Ondo West", state: "Ondo" },
          { area: "Ore", lga: "Odigbo", state: "Ondo" },
          { area: "Okitipupa", lga: "Okitipupa", state: "Ondo" },
          { area: "Ikare-Akoko", lga: "Akoko North-East", state: "Ondo" },
          { area: "Owo", lga: "Owo", state: "Ondo" },
          // Osun
          { area: "Osogbo", lga: "Osogbo", state: "Osun" },
          { area: "Ile-Ife", lga: "Ife Central", state: "Osun" },
          { area: "Ilesa", lga: "Ilesa West", state: "Osun" },
          { area: "Ede", lga: "Ede North", state: "Osun" },
          { area: "Ikirun", lga: "Ifelodun", state: "Osun" },
          { area: "Iwo", lga: "Iwo", state: "Osun" },
          { area: "Ile-Ogbo", lga: "Ayedire", state: "Osun" },
          // Oyo
          { area: "Ibadan", lga: "Ibadan North", state: "Oyo" },
          { area: "Ibadan South-East", lga: "Ibadan South-East", state: "Oyo" },
          { area: "Ibadan South-West", lga: "Ibadan South-West", state: "Oyo" },
          { area: "Bodija", lga: "Ibadan North", state: "Oyo" },
          { area: "Mokola", lga: "Ibadan North", state: "Oyo" },
          { area: "Agbowo", lga: "Ibadan North-East", state: "Oyo" },
          { area: "Moniya", lga: "Akinyele", state: "Oyo" },
          { area: "Apata", lga: "Ibadan South-East", state: "Oyo" },
          { area: "Ogbomoso", lga: "Ogbomoso North", state: "Oyo" },
          { area: "Oyo Town", lga: "Oyo East", state: "Oyo" },
          { area: "Saki", lga: "Saki East", state: "Oyo" },
          { area: "Iseyin", lga: "Iseyin", state: "Oyo" },
          { area: "Oluyole", lga: "Oluyole", state: "Oyo" },
          { area: "Iwo Road Ibadan", lga: "Ibadan South-West", state: "Oyo" },
          // Plateau
          { area: "Jos", lga: "Jos North", state: "Plateau" },
          { area: "Jos South", lga: "Jos South", state: "Plateau" },
          { area: "Bukuru", lga: "Jos South", state: "Plateau" },
          { area: "Shendam", lga: "Shendam", state: "Plateau" },
          { area: "Pankshin", lga: "Pankshin", state: "Plateau" },
          { area: "Barkin Ladi", lga: "Barkin Ladi", state: "Plateau" },
          { area: "Langtang", lga: "Langtang South", state: "Plateau" },
          // Rivers
          { area: "Port Harcourt", lga: "Port Harcourt", state: "Rivers" },
          { area: "GRA Port Harcourt", lga: "Port Harcourt", state: "Rivers" },
          { area: "Diobu", lga: "Port Harcourt", state: "Rivers" },
          { area: "Rumuola", lga: "Obio-Akpor", state: "Rivers" },
          { area: "Rumuomasi", lga: "Obio-Akpor", state: "Rivers" },
          { area: "Trans-Amadi", lga: "Obio-Akpor", state: "Rivers" },
          { area: "Obio-Akpor", lga: "Obio-Akpor", state: "Rivers" },
          { area: "Okrika", lga: "Okrika", state: "Rivers" },
          { area: "Eleme", lga: "Eleme", state: "Rivers" },
          { area: "Bonny", lga: "Bonny", state: "Rivers" },
          { area: "Degema", lga: "Degema", state: "Rivers" },
          { area: "Rumola", lga: "Obio-Akpor", state: "Rivers" },
          { area: "Eneka", lga: "Obio-Akpor", state: "Rivers" },
          // Sokoto
          { area: "Sokoto", lga: "Sokoto North", state: "Sokoto" },
          { area: "Sokoto South", lga: "Sokoto South", state: "Sokoto" },
          { area: "Gwadabawa", lga: "Gwadabawa", state: "Sokoto" },
          { area: "Illela", lga: "Illela", state: "Sokoto" },
          { area: "Wamako", lga: "Wamako", state: "Sokoto" },
          // Taraba
          { area: "Jalingo", lga: "Jalingo", state: "Taraba" },
          { area: "Wukari", lga: "Wukari", state: "Taraba" },
          { area: "Sardauna", lga: "Sardauna", state: "Taraba" },
          { area: "Takum", lga: "Takum", state: "Taraba" },
          { area: "Bali", lga: "Bali", state: "Taraba" },
          // Yobe
          { area: "Damaturu", lga: "Damaturu", state: "Yobe" },
          { area: "Potiskum", lga: "Potiskum", state: "Yobe" },
          { area: "Geidam", lga: "Geidam", state: "Yobe" },
          { area: "Nguru", lga: "Nguru", state: "Yobe" },
          { area: "Gashua", lga: "Bade", state: "Yobe" },
          // Zamfara
          { area: "Gusau", lga: "Gusau", state: "Zamfara" },
          { area: "Kaura Namoda", lga: "Kaura Namoda", state: "Zamfara" },
          { area: "Anka", lga: "Anka", state: "Zamfara" },
          { area: "Zurmi", lga: "Zurmi", state: "Zamfara" },
          { area: "Talata-Mafara", lga: "Talata Mafara", state: "Zamfara" },
        ];
        await storage.seedAddresses(nigerianAddresses);
        console.log(`Seeded ${nigerianAddresses.length} Nigerian addresses across all states`);
      }
    } catch (e) {
      console.error("Failed to seed addresses:", e);
    }
  })();

  // --- JOB CONTACT (in-app call info) ---

  app.get('/api/jobs/:id/contact', isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub || (req.session as any)?.manualUserId;
      const jobId = Number(req.params.id);
      const job = await storage.getJob(jobId);
      if (!job) return res.status(404).json({ message: "Job not found" });
      if (job.status !== 'in_progress') return res.status(403).json({ message: "Job not in progress" });

      const workerIds = job.workerId ? job.workerId.split(',').map(id => id.trim()).filter(Boolean) : [];
      const isPoster = job.posterId === userId;
      const isWorker = workerIds.includes(userId);

      if (!isPoster && !isWorker) return res.status(403).json({ message: "Not authorized" });

      if (isPoster) {
        if (workerIds.length === 0) return res.status(404).json({ message: "No worker assigned yet" });
        const workerId = workerIds[0];
        const workerProfile = await storage.getProfile(workerId);
        const workerUser = await storage.getUser(workerId);
        if (!workerProfile?.phoneNumber) return res.status(404).json({ message: "Worker has not set a phone number" });
        const name = workerUser?.name || (workerUser?.firstName ? `${workerUser.firstName} ${workerUser.lastName || ''}`.trim() : 'Worker');
        return res.json({ name, phone: workerProfile.phoneNumber, role: 'worker' });
      }

      // isWorker — return poster contact
      const posterProfile = await storage.getProfile(job.posterId);
      const posterUser = await storage.getUser(job.posterId);
      if (!posterProfile?.phoneNumber) return res.status(404).json({ message: "Job poster has not set a phone number" });
      const name = posterUser?.name || (posterUser?.firstName ? `${posterUser.firstName} ${posterUser.lastName || ''}`.trim() : 'Job Poster');
      return res.json({ name, phone: posterProfile.phoneNumber, role: 'poster' });
    } catch (e) {
      console.error("Contact route error:", e);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Returns the other party/parties (userId + display name) for an in-app call.
  // Unlike /contact, this does NOT depend on a phone number, so the call button
  // is always available to both poster and worker(s).
  app.get('/api/jobs/:id/call-peers', isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub || (req.session as any)?.manualUserId;
      const jobId = Number(req.params.id);
      const job = await storage.getJob(jobId);
      if (!job) return res.status(404).json({ message: "Job not found" });

      const workerIds = job.workerId ? job.workerId.split(',').map(s => s.trim()).filter(Boolean) : [];
      const isPoster = job.posterId === userId;
      const isWorker = workerIds.includes(userId);
      if (!isPoster && !isWorker) return res.status(403).json({ message: "Not authorized" });

      const peers: { userId: string; name: string; role: string }[] = [];
      if (isPoster) {
        for (const wid of workerIds) {
          const u = await storage.getUser(wid);
          const name = u?.name || (u?.firstName ? `${u.firstName} ${u.lastName || ''}`.trim() : 'Worker');
          peers.push({ userId: wid, name, role: 'worker' });
        }
      } else {
        const u = await storage.getUser(job.posterId);
        const name = u?.name || (u?.firstName ? `${u.firstName} ${u.lastName || ''}`.trim() : 'Job Poster');
        peers.push({ userId: job.posterId, name, role: 'poster' });
      }
      res.json(peers);
    } catch (e) {
      console.error("Call peers route error:", e);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ICE servers for WebRTC. STUN is always available; TURN is added only when
  // configured via env (never exposed as VITE_ vars so creds stay server-side).
  app.get('/api/call/ice-servers', isAuthenticated, (_req, res) => {
    const iceServers: any[] = [
      { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
    ];
    if (process.env.TURN_URL && process.env.TURN_USERNAME && process.env.TURN_CREDENTIAL) {
      // TURN_URL may hold several comma-separated relay URLs sharing the same
      // credentials (e.g. UDP:3478 + TCP:443 for firewall/CGNAT traversal).
      const turnUrls = process.env.TURN_URL.split(',')
        .map((u) => u.trim())
        .filter(Boolean)
        .map((u) => {
          // WebRTC requires a turn:/turns: scheme. Leave valid ones untouched.
          if (/^turns?:/i.test(u)) return u;
          // A different scheme (stun:, https:, ...) is invalid for TURN and
          // would throw in the client's RTCPeerConnection — drop it so calling
          // degrades to STUN-only instead of breaking entirely.
          if (/^[a-z][a-z0-9+.-]*:/i.test(u)) {
            console.warn(`[ice-servers] ignoring TURN_URL entry with non-TURN scheme: ${u}`);
            return null;
          }
          // Bare host:port (a common dashboard format) — add the turn: scheme.
          return `turn:${u}`;
        })
        .filter((u): u is string => Boolean(u));
      if (turnUrls.length > 0) {
        iceServers.push({
          urls: turnUrls.length === 1 ? turnUrls[0] : turnUrls,
          username: process.env.TURN_USERNAME,
          credential: process.env.TURN_CREDENTIAL,
        });
      }
    }
    res.json({ iceServers });
  });

  // --- OFFERS ---

  app.get('/api/jobs/:id/offers', isAuthenticated, async (req, res) => {
    const jobId = Number(req.params.id);
    const userId = (req.user as any)?.claims?.sub || (req.session as any)?.manualUserId;

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
      const userId = (req.user as any)?.claims?.sub || (req.session as any)?.manualUserId;
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
      const userId = (req.user as any)?.claims?.sub || (req.session as any)?.manualUserId;

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
      const userId = (req.user as any)?.claims?.sub || (req.session as any)?.manualUserId;

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
      const userId = (req.user as any)?.claims?.sub || (req.session as any)?.manualUserId;
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
    const userId = (req.user as any)?.claims?.sub || (req.session as any)?.manualUserId;
    let profile = await storage.getProfile(userId);
    if (!profile) {
      profile = await storage.createProfile(userId);
    }
    res.json(profile);
  });

  app.patch(api.profile.update.path, isAuthenticated, async (req, res) => {
    const userId = (req.user as any)?.claims?.sub || (req.session as any)?.manualUserId;
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

  // Resolve the authenticated user's email — works for both OIDC and manual auth
  const resolveUserEmail = async (req: any): Promise<string | null> => {
    // OIDC session: email is in the claims
    const claimsEmail = (req.user as any)?.claims?.email;
    if (claimsEmail) return claimsEmail.toLowerCase();
    // Manual session: look up the user in the DB
    const manualUserId = (req.session as any)?.manualUserId;
    if (manualUserId) {
      const u = await storage.getUser(manualUserId);
      if (u?.email) return u.email.toLowerCase();
    }
    return null;
  };

  const isOwner = async (req: any, res: any, next: any) => {
    const email = await resolveUserEmail(req);
    if (email === OWNER_EMAIL) {
      (req as any).adminRole = 'owner';
      return next();
    }
    return res.status(403).json({ message: "Owner access required" });
  };

  const isAdminOrOwner = async (req: any, res: any, next: any) => {
    // Check if owner (supports both OIDC and manual auth)
    const email = await resolveUserEmail(req);
    if (email === OWNER_EMAIL) {
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
    // Check owner (supports both OIDC and manual auth)
    const userEmail = await resolveUserEmail(req);
    if (userEmail === OWNER_EMAIL) {
      return res.json({ id: 0, email: OWNER_EMAIL, name: "Owner", role: "owner", isActive: true });
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

  // Staff admin: view own hours
  app.get('/api/admin/my-hours', async (req, res) => {
    try {
      const adminId = (req.session as any)?.adminId;
      if (!adminId) return res.status(401).json({ message: "Not authenticated" });
      const admin = await storage.getAdminUser(adminId);
      if (!admin || !admin.isActive) return res.status(401).json({ message: "Not authenticated" });

      const startDate = req.query.startDate as string | undefined;
      const endDate = req.query.endDate as string | undefined;
      const hours = await storage.getMyAdminHours(adminId, startDate, endDate);

      const totalSeconds = hours.reduce((sum, h) => sum + h.secondsWorked, 0);
      res.json({ hours, totalSeconds, admin: { id: admin.id, name: admin.name, email: admin.email, walletBalance: admin.walletBalance, bankName: admin.bankName, bankCode: admin.bankCode, accountNumber: admin.accountNumber, accountName: admin.accountName } });
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch hours" });
    }
  });

  // Staff admin: update own bank info
  app.post('/api/admin/my-bank', async (req, res) => {
    try {
      const adminId = (req.session as any)?.adminId;
      if (!adminId) return res.status(401).json({ message: "Not authenticated" });
      const admin = await storage.getAdminUser(adminId);
      if (!admin || !admin.isActive) return res.status(401).json({ message: "Not authenticated" });

      const { bankName, bankCode, accountNumber, accountName } = req.body;
      if (!bankName || !accountNumber || !accountName) {
        return res.status(400).json({ message: "Bank name, account number, and account name are required" });
      }

      const updated = await storage.updateAdminBankInfo(adminId, { bankName, bankCode: bankCode || '', accountNumber, accountName });

      try {
        await storage.createAdminNotification({
          adminId,
          title: "Bank Account Updated",
          message: `Your salary account has been updated to ${bankName} - ${accountNumber} (${accountName}).`,
          type: "info",
        });
      } catch (e) {}

      res.json({ bankName: updated.bankName, bankCode: updated.bankCode, accountNumber: updated.accountNumber, accountName: updated.accountName });
    } catch (err) {
      res.status(500).json({ message: "Failed to update bank info" });
    }
  });

  // Staff admin: view own payment history
  app.get('/api/admin/my-payments', async (req, res) => {
    try {
      const adminId = (req.session as any)?.adminId;
      if (!adminId) return res.status(401).json({ message: "Not authenticated" });
      const admin = await storage.getAdminUser(adminId);
      if (!admin || !admin.isActive) return res.status(401).json({ message: "Not authenticated" });

      const payments = await storage.getAdminPayments(adminId);
      res.json(payments);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch payments" });
    }
  });

  // Staff admin: request a withdrawal from wallet to registered salary bank
  app.post('/api/admin/my-withdraw', async (req, res) => {
    try {
      const adminId = (req.session as any)?.adminId;
      if (!adminId) return res.status(401).json({ message: "Not authenticated" });
      const admin = await storage.getAdminUser(adminId);
      if (!admin || !admin.isActive) return res.status(401).json({ message: "Not authenticated" });

      if (!admin.bankName || !admin.accountNumber) {
        return res.status(400).json({ message: "Please set up your salary bank account first." });
      }

      const amount = parseFloat(req.body?.amount);
      if (!isFinite(amount) || amount <= 0) {
        return res.status(400).json({ message: "Enter a valid amount." });
      }
      if (amount > parseFloat(admin.walletBalance)) {
        return res.status(400).json({ message: "Insufficient wallet balance." });
      }

      const withdrawal = await storage.requestAdminWithdrawal(adminId, {
        amount: amount.toFixed(2),
        bankName: admin.bankName,
        bankCode: admin.bankCode,
        accountNumber: admin.accountNumber,
        accountName: admin.accountName,
      });

      try {
        await storage.createAdminNotification({
          adminId,
          title: "Withdrawal Requested",
          message: `Your withdrawal of \u20A6${amount.toLocaleString()} to ${admin.bankName} (${admin.accountNumber}) is pending owner approval.`,
          type: "info",
        });
      } catch (e) {}

      res.json(withdrawal);
    } catch (err: any) {
      res.status(400).json({ message: err.message || "Failed to request withdrawal" });
    }
  });

  // Staff admin: own withdrawal history
  app.get('/api/admin/my-withdrawals', async (req, res) => {
    try {
      const adminId = (req.session as any)?.adminId;
      if (!adminId) return res.status(401).json({ message: "Not authenticated" });
      const admin = await storage.getAdminUser(adminId);
      if (!admin || !admin.isActive) return res.status(401).json({ message: "Not authenticated" });
      const withdrawals = await storage.getAdminWithdrawals(adminId);
      res.json(withdrawals);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch withdrawals" });
    }
  });

  // Owner: list admin withdrawal requests
  app.get('/api/admin/admin-withdrawals', isAuthenticated, isOwner, async (req, res) => {
    try {
      const status = req.query.status as string | undefined;
      const withdrawals = await storage.getAllAdminWithdrawals(status);
      res.json(withdrawals);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch admin withdrawals" });
    }
  });

  // Owner: approve or reject an admin withdrawal request
  app.post('/api/admin/admin-withdrawals/:id/process', isAuthenticated, isOwner, async (req, res) => {
    try {
      const id = parseInt(String(req.params.id));
      const { action, adminNote } = req.body;
      if (!['approved', 'rejected'].includes(action)) {
        return res.status(400).json({ message: "Action must be 'approved' or 'rejected'." });
      }

      const ownerAdmin = await storage.getAdminUserByEmail(OWNER_EMAIL);
      const updated = await storage.processAdminWithdrawal(id, action, ownerAdmin?.id ?? 0, adminNote);

      try {
        if (action === 'approved') {
          await storage.createAdminNotification({
            adminId: updated.adminId,
            title: "Withdrawal Approved",
            message: `Your withdrawal of \u20A6${parseFloat(updated.amount).toLocaleString()} to ${updated.bankName} (${updated.accountNumber}) has been approved and paid.`,
            type: "success",
          });
        } else {
          await storage.createAdminNotification({
            adminId: updated.adminId,
            title: "Withdrawal Rejected",
            message: `Your withdrawal of \u20A6${parseFloat(updated.amount).toLocaleString()} was not approved and the amount has been returned to your wallet.${adminNote ? ` Reason: ${adminNote}` : ''}`,
            type: "warning",
          });
        }
      } catch (e) {}

      res.json(updated);
    } catch (err: any) {
      res.status(400).json({ message: err.message || "Failed to process withdrawal" });
    }
  });

  // Owner: recall funds from an admin's wallet back into platform earnings
  app.post('/api/admin/payroll/recall', isAuthenticated, isOwner, async (req, res) => {
    try {
      const adminId = parseInt(String(req.body?.adminId));
      const amount = parseFloat(String(req.body?.amount));
      const note = typeof req.body?.note === 'string' ? req.body.note.trim().slice(0, 500) : undefined;

      if (!isFinite(adminId) || adminId <= 0) return res.status(400).json({ message: "Invalid admin." });
      if (!isFinite(amount) || amount <= 0) return res.status(400).json({ message: "Enter a valid amount." });

      const admin = await storage.getAdminUser(adminId);
      if (!admin) return res.status(404).json({ message: "Admin not found." });

      const result = await storage.recallAdminFunds(adminId, amount, note || undefined);

      try {
        await storage.createAdminNotification({
          adminId,
          title: "Payment Recalled",
          message: `\u20A6${amount.toLocaleString()} was recalled from your wallet by the owner${note ? `. Note: ${note}` : '.'}`,
          type: "warning",
        });
      } catch (e) {}

      res.json({
        success: true,
        recalled: result.recalled,
        adminName: result.admin.name,
        newWalletBalance: result.admin.walletBalance,
      });
    } catch (err: any) {
      res.status(400).json({ message: err.message || "Failed to recall payment" });
    }
  });

  // Owner: view payroll summary (all admins with hours and bank info)
  app.get('/api/admin/payroll', isAuthenticated, isOwner, async (req, res) => {
    try {
      const startDate = req.query.startDate as string | undefined;
      const endDate = req.query.endDate as string | undefined;
      const summary = await storage.getAdminsPayrollSummary(startDate, endDate);
      res.json(summary);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch payroll data" });
    }
  });

  // Owner: pay selected admins
  app.post('/api/admin/payroll/pay', isAuthenticated, isOwner, async (req, res) => {
    try {
      const { payments, paymentSource } = req.body;
      if (!payments || !Array.isArray(payments) || payments.length === 0) {
        return res.status(400).json({ message: "Please select at least one admin to pay" });
      }

      const totalAmount = payments.reduce((sum: number, p: any) => {
        const amt = parseFloat(p.amount);
        return sum + (isNaN(amt) ? 0 : amt);
      }, 0);

      if (paymentSource === 'platform_earnings') {
        const earnings = await storage.getPlatformEarnings();
        const balance = parseFloat(earnings.totalBalance);
        if (balance < totalAmount) {
          return res.status(400).json({ 
            message: `Insufficient platform balance. Available: ${new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', minimumFractionDigits: 0 }).format(balance)}, Required: ${new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', minimumFractionDigits: 0 }).format(totalAmount)}` 
          });
        }
      }

      const results = [];
      for (const p of payments) {
        const { adminId, amount, note } = p;
        if (!adminId || !amount || parseFloat(amount) <= 0) continue;

        const admin = await storage.getAdminUser(adminId);
        if (!admin) continue;

        const payment = await storage.createAdminPayment({
          adminId,
          amount: String(amount),
          bankName: admin.bankName || undefined,
          bankCode: admin.bankCode || undefined,
          accountNumber: admin.accountNumber || undefined,
          accountName: admin.accountName || undefined,
          note: note ? `${note} (${paymentSource === 'platform_earnings' ? 'Platform Earnings' : 'External Bank'})` : (paymentSource === 'platform_earnings' ? 'Platform Earnings' : 'External Bank'),
          paidBy: 'owner',
        });
        // Salary lands in the admin's in-app wallet; they withdraw it to their bank later.
        await storage.creditAdminWallet(adminId, parseFloat(String(amount)));
        results.push(payment);
      }

      if (paymentSource === 'platform_earnings' && results.length > 0) {
        const paidTotal = results.reduce((sum, r) => sum + parseFloat(r.amount), 0);
        await storage.deductPlatformSalary(paidTotal, `Salary payment to ${results.length} admin(s)`);
      }

      for (const p of payments) {
        try {
          const amt = parseFloat(p.amount);
          if (isNaN(amt) || amt <= 0) continue;
          await storage.createAdminNotification({
            adminId: p.adminId,
            title: "Salary Payment Received",
            message: `\u20A6${amt.toLocaleString()} has been added to your wallet${p.note ? ` - ${p.note}` : ''}. You can withdraw it to your salary bank account from your profile.`,
            type: "success",
          });
        } catch (e) {}
      }

      res.json({ paid: results.length, payments: results });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to process payments" });
    }
  });

  // Owner: view all admin payment history
  app.get('/api/admin/payroll/history', isAuthenticated, isOwner, async (_req, res) => {
    try {
      const payments = await storage.getAdminPayments();
      res.json(payments);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch payment history" });
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

  // --- ADMIN NOTIFICATIONS ---

  app.get('/api/admin/notifications', async (req, res) => {
    try {
      const adminId = (req.session as any)?.adminId;
      const email = (req.user as any)?.claims?.email;
      const isOwnerUser = email && email.toLowerCase() === OWNER_EMAIL;

      if (!adminId && !isOwnerUser) return res.status(401).json({ message: "Not authenticated" });

      if (isOwnerUser) {
        const ownerAdmin = await storage.getAdminUserByEmail(OWNER_EMAIL);
        if (ownerAdmin) {
          const notifs = await storage.getAdminNotifications(ownerAdmin.id);
          return res.json(notifs);
        }
        return res.json([]);
      }

      const notifs = await storage.getAdminNotifications(adminId);
      res.json(notifs);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch notifications" });
    }
  });

  app.get('/api/admin/notifications/unread-count', async (req, res) => {
    try {
      const adminId = (req.session as any)?.adminId;
      const email = (req.user as any)?.claims?.email;
      const isOwnerUser = email && email.toLowerCase() === OWNER_EMAIL;

      if (!adminId && !isOwnerUser) return res.status(401).json({ message: "Not authenticated" });

      if (isOwnerUser) {
        const ownerAdmin = await storage.getAdminUserByEmail(OWNER_EMAIL);
        if (ownerAdmin) {
          const count = await storage.getUnreadAdminNotificationCount(ownerAdmin.id);
          return res.json({ count });
        }
        return res.json({ count: 0 });
      }

      const count = await storage.getUnreadAdminNotificationCount(adminId);
      res.json({ count });
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch unread count" });
    }
  });

  app.post('/api/admin/notifications/:id/read', async (req, res) => {
    try {
      const adminId = (req.session as any)?.adminId;
      const email = (req.user as any)?.claims?.email;
      const isOwnerUser = email && email.toLowerCase() === OWNER_EMAIL;

      if (!adminId && !isOwnerUser) return res.status(401).json({ message: "Not authenticated" });

      const notifId = Number(req.params.id);
      let effectiveAdminId = adminId;
      if (isOwnerUser) {
        const ownerAdmin = await storage.getAdminUserByEmail(OWNER_EMAIL);
        if (ownerAdmin) effectiveAdminId = ownerAdmin.id;
      }
      if (effectiveAdminId) {
        await storage.markAdminNotificationRead(notifId, effectiveAdminId);
      }
      res.json({ message: "Marked as read" });
    } catch (err) {
      res.status(500).json({ message: "Failed" });
    }
  });

  app.post('/api/admin/notifications/read-all', async (req, res) => {
    try {
      const adminId = (req.session as any)?.adminId;
      const email = (req.user as any)?.claims?.email;
      const isOwnerUser = email && email.toLowerCase() === OWNER_EMAIL;

      if (!adminId && !isOwnerUser) return res.status(401).json({ message: "Not authenticated" });

      let effectiveAdminId = adminId;
      if (isOwnerUser) {
        const ownerAdmin = await storage.getAdminUserByEmail(OWNER_EMAIL);
        if (ownerAdmin) effectiveAdminId = ownerAdmin.id;
      }
      if (effectiveAdminId) {
        await storage.markAllAdminNotificationsRead(effectiveAdminId);
      }
      res.json({ message: "All marked as read" });
    } catch (err) {
      res.status(500).json({ message: "Failed" });
    }
  });

  // --- DISPUTES ---

  app.post('/api/jobs/:id/dispute', isAuthenticated, async (req, res) => {
    try {
      const jobId = Number(req.params.id);
      const userId = (req.user as any)?.claims?.sub || (req.session as any)?.manualUserId;
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

      try {
        await storage.createAdminNotificationForAll({
          title: "New Dispute Filed",
          message: `A new dispute has been filed for job "${job.title}". Review and resolve it in the Disputes section.`,
          type: "warning",
          disputeId: dispute.id,
        });
      } catch (e) {}

      await storage.createNotification({
        userId: parsed.data.workerId,
        title: 'A Concern Has Been Raised',
        message: `The poster has raised a concern about job "${job.title}". Please review and respond in the job details.`,
        type: 'warning',
        jobId: job.id,
      });

      const full = await storage.getDispute(dispute.id);
      res.status(201).json(full);
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get('/api/jobs/:id/dispute', isAuthenticated, async (req, res) => {
    try {
      const jobId = Number(req.params.id);
      const userId = (req.user as any)?.claims?.sub || (req.session as any)?.manualUserId;

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
      const userId = (req.user as any)?.claims?.sub || (req.session as any)?.manualUserId;
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

      // Notify the other party about the new message
      try {
        const disputeJob = await storage.getJob(dispute.jobId);
        const jobTitle = disputeJob?.title || 'a job';
        if (isAdminUser) {
          // Admin message — notify both poster and worker
          const notifMsg = `An admin has sent a message in the dispute for "${jobTitle}".`;
          await storage.createNotification({ userId: dispute.posterId, title: 'Admin Message in Dispute', message: notifMsg, type: 'info', jobId: dispute.jobId });
          await storage.createNotification({ userId: dispute.workerId, title: 'Admin Message in Dispute', message: notifMsg, type: 'info', jobId: dispute.jobId });
        } else if (userId === dispute.posterId) {
          // Poster sent a message — notify worker
          const msgLabel = parsed.data.type === 'proposal' ? 'made a settlement proposal' : 'sent a message';
          await storage.createNotification({
            userId: dispute.workerId,
            title: 'New Message in Your Dispute',
            message: `The job poster ${msgLabel} in the dispute for "${jobTitle}". Open the job to respond.`,
            type: 'warning',
            jobId: dispute.jobId,
          });
        } else if (userId === dispute.workerId) {
          // Worker sent a message — notify poster
          const msgLabel = parsed.data.type === 'proposal' ? 'made a settlement proposal' : 'sent a message';
          await storage.createNotification({
            userId: dispute.posterId,
            title: 'New Message in Your Dispute',
            message: `The worker ${msgLabel} in the dispute for "${jobTitle}". Open the job to respond.`,
            type: 'warning',
            jobId: dispute.jobId,
          });
        }
      } catch (e) {}

      const full = await storage.getDispute(disputeId);
      res.status(201).json(full);
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post('/api/disputes/:id/accept-proposal', isAuthenticated, async (req, res) => {
    try {
      const disputeId = Number(req.params.id);
      const userId = (req.user as any)?.claims?.sub || (req.session as any)?.manualUserId;

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

      await storage.createDisputeMessage({
        disputeId,
        senderId: userId,
        message: `Accepted the proposed amount of \u20A6${resolvedAmount.toLocaleString()}. Waiting for poster to confirm payment.`,
        type: 'acceptance',
        amount: resolvedAmount.toFixed(2),
      });

      await storage.updateDispute(disputeId, { status: 'awaiting_payment' });

      await storage.createNotification({
        userId: dispute.posterId,
        title: 'Worker Accepted Your Proposal',
        message: `The worker agreed to your proposed price of \u20A6${resolvedAmount.toLocaleString()} for "${job.title}". Please confirm payment to release funds.`,
        type: 'info',
        jobId: dispute.jobId,
      });

      const full = await storage.getDispute(disputeId);
      res.json(full);
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post('/api/disputes/:id/confirm-payment', isAuthenticated, async (req, res) => {
    try {
      const disputeId = Number(req.params.id);
      const userId = (req.user as any)?.claims?.sub || (req.session as any)?.manualUserId;

      const dispute = await storage.getDispute(disputeId);
      if (!dispute) return res.status(404).json({ message: "Dispute not found" });

      if (dispute.posterId !== userId) {
        return res.status(403).json({ message: "Only the job poster can confirm payment" });
      }

      if (dispute.status !== 'awaiting_payment') {
        return res.status(400).json({ message: "This dispute is not awaiting payment confirmation" });
      }

      if (!dispute.proposedAmount) {
        return res.status(400).json({ message: "No agreed amount found" });
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
        message: `Payment confirmed. \u20A6${resolvedAmount.toLocaleString()} released to worker (platform fee: \u20A6${fee.toFixed(2)}).`,
        type: 'system',
        amount: resolvedAmount.toFixed(2),
      });

      await storage.updateDispute(disputeId, {
        status: 'resolved',
        resolvedAmount: resolvedAmount.toFixed(2),
        resolvedBy: 'agreement',
      });

      await storage.updateJob(dispute.jobId, { status: 'completed', completedAt: new Date() });

      await storage.createNotification({
        userId: dispute.workerId,
        title: 'Payment Released!',
        message: `The poster confirmed payment of \u20A6${workerPayout.toFixed(2)} for "${job.title}" has been added to your wallet.`,
        type: 'success',
        jobId: dispute.jobId,
      });

      await storage.createAdminNotification({
        adminId: 0,
        title: 'Dispute Resolved - Job Completed',
        message: `"${job.title}" completed via dispute resolution. Resolved amount: \u20A6${resolvedAmount.toLocaleString()}. Platform fee: \u20A6${fee.toFixed(2)}.`,
        type: 'success'
      });

      const full = await storage.getDispute(disputeId);
      res.json(full);
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post('/api/disputes/:id/escalate', isAuthenticated, async (req, res) => {
    try {
      const disputeId = Number(req.params.id);
      const userId = (req.user as any)?.claims?.sub || (req.session as any)?.manualUserId;

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

      const newStatus = action === 'refund_poster' ? 'cancelled' : 'completed';
      await storage.updateJob(dispute.jobId, { 
        status: newStatus,
        ...(newStatus === 'completed' ? { completedAt: new Date() } : {}),
      });

      try {
        await storage.createAdminNotificationForAll({
          title: "Dispute Resolved",
          message: `Dispute #${disputeId} for job "${job.title}" has been resolved. ${summaryMsg}`,
          type: "success",
          disputeId,
        });
      } catch (e) {}

      const full = await storage.getDispute(disputeId);
      res.json(full);
    } catch (err) {
      console.error("Error resolving dispute:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // --- WALLET ---

  app.get(api.wallet.get.path, isAuthenticated, async (req, res) => {
    const userId = (req.user as any)?.claims?.sub || (req.session as any)?.manualUserId;
    const profile = await storage.getProfile(userId);
    const transactions = await storage.getTransactions(userId);
    
    if (!profile) return res.status(404).json({ message: "Profile not found" });

    res.json({
      balance: profile.walletBalance,
      transactions
    });
  });

  app.post(api.wallet.deposit.path, isAuthenticated, async (req, res) => {
    const userId = (req.user as any)?.claims?.sub || (req.session as any)?.manualUserId;
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
    const newBalance = parseFloat(profile?.walletBalance || "0");
    storage.getUser(userId).then(u => {
      if (u?.email) sendWalletDepositEmail(u.email, u.firstName || u.email, amount, newBalance).catch(() => {});
    }).catch(() => {});
    res.json({ newBalance: profile?.walletBalance || "0" });
  });

  app.post(api.wallet.cardDeposit.path, isAuthenticated, async (req, res) => {
    const userId = (req.user as any)?.claims?.sub || (req.session as any)?.manualUserId;
    const parsed = api.wallet.cardDeposit.input.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid input" });

    const { amount, paymentMethod, cardNumber, cardExpiry, cardCvv, bankCode, accountNumber } = parsed.data;

    // Fetch user email for Paystack
    const userRecord = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    const userEmail = userRecord[0]?.email || `user_${userId}@abib.jobs`;

    // Amount in kobo (Paystack uses smallest currency unit)
    const amountKobo = amount * 100;

    let chargeBody: any = {
      email: userEmail,
      amount: amountKobo,
    };

    let maskedInfo = '';

    if (paymentMethod === 'card') {
      if (!cardNumber || !cardExpiry || !cardCvv) {
        return res.status(400).json({ message: "Card number, expiry and CVV are required" });
      }
      const cleanCard = cardNumber.replace(/\s/g, '');
      if (cleanCard.length < 13) {
        return res.status(400).json({ message: "Invalid card number" });
      }
      const [expMonth, expYear] = cardExpiry.replace(/\s/g, '').split('/');
      chargeBody.card = {
        number: cleanCard,
        cvv: cardCvv,
        expiry_month: expMonth,
        expiry_year: expYear?.length === 2 ? `20${expYear}` : expYear,
      };
      maskedInfo = `****${cleanCard.slice(-4)}`;
    } else {
      if (!bankCode || !accountNumber) {
        return res.status(400).json({ message: "Bank and account number are required" });
      }
      chargeBody.bank = {
        code: bankCode,
        account_number: accountNumber,
      };
      maskedInfo = `****${accountNumber.slice(-4)}`;
    }

    try {
      const chargeResp = await paystackRequest('POST', '/charge', chargeBody);
      console.log(`[Paystack] charge response:`, JSON.stringify(chargeResp));

      if (!chargeResp.status) {
        return res.status(400).json({ message: chargeResp.message || "Payment initiation failed" });
      }

      const data = chargeResp.data;
      const reference = data?.reference;

      if (!reference) {
        return res.status(400).json({ message: "No payment reference returned. Please try again." });
      }

      // If charge is already successful (test mode sometimes skips OTP)
      if (data.status === 'success') {
        await storage.updateWalletBalance(userId, amount);
        const profile = await storage.getProfile(userId);

        // Fetch bank name from NIGERIAN_BANKS if needed
        let bankName = paymentMethod === 'card' ? 'Card Payment' : 'Bank Account';

        await storage.createTransaction({
          userId,
          amount: amount.toString(),
          type: 'deposit',
          bankName,
          bankCode: bankCode || null,
          accountNumber: maskedInfo,
          accountName: paymentMethod === 'card' ? 'Debit Card' : 'Bank Account',
        });

        const newBal = parseFloat(profile?.walletBalance || "0");
        storage.getUser(userId).then(u => {
          if (u?.email) sendWalletDepositEmail(u.email, u.firstName || u.email, amount, newBal).catch(() => {});
        }).catch(() => {});

        return res.json({
          sessionId: reference,
          message: 'Payment completed instantly',
          otpSentTo: maskedInfo,
          instant: true,
          newBalance: profile?.walletBalance || "0",
        });
      }

      // Needs OTP or PIN
      if (data.status === 'send_otp' || data.status === 'send_pin' || data.status === 'pending') {
        const sessionId = crypto.randomUUID();
        paystackSessions.set(sessionId, {
          userId,
          amount,
          paymentMethod,
          paystackReference: reference,
          maskedInfo,
          bankCode: bankCode || undefined,
          accountNumber: accountNumber || undefined,
          expiresAt: Date.now() + 15 * 60 * 1000,
          createdAt: Date.now(),
        });

        const displayMessage = data.status === 'send_pin'
          ? `Enter your bank PIN for account ${maskedInfo}`
          : `OTP sent to the phone number linked to ${maskedInfo}`;

        return res.json({
          sessionId,
          message: displayMessage,
          otpSentTo: maskedInfo,
          promptType: data.status,
        });
      }

      return res.status(400).json({ message: data.message || `Unexpected payment status: ${data.status}` });
    } catch (err: any) {
      console.error('[Paystack] charge error:', err);
      return res.status(500).json({ message: "Payment service error. Please try again." });
    }
  });

  app.post(api.wallet.verifyOtp.path, isAuthenticated, async (req, res) => {
    const userId = (req.user as any)?.claims?.sub || (req.session as any)?.manualUserId;
    const parsed = api.wallet.verifyOtp.input.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid input" });

    const { sessionId, otp } = parsed.data;
    const session = paystackSessions.get(sessionId);

    if (!session) {
      return res.status(400).json({ message: "Session expired or invalid. Please try again." });
    }

    if (session.userId !== userId) {
      return res.status(400).json({ message: "Unauthorized session" });
    }

    if (session.expiresAt < Date.now()) {
      paystackSessions.delete(sessionId);
      return res.status(400).json({ message: "Session expired. Please initiate a new deposit." });
    }

    try {
      // Submit OTP to Paystack
      const otpResp = await paystackRequest('POST', '/charge/submit_otp', {
        otp,
        reference: session.paystackReference,
      });
      console.log(`[Paystack] submit_otp response:`, JSON.stringify(otpResp));

      if (!otpResp.status) {
        return res.status(400).json({ message: otpResp.message || "OTP verification failed" });
      }

      const data = otpResp.data;

      // Verify transaction status
      if (data.status === 'success') {
        // Double-check with verify endpoint
        const verifyResp = await paystackRequest('GET', `/transaction/verify/${session.paystackReference}`);
        console.log(`[Paystack] verify response:`, JSON.stringify(verifyResp));

        if (verifyResp.data?.status !== 'success') {
          return res.status(400).json({ message: "Payment could not be confirmed. Please contact support." });
        }

        await storage.updateWalletBalance(userId, session.amount);
        await storage.createTransaction({
          userId,
          amount: session.amount.toString(),
          type: 'deposit',
          bankName: session.paymentMethod === 'card' ? 'Card Payment' : 'Bank Account',
          bankCode: session.bankCode || null,
          accountNumber: session.maskedInfo,
          accountName: session.paymentMethod === 'card' ? 'Debit Card' : 'Bank Account',
        });

        paystackSessions.delete(sessionId);
        const profile = await storage.getProfile(userId);
        const newBal2 = parseFloat(profile?.walletBalance || "0");
        storage.getUser(userId).then(u => {
          if (u?.email) sendWalletDepositEmail(u.email, u.firstName || u.email, session.amount, newBal2).catch(() => {});
        }).catch(() => {});
        return res.json({
          newBalance: profile?.walletBalance || "0",
          message: "Deposit successful!",
        });
      }

      if (data.status === 'send_otp' || data.status === 'send_pin') {
        return res.status(400).json({ message: "Incorrect OTP. Please try again." });
      }

      return res.status(400).json({ message: data.message || `Payment status: ${data.status}. Please try again.` });
    } catch (err: any) {
      console.error('[Paystack] verify-otp error:', err);
      return res.status(500).json({ message: "Payment service error. Please try again." });
    }
  });

  app.post(api.wallet.resendOtp.path, isAuthenticated, async (req, res) => {
    const userId = (req.user as any)?.claims?.sub || (req.session as any)?.manualUserId;
    const parsed = api.wallet.resendOtp.input.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid input" });

    const { sessionId } = parsed.data;
    const session = paystackSessions.get(sessionId);

    if (!session || session.userId !== userId) {
      return res.status(400).json({ message: "Session expired or invalid. Please try again." });
    }

    try {
      // Paystack doesn't have a resend OTP endpoint directly — we inform the user to check their phone
      res.json({
        message: "Please check your phone for the OTP already sent by your bank",
        otpSentTo: session.maskedInfo,
      });
    } catch (err: any) {
      console.error('[Paystack] resend-otp error:', err);
      return res.status(500).json({ message: "Could not resend OTP. Please try again." });
    }
  });

  app.get(api.wallet.depositMethods.path, isAuthenticated, async (req, res) => {
    const userId = (req.user as any)?.claims?.sub || (req.session as any)?.manualUserId;
    const methods = await storage.getDepositMethods(userId);
    res.json({ methods, hasDeposits: methods.length > 0 });
  });

  // User: submit withdrawal request (when they want a different account)
  app.post('/api/wallet/withdrawal-requests', isAuthenticated, async (req, res) => {
    const userId = (req.user as any)?.claims?.sub || (req.session as any)?.manualUserId;
    const { amount, bankName, bankCode, accountNumber, accountName, reason } = req.body;
    if (!amount || !bankName || !accountNumber) {
      return res.status(400).json({ message: "Amount, bank name, and account number are required." });
    }
    const val = parseFloat(amount);
    if (isNaN(val) || val <= 0) return res.status(400).json({ message: "Invalid amount." });

    const profile = await storage.getProfile(userId);
    if (!profile || parseFloat(profile.walletBalance) < val) {
      return res.status(400).json({ message: "Insufficient wallet balance for this request." });
    }

    const userRecord = await storage.getUser(userId);
    const userName = userRecord
      ? `${userRecord.firstName || ''} ${userRecord.lastName || ''}`.trim() || userRecord.email || userId
      : userId;

    const request = await storage.createWithdrawalRequest({
      userId,
      userName,
      amount: val.toString(),
      bankName,
      bankCode: bankCode || null,
      accountNumber,
      accountName: accountName || null,
      reason: reason || null,
    });

    if (userRecord?.email) {
      sendWithdrawalEmail(userRecord.email, userRecord.firstName || userRecord.email, val).catch(() => {});
    }

    res.json(request);
  });

  // User: view their own withdrawal requests
  app.get('/api/wallet/withdrawal-requests', isAuthenticated, async (req, res) => {
    const userId = (req.user as any)?.claims?.sub || (req.session as any)?.manualUserId;
    const requests = await storage.getUserWithdrawalRequests(userId);
    res.json(requests);
  });

  // Admin: view all withdrawal requests
  app.get('/api/admin/withdrawal-requests', isAdminOrOwner, async (req, res) => {
    const status = req.query.status as string | undefined;
    const requests = await storage.getAllWithdrawalRequests(status);
    res.json(requests);
  });

  // Admin: approve or reject a withdrawal request
  app.post('/api/admin/withdrawal-requests/:id/process', isAdminOrOwner, async (req, res) => {
    const id = parseInt(req.params.id);
    const { action, adminNote } = req.body;
    if (!['approved', 'rejected'].includes(action)) {
      return res.status(400).json({ message: "Action must be 'approved' or 'rejected'." });
    }
    const adminUser = (req as any).adminUser;
    if (!adminUser) return res.status(401).json({ message: "Admin not authenticated." });

    const existing = (await storage.getAllWithdrawalRequests()).find(r => r.id === id);
    if (!existing) return res.status(404).json({ message: "Request not found." });
    if (existing.status !== 'pending') return res.status(400).json({ message: "This request has already been processed." });

    if (action === 'approved') {
      const profile = await storage.getProfile(existing.userId);
      const balance = parseFloat(profile?.walletBalance || '0');
      const amount = parseFloat(existing.amount);
      if (balance < amount) {
        return res.status(400).json({ message: "User has insufficient wallet balance to fulfil this request." });
      }
      // Deduct from user wallet
      await storage.updateWalletBalance(existing.userId, -amount);
      await storage.createTransaction({
        userId: existing.userId,
        amount: (-amount).toString(),
        type: 'withdrawal',
        bankName: existing.bankName,
        bankCode: existing.bankCode,
        accountNumber: existing.accountNumber,
        accountName: existing.accountName,
      });
      // Notify user
      await storage.createNotification({
        userId: existing.userId,
        title: 'Withdrawal Approved',
        message: `Your withdrawal request of N${amount.toLocaleString()} to ${existing.bankName} (${existing.accountNumber}) has been approved and processed.`,
        type: 'success',
      });
    } else {
      // Notify user of rejection
      await storage.createNotification({
        userId: existing.userId,
        title: 'Withdrawal Request Rejected',
        message: `Your withdrawal request of N${parseFloat(existing.amount).toLocaleString()} was not approved.${adminNote ? ` Reason: ${adminNote}` : ''}`,
        type: 'warning',
      });
    }

    const updated = await storage.processWithdrawalRequest(id, action, adminUser.id, adminNote);
    res.json(updated);
  });

  app.post(api.wallet.withdraw.path, isAuthenticated, async (req, res) => {
    const userId = (req.user as any)?.claims?.sub || (req.session as any)?.manualUserId;
    const parsed = api.wallet.withdraw.input.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid input" });
    const { amount, bankCode, bankName, accountNumber, accountName } = parsed.data;

    const profile = await storage.getProfile(userId);
    if (!profile || parseFloat(profile.walletBalance) < amount) {
      return res.status(400).json({ message: "Insufficient funds" });
    }

    // Validate withdrawal destination matches a deposit method (if user has any deposits)
    const depositMethods = await storage.getDepositMethods(userId);
    if (depositMethods.length > 0) {
      const isValidDestination = depositMethods.some(m => m.accountNumber === accountNumber && m.bankName === bankName);
      if (!isValidDestination) {
        return res.status(400).json({ message: "Withdrawal must go to one of your original deposit payment methods." });
      }
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
    const userId = (req.user as any)?.claims?.sub || (req.session as any)?.manualUserId;
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

    const verifyIp = ((req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()) || req.ip || req.socket?.remoteAddress || 'unknown';
    const updated = await storage.submitVerification(userId, parsed.data.idCardUrl, parsed.data.faceScanUrl, verifyIp);

    const userName = profile.bio ? profile.bio.split('\n')[0] : userId;
    const userProfile = req.user as any;
    const displayName = userProfile?.claims?.first_name
      ? `${userProfile.claims.first_name} ${userProfile.claims.last_name || ''}`.trim()
      : userName;

    await storage.createAdminNotificationForAll({
      title: 'New Verification Submission',
      message: `${displayName} has submitted their ID/passport and selfie for identity verification. Please review in the Verifications section.`,
      type: 'warning',
    });

    res.json(updated);
  });

  app.post('/api/verification/cancel', isAuthenticated, async (req, res) => {
    const userId = (req.user as any)?.claims?.sub || (req.session as any)?.manualUserId;
    const profile = await storage.getProfile(userId);
    if (!profile) return res.status(404).json({ message: "Profile not found" });
    if (profile.verificationStatus !== 'pending') {
      return res.status(400).json({ message: "No pending verification to cancel." });
    }
    const updated = await storage.reviewVerification(userId, 'redo', 'Cancelled by user for resubmission');
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

  // --- SECURITY RECORDS (all admins) ---
  app.get('/api/admin/security-records', isAdminOrOwner, async (req, res) => {
    try {
      const search = typeof req.query.search === 'string' ? req.query.search : undefined;
      const records = await storage.getSecurityRecords(search);
      res.json(records);
    } catch (err) {
      console.error("Security records error:", err);
      res.status(500).json({ message: "Failed to fetch security records" });
    }
  });

  app.get('/api/admin/security-records/:userId', isAdminOrOwner, async (req, res) => {
    try {
      const detail = await storage.getSecurityRecordDetail(req.params.userId);
      if (!detail?.user) return res.status(404).json({ message: "User not found" });
      // Never expose credentials or reset tokens to admins
      const { passwordHash, passwordResetToken, passwordResetExpiry, ...safeUser } = detail.user;
      res.json({ ...detail, user: safeUser });
    } catch (err) {
      console.error("Security record detail error:", err);
      res.status(500).json({ message: "Failed to fetch security record" });
    }
  });

  // --- ADMIN BROADCAST ---
  app.post('/api/admin/broadcast', isAuthenticated, isOwner, async (req, res) => {
    const { title, message } = req.body;
    if (!title || typeof title !== 'string' || !message || typeof message !== 'string') {
      return res.status(400).json({ message: "Title and message are required" });
    }
    const trimmedTitle = title.trim().slice(0, 200);
    const trimmedMessage = message.trim().slice(0, 1000);
    if (!trimmedTitle || !trimmedMessage) {
      return res.status(400).json({ message: "Title and message cannot be empty" });
    }
    await storage.broadcastNotificationToAll({
      title: trimmedTitle,
      message: trimmedMessage,
      type: 'info',
    });
    res.json({ success: true, message: "Announcement sent to all users" });
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

  // --- VISIT TRACKING ---
  app.post('/api/track-visit', async (req, res) => {
    try {
      const { visitorId, page } = req.body;
      if (!visitorId || !page) return res.status(400).json({ message: "Missing visitorId or page" });
      const userAgent = req.headers['user-agent'] || undefined;
      await storage.trackVisit(visitorId, page, userAgent);

      // Record "last seen" info for logged-in users (for admin investigations)
      const seenUserId = (req.user as any)?.claims?.sub || (req.session as any)?.manualUserId;
      if (seenUserId) {
        const seenIp = ((req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()) || req.ip || req.socket?.remoteAddress || 'unknown';
        storage.updateLastSeen(String(seenUserId), String(page).slice(0, 200), seenIp).catch(() => {});
      }

      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ message: "Failed to track visit" });
    }
  });

  // --- ADMIN DASHBOARD ANALYTICS ---
  app.get('/api/admin/dashboard', isAuthenticated, isAdminOrOwner, async (_req, res) => {
    try {
      const analytics = await storage.getDashboardAnalytics();
      res.json(analytics);
    } catch (err) {
      console.error("Dashboard analytics error:", err);
      res.status(500).json({ message: "Failed to fetch analytics" });
    }
  });

  app.get('/api/admin/hours-worked', isAuthenticated, isAdminOrOwner, async (req, res) => {
    try {
      const { startDate, endDate } = req.query;
      if (!startDate || !endDate) {
        return res.status(400).json({ message: "startDate and endDate query parameters are required" });
      }
      const start = new Date(startDate as string);
      const end = new Date(endDate as string);
      end.setHours(23, 59, 59, 999);

      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        return res.status(400).json({ message: "Invalid date format" });
      }

      const result = await storage.getHoursWorked(start, end);
      res.json(result);
    } catch (err) {
      console.error("Hours worked error:", err);
      res.status(500).json({ message: "Failed to fetch hours worked data" });
    }
  });

  // === SUPPORT CHAT ROUTES ===

  // User: Create a support ticket
  app.post('/api/support/tickets', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.session?.manualUserId || (req.user as any)?.claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });

      const { subject } = req.body;
      if (!subject || typeof subject !== 'string' || subject.trim().length === 0) {
        return res.status(400).json({ message: "Subject is required" });
      }

      const existing = await storage.getActiveSupportTicket(userId);
      if (existing) {
        return res.json(existing);
      }

      const [user] = await db.select().from(users).where(eq(users.id, userId));
      const userName = user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email || 'User' : 'User';

      const ticket = await storage.createSupportTicket({
        userId,
        userName,
        subject: subject.trim(),
      });

      await storage.createSupportMessage({
        ticketId: ticket.id,
        senderId: 'system',
        senderName: 'System',
        senderType: 'system',
        message: `Ticket ${ticket.ticketNumber} created. Please hold on while we connect you with a live agent.`,
      });

      res.json(ticket);
    } catch (err) {
      console.error("Create support ticket error:", err);
      res.status(500).json({ message: "Failed to create ticket" });
    }
  });

  // User: Get active ticket
  app.get('/api/support/active', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.session?.manualUserId || (req.user as any)?.claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const ticket = await storage.getActiveSupportTicket(userId);
      res.json(ticket || null);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch active ticket" });
    }
  });

  // User: Get my ticket history
  app.get('/api/support/tickets', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.session?.manualUserId || (req.user as any)?.claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const tickets = await storage.getUserSupportTickets(userId);
      res.json(tickets);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch tickets" });
    }
  });

  // User: Get messages for own ticket (supports polling with afterId)
  app.get('/api/support/tickets/:id/messages', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.session?.manualUserId || (req.user as any)?.claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });

      const ticketId = parseInt(req.params.id);
      const ticket = await storage.getSupportTicket(ticketId);
      if (!ticket) return res.status(404).json({ message: "Ticket not found" });
      if (ticket.userId !== userId) return res.status(403).json({ message: "Not authorized" });

      const afterId = req.query.afterId ? parseInt(req.query.afterId as string) : undefined;
      const messages = await storage.getSupportMessages(ticketId, afterId);
      res.json(messages);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch messages" });
    }
  });

  // User: Send a message
  app.post('/api/support/tickets/:id/messages', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.session?.manualUserId || (req.user as any)?.claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });

      const ticketId = parseInt(req.params.id);
      const ticket = await storage.getSupportTicket(ticketId);
      if (!ticket) return res.status(404).json({ message: "Ticket not found" });
      if (ticket.userId !== userId) return res.status(403).json({ message: "Not authorized" });

      if (ticket.status === 'closed' || ticket.status === 'resolved') {
        return res.status(400).json({ message: "This ticket is closed" });
      }

      const { message } = req.body;
      if (!message || typeof message !== 'string' || message.trim().length === 0) {
        return res.status(400).json({ message: "Message is required" });
      }

      const [user] = await db.select().from(users).where(eq(users.id, userId));
      const senderName = user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'User' : 'User';

      const msg = await storage.createSupportMessage({
        ticketId,
        senderId: userId,
        senderName,
        senderType: 'user',
        message: message.trim(),
      });

      res.json(msg);
    } catch (err) {
      res.status(500).json({ message: "Failed to send message" });
    }
  });

  // User: Close own ticket
  app.post('/api/support/tickets/:id/close', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.session?.manualUserId || (req.user as any)?.claims?.sub;
      const ticketId = parseInt(req.params.id);
      const ticket = await storage.getSupportTicket(ticketId);
      if (!ticket) return res.status(404).json({ message: "Ticket not found" });
      if (ticket.userId !== userId) return res.status(403).json({ message: "Not authorized" });

      const updated = await storage.updateSupportTicket(ticketId, { status: 'closed', closedAt: new Date() });

      await storage.createSupportMessage({
        ticketId,
        senderId: 'system',
        senderName: 'System',
        senderType: 'system',
        message: 'Chat ended by user.',
      });

      res.json(updated);
    } catch (err) {
      res.status(500).json({ message: "Failed to close ticket" });
    }
  });

  // Admin: Get all support tickets
  app.get('/api/admin/support/tickets', isAdminOrOwner, async (req: any, res) => {
    try {
      const status = req.query.status as string | undefined;
      const tickets = await storage.getAllSupportTickets(status);
      res.json(tickets);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch support tickets" });
    }
  });

  // Admin: Get waiting tickets count
  app.get('/api/admin/support/waiting-count', isAdminOrOwner, async (_req, res) => {
    try {
      const count = await storage.getWaitingTicketsCount();
      res.json({ count });
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch waiting count" });
    }
  });

  // Admin: Get ticket details with messages
  app.get('/api/admin/support/tickets/:id', isAdminOrOwner, async (req: any, res) => {
    try {
      const ticketId = parseInt(req.params.id);
      const ticket = await storage.getSupportTicket(ticketId);
      if (!ticket) return res.status(404).json({ message: "Ticket not found" });
      const messages = await storage.getSupportMessages(ticketId);
      res.json({ ...ticket, messages });
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch ticket" });
    }
  });

  // Admin: Assign self to a ticket (join chat)
  app.post('/api/admin/support/tickets/:id/assign', isAdminOrOwner, async (req: any, res) => {
    try {
      const ticketId = parseInt(req.params.id);
      const ticket = await storage.getSupportTicket(ticketId);
      if (!ticket) return res.status(404).json({ message: "Ticket not found" });

      let adminName = 'Admin';
      let adminId = 0;
      if ((req as any).adminRole === 'owner') {
        adminName = 'Owner';
        adminId = 0;
      } else if ((req as any).adminUser) {
        adminName = (req as any).adminUser.name;
        adminId = (req as any).adminUser.id;
      }

      const updated = await storage.updateSupportTicket(ticketId, {
        status: 'active',
        assignedAdminId: adminId,
        assignedAdminName: adminName,
      });

      await storage.createSupportMessage({
        ticketId,
        senderId: `admin-${adminId}`,
        senderName: adminName,
        senderType: 'system',
        message: `${adminName} has joined the chat. How can we help you?`,
      });

      res.json(updated);
    } catch (err) {
      res.status(500).json({ message: "Failed to assign ticket" });
    }
  });

  // Admin: Send message to ticket
  app.post('/api/admin/support/tickets/:id/messages', isAdminOrOwner, async (req: any, res) => {
    try {
      const ticketId = parseInt(req.params.id);
      const ticket = await storage.getSupportTicket(ticketId);
      if (!ticket) return res.status(404).json({ message: "Ticket not found" });

      const { message } = req.body;
      if (!message || typeof message !== 'string' || message.trim().length === 0) {
        return res.status(400).json({ message: "Message is required" });
      }

      let adminName = 'Admin';
      let adminId = '0';
      if ((req as any).adminRole === 'owner') {
        adminName = 'Owner';
        adminId = 'admin-owner';
      } else if ((req as any).adminUser) {
        adminName = (req as any).adminUser.name;
        adminId = `admin-${(req as any).adminUser.id}`;
      }

      const msg = await storage.createSupportMessage({
        ticketId,
        senderId: adminId,
        senderName: adminName,
        senderType: 'admin',
        message: message.trim(),
      });

      res.json(msg);
    } catch (err) {
      res.status(500).json({ message: "Failed to send message" });
    }
  });

  // Admin: Close/resolve a ticket
  app.post('/api/admin/support/tickets/:id/close', isAdminOrOwner, async (req: any, res) => {
    try {
      const ticketId = parseInt(req.params.id);
      const ticket = await storage.getSupportTicket(ticketId);
      if (!ticket) return res.status(404).json({ message: "Ticket not found" });

      let adminName = 'Admin';
      if ((req as any).adminRole === 'owner') adminName = 'Owner';
      else if ((req as any).adminUser) adminName = (req as any).adminUser.name;

      const updated = await storage.updateSupportTicket(ticketId, { status: 'resolved', closedAt: new Date() });

      await storage.createSupportMessage({
        ticketId,
        senderId: 'system',
        senderName: 'System',
        senderType: 'system',
        message: `Chat resolved by ${adminName}. Thank you for contacting support.`,
      });

      res.json(updated);
    } catch (err) {
      res.status(500).json({ message: "Failed to close ticket" });
    }
  });

  // Admin: Get messages for a ticket (polling)
  app.get('/api/admin/support/tickets/:id/messages', isAdminOrOwner, async (req: any, res) => {
    try {
      const ticketId = parseInt(req.params.id);
      const afterId = req.query.afterId ? parseInt(req.query.afterId as string) : undefined;
      const messages = await storage.getSupportMessages(ticketId, afterId);
      res.json(messages);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch messages" });
    }
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
