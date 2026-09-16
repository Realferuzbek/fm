import { fail } from "./environment";
import { executeSql } from "../src/lib/db";

async function run() {
  console.log("Milestones from the past 30 days:");
  console.table(await executeSql(`SELECT mode,name,count(*) AS count FROM events
    WHERE received_at>=now()-interval '30 days' GROUP BY mode,name ORDER BY mode,name`));
  console.log("Recent notification delivery records (sending means outcome may be uncertain):");
  console.table(await executeSql(`SELECT id,kind,status,attempts,last_error,last_attempt_at
    FROM notification_deliveries ORDER BY created_at DESC LIMIT 50`));
}
run().catch(() => fail("Report failed. Check server environment and database availability."));
