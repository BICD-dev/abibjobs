import type { Express } from "express";
import { authStorage } from "./storage";
import { isAuthenticated } from "./replitAuth";

function sanitizeUser(user: any) {
  const { passwordHash, passwordResetToken, passwordResetExpiry, ...safe } = user;
  return { ...safe, hasPassword: !!passwordHash };
}

export function registerAuthRoutes(app: Express): void {
  app.get("/api/auth/user", async (req: any, res) => {
    try {
      if (req.session?.manualUserId) {
        const user = await authStorage.getUser(req.session.manualUserId);
        if (user) return res.json(sanitizeUser(user));
        delete req.session.manualUserId;
      }
      if (req.isAuthenticated && req.isAuthenticated()) {
        const userId = req.user?.claims?.sub;
        if (userId) {
          const user = await authStorage.getUser(userId);
          if (user) return res.json(sanitizeUser(user));
        }
      }
      return res.status(401).json({ message: "Unauthorized" });
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });
}
