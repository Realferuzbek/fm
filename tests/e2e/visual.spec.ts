import { mkdir } from "node:fs/promises";
import { test, expect } from "@playwright/test";
import { finalVisible, isolateEvents, noHorizontalOverflow, openQuestion, settle } from "./helpers";

for (const width of [360, 390, 768, 1024, 1440, 1920]) {
  test(`@visual all five stages at ${width}px`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "The settled visual matrix is captured once in Chromium; functional accessibility checks cover all engines.");
    test.setTimeout(60_000);
    await isolateEvents(page);
    await page.setViewportSize({ width, height: width < 700 ? 844 : 1080 });
    await openQuestion(page);
    const capture = async (stage: number) => {
      await page.mouse.move(0, 0);
      await settle(page); await noHorizontalOverflow(page);
      await mkdir("test-results/visual", { recursive: true });
      await page.screenshot({ path: `test-results/visual/${width}-stage-${stage}.png`, fullPage: true, animations: "disabled" });
    };
    await capture(1);
    await page.getByRole("button", { name: "YES ♡", exact: true }).click();
    await expect(page.getByRole("button", { name: "okay okay!" })).toBeVisible(); await capture(2);
    await page.getByRole("button", { name: "okay okay!" }).click(); await capture(3);
    await page.locator('input[type="date"]').fill("2099-10-24"); await page.locator('input[type="time"]').fill("19:00");
    await page.getByRole("button", { name: "Set the date ♡" }).click(); await capture(4);
    await page.getByRole("button", { name: /Osh/ }).click(); await finalVisible(page); await capture(5);
  });
}

test("short landscape and 200 percent zoom remain usable", async ({ page }) => {
  await isolateEvents(page);
  await page.setViewportSize({ width: 740, height: 360 });
  await openQuestion(page); await settle(page); await noHorizontalOverflow(page);
  await page.getByRole("button", { name: "YES ♡", exact: true }).click();
  await expect(page.getByRole("button", { name: "okay okay!" })).toBeVisible();
  await page.evaluate(() => { document.documentElement.style.zoom = "2"; });
  await noHorizontalOverflow(page);
  await page.getByRole("button", { name: "okay okay!" }).click();
  await expect(page.locator('input[type="date"]')).toBeVisible();
});

