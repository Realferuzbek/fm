import { test, expect } from "@playwright/test";

test.describe("Date Invitation Experience", () => {
  test("completes the full public 5-stage story", async ({ page }) => {
    await page.goto("/");

    // Stage 1: Question
    await expect(page.locator("text=Will you go on a")).toBeVisible();
    const yesButton = page.locator("button", { hasText: "YES" });
    const noButton = page.locator('[data-testid="no-button"]');
    await expect(yesButton).toBeVisible();
    await expect(noButton).toBeVisible();

    // Click YES
    await yesButton.click();

    // Stage 2: Surprise Reaction
    const okayButton = page.locator("button", { hasText: "okay okay!" });
    await expect(okayButton).toBeVisible({ timeout: 8000 });
    await expect(page.locator("text=WAIT YOU ACTUALLY SAID YES??")).toBeVisible();
    await okayButton.click();

    // Stage 3: Schedule
    await expect(page.locator("text=When are you free?")).toBeVisible();
    const dateInput = page.locator('input[type="date"]');
    const timeInput = page.locator('input[type="time"]');
    const confirmButton = page.locator('button[type="submit"]');

    // Initially disabled if empty
    await expect(confirmButton).toBeDisabled();

    // Fill valid future schedule
    await dateInput.fill("2099-10-24");
    await timeInput.fill("19:00");
    await expect(confirmButton).toBeEnabled();
    await confirmButton.click();

    // Stage 4: Food choice
    await expect(page.locator("text=What are we eating?")).toBeVisible();
    const oshOption = page.locator("button", { hasText: "Osh" });
    await expect(oshOption).toBeVisible();
    await oshOption.click();

    // Stage 5: Final reveal
    await expect(page.locator("text=It's a date! ♡")).toBeVisible({ timeout: 8000 });
    await expect(page.locator("text=Osh")).toBeVisible();
    await expect(page.locator("text=7:00 PM (Tashkent time)")).toBeVisible();

    const telegramCta = page.locator("a", { hasText: "Back to him ♡" });
    await expect(telegramCta).toBeVisible();
    await expect(telegramCta).toHaveAttribute("href", "https://t.me/realferuzbek");
  });

  test("NO button evades pointer and remains accessible", async ({ page }) => {
    await page.goto("/");

    const noButton = page.locator('[data-testid="no-button"]');
    await expect(noButton).toBeVisible();

    const initialBox = await noButton.boundingBox();
    expect(initialBox).not.toBeNull();

    // Hover near NO button to trigger avoidance
    if (initialBox) {
      await page.mouse.move(initialBox.x + 5, initialBox.y + 5);
      await page.waitForTimeout(300);

      // Check transform attribute or updated bounding box
      const transformStyle = await noButton.evaluate((el) => el.style.transform);
      expect(transformStyle).toContain("translate3d");
    }
  });

  test("renders cleanly without horizontal overflow on mobile viewport", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/");

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  });
});

