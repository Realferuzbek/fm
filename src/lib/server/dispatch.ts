import "server-only";
import { after } from "next/server";
import { deliverNotification } from "./notifications";

/** Call only after the booking or milestone transaction has committed. */
export async function dispatchNotification(id: string) {
  const deliver = async () => {
    try { return await deliverNotification(id); }
    catch {
      // No credential-bearing errors or request URLs enter logs.
      console.error("Notification delivery could not be completed; inspect the delivery ledger.");
      return "unknown" as const;
    }
  };
  if (process.env.TELEGRAM_DELIVERY_MODE === "direct") return deliver();
  after(async () => { await deliver(); });
  return "pending" as const;
}
