import { test, expect } from "@playwright/test";
import { finalVisible, inviteId, isolateEvents, mockPrivate, openQuestion, reservation, reservationApiPattern, selection, toFinal, toFood } from "./helpers";

test.beforeEach(async ({ page }) => { await isolateEvents(page); await page.emulateMedia({ reducedMotion: "reduce" }); });

for (const path of ["/invite#invite=private-fragment-token", "/invite?invite=private-query-token", "/?invite=legacy-query-token"]) {
  test(`private URL resolves and immediately scrubs credentials: ${path.split("=")[0]}`, async ({ page }) => {
    await mockPrivate(page);
    const resolves: unknown[] = [];
    await page.route("**/api/invitation/resolve", async route => {
      resolves.push(route.request().postDataJSON());
      expect(new URL(page.url()).search).toBe(""); expect(new URL(page.url()).hash).toBe("");
      await route.fulfill({ json: { inviteId, reservation: null } });
    });
    await openQuestion(page, path);
    await expect(page).toHaveURL(/\/invite$/);
    expect(resolves.length).toBeGreaterThanOrEqual(1);
    const storage = await page.evaluate(() => JSON.stringify({ ...sessionStorage, ...localStorage }));
    expect(storage).not.toContain(path.split("=")[1]);
    expect(await page.locator("body").innerText()).not.toContain(path.split("=")[1]);
  });
}

test("public mode ignores an existing private session and never submits bookings", async ({ page, context }) => {
  await context.addCookies([{ name: "date_invite_session", value: "old-private-cookie", domain: "localhost", path: "/", httpOnly: true, sameSite: "Strict" }]);
  const batches = await isolateEvents(page);
  const { requests } = await mockPrivate(page, reservation);
  let sessionReads = 0;
  await page.route("**/api/invitation/session", async route => { sessionReads++; await route.fulfill({ json: { inviteId, reservation } }); });
  await openQuestion(page); await toFinal(page);
  expect(requests).toHaveLength(0); expect(sessionReads).toBe(0);
  expect(batches.length).toBeGreaterThan(0);
  expect(batches.every(batch => batch.mode === "public")).toBe(true);
  expect(batches.every(batch => !("inviteId" in batch))).toBe(true);
});

test("first private booking persists once; replay and refresh never resubmit unchanged choices", async ({ page }) => {
  const { reads, requests } = await mockPrivate(page);
  await openQuestion(page, "/invite"); await toFinal(page);
  expect(requests).toHaveLength(1);
  expect(requests[0]).toMatchObject({ ...selection, inviteId, expectedVersion: 0 });
  expect(requests[0].requestId).toMatch(/^[\da-f-]{36}$/i);
  await page.getByRole("button", { name: /one more smile/ }).click(); await toFinal(page);
  expect(requests).toHaveLength(1);
  expect(reads).toHaveLength(1);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByRole("button", { name: "YES ♡", exact: true })).toBeEnabled();
  await toFinal(page); expect(requests).toHaveLength(1); expect(reads).toHaveLength(2);
});

test("unchanged replay reconciles a newer server plan before allowing a revision", async ({ page }) => {
  const { requests } = await mockPrivate(page, reservation);
  const newer = { ...reservation, time: "20:00", version: 2 };
  const reads: string[] = [];
  await page.route(reservationApiPattern, async route => {
    if (route.request().method() !== "GET") return route.fallback();
    const url = new URL(route.request().url());
    reads.push(url.toString());
    expect(url.searchParams.get("inviteId")).toBe(inviteId);
    await route.fulfill({ json: { reservation: newer } });
  });

  await openQuestion(page, "/invite"); await toFood(page);
  await page.getByRole("button", { name: /Osh/ }).click();
  await expect(page.getByRole("heading", { name: "Save this new plan? ♡" })).toBeVisible();
  await expect(page.getByRole("status")).toContainText("changed in another tab");
  await expect(page.getByText(/Our current plan:/)).toContainText("8:00 PM");
  expect(reads).toHaveLength(1);
  expect(requests).toHaveLength(0);

  await page.getByRole("button", { name: "Save these changes ♡" }).click();
  await finalVisible(page);
  expect(requests).toHaveLength(1);
  expect(requests[0]).toMatchObject({ ...selection, inviteId, expectedVersion: 2 });
});

test("unchanged replay stops safely when the authenticated invite cookie changed", async ({ page }) => {
  const { requests } = await mockPrivate(page, reservation);
  const reads: string[] = [];
  await page.route(reservationApiPattern, async route => {
    if (route.request().method() !== "GET") return route.fallback();
    const url = new URL(route.request().url());
    reads.push(url.toString());
    expect(url.searchParams.get("inviteId")).toBe(inviteId);
    await route.fulfill({ status: 409, json: { code: "invitation_session_changed", error: "Invitation session changed." } });
  });

  await openQuestion(page, "/invite"); await toFood(page);
  await page.getByRole("button", { name: /Osh/ }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("private invitation changed");
  expect(reads).toHaveLength(1);
  expect(requests).toHaveLength(0);
  await expect(page.getByRole("heading", { name: /glad you didn't/ })).toHaveCount(0);
});

test("changed choices require explicit confirmation and one versioned update", async ({ page }) => {
  const { requests } = await mockPrivate(page, reservation);
  await openQuestion(page, "/invite"); await toFood(page);
  await page.getByRole("button", { name: /Lavash/ }).click();
  await expect(page.getByRole("heading", { name: "Save this new plan? ♡" })).toBeVisible();
  expect(requests).toHaveLength(0);
  await page.getByRole("button", { name: "Save these changes ♡" }).click(); await finalVisible(page);
  expect(requests).toHaveLength(1);
  expect(requests[0]).toMatchObject({ ...selection, food: "lavash", expectedVersion: 1 });
  await expect(page.locator('[class*="ticketDetails"]')).toContainText("Lavash");
});

test("keeping the current plan discards proposed changes without a write", async ({ page }) => {
  const { requests } = await mockPrivate(page, reservation);
  await openQuestion(page, "/invite"); await toFood(page, "2099-11-01", "20:30");
  await page.getByRole("button", { name: /Taco/ }).click();
  await page.getByRole("button", { name: "Keep our original plan" }).click(); await finalVisible(page);
  expect(requests).toHaveLength(0);
  await expect(page.getByText("7:00 PM", { exact: true })).toBeVisible();
  await expect(page.locator('[class*="ticketDetails"]')).toContainText("Osh");
});

test("failed submission retries the same request ID and preserves selections", async ({ page }) => {
  await mockPrivate(page);
  const bodies: Record<string, unknown>[] = [];
  await page.route(reservationApiPattern, async route => {
    bodies.push(route.request().postDataJSON());
    await route.fulfill(bodies.length === 1 ? { status: 503, json: { error: "Unavailable" } } : { json: { reservation, changed: true } });
  });
  await openQuestion(page, "/invite"); await toFood(page); await page.getByRole("button", { name: /Osh/ }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Your choices are still here");
  const stored = await page.evaluate(id => JSON.parse(sessionStorage.getItem("invitation:pending:private:" + id) ?? "null"), inviteId);
  expect(stored).toMatchObject({ ...selection, inviteId, expectedVersion: 0 });
  await page.getByRole("button", { name: "Try saving again ♡" }).click(); await finalVisible(page);
  expect(bodies).toHaveLength(2); expect(bodies[1]).toEqual(bodies[0]);
});

test("a cookie/invite mismatch cannot redirect a booking write", async ({ page }) => {
  await mockPrivate(page);
  const mismatchedInviteId = "e1b48d54-8962-4d8d-bcea-71737fae5509";
  const bodies: Record<string, unknown>[] = [];
  await page.route(reservationApiPattern, async route => {
    if (route.request().method() !== "POST") return route.fallback();
    bodies.push(route.request().postDataJSON());
    await route.fulfill({ status: 409, json: { code: "invitation_session_changed", error: "Invitation session changed." } });
  });

  await openQuestion(page, "/invite"); await toFood(page); await page.getByRole("button", { name: /Osh/ }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("private invitation changed");
  expect(bodies).toHaveLength(1);
  expect(bodies[0]).toMatchObject({ ...selection, inviteId });
  expect(bodies[0]).not.toMatchObject({ inviteId: mismatchedInviteId });
  const stored = await page.evaluate(id => JSON.parse(sessionStorage.getItem("invitation:pending:private:" + id) ?? "null"), inviteId);
  expect(stored).toMatchObject({ ...selection, inviteId });
  expect(JSON.stringify(stored)).not.toContain(mismatchedInviteId);
  await expect(page.getByRole("heading", { name: /glad you didn't/ })).toHaveCount(0);
});

test("pending recovery ignores a request bound to another invite", async ({ page }) => {
  const { requests } = await mockPrivate(page);
  const otherInviteId = "e1b48d54-8962-4d8d-bcea-71737fae5509";
  await page.addInitScript(({ inviteId, otherInviteId, selection }) => {
    sessionStorage.setItem("invitation:pending:private:" + inviteId, JSON.stringify({
      ...selection, inviteId: otherInviteId, requestId: "151b3576-f65a-41fc-a702-b591b04c33d1", expectedVersion: 0,
    }));
  }, { inviteId, otherInviteId, selection });

  await openQuestion(page, "/invite");
  await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
  expect(requests).toHaveLength(0);
});

test("a stale revision shows the latest plan and requires fresh confirmation", async ({ page }) => {
  await mockPrivate(page, reservation);
  const bodies: Record<string, unknown>[] = [];
  await page.route(reservationApiPattern, async route => {
    bodies.push(route.request().postDataJSON());
    await route.fulfill(bodies.length === 1 ? { status: 409, json: { reservation: { ...reservation, time: "20:00", version: 2 } } } :
      { json: { reservation: { ...reservation, food: "lavash", version: 3 }, changed: true } });
  });
  await openQuestion(page, "/invite"); await toFood(page); await page.getByRole("button", { name: /Lavash/ }).click();
  await page.getByRole("button", { name: "Save these changes ♡" }).click();
  await expect(page.getByRole("status")).toContainText("changed in another tab");
  expect(bodies).toHaveLength(1);
  await expect(page.getByText(/Our current plan:/)).toContainText("8:00 PM");
  await page.getByRole("button", { name: "Save these changes ♡" }).click(); await finalVisible(page);
  expect(bodies[1].expectedVersion).toBe(2); expect(bodies[1].requestId).not.toBe(bodies[0].requestId);
});

test("reload reconciles a saved pending submission without another write", async ({ page }) => {
  const { requests } = await mockPrivate(page, reservation);
  await page.addInitScript(({ inviteId, selection }) => {
    sessionStorage.setItem("invitation:pending:private:" + inviteId, JSON.stringify({ ...selection, inviteId, requestId: "b9470b74-8547-476f-b1da-7a019b5e81f9", expectedVersion: 0 }));
  }, { inviteId, selection });
  await openQuestion(page, "/invite");
  expect(requests).toHaveLength(0);
  expect(await page.evaluate(id => sessionStorage.getItem("invitation:pending:private:" + id), inviteId)).toBeNull();
});

test("reload preserves an unresolved request key for safe manual recovery", async ({ page }) => {
  const { requests } = await mockPrivate(page);
  const requestId = "151b3576-f65a-41fc-a702-b591b04c33d1";
  await page.addInitScript(({ inviteId, selection, requestId }) => {
    sessionStorage.setItem("invitation:pending:private:" + inviteId, JSON.stringify({ ...selection, inviteId, requestId, expectedVersion: 0 }));
  }, { inviteId, selection, requestId });
  await page.goto("/invite", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Your choices are safe here");
  expect(requests).toHaveLength(0);
  await page.getByRole("button", { name: "Try saving again ♡" }).click(); await finalVisible(page);
  expect(requests[0].requestId).toBe(requestId);
});

test("invalid private entry offers recovery without demo attribution", async ({ page }) => {
  const batches = await isolateEvents(page);
  await page.route("**/api/invitation/session", route => route.fulfill({ status: 401, json: { error: "Invalid" } }));
  await page.goto("/invite", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "A little pause ♡" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Try again ♡" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Explore the demo" })).toHaveAttribute("href", "/");
  expect(batches).toHaveLength(0);
});

test("expired unresolved submission can recover its original request without new date validation", async ({ page }) => {
  await mockPrivate(page);
  const requestId = "a3c92f1d-75dc-441e-bf76-c0f346220496";
  const expired = { ...selection, date: "2001-01-01" };
  const requests: Record<string, unknown>[] = [];
  await page.route(reservationApiPattern, async route => {
    requests.push(route.request().postDataJSON());
    await route.fulfill({ json: { reservation: { ...reservation, ...expired }, changed: false } });
  });
  await page.addInitScript(({ inviteId, expired, requestId }) => {
    sessionStorage.setItem("invitation:pending:private:" + inviteId, JSON.stringify({ ...expired, inviteId, requestId, expectedVersion: 0 }));
  }, { inviteId, expired, requestId });
  await page.goto("/invite", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Your choices are safe here");
  await page.getByRole("button", { name: "Try saving again ♡" }).click();
  await finalVisible(page);
  expect(requests).toHaveLength(1);
  expect(requests[0]).toMatchObject({ ...expired, requestId, expectedVersion: 0 });
  await expect(page.locator('[class*="ticketDetails"]')).toContainText("2001");
});

test("private opened event uses a stable visit ID across refresh and replay", async ({ page }) => {
  const batches = await isolateEvents(page);
  await mockPrivate(page);
  await openQuestion(page, "/invite");
  await expect.poll(() => batches.filter(batch => batch.events.some(event => event.name === "visit_started")).length).toBe(1);
  const first = batches[0].sessionId;
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByRole("button", { name: "YES ♡", exact: true })).toBeEnabled();
  await expect.poll(() => batches.filter(batch => batch.events.some(event => event.name === "visit_started")).length).toBe(2);
  expect(batches.every(batch => batch.mode === "private" && batch.inviteId === inviteId && batch.sessionId === first)).toBe(true);
  expect(JSON.stringify(batches)).not.toMatch(/userAgent|fingerprint|private-token|2099-10-24/);
});


