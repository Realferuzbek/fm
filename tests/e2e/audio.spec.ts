import { test, expect } from "@playwright/test";
import { isolateEvents, openQuestion } from "./helpers";

test.beforeEach(async ({ page }) => { await isolateEvents(page); });

for (const behavior of ["allowed", "blocked"] as const) {
  test(`music autoplay ${behavior} uses MP3 and natural interaction without UI`, async ({ page }) => {
    await page.addInitScript(behavior => {
      const target = window as typeof window & { __audio: { calls: number; sources: string[]; successful: boolean } };
      target.__audio = { calls: 0, sources: [], successful: false };
      let interacted = false;
      document.addEventListener("pointerdown", () => { interacted = true; }, true);
      document.addEventListener("keydown", () => { interacted = true; }, true);
      HTMLMediaElement.prototype.play = function () {
        target.__audio.calls++;
        target.__audio.sources.push(this.src);
        if (behavior === "blocked" && !interacted) return Promise.reject(new DOMException("Policy", "NotAllowedError"));
        target.__audio.successful = true;
        return Promise.resolve();
      };
      HTMLMediaElement.prototype.pause = function () {};
    }, behavior);
    await openQuestion(page);
    const state = () => page.evaluate(() => (window as typeof window & { __audio: { calls: number; sources: string[]; successful: boolean } }).__audio);
    await expect.poll(async () => (await state()).calls).toBeGreaterThan(0);
    expect((await state()).sources.every(source => source.endsWith(".mp3"))).toBe(true);
    if (behavior === "blocked") {
      expect((await state()).successful).toBe(false);
      await page.getByRole("button", { name: "YES ♡", exact: true }).click();
      await expect.poll(async () => (await state()).successful).toBe(true);
    }
    const before = (await state()).calls;
    await page.keyboard.press("Tab"); await page.keyboard.press("Tab");
    expect((await state()).calls).toBe(before);
    await expect(page.locator("audio[controls], video[controls]")).toHaveCount(0);
    await expect(page.getByText(/tap anywhere|music is playing|laptop is muted/i)).toHaveCount(0);
  });
}

test("an unavailable audio asset does not block the story", async ({ page }) => {
  await page.route("**/assets/audio/**", route => route.fulfill({ status: 404, body: "" }));
  await openQuestion(page);
  await page.getByRole("button", { name: "YES ♡", exact: true }).click();
  await expect(page.getByRole("button", { name: "okay okay!" })).toBeVisible();
});

test("configured MP3 and supplied image load successfully", async ({ page }) => {
  const badAssets: string[] = [];
  await page.addInitScript(() => {
    const nativePlay = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      (window as typeof window & { __requestedAudio: string }).__requestedAudio = this.src;
      return nativePlay.call(this);
    };
  });
  page.on("response", response => {
    if ((response.url().includes("/assets/") || response.url().includes("/_next/image")) && response.status() >= 400) badAssets.push(response.url());
  });
  await openQuestion(page);
  const source = () => page.evaluate(() => (window as typeof window & { __requestedAudio?: string }).__requestedAudio);
  await expect.poll(source).toMatch(/\.mp3$/);
  // Windows WebKit's native media loader does not expose all requests through
  // Playwright page response events. Check its actual requested URL directly;
  // browser play policy and gesture recovery are verified separately above.
  const audioResponse = await page.request.get((await source())!, { headers: { Range: "bytes=0-1023" } });
  expect(audioResponse.ok()).toBe(true);
  expect(audioResponse.headers()["content-type"]).toMatch(/audio\//);
  expect((await audioResponse.body()).byteLength).toBeGreaterThan(0);
  await expect.poll(() => page.getByRole("img").evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
  expect(badAssets).toEqual([]);
});

