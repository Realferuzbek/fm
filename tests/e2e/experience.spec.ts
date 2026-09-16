import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { finalVisible, isolateEvents, noHorizontalOverflow, openQuestion, settle, toFinal, toFood, toSchedule } from "./helpers";

test.beforeEach(async ({ page }) => { await isolateEvents(page); });

test("full public story has exact copy, real selected time, MP3 and no private writes", async ({ page }) => {
  const errors: string[] = [];
  const privateWrites: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  page.on("request", request => { if (request.url().includes("/api/reservation")) privateWrites.push(request.url()); });
  await openQuestion(page);
  await expect(page.getByRole("heading", { name: /Will you go on a\s*date with me/ })).toBeVisible();
  await expect(page.getByRole("img")).toHaveAttribute("alt", /pug|pet|wingman/i);
  await toSchedule(page);
  await expect(page.getByText("I was so ready for you to say no 😭")).not.toBeVisible();
  const submit = page.getByRole("button", { name: "Set the date ♡" });
  await expect(submit).toBeDisabled();
  await page.locator('input[type="date"]').fill("2099-10-24");
  await expect(submit).toBeDisabled();
  await page.locator('input[type="time"]').fill("18:45");
  await expect(submit).toBeEnabled();
  await submit.click();
  for (const food of ["Donar", "Lavash", "Shashlik", "Taco", "Lag'mon", "Osh"]) await expect(page.getByRole("button", { name: new RegExp(food) })).toBeVisible();
  await page.getByRole("button", { name: /Osh/ }).click();
  await finalVisible(page);
  await expect(page.getByText("6:45 PM", { exact: true })).toBeVisible();
  await expect(page.getByText("reservation status: suspiciously successful ✅", { exact: true })).toBeVisible();
  const telegram = page.getByRole("link", { name: "Back to him ♡", exact: true });
  await expect(telegram).toHaveAttribute("href", "https://t.me/realferuzbek");
  await expect(telegram).toHaveAttribute("target", "_blank");
  await expect(page.getByText("@realferuzbek")).toHaveCount(0);
  expect(privateWrites).toEqual([]);
  expect(errors).toEqual([]);
});

test("past dates remain disabled and future dates recover", async ({ page }) => {
  await openQuestion(page); await toSchedule(page);
  await page.locator('input[type="date"]').fill("2000-01-01");
  await page.locator('input[type="time"]').fill("12:00");
  await expect(page.getByRole("button", { name: "Set the date ♡" })).toBeDisabled();
  await page.locator('input[type="date"]').fill("2099-10-24");
  await expect(page.getByRole("button", { name: "Set the date ♡" })).toBeEnabled();
});

for (const food of ["Donar", "Lavash", "Shashlik", "Taco", "Lag'mon", "Osh"]) {
  test(`${food} selection advances automatically`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openQuestion(page); await toFood(page);
    await page.getByRole("button", { name: new RegExp(food) }).click();
    await finalVisible(page);
    await expect(page.locator('[class*="ticketDetails"]')).toContainText(food);
  });
}

test("keyboard NO stays focused and stationary, then YES remains reachable", async ({ page }) => {
  await openQuestion(page); await settle(page);
  const no = page.getByTestId("no-button");
  await no.focus();
  const initial = await no.boundingBox();
  await page.keyboard.press("Enter"); await settle(page);
  await expect(no).toBeFocused();
  const after = await no.boundingBox();
  expect(after?.x).toBeCloseTo(initial!.x, 1); expect(after?.y).toBeCloseTo(initial!.y, 1);
  await expect(page.locator("#no-button-status")).not.toHaveText("no pressure. just one extremely hopeful pug.");
  await page.keyboard.press("Shift+Tab");
  await expect(page.getByRole("button", { name: "YES ♡", exact: true })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "okay okay!" })).toBeVisible();
});

test("reduced motion disables decorative motion and moving NO", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openQuestion(page); await settle(page);
  const no = page.getByTestId("no-button");
  const box = await no.boundingBox();
  await no.click(); await settle(page);
  const after = await no.boundingBox();
  expect(after?.x).toBeCloseTo(box!.x, 1); expect(after?.y).toBeCloseTo(box!.y, 1);
  expect(await page.evaluate(() => document.getAnimations().filter(a => a.effect?.getComputedTiming().iterations === Infinity).length)).toBe(0);
  await toFinal(page);
});

test("all five stages pass accessibility and overflow checks", async ({ page }) => {
  test.setTimeout(75_000);
  await openQuestion(page);
  const audit = async () => {
    await settle(page); await noHorizontalOverflow(page);
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    expect(results.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) }))).toEqual([]);
  };
  await audit();
  await page.getByRole("button", { name: "YES ♡", exact: true }).click();
  await expect(page.getByRole("button", { name: "okay okay!" })).toBeVisible(); await audit();
  await expect(page.getByText("I was so ready for you to say no 😭")).toBeVisible();
  await page.getByRole("button", { name: "okay okay!" }).click(); await audit();
  await page.locator('input[type="date"]').fill("2099-10-24"); await page.locator('input[type="time"]').fill("19:00");
  await page.getByRole("button", { name: "Set the date ♡" }).click(); await audit();
  await page.getByRole("button", { name: /Osh/ }).click(); await finalVisible(page); await audit();
});

test("unfinished schedule survives reload; completed replay starts at question", async ({ page }) => {
  await openQuestion(page); await toSchedule(page);
  await page.locator('input[type="date"]').fill("2099-10-24"); await page.locator('input[type="time"]').fill("19:00");
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator('input[type="date"]')).toHaveValue("2099-10-24");
  await expect(page.locator('input[type="time"]')).toHaveValue("19:00");
  await page.getByRole("button", { name: "Set the date ♡" }).click(); await page.getByRole("button", { name: /Osh/ }).click(); await finalVisible(page);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByRole("button", { name: "YES ♡", exact: true })).toBeEnabled();
});

test("milestones include timestamps and final CTA navigation flushes the last event", async ({ page, context }) => {
  const batches = await isolateEvents(page);
  await context.route("https://t.me/**", route => route.fulfill({ contentType: "text/html", body: "Telegram destination" }));
  await openQuestion(page);
  await page.getByTestId("no-button").focus(); await page.keyboard.press("Enter");
  await toFinal(page);
  const popup = page.waitForEvent("popup");
  await page.getByRole("link", { name: "Back to him ♡", exact: true }).click();
  const telegramPage = await popup;
  await telegramPage.waitForLoadState("domcontentloaded");
  expect(telegramPage.url()).toBe("https://t.me/realferuzbek");
  await expect.poll(() => batches.flatMap(batch => batch.events).map(event => event.name)).toContain("telegram_clicked");
  const events = batches.flatMap(batch => batch.events);
  for (const name of ["visit_started", "screen_1_viewed", "no_button_attempted", "yes_clicked", "screen_2_viewed", "okay_clicked", "date_screen_viewed", "date_selected", "time_selected", "date_confirmed", "food_screen_viewed", "food_selected", "final_screen_viewed", "telegram_clicked"]) expect(events.some(event => event.name === name), name).toBe(true);
  expect(events.every(event => Number.isFinite(Date.parse(event.occurredAt)) && /^[\da-f-]{36}$/i.test(event.eventId))).toBe(true);
  expect(new Set(events.map(event => event.eventId)).size).toBe(events.length);
});

