import { fail } from "./environment";
import { deliverNotification } from "../src/lib/server/notifications";

async function run() {
  const id = process.argv[2];
  if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return fail("Usage: npm run notifications:retry -- NOTIFICATION_UUID");
  }
  // Claiming is atomic; concurrent invocations cannot duplicate a retry.
  const result = await deliverNotification(id, { retryFailed: true });
  if (result === "not_claimed") return fail("Not retried. Only a definitively failed notification for an active invitation is eligible. Unknown/sending/sent/pending deliveries cannot be retried by this command.");
  console.log(`Notification ${id}: ${result}.`);
  if (result !== "sent") process.exitCode = 1;
}
run().catch(() => fail("Could not record the delivery outcome. Inspect the ledger; do not resend uncertain deliveries."));
