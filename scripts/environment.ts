import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

/** Log operational context only, never database URLs or secret-bearing errors. */
export function fail(message: string) {
  console.error(message);
  process.exitCode = 1;
}
