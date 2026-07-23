import { z } from 'zod';
import { createJobSchema, createOfferSchema, jobs, profiles, transactions, platformEarnings, platformTransactions, offers, disputes, disputeMessages, notifications } from './schema';

export const errorSchemas = {
  validation: z.object({
    message: z.string(),
    field: z.string().optional(),
  }),
  notFound: z.object({
    message: z.string(),
  }),
  internal: z.object({
    message: z.string(),
  }),
  unauthorized: z.object({
    message: z.string(),
  }),
  payment: z.object({
    message: z.string(),
  }),
};

export const api = {
  jobs: {
    list: {
      method: 'GET' as const,
      path: '/api/jobs' as const,
      input: z.object({
        category: z.string().optional(),
        search: z.string().optional(),
        status: z.enum(['open', 'in_progress', 'completed', 'cancelled']).optional(),
      }).optional(),
      responses: {
        200: z.array(z.any()), // Returns JobWithDetails[]
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/jobs/:id' as const,
      responses: {
        200: z.custom<typeof jobs.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/jobs' as const,
      input: createJobSchema,
      responses: {
        201: z.custom<typeof jobs.$inferSelect>(),
        400: errorSchemas.validation,
        401: errorSchemas.unauthorized,
      },
    },
    accept: {
      method: 'POST' as const,
      path: '/api/jobs/:id/accept' as const,
      responses: {
        200: z.custom<typeof jobs.$inferSelect>(),
        400: errorSchemas.validation, // e.g. already taken
        401: errorSchemas.unauthorized,
      },
    },
    complete: {
      method: 'POST' as const,
      path: '/api/jobs/:id/complete' as const,
      responses: {
        200: z.custom<typeof jobs.$inferSelect>(),
        400: errorSchemas.validation,
        401: errorSchemas.unauthorized,
      },
    },
    cancel: {
      method: 'POST' as const,
      path: '/api/jobs/:id/cancel' as const,
      responses: {
        200: z.custom<typeof jobs.$inferSelect>(),
        400: errorSchemas.validation,
        401: errorSchemas.unauthorized,
      },
    },
    updateProgress: {
      method: 'POST' as const,
      path: '/api/jobs/:id/progress' as const,
      input: z.object({
        progress: z.enum(['getting_ready', 'on_the_way', 'at_location']),
      }),
      responses: {
        200: z.custom<typeof jobs.$inferSelect>(),
        400: errorSchemas.validation,
        401: errorSchemas.unauthorized,
      },
    },
    confirmArrival: {
      method: 'POST' as const,
      path: '/api/jobs/:id/confirm-arrival' as const,
      responses: {
        200: z.custom<typeof jobs.$inferSelect>(),
        400: errorSchemas.validation,
        401: errorSchemas.unauthorized,
      },
    },
    myJobs: {
      method: 'GET' as const,
      path: '/api/jobs/my-jobs' as const,
      responses: {
        200: z.array(z.any()),
      },
    },
    history: {
      method: 'GET' as const,
      path: '/api/jobs/history' as const,
      input: z.object({
        role: z.enum(['posted', 'accepted']).optional(),
      }).optional(),
      responses: {
        200: z.array(z.any()),
      },
    },
    noShow: {
      method: 'POST' as const,
      path: '/api/jobs/:id/no-show' as const,
      responses: {
        200: z.object({ message: z.string() }),
        400: errorSchemas.validation,
        401: errorSchemas.unauthorized,
      },
    },
  },
  notifications: {
    list: {
      method: 'GET' as const,
      path: '/api/notifications' as const,
      responses: {
        200: z.array(z.custom<typeof notifications.$inferSelect>()),
      },
    },
    unreadCount: {
      method: 'GET' as const,
      path: '/api/notifications/unread-count' as const,
      responses: {
        200: z.object({ count: z.number() }),
      },
    },
    markRead: {
      method: 'POST' as const,
      path: '/api/notifications/:id/read' as const,
      responses: {
        200: z.object({ message: z.string() }),
      },
    },
    markAllRead: {
      method: 'POST' as const,
      path: '/api/notifications/read-all' as const,
      responses: {
        200: z.object({ message: z.string() }),
      },
    },
  },
  profile: {
    get: {
      method: 'GET' as const,
      path: '/api/profile/me' as const,
      responses: {
        200: z.custom<typeof profiles.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    update: {
      method: 'PATCH' as const,
      path: '/api/profile/me' as const,
      input: z.object({
        bio: z.string().optional(),
        phoneNumber: z.string().optional(),
        location: z.string().optional(),
        idCardUrl: z.string().optional(),
      }),
      responses: {
        200: z.custom<typeof profiles.$inferSelect>(),
      },
    },
  },
  wallet: {
  get: {
    method: 'GET' as const,
    path: '/api/wallet' as const,
    responses: {
      200: z.object({
        balance: z.string(),
        heldBalance: z.string(),
        transactions: z.array(z.custom<typeof transactions.$inferSelect>()),
      }),
    },
  },
  /**
   * Breakdown of funds currently held in escrow for the user's own pending jobs.
   */
  heldJobs: {
    method: 'GET' as const,
    path: '/api/wallet/held-jobs' as const,
    responses: {
      200: z.object({
        jobs: z.array(
          z.object({
            jobId: z.number(),
            jobTitle: z.string(),
            amount: z.string(),
            createdAt: z.string(),
          }),
        ),
      }),
    },
  },
  /**
   * Initialize a Paystack transaction.
   * Returns the hosted checkout URL.
   */
  initializeFunding: {
    method: 'POST' as const,
    path: '/api/wallet/fund/initialize' as const,
    input: z.object({
      amount: z.number().min(100),
    }),
    responses: {
      200: z.object({
        checkoutUrl: z.string().url(),
        reference: z.string(),
      }),
      400: errorSchemas.payment,
    },
  },

  /**
   * Called by the frontend after Paystack redirects back.
   * Used to determine the final state of the payment.
   * Does NOT credit the wallet.
   */
  verifyFunding: {
    method: 'GET' as const,
    path: '/api/wallet/fund/verify/:reference' as const,
    input: z.object({
      reference: z.string(),
    }),
    responses: {
      200: z.object({
        status: z.enum([
          'pending',
          'success',
          'failed',
        ]),
        message: z.string(),
        amount: z.string(),
      }),
      400: errorSchemas.payment,
    },
  },

  /**
   * Withdraw from wallet.
   * The backend should initiate a Paystack transfer.
   */
  withdraw: {
    method: 'POST' as const,
    path: '/api/wallet/withdraw' as const,
    input: z.object({
      amount: z.number().min(100),
      bankCode: z.string(),
      accountNumber: z.string().length(10),
      accountName: z.string().optional(),
    }),
    responses: {
      200: z.object({
        reference: z.string(),
        status: z.enum([
          'pending',
          'success',
        ]),
        message: z.string(),
      }),
      400: errorSchemas.payment,
    },
  },

  /**
   * Returns saved beneficiary accounts for withdrawals.
   */
  withdrawalAccounts: {
    method: 'GET' as const,
    path: '/api/wallet/withdrawal-accounts' as const,
    responses: {
      200: z.object({
        accounts: z.array(
          z.object({
            bankCode: z.string(),
            bankName: z.string(),
            accountNumber: z.string(),
            accountName: z.string(),
          }),
        ),
      }),
    },
  },

  /**
   * Fetch available Nigerian banks from Paystack.
   */
  banks: {
    method: 'GET' as const,
    path: '/api/wallet/banks' as const,
    responses: {
      200: z.object({
        banks: z.array(
          z.object({
            name: z.string(),
            code: z.string(),
          }),
        ),
      }),
    },
  },

  /**
   * Resolve account name before withdrawal.
   */
  resolveAccount: {
    method: 'POST' as const,
    path: '/api/wallet/resolve-account' as const,
    input: z.object({
      accountNumber: z.string().length(10),
      bankCode: z.string(),
    }),
    responses: {
      200: z.object({
        accountName: z.string(),
      }),
      400: errorSchemas.payment,
    },
  },
  // deposit money into wallet 
  deposit: {
    method: 'POST' as const,
    path: '/api/wallet/deposit' as const,
    input: z.object({
      amount: z.number().min(100),
      bankCode: z.string(),
      accountNumber: z.string().length(10),
      accountName: z.string().optional(),
      bankName: z.string().optional(),
    }),
    responses: {
      200: z.object({
        reference: z.string(),
        status: z.enum([
          'pending',
          'success',
        ]),
        message: z.string(),
      }),
      400: errorSchemas.payment,
    },
  },
},
  offers: {
    list: {
      method: 'GET' as const,
      path: '/api/jobs/:id/offers' as const,
      responses: {
        200: z.array(z.any()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/jobs/:id/offers' as const,
      input: z.object({
        amount: z.number().min(1),
        message: z.string().optional(),
      }),
      responses: {
        201: z.custom<typeof offers.$inferSelect>(),
        400: errorSchemas.validation,
        401: errorSchemas.unauthorized,
      },
    },
    accept: {
      method: 'POST' as const,
      path: '/api/offers/:id/accept' as const,
      responses: {
        200: z.object({ offer: z.any(), job: z.any(), insufficientFunds: z.boolean().optional(), shortfall: z.number().optional() }),
        400: errorSchemas.validation,
        401: errorSchemas.unauthorized,
      },
    },
    decline: {
      method: 'POST' as const,
      path: '/api/offers/:id/decline' as const,
      responses: {
        200: z.custom<typeof offers.$inferSelect>(),
        400: errorSchemas.validation,
        401: errorSchemas.unauthorized,
      },
    },
    counter: {
      method: 'POST' as const,
      path: '/api/offers/:id/counter' as const,
      input: z.object({
        amount: z.number().min(1),
        message: z.string().optional(),
      }),
      responses: {
        200: z.custom<typeof offers.$inferSelect>(),
        400: errorSchemas.validation,
        401: errorSchemas.unauthorized,
      },
    },
  },
  disputes: {
    create: {
      method: 'POST' as const,
      path: '/api/jobs/:id/dispute' as const,
      input: z.object({
        workerId: z.string().min(1),
        message: z.string().min(1),
      }),
      responses: {
        201: z.any(),
        400: errorSchemas.validation,
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/disputes/:id' as const,
      responses: {
        200: z.any(),
        404: errorSchemas.notFound,
      },
    },
    getByJob: {
      method: 'GET' as const,
      path: '/api/jobs/:id/dispute' as const,
      responses: {
        200: z.any(),
        404: errorSchemas.notFound,
      },
    },
    list: {
      method: 'GET' as const,
      path: '/api/admin/disputes' as const,
      responses: {
        200: z.array(z.any()),
      },
    },
    message: {
      method: 'POST' as const,
      path: '/api/disputes/:id/message' as const,
      input: z.object({
        message: z.string().min(1),
        type: z.enum(['message', 'proposal', 'acceptance']).default('message'),
        amount: z.number().optional(),
        imageUrl: z.string().optional(),
      }),
      responses: {
        201: z.any(),
        400: errorSchemas.validation,
      },
    },
    escalate: {
      method: 'POST' as const,
      path: '/api/disputes/:id/escalate' as const,
      responses: {
        200: z.any(),
      },
    },
    resolve: {
      method: 'POST' as const,
      path: '/api/disputes/:id/resolve' as const,
      input: z.object({
        action: z.enum(['refund_poster', 'release_worker', 'custom']),
        workerAmount: z.number().min(0).optional(),
        posterRefund: z.number().min(0).optional(),
        message: z.string().optional(),
      }),
      responses: {
        200: z.any(),
      },
    },
    acceptProposal: {
      method: 'POST' as const,
      path: '/api/disputes/:id/accept-proposal' as const,
      responses: {
        200: z.any(),
      },
    },
  },
  verification: {
    submit: {
      method: 'POST' as const,
      path: '/api/verification/submit' as const,
      input: z.object({
        idCardUrl: z.string().min(1),
        faceScanUrl: z.string().min(1),
      }),
      responses: {
        200: z.any(),
        400: errorSchemas.validation,
      },
    },
    pending: {
      method: 'GET' as const,
      path: '/api/admin/verifications' as const,
      responses: {
        200: z.array(z.any()),
      },
    },
    review: {
      method: 'POST' as const,
      path: '/api/admin/verifications/:userId/review' as const,
      input: z.object({
        action: z.enum(['approve', 'decline', 'redo']),
        note: z.string().optional(),
      }),
      responses: {
        200: z.any(),
        400: errorSchemas.validation,
      },
    },
  },
  ownerPasscode: {
    setup: {
      method: 'POST' as const,
      path: '/api/owner/passcode/setup' as const,
      input: z.object({ passcode: z.string().length(6) }),
      responses: {
        200: z.object({ message: z.string() }),
        400: errorSchemas.validation,
      },
    },
    verify: {
      method: 'POST' as const,
      path: '/api/owner/passcode/verify' as const,
      input: z.object({ passcode: z.string().length(6) }),
      responses: {
        200: z.object({ valid: z.boolean() }),
      },
    },
    status: {
      method: 'GET' as const,
      path: '/api/owner/passcode/status' as const,
      responses: {
        200: z.object({ hasPasscode: z.boolean(), ownerEmail: z.string() }),
      },
    },
    requestReset: {
      method: 'POST' as const,
      path: '/api/owner/passcode/request-reset' as const,
      responses: {
        200: z.object({ message: z.string() }),
      },
    },
    resetWithToken: {
      method: 'POST' as const,
      path: '/api/owner/passcode/reset' as const,
      input: z.object({
        token: z.string().min(1),
        newPasscode: z.string().length(6),
      }),
      responses: {
        200: z.object({ message: z.string() }),
        400: errorSchemas.validation,
      },
    },
    updateEmail: {
      method: 'POST' as const,
      path: '/api/owner/email' as const,
      input: z.object({
        passcode: z.string().length(6),
        newEmail: z.string().email(),
      }),
      responses: {
        200: z.object({ message: z.string() }),
        400: errorSchemas.validation,
      },
    },
  },
  admin: {
    earnings: {
      method: 'GET' as const,
      path: '/api/admin/earnings' as const,
      responses: {
        200: z.object({
          balance: z.string(),
          bankName: z.string().nullable(),
          bankCode: z.string().nullable(),
          accountNumber: z.string().nullable(),
          accountName: z.string().nullable(),
          transactions: z.array(z.custom<typeof platformTransactions.$inferSelect>()),
        }),
      },
    },
    withdraw: {
      method: 'POST' as const,
      path: '/api/admin/withdraw' as const,
      input: z.object({
        amount: z.number().min(1),
        bankCode: z.string().min(1),
        bankName: z.string().min(1),
        accountNumber: z.string().length(10),
        accountName: z.string().optional(),
      }),
      responses: {
        200: z.object({ newBalance: z.string() }),
        400: errorSchemas.payment,
      },
    },
    updateBank: {
      method: 'POST' as const,
      path: '/api/admin/bank' as const,
      input: z.object({
        bankCode: z.string().min(1),
        bankName: z.string().min(1),
        accountNumber: z.string().length(10),
        accountName: z.string().optional(),
      }),
      responses: {
        200: z.object({ message: z.string() }),
      },
    },
  },
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}
