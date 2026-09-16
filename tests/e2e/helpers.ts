import { expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";

export const selection = { date: "2099-10-24", time: "19:00", food: "osh" };
export const inviteId = "b9470b74-8547-476f-b1da-7a019b5e81f9";
export const reservation = { id: "421634b4-29c7-4a20-a838-ed42544e3e10", ...selection, version: 1 };
export const reservationApiPattern = /\/api\/reservation(?:\?.*)?$/;
export type Reservation = typeof reservation;
export type EventBatch = { mode: string; inviteId?: string; sessionId: string; events: Array<{ eventId: string; name: string; occurredAt: string }> };

export async function isolateEvents(page: Page) {
  const batches: EventBatch[] = [];
  const seen = new Set<string>();
  const receive = (batch: EventBatch | null) => {
    if (!batch) return;
    const events = batch.events.filter(event => {
      if (seen.has(event.eventId)) return false;
      seen.add(event.eventId); return true;
    });
    if (events.length) batches.push({ ...batch, events });
  };
  // WebKit's network inspector omits Blob request bodies for sendBeacon.
  // Observe that payload without replacing the browser's real beacon behavior.
  const bindingName = "__observeBeacon_" + randomUUID().replaceAll("-", "");
  await page.exposeFunction(bindingName, (body: string) => receive(JSON.parse(body)));
  await page.addInitScript(bindingName => {
    const nativeBeacon = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = (url, data) => {
      const accepted = nativeBeacon(url, data);
      if (accepted && String(url).endsWith("/api/events") && data instanceof Blob) {
        void data.text().then(body => (window as unknown as Record<string, (body: string) => Promise<void>>)[bindingName](body));
      }
      return accepted;
    };
  }, bindingName);
  await page.route("**/api/events", async route => {
    receive(route.request().postDataJSON());
    await route.fulfill({ json: { accepted: true } });
  });
  return batches;
}

export async function mockPrivate(page: Page, initial: Reservation | null = null) {
  const current = { reservation: initial };
  const requests: Record<string, unknown>[] = [];
  const reads: string[] = [];
  await page.route("**/api/invitation/session", route => route.fulfill({ json: { inviteId, reservation: current.reservation } }));
  await page.route("**/api/invitation/resolve", route => route.fulfill({ json: { inviteId, reservation: current.reservation } }));
  await page.route(reservationApiPattern, async route => {
    if (route.request().method() === "GET") {
      const url = new URL(route.request().url());
      expect(url.searchParams.get("inviteId")).toBe(inviteId);
      reads.push(url.toString());
      return route.fulfill({ json: { reservation: current.reservation } });
    }
    const body = route.request().postDataJSON();
    expect(body.inviteId).toBe(inviteId);
    requests.push(body);
    current.reservation = { id: reservation.id, date: body.date, time: body.time, food: body.food, version: (current.reservation?.version ?? 0) + 1 };
    await route.fulfill({ json: { reservation: current.reservation, changed: true, notificationStatus: "pending" } });
  });
  return { current, reads, requests };
}

export async function openQuestion(page: Page, path = "/") {
  await page.goto(path, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("button", { name: "YES ♡", exact: true })).toBeEnabled();
}
export async function toSchedule(page: Page) {
  await page.getByRole("button", { name: "YES ♡", exact: true }).click();
  await expect(page.getByRole("heading", { name: /WAIT YOU ACTUALLY\s*SAID YES/ })).toBeVisible();
  await page.getByRole("button", { name: "okay okay!", exact: true }).click();
  await expect(page.getByRole("heading", { name: /So\.\.\. when are you free\?/ })).toBeVisible();
}
export async function toFood(page: Page, date = selection.date, time = selection.time) {
  await toSchedule(page);
  await page.locator('input[type="date"]').fill(date);
  await page.locator('input[type="time"]').fill(time);
  await page.getByRole("button", { name: "Set the date ♡", exact: true }).click();
  await expect(page.getByRole("heading", { name: /What are we feeling/ })).toBeVisible();
}
export async function toFinal(page: Page, food = "Osh") {
  await toFood(page);
  await page.getByRole("button", { name: new RegExp(food) }).click();
  await finalVisible(page);
}
export async function finalVisible(page: Page) {
  await expect(page.getByRole("heading", { name: /glad you didn't\s*say no ♡/ })).toBeVisible();
}
export async function settle(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(Array.from(document.images, image => image.decode().catch(() => {})));
    await Promise.all(document.getAnimations().filter(animation => animation.effect?.getComputedTiming().iterations !== Infinity)
      .map(animation => animation.finished.catch(() => {})));
  });
}
export async function noHorizontalOverflow(page: Page) {
  const bounds = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, width: document.documentElement.clientWidth }));
  expect(bounds.scroll).toBeLessThanOrEqual(bounds.width);
}

