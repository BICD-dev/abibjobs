import { db } from "../../server/db.js";
import { adminUsers } from "@shared/schema";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";

const [email, password, name] = process.argv.slice(2);
if (!email || !password) {
  console.error("usage: create-admin.mjs <email> <password> [name]");
  process.exit(1);
}

const existing = await db.select().from(adminUsers).where(eq(adminUsers.email, email));
if (existing.length > 0) {
  console.error("admin already exists with that email");
  process.exit(1);
}

const passwordHash = await bcrypt.hash(password, 10);
const [admin] = await db
  .insert(adminUsers)
  .values({ email, passwordHash, name: name || "Smoke Admin", role: "staff", isActive: true })
  .returning();
console.log(JSON.stringify({ id: admin.id, email: admin.email, role: admin.role }));
process.exit(0);