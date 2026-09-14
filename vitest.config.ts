import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["tests/**/*.test.ts"],
    exclude: ["node_modules", ".next"],
    alias: {
      "@": path.resolve(__dirname, "./src")
    }
  }
});
