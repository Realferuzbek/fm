import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cookieGet: vi.fn(), cookieSet: vi.fn(), findSession: vi.fn(), findToken: vi.fn(),
  current: vi.fn(), save: vi.fn(), events: vi.fn(), dispatch: vi.fn(),
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: mocks.cookieGet, set: mocks.cookieSet }) }));
vi.mock("@/lib/server/invites", () => ({ findActiveInviteFromSession: mocks.findSession, findActiveInviteByToken: mocks.findToken }));
vi.mock("@/lib/server/reservations", () => ({ getCurrentReservation: mocks.current, saveReservation: mocks.save }));
vi.mock("@/lib/server/events", () => ({ persistEvents: mocks.events }));
vi.mock("@/lib/server/dispatch", () => ({ dispatchNotification: mocks.dispatch }));

import { POST as eventsPost } from "@/app/api/events/route";
import { GET as reservationGet, POST as reservationPost } from "@/app/api/reservation/route";
import { GET as sessionGet } from "@/app/api/invitation/session/route";
import { POST as resolvePost } from "@/app/api/invitation/resolve/route";

const inviteId = "00000000-0000-4000-8000-000000000001";
const reservation = { id: randomUUID(), date: "2099-08-19", time: "19:30", food: "osh", location: "LRC", version: 1 };
const input = () => ({ inviteId, requestId: randomUUID(), expectedVersion: 0, date: reservation.date, time: reservation.time, food: reservation.food, location: reservation.location });
function request(path: string, body: unknown, origin = "https://example.com") {
  return new Request(`https://example.com/api/${path}`, { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body) });
}
function batch(mode = "public") {
  return { mode, ...(mode === "private" ? { inviteId } : {}), sessionId: randomUUID(), events: [{ eventId: randomUUID(), name: "visit_started", occurredAt: new Date().toISOString() }] };
}

describe("API authentication and delivery boundaries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("APP_ORIGIN", "https://example.com");
    vi.stubEnv("DATABASE_URL", "test-db-never-contacted");
    vi.stubEnv("INVITE_TOKEN_PEPPER", "a".repeat(64));
    vi.stubEnv("INVITE_SESSION_SECRET", "b".repeat(64));
    mocks.findSession.mockResolvedValue({ id: inviteId });
    mocks.findToken.mockResolvedValue({ id: inviteId });
    mocks.current.mockResolvedValue(reservation);
    mocks.cookieGet.mockReturnValue({ value: "private-cookie" });
    mocks.events.mockResolvedValue(null);
    mocks.dispatch.mockResolvedValue("pending");
    mocks.save.mockResolvedValue({ status: "created", reservation, notificationId: "notification-id", notificationStatus: "pending" });
  });
  afterEach(() => vi.unstubAllEnvs());

  it("attributes demo events to public despite a private cookie and never dispatches Telegram", async () => {
    const payload = batch();
    expect((await eventsPost(request("events", payload))).status).toBe(204);
    expect(mocks.events).toHaveBeenCalledWith(payload, null);
    expect(mocks.findSession).not.toHaveBeenCalled();
    expect(mocks.dispatch).not.toHaveBeenCalled();
  });

  it("accepts clean demo operation without configured persistence", async () => {
    vi.stubEnv("DATABASE_URL", "");
    const response = await eventsPost(request("events", batch()));
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ accepted: false, disabled: true });
    expect(mocks.events).not.toHaveBeenCalled();
  });

  it("rejects forged private requests before persistence or notifications", async () => {
    mocks.findSession.mockResolvedValue(null);
    expect((await eventsPost(request("events", batch("private")))).status).toBe(403);
    expect((await reservationPost(request("reservation", input()))).status).toBe(403);
    expect(mocks.events).not.toHaveBeenCalled();
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.dispatch).not.toHaveBeenCalled();
  });

  it("dispatches a private-open notice only after its authenticated event persistence", async () => {
    mocks.events.mockResolvedValue("open-notification");
    const payload = batch("private");
    expect((await eventsPost(request("events", payload))).status).toBe(204);
    expect(mocks.events).toHaveBeenCalledWith(payload, inviteId);
    expect(mocks.dispatch).toHaveBeenCalledWith("open-notification");
    expect(mocks.events.mock.invocationCallOrder[0]).toBeLessThan(mocks.dispatch.mock.invocationCallOrder[0]);
  });

  it.each(["reservation", "events"])("rejects a cross-tab cookie change for %s before persistence or dispatch", async path => {
    mocks.findSession.mockResolvedValue({ id: "00000000-0000-4000-8000-000000000002" });
    const handler = path === "reservation" ? reservationPost : eventsPost;
    const payload = path === "reservation" ? input() : batch("private");
    const response = await handler(request(path, payload));
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "invitation_session_changed" });
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.events).not.toHaveBeenCalled();
    expect(mocks.dispatch).not.toHaveBeenCalled();
  });

  it("rejects a reservation read bound to another invite before loading any snapshot", async () => {
    const otherInviteId = "00000000-0000-4000-8000-000000000002";
    mocks.current.mockResolvedValue({ ...reservation, id: randomUUID(), time: "21:00" });

    const response = await reservationGet(new Request(
      `https://example.com/api/reservation?inviteId=${otherInviteId}`,
    ));

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "invitation_session_changed" });
    expect(mocks.current).not.toHaveBeenCalled();
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.events).not.toHaveBeenCalled();
    expect(mocks.dispatch).not.toHaveBeenCalled();
  });

  it("requires an explicit invite binding for reservation reads", async () => {
    const response = await reservationGet(new Request("https://example.com/api/reservation"));

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "invitation_session_changed" });
    expect(mocks.current).not.toHaveBeenCalled();
  });

  it("rejects private payloads without binding and public payloads with a private binding", async () => {
    const { inviteId: omittedId, ...unbound } = input();
    expect(omittedId).toBe(inviteId);
    expect((await reservationPost(request("reservation", unbound))).status).toBe(422);
    expect((await eventsPost(request("events", { ...batch(), mode: "private" }))).status).toBe(422);
    expect((await eventsPost(request("events", { ...batch(), inviteId }))).status).toBe(422);
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.events).not.toHaveBeenCalled();
    expect(mocks.dispatch).not.toHaveBeenCalled();
  });

  it("persists a reservation before initiating notification and returns its snapshot", async () => {
    const response = await reservationPost(request("reservation", input()));
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ reservation, changed: true, notificationStatus: "pending" });
    expect(mocks.save.mock.invocationCallOrder[0]).toBeLessThan(mocks.dispatch.mock.invocationCallOrder[0]);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it.each(["conflict", "invalid", "forbidden"])("does not notify for %s writes", async (status) => {
    mocks.save.mockResolvedValue({ status, reservation });
    const response = await reservationPost(request("reservation", input()));
    expect(response.status).toBe(({ conflict: 409, invalid: 422, forbidden: 403 })[status]);
    expect(mocks.dispatch).not.toHaveBeenCalled();
    if (status === "conflict") expect((await response.json()).reservation).toEqual(reservation);
  });

  it("does not notify failed writes or duplicate completed writes", async () => {
    mocks.save.mockRejectedValueOnce(new Error("secret database URL"));
    const failed = await reservationPost(request("reservation", input()));
    expect(failed.status).toBe(500);
    expect(JSON.stringify(await failed.json())).not.toContain("secret");
    mocks.save.mockResolvedValue({ status: "replayed", reservation, notificationId: "id", notificationStatus: "sent" });
    expect((await reservationPost(request("reservation", input()))).status).toBe(200);
    expect(mocks.dispatch).not.toHaveBeenCalled();
  });

  it("blocks foreign origins and client-only private flags", async () => {
    expect((await reservationPost(request("reservation", input(), "https://evil.example"))).status).toBe(403);
    expect((await reservationPost(request("reservation", { ...input(), private: true }))).status).toBe(422);
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("resolves the token to an HttpOnly cookie and restores the same current reservation", async () => {
    const response = await resolvePost(request("invitation/resolve", { token: "a".repeat(43) }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ inviteId, reservation });
    expect(mocks.cookieSet).toHaveBeenCalledWith("date_invite_session", expect.any(String), expect.objectContaining({ httpOnly: true, sameSite: "strict", maxAge: 2678400 }));
    expect(await (await sessionGet()).json()).toEqual({ inviteId, reservation });
    const read = await reservationGet(new Request(
      `https://example.com/api/reservation?inviteId=${inviteId}`,
    ));
    expect(read.status).toBe(200);
    expect(await read.json()).toEqual({ reservation });
    expect(mocks.current).toHaveBeenLastCalledWith(inviteId);
    expect(mocks.dispatch).not.toHaveBeenCalled();
  });

  it("returns a null session for unauthenticated context without silently authenticating demo", async () => {
    mocks.findSession.mockResolvedValue(null);
    expect(await (await sessionGet()).json()).toEqual({ inviteId: null, reservation: null });
  });
});
