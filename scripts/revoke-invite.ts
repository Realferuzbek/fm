import { revokePrivateInvite, extractInviteToken } from "../src/lib/server/invites";
import { getDb } from "../src/lib/db";
import { invites } from "../src/lib/db/schema";
import { eq } from "drizzle-orm";

async function run() {
  const arg = process.argv[2];
  if (!arg) {
    console.error("Please provide an invite UUID, full URL, or raw token to revoke.");
    process.exit(1);
  }

  const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  
  if (UUID_PATTERN.test(arg)) {
    const db = getDb();
    const [revoked] = await db
      .update(invites)
      .set({ status: "revoked", revokedAt: new Date() })
      .where(eq(invites.id, arg))
      .returning({ id: invites.id });
      
    if (revoked) {
      console.log(`Revoked invite with ID: ${revoked.id}`);
    } else {
      console.error("Failed to revoke: invite not found or already revoked.");
      process.exit(1);
    }
  } else {
    const token = extractInviteToken(arg);
    if (!token) {
      console.error("Invalid token format.");
      process.exit(1);
    }
    
    const revoked = await revokePrivateInvite(token);
    if (revoked) {
      console.log("Revoked invite successfully by token.");
    } else {
      console.error("Failed to revoke: invite not found or already revoked.");
      process.exit(1);
    }
  }
}

run();
