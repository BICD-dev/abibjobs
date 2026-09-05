import rateLimit, { type RateLimitRequestHandler } from "express-rate-limit";

// Express-rate-limit counts requests per IP. NODE_ENV=development (and local
// smoke tests) are exempt so rapid iteration and seeding aren't throttled.
const skip = () => process.env.NODE_ENV === "development";

function limiter(options: { windowMs: number; max: number; message?: string }): RateLimitRequestHandler {
  return rateLimit({
    windowMs: options.windowMs,
    limit: options.max,
    standardHeaders: true,
    legacyHeaders: false,
    skip,
    handler: (_req, res) => {
      res.status(429).json({ message: options.message ?? "Too many requests, please try again later." });
    },
  });
}

// Auth routes — brute-force protection. Very tight window so a single burst of
// failed logins can't hammer the login endpoint.
export const authRateLimit = limiter({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: "Too many authentication attempts. Please wait 15 minutes and try again.",
});

// Account creation / password reset — prevents spam and abuse.
export const accountRateLimit = limiter({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: "Too many account actions. Please wait an hour and try again.",
});

// Admin login — extra strict, since a compromised admin account is high-impact.
export const adminRateLimit = limiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: "Too many admin login attempts. Please wait 15 minutes and try again.",
});

// Generic API protection for mutation-heavy or sensitive endpoints.
export const apiRateLimit = limiter({
  windowMs: 60 * 1000,
  max: 120,
  message: "Too many requests. Please slow down.",
});
