# Test suite map

The test files in this directory are deliberately split by boundary:

- `unit/`: deterministic browser-independent behavior.
- `integration/`: server validation, token/session, persistence, and Telegram idempotency using a temporary database and mocked Telegram client.
- `e2e/`: browser journeys run with Playwright against the local app.

The root package configuration should provide these commands:

```text
npm run test          # Vitest unit + integration tests
npm run test:watch    # Vitest watch mode
npm run test:e2e      # Playwright
npm run test:e2e:ui   # optional Playwright UI mode
```

Integration tests must use a separate throwaway database URL (for example `TEST_DATABASE_URL`) and must never use production Telegram credentials. E2E tests should intercept Telegram/navigation calls and never create a real reservation notification.
