import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const screenshotsDir = path.resolve(__dirname, "..", "screenshots");
fs.mkdirSync(screenshotsDir, { recursive: true });

async function capture() {
  const browser = await chromium.launch();
  
  // Desktop
  const desktopContext = await browser.newContext({
    viewport: { width: 1440, height: 900 }
  });
  const page = await desktopContext.newPage();
  
  await page.goto("http://localhost:3000");
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(screenshotsDir, "desktop-stage-1-question.png") });
  console.log("Captured desktop stage 1");

  await page.click("button:has-text('YES')");
  await page.waitForSelector("button:has-text('okay okay!')", { timeout: 8000 });
  await page.screenshot({ path: path.join(screenshotsDir, "desktop-stage-2-surprise.png") });
  console.log("Captured desktop stage 2");

  await page.click("button:has-text('okay okay!')");
  await page.waitForSelector("input[type='date']");
  await page.fill("input[type='date']", "2099-10-24");
  await page.fill("input[type='time']", "19:00");
  await page.screenshot({ path: path.join(screenshotsDir, "desktop-stage-3-schedule.png") });
  console.log("Captured desktop stage 3");

  await page.click("button[type='submit']");
  await page.waitForSelector("button:has-text('Osh')");
  await page.screenshot({ path: path.join(screenshotsDir, "desktop-stage-4-food.png") });
  console.log("Captured desktop stage 4");

  await page.click("button:has-text('Osh')");
  await page.waitForSelector("text=It's a date! ♡", { timeout: 8000 });
  await page.screenshot({ path: path.join(screenshotsDir, "desktop-stage-5-final.png") });
  console.log("Captured desktop stage 5");

  // Mobile
  const mobileContext = await browser.newContext({
    viewport: { width: 375, height: 667 },
    isMobile: true,
    hasTouch: true
  });
  const mPage = await mobileContext.newPage();
  await mPage.goto("http://localhost:3000");
  await mPage.waitForTimeout(500);
  await mPage.screenshot({ path: path.join(screenshotsDir, "mobile-stage-1-question.png") });
  console.log("Captured mobile stage 1");

  await mPage.click("button:has-text('YES')");
  await mPage.waitForSelector("button:has-text('okay okay!')", { timeout: 8000 });
  await mPage.screenshot({ path: path.join(screenshotsDir, "mobile-stage-2-surprise.png") });
  console.log("Captured mobile stage 2");

  await mPage.click("button:has-text('okay okay!')");
  await mPage.waitForSelector("input[type='date']");
  await mPage.fill("input[type='date']", "2099-10-24");
  await mPage.fill("input[type='time']", "19:00");
  await mPage.screenshot({ path: path.join(screenshotsDir, "mobile-stage-3-schedule.png") });
  console.log("Captured mobile stage 3");

  await mPage.click("button[type='submit']");
  await mPage.waitForSelector("button:has-text('Osh')");
  await mPage.screenshot({ path: path.join(screenshotsDir, "mobile-stage-4-food.png") });
  console.log("Captured mobile stage 4");

  await mPage.click("button:has-text('Osh')");
  await mPage.waitForSelector("text=It's a date! ♡", { timeout: 8000 });
  await mPage.screenshot({ path: path.join(screenshotsDir, "mobile-stage-5-final.png") });
  console.log("Captured mobile stage 5");

  await browser.close();
  console.log("All screenshots captured successfully in screenshots/");
}

capture().catch((err) => {
  console.error("Screenshot capture failed:", err);
  process.exit(1);
});
