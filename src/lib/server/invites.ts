import "server-only";
import { and, eq } from "drizzle-orm";

import { getDb } from "@/lib/db";
import { invites, type Invite } from "@/lib/db/schema";
import {
  generateInviteToken,
  hashInviteToken,
  isValidInviteToken,
  readInviteSession,
  type ApiError
} from "@/lib/server/security";

export async function findActiveInviteByHash(tokenHash: string): Promise<Invite | null> {
  const db = getDb();
  const [invite] = await db
    .select()
    .from(invites)
    .where(and(eq(invites.tokenHash, tokenHash), eq(invites.status, "active")))
    .limit(1);

  return invite ?? null;
}

export async function findActiveInviteByToken(token: string): Promise<Invite | null> {
  if (!isValidInviteToken(token)) return null;
  return findActiveInviteByHash(hashInviteToken(token));
}

export async function findActiveInviteFromSession(cookieValue: string | undefined): Promise<Invite | null> {
  const session = readInviteSession(cookieValue);
  if (!session) return null;

  const db = getDb();
  const [invite] = await db
    .select()
    .from(invites)
    .where(and(eq(invites.id, session.inviteId), eq(invites.status, "active")))
    .limit(1);

  return invite ?? null;
}

export interface CreatedInvite {
  id: string;
  token: string;
}

/** Used exclusively by the server-side CLI, never by a route or browser bundle. */
export async function createPrivateInvite(): Promise<CreatedInvite> {
  const db = getDb();

  // A collision is cryptographically negligible, but retrying makes the
  // uniqueness guarantee explicit instead of relying on probability alone.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const token = generateInviteToken();
    const tokenHash = hashInviteToken(token);

    try {
      const [invite] = await db.insert(invites).values({ tokenHash }).returning({ id: invites.id });
      if (invite) return { id: invite.id, token };
    } catch (error) {
      // Only a token hash collision should be retried; other DB failures must
      // surface rather than silently reporting a link that does not exist.
      const code = (error as { code?: string } | undefined)?.code;
      if (code !== "23505" || attempt === 2) throw error;
    }
  }

  throw new Error("Unable to create a unique invitation token.");
}

export async function revokePrivateInvite(token: string): Promise<boolean> {
  if (!isValidInviteToken(token)) return false;
  const db = getDb();
  const [revoked] = await db
    .update(invites)
    .set({ status: "revoked", revokedAt: new Date() })
    .where(and(eq(invites.tokenHash, hashInviteToken(token)), eq(invites.status, "active")))
    .returning({ id: invites.id });

  return Boolean(revoked);
}

/** Accept either the canonical #invite URL, compatibility query URL, or token. */
export function extractInviteToken(value: string) {
  const trimmed = value.trim();
  if (isValidInviteToken(trimmed)) return trimmed;

  try {
    const url = new URL(trimmed);
    const fragment = new URLSearchParams(url.hash.startsWith("#") ? url.hash.slice(1) : url.hash);
    const token = fragment.get("invite") ?? url.searchParams.get("invite");
    return token && isValidInviteToken(token) ? token : null;
  } catch {
    return null;
  }
}

export function isInvalidInviteError(error: unknown): error is ApiError {
  return Boolean(error && typeof error === "object" && (error as { code?: string }).code === "invalid_invite_token");
}
