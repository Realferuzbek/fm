import { fail } from "./environment";
import { extractInviteToken, revokePrivateInvite } from "../src/lib/server/invites";
import { executeSql } from "../src/lib/db";

async function run() {
  const argument = process.argv[2];
  if (!argument) return fail("Usage: npm run invite:revoke -- INVITE_ID_OR_PRIVATE_LINK");
  let revoked = false;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(argument)) {
    const rows = await executeSql("UPDATE invites SET status='revoked',revoked_at=now() WHERE id=$1 AND status='active' RETURNING id", [argument]);
    revoked = rows.length > 0;
  } else {
    const token = extractInviteToken(argument);
    if (!token) return fail("Invalid invitation ID or link.");
    revoked = await revokePrivateInvite(token);
  }
  if (!revoked) return fail("No active invitation matched.");
  console.log("Invitation revoked. Booking history is preserved.");
}
run().catch(() => fail("Revocation failed. Check server environment and database availability."));
