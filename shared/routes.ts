import { z } from 'zod';
import { createJobSchema, jobs, profiles, transactions } from './schema';

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
      input: z.object({ amount: z.number().min(1) }),
      responses: {
        200: z.object({ newBalance: z.string() }),
      },
    },
    withdraw: {
      method: 'POST' as const,
      path: '/api/wallet/withdraw' as const,
      input: z.object({ amount: z.number().min(1) }),
      responses: {
        200: z.object({ newBalance: z.string() }),
        400: errorSchemas.payment, // Insufficient funds
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
