import * as client from "openid-client";
import { Strategy, type VerifyFunction } from "openid-client/passport";

import passport from "passport";
import type { Express } from "express";
import memoize from "memoizee";
import { authStorage } from "./storage";
import { db } from "../../db";
import { adminUsers } from "@shared/schema";
import { eq } from "drizzle-orm";

const GOOGLE_ISSUER = "https://accounts.google.com";
const GOOGLE_STRATEGY = "google";

const getGoogleConfig = memoize(
  async () => {
    return await client.discovery(
      new URL(GOOGLE_ISSUER),
      process.env.GOOGLE_CLIENT_ID!,
      process.env.GOOGLE_CLIENT_SECRET!
    );
  },
  { maxAge: 3600 * 1000 }
);

function updateUserSession(
  user: any,
  tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers
) {
  user.claims = tokens.claims();
  user.access_token = tokens.access_token;
  user.refresh_token = tokens.refresh_token;
  user.expires_at = user.claims?.exp;
}

let googleConfig: Awaited<ReturnType<typeof getGoogleConfig>> | null = null;

export function isGoogleAuthEnabled() {
  return !!googleConfig;
}

export async function setupGoogleAuth(app: Express) {
  if (
    !process.env.GOOGLE_CLIENT_ID ||
    !process.env.GOOGLE_CLIENT_SECRET ||
    !process.env.GOOGLE_REDIRECT_URI
  ) {
    console.warn("GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI not set — Google login disabled.");
    return;
  }

  try {
    googleConfig = await getGoogleConfig();
    console.log("Google OAuth login enabled.");
  } catch (err) {
    console.warn(
      "Google OIDC discovery failed, disabling Google login.",
      (err as Error).message
    );
    googleConfig = null;
    return;
  }

  const verify: VerifyFunction = async (
    tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers,
    verified: passport.AuthenticateCallback
  ) => {
    try {
      const claims = tokens.claims() as Record<string, any>;
      const email = claims["email"];
      if (email) {
        const [adminUser] = await db.select().from(adminUsers).where(eq(adminUsers.email, email.toLowerCase()));
        if (adminUser) {
          verified(new Error("This email is already associated with an account."));
          return;
        }
      }
      const dbUser = await authStorage.upsertUser({
        id: `google-${claims["sub"]}`,
        email: claims["email"] ?? null,
        firstName: claims["given_name"] ?? null,
        lastName: claims["family_name"] ?? null,
        profileImageUrl: claims["picture"] ?? null,
        authMethod: "google",
      });

      const user: any = {};
      updateUserSession(user, tokens);
      // Use the actual DB user ID — handles both new Google users and
      // existing accounts matched by email (manual or other OAuth).
      user.claims = { ...user.claims, sub: dbUser.id };
      verified(null, user);
    } catch (err) {
      console.error("Google auth verify error:", err);
      verified(err as Error);
    }
  };

  passport.use(
    GOOGLE_STRATEGY,
    new Strategy(
      {
        name: GOOGLE_STRATEGY,
        config: googleConfig,
        scope: "openid email profile",
        callbackURL: process.env.GOOGLE_REDIRECT_URI!,
      },
      verify
    )
  );

  app.get("/auth/google", (req, res, next) => {
    const returnTo = req.query.returnTo as string;
    if (returnTo && req.session) {
      (req.session as any).returnTo = returnTo;
    }
    passport.authenticate(GOOGLE_STRATEGY, {
      prompt: "select_account",
      scope: ["openid", "email", "profile"],
    })(req, res, next);
  });

  app.get("/auth/google/callback", (req, res, next) => {
    const returnTo = (req.session as any)?.returnTo || "/";
    if (req.session) {
      delete (req.session as any).returnTo;
    }
    passport.authenticate(GOOGLE_STRATEGY, (err: any, user: any, info: any) => {
      if (err || !user) {
        const msg = err?.message || "";
        if (msg.includes("already associated")) {
          return res.redirect("/auth?login_error=account_exists");
        }
        console.error("Google auth callback error:", err?.message || info);
        return res.redirect("/auth?login_error=google_failed");
      }
      req.logIn(user, (loginErr) => {
        if (loginErr) {
          console.error("Google login error:", loginErr.message);
          return res.redirect("/auth?login_error=google_failed");
        }
        return res.redirect(returnTo);
      });
    })(req, res, next);
  });
}
