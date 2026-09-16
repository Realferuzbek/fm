import { fail } from "./environment";
import { neon } from "@neondatabase/serverless";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

async function run() {
  if (!process.env.DATABASE_URL) return fail("DATABASE_URL is required to run migrations.");
  const sql = neon(process.env.DATABASE_URL);
  await sql.query(`CREATE TABLE IF NOT EXISTS invitation_migrations (
    name text PRIMARY KEY, hash text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())`);
  const directory = resolve(process.cwd(), "drizzle");
  for (const name of (await readdir(directory)).filter((item) => /^\d+_.*\.sql$/.test(item)).sort()) {
    const source = await readFile(resolve(directory, name), "utf8");
    const hash = createHash("sha256").update(source).digest("hex");
    const [existing] = await sql.query("SELECT hash FROM invitation_migrations WHERE name=$1", [name]);
    if (existing) {
      if (existing.hash !== hash) throw new Error("An applied migration has changed.");
      continue;
    }
    const statements = source.split("--> statement-breakpoint").map((item) => item.trim()).filter(Boolean);
    await sql.transaction([
      sql.query("SELECT pg_advisory_xact_lock(48201721)"),
      ...statements.map((statement) => sql.query(statement)),
      sql.query("INSERT INTO invitation_migrations(name,hash) VALUES($1,$2) ON CONFLICT(name) DO NOTHING", [name, hash]),
    ]);
    console.log(`Applied ${name}`);
  }
  console.log("Migrations complete. Existing bookings and historical notifications are preserved.");
}
run().catch(() => fail("Migration failed. Check database access and whether an already applied migration was modified."));
