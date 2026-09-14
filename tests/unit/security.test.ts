import { beforeEach, describe, expect, it } from "vitest";
import {
  generateInviteToken,
  isValidInviteToken,
  hashInviteToken,
  createInviteSession,
  readInviteSession,
} from "@/lib/server/security";
import { extractInviteToken } from "@/lib/server/invites";

describe("security utilities", () => {
  const pepper = "test-pepper-12345678901234567890123456789012345678901234567890123456";
  const sessionSecret = "test-secret-12345678901234567890123456789012345678901234567890123456";

  beforeEach(() => {
    process.env.INVITE_SESSION_SECRET = sessionSecret;
    process.env.INVITE_TOKEN_PEPPER = pepper;
  });

  it("generates valid 43-char base64url invite tokens", () => {
    const token = generateInviteToken();
    expect(token).toHaveLength(43);
    expect(isValidInviteToken(token)).toBe(true);
  });

  it("hashes invite tokens deterministically with HMAC-SHA256", () => {
    const token = "AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-ABCDE";
    const hash1 = hashInviteToken(token, pepper);
    const hash2 = hashInviteToken(token, pepper);

    expect(hash1).toHaveLength(64);
    expect(hash1).toBe(hash2);
  });

  it("creates and verifies signed private session cookies", () => {
    const inviteId = "a0b1c2d3-e4f5-4a6b-8c7d-9e0f1a2b3c4d";
    const sessionCookie = createInviteSession(inviteId, Date.now());

    const session = readInviteSession(sessionCookie);

    expect(session).not.toBeNull();
    expect(session?.inviteId).toBe(inviteId);
    expect(session?.v).toBe(1);
  });

  it("rejects tampered or forged session cookies", () => {
    const inviteId = "a0b1c2d3-e4f5-4a6b-8c7d-9e0f1a2b3c4d";
    const sessionCookie = createInviteSession(inviteId, Date.now());
    const tampered = sessionCookie.slice(0, -4) + "XXXX";

    expect(readInviteSession(tampered)).toBeNull();
    expect(readInviteSession("invalid-cookie")).toBeNull();
  });

  it("extracts invite tokens from URLs and raw tokens", () => {
    const token = "AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-ABCDE";
    expect(extractInviteToken(token)).toBe(token);
    expect(extractInviteToken(`https://example.com/#invite=${token}`)).toBe(token);
    expect(extractInviteToken(`https://example.com/?invite=${token}`)).toBe(token);
    expect(extractInviteToken("https://example.com/")).toBeNull();
  });
});

