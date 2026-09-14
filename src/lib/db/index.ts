import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

import * as schema from "@/lib/db/schema";

/**
 * Lazily constructs the HTTP database client so importing route modules does
 * not require production secrets during static analysis or a frontend build.
 */
export function getDb() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL is required for private invitations and analytics.");
  }

  return drizzle({ client: neon(connectionString), schema });
}

export type Database = ReturnType<typeof getDb>;
