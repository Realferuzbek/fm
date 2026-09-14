import { lt, eq, inArray } from "drizzle-orm";
import { getDb } from "../src/lib/db";
import { events, reservations, invites } from "../src/lib/db/schema";

async function run() {
  const db = getDb();
  
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const deletedEvents = await db
      .delete(events)
      .where(lt(events.receivedAt, thirtyDaysAgo))
      .returning({ id: events.id });
      
    console.log(`Deleted ${deletedEvents.length} old events.`);

    const revokedInvites = await db
      .select({ id: invites.id })
      .from(invites)
      .where(eq(invites.status, "revoked"));
      
    if (revokedInvites.length > 0) {
      const revokedIds = revokedInvites.map(i => i.id);
      const deletedReservations = await db
        .delete(reservations)
        .where(inArray(reservations.inviteId, revokedIds))
        .returning({ id: reservations.id });
        
      console.log(`Deleted ${deletedReservations.length} reservations for revoked invites.`);
    } else {
      console.log("No reservations for revoked invites to delete.");
    }
  } catch (err) {
    console.error("Purge failed:", err);
    process.exit(1);
  }
}

run();
