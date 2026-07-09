import * as client from "openid-client";
import { Strategy, type VerifyFunction } from "openid-client/passport";

import passport from "passport";
import session from "express-session";
import type { Express, RequestHandler } from "express";
import memoize from "memoizee";
import connectPg from "connect-pg-simple";
import { authStorage } from "./storage";

const getOidcConfig = memoize(
  async () => {
    return await client.discovery(
      new URL(process.env.ISSUER_URL ?? "https://replit.com/oidc"),
      process.env.REPL_ID!
    );
  },
  { maxAge: 3600 * 1000 }
);

let _sessionMiddleware: ReturnType<typeof session> | null = null;

export function getSession() {
  if (_sessionMiddleware) return _sessionMiddleware;
  const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: false,
    ttl: sessionTtl,
    tableName: "sessions",
  });
  _sessionMiddleware = session({
    secret: process.env.SESSION_SECRET!,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: true,
      maxAge: sessionTtl,
    },
  });
  return _sessionMiddleware;
}

function updateUserSession(
  user: any,
  tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers
) {
  user.claims = tokens.claims();
  user.access_token = tokens.access_token;
  user.refresh_token = tokens.refresh_token;
  user.expires_at = user.claims?.exp;
}

async function upsertUser(claims: any) {
  await authStorage.upsertUser({
    id: claims["sub"],
    email: claims["email"],
    firstName: claims["first_name"],
    lastName: claims["last_name"],
    profileImageUrl: claims["profile_image_url"],
  });
}

// Set to a resolved OIDC config if Replit auth is available, otherwise stays null
// and the app falls back to local (username/password) auth only.
let oidcConfig: Awaited<ReturnType<typeof getOidcConfig>> | null = null;

export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getSession());
  app.use(passport.initialize());
  app.use(passport.session());

  passport.serializeUser((user: Express.User, cb) => cb(null, user));
  passport.deserializeUser((user: Express.User, cb) => cb(null, user));

  if (process.env.REPL_ID) {
    try {
      oidcConfig = await getOidcConfig();
      console.log("Replit OIDC login enabled.");
    } catch (err) {
      console.warn(
        "Replit OIDC discovery failed, disabling Replit login. App will continue with local auth only.",
        (err as Error).message
      );
      oidcConfig = null;
    }
  } else {
    console.warn("REPL_ID not set — Replit OIDC login disabled. Using local auth only.");
  }

  const verify: VerifyFunction = async (
    tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers,
    verified: passport.AuthenticateCallback
  ) => {
    const user = {};
    updateUserSession(user, tokens);
    await upsertUser(tokens.claims());
    verified(null, user);
  };

  const registeredStrategies = new Set<string>();

  const ensureStrategy = (domain: string) => {
    if (!oidcConfig) return;
    const strategyName = `replitauth:${domain}`;
    if (!registeredStrategies.has(strategyName)) {
      const strategy = new Strategy(
        {
          name: strategyName,
          config: oidcConfig,
          scope: "openid email profile offline_access",
          callbackURL: `https://${domain}/api/callback`,
        },
        verify
      );
      passport.use(strategy);
      registeredStrategies.add(strategyName);
    }
  };

  app.get("/api/login", (req, res, next) => {
    if (!oidcConfig) {
      return res.redirect("/auth?login_error=oidc_unavailable");
    }
    const returnTo = req.query.returnTo as string;
    if (returnTo && req.session) {
      (req.session as any).returnTo = returnTo;
    }
    ensureStrategy(req.hostname);
    passport.authenticate(`replitauth:${req.hostname}`, {
      prompt: "login consent",
      scope: ["openid", "email", "profile", "offline_access"],
    })(req, res, next);
  });

  app.get("/api/callback", (req, res, next) => {
    if (!oidcConfig) {
      return res.redirect("/auth?login_error=oidc_unavailable");
    }
    ensureStrategy(req.hostname);
    const returnTo = (req.session as any)?.returnTo || "/";
    if (req.session) {
      delete (req.session as any).returnTo;
    }
    passport.authenticate(`replitauth:${req.hostname}`, (err: any, user: any, info: any) => {
      if (err || !user) {
        console.error("Auth callback error:", err?.message || info);
        return res.redirect("/?login_error=1");
      }
      req.logIn(user, (loginErr) => {
        if (loginErr) {
          console.error("Login error:", loginErr.message);
          return res.redirect("/?login_error=1");
        }
        return res.redirect(returnTo);
      });
    })(req, res, next);
  });

  app.get("/api/logout", (req: any, res) => {
    const hasOidc = req.isAuthenticated && req.isAuthenticated();
    const hasManual = !!req.session?.manualUserId;

    if (hasManual) {
      delete req.session.manualUserId;
    }

    if (hasOidc && oidcConfig) {
      req.logout(() => {
        req.session.destroy(() => {
          res.redirect(
            client.buildEndSessionUrl(oidcConfig!, {
              client_id: process.env.REPL_ID!,
              post_logout_redirect_uri: `${req.protocol}://${req.hostname}/auth`,
            }).href
          );
        });
      });
    } else if (hasOidc) {
      req.logout(() => {
        req.session.destroy(() => {
          res.redirect("/auth");
        });
      });
    } else {
      req.session.destroy(() => {
        res.redirect("/auth");
      });
    }
  });
}

export const isAuthenticated: RequestHandler = async (req: any, res, next) => {
  if (req.session?.manualUserId) {
    if (!req.user) {
      req.user = { claims: { sub: req.session.manualUserId } };
    }
    return next();
  }

  const user = req.user as any;

  if (!req.isAuthenticated || !req.isAuthenticated() || !user?.claims?.sub) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  if (!user.expires_at) {
    return next();
  }

  const now = Math.floor(Date.now() / 1000);
  if (now <= user.expires_at) {
    return next();
  }

  const refreshToken = user.refresh_token;
  if (!refreshToken || !oidcConfig) {
    return next();
  }

  try {
    const tokenResponse = await client.refreshTokenGrant(oidcConfig, refreshToken);
    updateUserSession(user, tokenResponse);
  } catch (error) {
    console.warn("Token refresh failed, continuing with existing session");
  }
  return next();
};
