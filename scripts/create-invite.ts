import { createPrivateInvite } from "../src/lib/server/invites";

async function run() {
  const origin = process.env.APP_ORIGIN;
  if (!origin) {
    console.warn("APP_ORIGIN is not set, generating invite token anyway.");
  }

  try {
    const invite = await createPrivateInvite();
    const baseUrl = origin || "http://localhost:3000";
    console.log("Invite created successfully!");
    console.log(`Invite ID (save to revoke): ${invite.id}`);
    console.log(`Invite URL: ${baseUrl}/#invite=${invite.token}`);
  } catch (err) {
    console.error("Failed to create invite:", err);
    process.exit(1);
  }
}

run();
