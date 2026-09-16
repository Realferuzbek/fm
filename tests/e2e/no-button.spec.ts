import { test, expect } from "@playwright/test";
import { isolateEvents, openQuestion, settle } from "./helpers";

test.beforeEach(async ({ page }) => { await isolateEvents(page); });

test("NO remains inside its arena and clear of YES throughout repeated pointer motion", async ({ page }, testInfo) => {
  // Windows WebKit acknowledges each three-step native mouse move in roughly
  // 2.3 seconds. Keep all 18 real approaches and continuous frame sampling.
  if (testInfo.project.name === "webkit") test.setTimeout(90_000);
  test.skip(testInfo.project.name === "mobile-chrome", "Touch behavior has a separate scenario.");
  await openQuestion(page); await settle(page);
  await page.getByTestId("choice-arena").scrollIntoViewIfNeeded();
  await page.evaluate(() => {
    const target = window as typeof window & { __geometry: { frames: number; escapes: number; defects: string[]; running: boolean } };
    target.__geometry = { frames: 0, escapes: 0, defects: [], running: true };
    const sample = () => {
      if (!target.__geometry.running) return;
      const arena = document.querySelector('[data-testid="choice-arena"]')!.getBoundingClientRect();
      const no = document.querySelector('[data-testid="no-button"]')!.getBoundingClientRect();
      const yes = document.querySelector('[data-testid="choice-arena"] button')!.getBoundingClientRect();
      target.__geometry.frames++;
      if (no.left < arena.left - 1 || no.right > arena.right + 1 || no.top < arena.top - 1 || no.bottom > arena.bottom + 1) target.__geometry.defects.push("arena: " + JSON.stringify({ no: no.toJSON(), arena: arena.toJSON() }));
      if (no.left < yes.right && no.right > yes.left && no.top < yes.bottom && no.bottom > yes.top) target.__geometry.defects.push("YES collision");
      if (no.left < 0 || no.right > innerWidth || no.top < 0 || no.bottom > innerHeight) target.__geometry.defects.push("viewport");
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  const original = await page.getByTestId("no-button").boundingBox();
  for (let attempt = 0; attempt < 18; attempt++) {
    const box = await page.getByTestId("no-button").boundingBox();
    const arena = await page.getByTestId("choice-arena").boundingBox();
    const direction = attempt % 4;
    await page.mouse.move(arena!.x + 1, arena!.y + arena!.height - 1);
    await page.mouse.move(box!.x + box!.width / 2 + (direction === 0 ? -24 : direction === 1 ? 24 : 0), box!.y + box!.height / 2 + (direction === 2 ? -15 : direction === 3 ? 15 : 0), { steps: 3 });
    // Sample approaches during active easing, with occasional settled departures.
    await page.waitForTimeout(attempt % 3 === 0 ? 330 : 45);
  }
  await settle(page);
  const result = await page.evaluate(() => {
    const state = (window as typeof window & { __geometry: { frames: number; defects: string[]; running: boolean } }).__geometry;
    state.running = false; return state;
  });
  expect(result.frames).toBeGreaterThan(20);
  expect(result.defects.slice(0, 5)).toEqual([]);
  const after = await page.getByTestId("no-button").boundingBox();
  expect(Math.hypot(after!.x - original!.x, after!.y - original!.y)).toBeGreaterThan(5);
});

test("touch attempts escape safely without a synthesized duplicate attempt", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chrome", "Uses a real touch-capable mobile context.");
  const batches = await isolateEvents(page);
  await openQuestion(page); await settle(page);
  const no = page.getByTestId("no-button");
  const original = await no.boundingBox();
  await page.touchscreen.tap(original!.x + original!.width / 2, original!.y + original!.height / 2);
  await settle(page);
  const moved = await no.boundingBox();
  expect(Math.hypot(moved!.x - original!.x, moved!.y - original!.y)).toBeGreaterThan(5);
  await expect.poll(() => batches.flatMap(b => b.events).filter(e => e.name === "no_button_attempted").length).toBe(1);
  for (let i = 0; i < 7; i++) {
    const box = await no.boundingBox();
    await page.touchscreen.tap(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await settle(page);
    const next = await no.boundingBox();
    const arena = await page.getByTestId("choice-arena").boundingBox();
    expect(next!.x).toBeGreaterThanOrEqual(arena!.x - 1);
    expect(next!.x + next!.width).toBeLessThanOrEqual(arena!.x + arena!.width + 1);
    expect(next!.y).toBeGreaterThanOrEqual(arena!.y - 1);
    expect(next!.y + next!.height).toBeLessThanOrEqual(arena!.y + arena!.height + 1);
  }
  await page.getByRole("button", { name: "YES ♡", exact: true }).tap();
  await expect(page.getByRole("button", { name: "okay okay!" })).toBeVisible();
});

test("resizing during an escape re-bounds the button", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile-chrome", "Desktop resizing scenario.");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await openQuestion(page); await settle(page);
  const box = await page.getByTestId("no-button").boundingBox();
  await page.mouse.move(box!.x + 5, box!.y + 5);
  await page.setViewportSize({ width: 360, height: 844 }); await settle(page);
  const no = await page.getByTestId("no-button").boundingBox();
  const arena = await page.getByTestId("choice-arena").boundingBox();
  expect(no!.x).toBeGreaterThanOrEqual(arena!.x - 1);
  expect(no!.x + no!.width).toBeLessThanOrEqual(arena!.x + arena!.width + 1);
  expect(no!.y).toBeGreaterThanOrEqual(arena!.y - 1);
  expect(no!.y + no!.height).toBeLessThanOrEqual(arena!.y + arena!.height + 1);
});

