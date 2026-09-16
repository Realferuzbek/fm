import { fail } from "./environment";
import { executeSql } from "../src/lib/db";

async function run() {
  const rows = await executeSql("DELETE FROM events WHERE received_at < now()-interval '30 days' RETURNING id");
  console.log(`Deleted ${rows.length} events older than 30 days. Booking history and notification deduplication are preserved.`);
}
run().catch(() => fail("Event purge failed. Check server environment and database availability."));
