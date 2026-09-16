import { fail } from "./environment";
import { createPrivateInvite } from "../src/lib/server/invites";

async function run() {
  const origin = process.env.APP_ORIGIN ?? "http://localhost:3000";
  const url = new URL("/invite", origin);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Invalid origin.");
  const invite = await createPrivateInvite();
  url.hash = new URLSearchParams({ invite: invite.token }).toString();
  console.log(`Invite ID (save to revoke): ${invite.id}`);
  console.log(`Private invitation: ${url.toString()}`);
  console.log("Keep this bearer link private. It is shown only here; the database stores its hash.");
}
run().catch(() => fail("Could not create the invitation. Check server environment and database migrations."));
