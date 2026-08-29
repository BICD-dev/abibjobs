import { db } from "../../server/db.js";
import { profiles } from "@shared/schema";
import { eq } from "drizzle-orm";

const [userId] = process.argv.slice(2);
if (!userId) {
  console.error("usage: verify-user.mjs <userId>");
  process.exit(1);
}

const [profile] = await db
  .update(profiles)
  .set({ verificationStatus: "verified", isBanned: false, isSuspended: false })
  .where(eq(profiles.userId, userId))
  .returning();
if (!profile) {
  console.error("profile not found for user " + userId);
  process.exit(1);
}
console.log(JSON.stringify({ userId, verificationStatus: profile.verificationStatus }));
process.exit(0);