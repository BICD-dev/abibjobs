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
          transactions: z.array(z.custom<typeof transactions.$inferSelect>()),
        }),
      },
    },
    deposit: {
      method: 'POST' as const,
      path: '/api/wallet/deposit' as const,
      input: z.object({
        amount: z.number().min(1),
        bankCode: z.string().min(1),
        bankName: z.string().min(1),
        accountNumber: z.string().length(10),
        accountName: z.string().optional(),
      }),
      responses: {
        200: z.object({ newBalance: z.string() }),
      },
    },
    withdraw: {
      method: 'POST' as const,
      path: '/api/wallet/withdraw' as const,
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
