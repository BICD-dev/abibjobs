import * as client from "openid-client";
import { Strategy, type VerifyFunction } from "openid-client/passport";

import passport from "passport";
import type { Express } from "express";
import memoize from "memoizee";
import { authStorage } from "./storage";

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

async function upsertUser(claims: any) {
  await authStorage.upsertUser({
    // Namespace Google subjects so they can't collide with Replit or manual user ids.
    id: `google-${claims["sub"]}`,
    email: claims["email"],
    firstName: claims["given_name"],
    lastName: claims["family_name"],
    profileImageUrl: claims["picture"],
    authMethod: "google",
  });
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
    const user = {};
    updateUserSession(user, tokens);
    await upsertUser(tokens.claims());
    verified(null, user);
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
