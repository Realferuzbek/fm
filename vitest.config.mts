import { fileURLToPath } from "node:url";
import path from "node:path";
import { defineConfig } from "vitest/config";

const workspace = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(workspace, "src"),
      "server-only": path.resolve(workspace, "tests/server-only.ts"),
    },
  },
  test: {
    environment: "jsdom",
    include: ["tests/**/*.test.{ts,tsx}"],
    exclude: ["node_modules", ".next"],
    restoreMocks: true,
  },
});
