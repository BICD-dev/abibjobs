import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM = "ABIB JOBS <onboarding@resend.dev>";
const APP_URL = process.env.REPLIT_DOMAINS
  ? `https://${process.env.REPLIT_DOMAINS.split(",")[0]}`
  : "http://localhost:5000";

function fmt(amount: number) {
  return `₦${amount.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

async function send(to: string, subject: string, html: string) {
  if (!process.env.RESEND_API_KEY) return;
  try {
    await resend.emails.send({ from: FROM, to, subject, html });
  } catch (err) {
    console.error("[email] Failed to send:", subject, err);
  }
}

function wrap(title: string, body: string) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head><body style="margin:0;padding:0;background:#f4f4f5;font-family:'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 0;">
  <tr><td align="center">
    <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08);">
      <tr><td style="background:#16a34a;padding:28px 36px;text-align:center;">
        <span style="color:#fff;font-size:24px;font-weight:800;letter-spacing:-0.5px;">ABIB JOBS</span>
        <p style="color:#bbf7d0;margin:4px 0 0;font-size:13px;">Nigeria's #1 Quick Jobs Marketplace</p>
      </td></tr>
      <tr><td style="padding:36px;">${body}</td></tr>
      <tr><td style="background:#f9fafb;padding:20px 36px;text-align:center;border-top:1px solid #e5e7eb;">
        <p style="color:#9ca3af;font-size:12px;margin:0;">© ${new Date().getFullYear()} ABIB JOBS. All rights reserved.</p>
        <p style="color:#9ca3af;font-size:12px;margin:4px 0 0;"><a href="${APP_URL}" style="color:#16a34a;text-decoration:none;">Visit ABIB JOBS</a></p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

function btn(href: string, label: string) {
  return `<a href="${href}" style="display:inline-block;background:#16a34a;color:#fff;font-weight:700;font-size:15px;padding:14px 32px;border-radius:8px;text-decoration:none;margin-top:24px;">${label}</a>`;
}

function heading(text: string) {
  return `<h2 style="color:#111827;font-size:20px;font-weight:700;margin:0 0 12px;">${text}</h2>`;
}

function para(text: string) {
  return `<p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 12px;">${text}</p>`;
}

function infoBox(label: string, value: string) {
  return `<tr><td style="padding:8px 0;color:#6b7280;font-size:13px;border-bottom:1px solid #f3f4f6;">${label}</td><td style="padding:8px 0;color:#111827;font-size:13px;font-weight:600;text-align:right;border-bottom:1px solid #f3f4f6;">${value}</td></tr>`;
}

function table(...rows: string[]) {
  return `<table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border-radius:8px;padding:4px 16px;margin:16px 0;">${rows.join("")}</table>`;
}

// ─── AUTH ───────────────────────────────────────────────────────────────────

export async function sendWelcomeEmail(to: string, firstName: string) {
  const body = wrap("Welcome to ABIB JOBS",
    heading(`Welcome, ${firstName}! 🎉`) +
    para("Your ABIB JOBS account is ready. You can now browse jobs, post work you need done, and get paid — all through our secure wallet.") +
    para("Complete your identity verification to unlock posting and accepting jobs.") +
    btn(`${APP_URL}/profile`, "Complete Your Profile")
  );
  await send(to, "Welcome to ABIB JOBS!", body);
}

export async function sendPasswordResetEmail(to: string, firstName: string, resetToken: string) {
  const resetLink = `${APP_URL}/reset-password?token=${resetToken}`;
  const body = wrap("Reset Your Password",
    heading("Password Reset Request") +
    para(`Hi ${firstName}, we received a request to reset your ABIB JOBS password.`) +
    para("Click the button below to set a new password. This link expires in <strong>1 hour</strong>.") +
    btn(resetLink, "Reset My Password") +
    `<p style="color:#9ca3af;font-size:13px;margin-top:24px;">If you didn't request this, you can safely ignore this email.</p>`
  );
  await send(to, "Reset your ABIB JOBS password", body);
}

// ─── JOB POSTED ─────────────────────────────────────────────────────────────

export async function sendJobPostedEmail(to: string, posterName: string, jobTitle: string, jobId: number, price: string, location: string, category: string) {
  const body = wrap("Job Posted Successfully",
    heading("Your Job is Live! 🚀") +
    para(`Hi ${posterName}, your job has been posted and is now visible to workers on ABIB JOBS.`) +
    table(
      infoBox("Job Title", jobTitle),
      infoBox("Category", category),
      infoBox("Location", location),
      infoBox("Budget", price),
    ) +
    para("You'll get an email as soon as a worker accepts your job.") +
    btn(`${APP_URL}/jobs/${jobId}`, "View Job")
  );
  await send(to, `Your job "${jobTitle}" is live on ABIB JOBS`, body);
}

// ─── JOB ACCEPTED ───────────────────────────────────────────────────────────

export async function sendJobAcceptedToPosterEmail(to: string, posterName: string, jobTitle: string, jobId: number, workersAccepted: number, workersNeeded: number) {
  const isFullyStaffed = workersAccepted >= workersNeeded;
  const body = wrap("Worker Accepted Your Job",
    heading("A Worker Has Accepted Your Job!") +
    para(`Hi ${posterName}, great news — a worker has accepted <strong>${jobTitle}</strong>.`) +
    table(
      infoBox("Workers Accepted", `${workersAccepted} / ${workersNeeded}`),
      infoBox("Status", isFullyStaffed ? "✅ In Progress" : "⏳ Waiting for more workers"),
    ) +
    (isFullyStaffed
      ? para("Your job is now fully staffed and in progress. Escrow funds are securely held and will be released to the worker(s) on completion.")
      : para("Your job still needs more workers. We'll notify you when all slots are filled.")) +
    btn(`${APP_URL}/jobs/${jobId}`, "View Job")
  );
  await send(to, `A worker accepted your job "${jobTitle}"`, body);
}

export async function sendJobAcceptedToWorkerEmail(to: string, workerName: string, jobTitle: string, jobId: number, price: string, location: string) {
  const body = wrap("You Accepted a Job",
    heading("Job Accepted Successfully!") +
    para(`Hi ${workerName}, you've successfully accepted <strong>${jobTitle}</strong>. Head to the job location and do great work!`) +
    table(
      infoBox("Job", jobTitle),
      infoBox("Location", location),
      infoBox("Earnings (after 22% fee)", price),
    ) +
    para("Update your progress on the job page as you work. The poster can track your status in real time.") +
    btn(`${APP_URL}/jobs/${jobId}`, "View Job")
  );
  await send(to, `You accepted the job "${jobTitle}"`, body);
}

// ─── JOB COMPLETED ──────────────────────────────────────────────────────────

export async function sendJobCompletedToPosterEmail(to: string, posterName: string, jobTitle: string, jobId: number, totalPaid: number) {
  const body = wrap("Job Completed",
    heading("Job Completed! ✅") +
    para(`Hi ${posterName}, the job <strong>${jobTitle}</strong> has been completed and payment has been released to the worker(s).`) +
    table(
      infoBox("Total Paid Out", fmt(totalPaid)),
    ) +
    para("Thank you for using ABIB JOBS! Feel free to post more jobs anytime.") +
    btn(`${APP_URL}/my-jobs`, "View My Jobs")
  );
  await send(to, `Job "${jobTitle}" completed on ABIB JOBS`, body);
}

export async function sendJobCompletedToWorkerEmail(to: string, workerName: string, jobTitle: string, jobId: number, earning: number) {
  const body = wrap("Payment Received!",
    heading("Payment Received! 💰") +
    para(`Hi ${workerName}, <strong>${jobTitle}</strong> is marked complete and your payment has been added to your ABIB JOBS wallet.`) +
    table(
      infoBox("Amount Earned", fmt(earning)),
    ) +
    para("You can withdraw your earnings to your bank account from the Wallet page.") +
    btn(`${APP_URL}/wallet`, "Go to Wallet")
  );
  await send(to, `Payment of ${fmt(earning)} received for "${jobTitle}"`, body);
}

export async function sendCompletionRequestedEmail(to: string, recipientName: string, jobTitle: string, jobId: number, senderRole: "poster" | "worker") {
  const from = senderRole === "poster" ? "The job poster" : "The worker";
  const action = senderRole === "poster" ? "confirm the work was done" : "confirm the job is complete";
  const body = wrap("Completion Confirmation Needed",
    heading("Action Required: Confirm Job Completion") +
    para(`Hi ${recipientName}, ${from} has marked <strong>${jobTitle}</strong> as complete.`) +
    para(`Please open the job and ${action} so payment can be released.`) +
    btn(`${APP_URL}/jobs/${jobId}`, "Confirm Completion")
  );
  await send(to, `Please confirm completion of "${jobTitle}"`, body);
}

// ─── JOB CANCELLED ──────────────────────────────────────────────────────────

export async function sendJobCancelledToWorkerEmail(to: string, workerName: string, jobTitle: string, compensation: number | null) {
  const body = wrap("Job Cancelled",
    heading("Job Cancelled by Poster") +
    para(`Hi ${workerName}, the poster has cancelled <strong>${jobTitle}</strong>.`) +
    (compensation
      ? para(`Because you were already on your way, you will receive a <strong>${fmt(compensation)}</strong> cancellation compensation in your wallet within 24 hours.`)
      : para("No escrow had been held yet, so there is nothing to refund.")) +
    btn(`${APP_URL}/jobs`, "Browse More Jobs")
  );
  await send(to, `Job "${jobTitle}" was cancelled`, body);
}

// ─── NO-SHOW ────────────────────────────────────────────────────────────────

export async function sendNoShowWarningEmail(to: string, workerName: string, jobTitle: string, remainingChances: number, suspended: boolean) {
  const body = wrap(suspended ? "Account Suspended" : "No-Show Warning",
    heading(suspended ? "Your Account Has Been Suspended" : `No-Show Warning ⚠️`) +
    para(`Hi ${workerName}, the poster of <strong>${jobTitle}</strong> reported that you didn't show up.`) +
    (suspended
      ? para("You have reached 3 no-show reports. Your account is now suspended from accepting jobs. Please contact support to resolve this.")
      : para(`You have <strong>${remainingChances} chance${remainingChances === 1 ? "" : "s"}</strong> remaining before your account is suspended.`)) +
    btn(`${APP_URL}/support`, "Contact Support")
  );
  await send(to, suspended ? "Your ABIB JOBS account has been suspended" : `No-show warning for "${jobTitle}"`, body);
}

// ─── PASSWORD RESET (in-app display, but also send email if possible) ───────

export async function sendPasswordResetReadyEmail(to: string, firstName: string, resetToken: string) {
  await sendPasswordResetEmail(to, firstName, resetToken);
}

// ─── WALLET ─────────────────────────────────────────────────────────────────

export async function sendWalletDepositEmail(to: string, name: string, amount: number, newBalance: number) {
  const body = wrap("Wallet Funded",
    heading("Wallet Funded Successfully! 💳") +
    para(`Hi ${name}, your ABIB JOBS wallet has been topped up.`) +
    table(
      infoBox("Amount Added", fmt(amount)),
      infoBox("New Balance", fmt(newBalance)),
    ) +
    btn(`${APP_URL}/wallet`, "View Wallet")
  );
  await send(to, `Your wallet was topped up by ${fmt(amount)}`, body);
}

export async function sendWithdrawalEmail(to: string, name: string, amount: number) {
  const body = wrap("Withdrawal Requested",
    heading("Withdrawal Request Received") +
    para(`Hi ${name}, your withdrawal request of <strong>${fmt(amount)}</strong> has been received and is being processed.`) +
    para("Funds are typically sent to your bank account within 1-2 business days.") +
    btn(`${APP_URL}/wallet`, "View Wallet")
  );
  await send(to, `Withdrawal of ${fmt(amount)} requested`, body);
}

export async function sendWithdrawalVerificationCodeEmail(to: string, name: string, code: string, amount: number, bankName: string, accountNumber: string) {
  const codeBox = `<div style="margin:24px 0;text-align:center;">
    <div style="display:inline-block;background:#f0fdf4;border:2px dashed #16a34a;border-radius:12px;padding:18px 36px;">
      <span style="color:#166534;font-size:34px;font-weight:800;letter-spacing:10px;font-family:'Courier New',monospace;">${code}</span>
    </div>
  </div>`;
  const body = wrap("Verify Your Withdrawal",
    heading("Verify Your Withdrawal") +
    para(`Hi ${name}, you requested a withdrawal of <strong>${fmt(amount)}</strong> to a new bank account. For your security, this request must be verified before it can be approved.`) +
    table(
      infoBox("Bank", bankName),
      infoBox("Account Number", accountNumber),
      infoBox("Amount", fmt(amount)),
    ) +
    para("Your verification code is:") +
    codeBox +
    para("Share this code with our support team <strong>only</strong> when you are confirming this withdrawal. They will enter it to approve your request.") +
    `<p style="color:#b91c1c;font-size:13px;margin-top:16px;">If you did NOT request this withdrawal, do not share this code with anyone and contact support immediately.</p>`
  );
  await send(to, `Your ABIB JOBS withdrawal verification code: ${code}`, body);
}
