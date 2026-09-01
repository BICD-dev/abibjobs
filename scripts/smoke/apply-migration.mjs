import fs from "node:fs";
import pg from "pg";

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const file = process.argv[2];
if (!file) {
  console.error("usage: node apply-migration.mjs <sql-file>");
  process.exit(1);
}

const statements = fs
  .readFileSync(file, "utf8")
  .split("--> statement-breakpoint")
  .map((s) => s.trim())
  .filter(Boolean);

for (const stmt of statements) {
  try {
    const res = await pool.query(stmt);
    console.log(`OK  (${res.rowCount ?? 0} rows): ${stmt.split("\n")[0].slice(0, 90)}`);
  } catch (err) {
    console.error(`FAIL: ${err.message}`);
    process.exit(1);
  }
}

await pool.end();
console.log("done");