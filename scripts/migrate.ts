import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { migrate } from "drizzle-orm/neon-http/migrator";
import { resolve } from "node:path";

async function run() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required to run migrations.");
  }

  const sql = neon(connectionString);
  const db = drizzle(sql);

  console.log("Running migrations...");
  try {
    await migrate(db, { migrationsFolder: resolve(process.cwd(), "drizzle") });
    console.log("Migrations complete.");
  } catch (err) {
    console.error("Migration failed", err);
    process.exit(1);
  }
}

run();
