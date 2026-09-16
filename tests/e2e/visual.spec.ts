import { mkdir } from "node:fs/promises";
import { test, expect } from "@playwright/test";
import { chooseLocation, finalVisible, isolateEvents, noHorizontalOverflow, openQuestion, settle } from "./helpers";

const viewports = [
  { width: 360, height: 800 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1366, height: 768 },
  { width: 1440, height: 900 },
  { width: 1536, height: 864 },
  { width: 1920, height: 1080 },
];

for (const { width, height } of viewports) {
  test(`@visual all six stages at ${width}x${height}`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "The settled visual matrix is captured once in Chromium; functional accessibility checks cover all engines.");
    test.setTimeout(60_000);
    await isolateEvents(page);
    await page.setViewportSize({ width, height });
    await openQuestion(page);
    const capture = async (stage: number) => {
      await page.mouse.move(0, 0);
      await settle(page); await noHorizontalOverflow(page);
      if (width >= 1024 && height >= 768) {
        const card = await page.getByTestId("story-card").boundingBox();
        expect(card!.y).toBeGreaterThanOrEqual(0);
        expect(card!.y + card!.height).toBeLessThanOrEqual(height + 1);
      }
      await mkdir("test-results/visual", { recursive: true });
      await page.screenshot({ path: `test-results/visual/${width}-stage-${stage}.png`, fullPage: true, animations: "disabled" });
    };
    await capture(1);
    await page.getByRole("button", { name: "YES ♡", exact: true }).click();
    await expect(page.getByRole("button", { name: "okay okay!" })).toBeVisible(); await capture(2);
    await page.getByRole("button", { name: "okay okay!" }).click(); await capture(3);
    await page.locator('input[type="date"]').fill("2099-10-24"); await page.getByRole("combobox", { name: "Your time" }).selectOption("19:00");
    await page.getByRole("button", { name: "Set the date ♡" }).click(); await capture(4);
    await page.getByRole("button", { name: /Osh/ }).click();
    await expect(page.getByRole("heading", { name: /Where should\s*I find you/ })).toBeVisible(); await capture(5);
    await chooseLocation(page); await finalVisible(page); await capture(6);
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

