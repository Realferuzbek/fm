import { spawnSync } from "node:child_process";
import { access } from "node:fs/promises";
import { fileURLToPath } from "node:url";

// Reuse the same settled responsive journeys as the browser suite.
const workspace = fileURLToPath(new URL("../", import.meta.url));
const cli = fileURLToPath(new URL("../node_modules/@playwright/test/cli.js", import.meta.url));
// Keep the full-suite HTML report and traces when refreshing just the visuals.
const result = spawnSync(process.execPath, [cli, "test", "--project=chromium", "--grep", "@visual", "--reporter=line", "--output=test-results/visual-run"], {
  cwd: workspace, stdio: "inherit", env: process.env,
});
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);

for (const width of [360, 390, 768, 1024, 1366, 1440, 1536, 1920]) {
  for (let stage = 1; stage <= 6; stage++) {
    await access(new URL(`../test-results/visual/${width}-stage-${stage}.png`, import.meta.url));
  }
}
console.log("Verified 48 settled screenshots in test-results/visual (six stages at eight responsive viewports).");
