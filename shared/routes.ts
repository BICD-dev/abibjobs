import { z } from 'zod';
import { createJobSchema, createOfferSchema, jobs, profiles, platformEarnings, platformTransactions, offers, disputes, disputeMessages, notifications, jobPostingFees, negotiationFeeAdjustments, suspensionAppeals } from './schema';

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
    createWithFee: {
      method: 'POST' as const,
      path: '/api/jobs/create-with-fee' as const,
      input: createJobSchema,
      responses: {
        200: z.object({
          jobId: z.number(),
          fee: z.number(),
          authorizationUrl: z.string(),
          reference: z.string(),
        }),
        400: errorSchemas.validation,
        401: errorSchemas.unauthorized,
      },
    },
    verifyPayment: {
      method: 'POST' as const,
      path: '/api/jobs/verify-payment/:jobId' as const,
      responses: {
        200: z.object({ success: z.boolean(), job: z.any() }),
        400: errorSchemas.validation,
      },
    },
    cancel: {
      method: 'POST' as const,
      path: '/api/jobs/:id/cancel' as const,
      responses: {
        200: z.object({
          job: z.any(),
          message: z.string(),
          escalated: z.boolean().optional(),
        }),
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
  transactions: {
    history: {
      method: 'GET' as const,
      path: '/api/transactions/history' as const,
      responses: {
        200: z.object({
          transactions: z.array(
            z.object({
              id: z.number(),
              type: z.string(),
              amount: z.string(),
              jobId: z.number().nullable(),
              jobTitle: z.string().nullable(),
              previousAmount: z.string().nullable(),
              newAmount: z.string().nullable(),
              status: z.string(),
              createdAt: z.string().nullable(),
            }),
          ),
        }),
      },
    },
    fees: {
      method: 'GET' as const,
      path: '/api/admin/fees' as const,
      responses: {
        200: z.object({
          totalFees: z.string(),
          postingFees: z.array(z.custom<typeof jobPostingFees.$inferSelect>()),
          adjustments: z.array(z.custom<typeof negotiationFeeAdjustments.$inferSelect>()),
        }),
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
        200: z.object({
          offer: z.any(),
          job: z.any(),
          requiresPayment: z.boolean().optional(),
          authorizationUrl: z.string().optional(),
          additionalFee: z.number().optional(),
        }),
        400: errorSchemas.validation,
        401: errorSchemas.unauthorized,
      },
    },
    acceptWithPaymentVerify: {
      method: 'POST' as const,
      path: '/api/offers/accept/:negotiationId/verify' as const,
      responses: {
        200: z.object({ offer: z.any(), job: z.any() }),
        400: errorSchemas.validation,
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
        resolution: z.enum(['poster_favored', 'worker_favored', 'mutual_agreement']),
        note: z.string().optional(),
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
    users: {
      method: 'GET' as const,
      path: '/api/admin/users' as const,
      responses: {
        200: z.array(z.any()),
      },
    },
    suspendUser: {
      method: 'POST' as const,
      path: '/api/admin/users/:userId/suspend' as const,
      input: z.object({
        reason: z.string().min(1),
        duration: z.string().optional(),
      }),
      responses: {
        200: z.object({
          success: z.boolean(),
          cancelledJobs: z.number(),
        }),
      },
    },
    unsuspendUser: {
      method: 'POST' as const,
      path: '/api/admin/users/:userId/unsuspend' as const,
      responses: {
        200: z.object({ success: z.boolean() }),
      },
    },
    banUser: {
      method: 'POST' as const,
      path: '/api/admin/users/:userId/ban' as const,
      input: z.object({
        reason: z.string().min(1),
      }),
      responses: {
        200: z.object({
          success: z.boolean(),
          cancelledJobs: z.number(),
        }),
      },
    },
    unbanUser: {
      method: 'POST' as const,
      path: '/api/admin/users/:userId/unban' as const,
      responses: {
        200: z.object({ success: z.boolean() }),
      },
    },
    appeals: {
      method: 'GET' as const,
      path: '/api/admin/appeals' as const,
      responses: {
        200: z.array(z.any()),
      },
    },
    reviewAppeal: {
      method: 'POST' as const,
      path: '/api/admin/appeals/:id/review' as const,
      input: z.object({
        decision: z.enum(['approved', 'denied']),
        note: z.string().optional(),
      }),
      responses: {
        200: z.object({ success: z.boolean() }),
      },
    },
  },
  appeals: {
    create: {
      method: 'POST' as const,
      path: '/api/appeals' as const,
      input: z.object({
        reason: z.string().min(10),
      }),
      responses: {
        200: z.object({ success: z.boolean(), message: z.string() }),
        400: errorSchemas.validation,
      },
    },
    my: {
      method: 'GET' as const,
      path: '/api/appeals/my' as const,
      responses: {
        200: z.array(z.custom<typeof suspensionAppeals.$inferSelect>()),
      },
    },
  },
  negotiationFees: {
    verify: {
      method: 'POST' as const,
      path: '/api/offers/accept/:negotiationId/verify' as const,
      responses: {
        200: z.object({ offer: z.any(), job: z.any() }),
        400: errorSchemas.validation,
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
