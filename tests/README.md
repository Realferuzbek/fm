# Invitation verification

Run from the repository root:

```sh
npm run lint
npm run typecheck
npm test
npm run build
npx playwright install chromium firefox webkit
npm run test:e2e
```

Playwright uses two workers and will reuse an existing application on port 3000,
or start the development server. To check the production build, run `npm start`
in another terminal, then set `PLAYWRIGHT_BASE_URL=http://localhost:3000` for the
test command. An explicit URL disables automatic development-server startup.

The production build explicitly uses webpack. In this local Next.js 16.3.5
installation, Turbopack twice omitted a generated server chunk during page-data
collection; the webpack build completes and is the verified release command.

`npm run test:e2e:ui` opens the browser test runner. Failure traces, screenshots,
and the HTML report are written under `test-results/` and `playwright-report/`.

## Boundaries

- Unit tests exercise geometry, story transitions, timezone validation, audio
  lifecycle, event buffering, token/session validation, and Telegram outcomes.
- Integration tests exercise the real persistence and migration behavior using
  a fresh in-memory PGlite PostgreSQL instance, with Telegram transport mocked.
  They require no live database URL and must never send real Telegram messages.
- Browser tests cover Chromium, Firefox, WebKit, and touch-capable mobile Chrome.
  Private endpoints and analytics are intercepted in each browser context. Tests
  cannot consume a live invitation or create a real reservation notification.

The browser suite includes all six stages, all six foods, date and time validation,
keyboard navigation, reduced motion, audio autoplay/fallback, asset loading,
all-stage axe checks, continuous NO collision/bounds sampling, touch attempts,
resizing, public/private isolation, token scrubbing, stable visit correlation,
single-booking replay, explicit revisions, stale versions, failed saves, and
pending-request recovery.

## Visual inspection

```sh
npm run test:screenshots
# Equivalent wrapper also verifies all 30 files exist:
node scripts/verify-screenshots.mjs
```

Captures are generated at 360, 390, 768, 1024, 1366, 1440, 1536, and 1920 pixels, with six
stage screenshots per viewport in `test-results/visual/`. They wait for fonts,
image decoding, and finite animations. They do not wait for network-idle because
music and analytics remain active. Screenshots are review artifacts, not stored
pixel baselines; inspect typography, spacing, image treatment, and hierarchy.

## Live deployment check

Automated transport mocks cannot prove delivery to Telegram or execution after
a Vercel response. Once deployment secrets are configured, use a separate test
invitation and check the exact opened notification, one saved booking notice,
no duplicate on refresh/replay, and one update after explicit confirmation.
Check persisted delivery status and Telegram message IDs. Verify both the
configured `after` behavior and the documented `direct` fallback if needed.

Use the manual notification command only for definitively failed records.
Never automatically retry an uncertain delivery. Do not use the girlfriend's
real invitation for destructive test cases or cleanup.
