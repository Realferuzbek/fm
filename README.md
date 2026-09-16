# A tiny date story ♡

A six-stage, personal invitation with a persuasive pug, a continuously evasive NO button, fixed date and time choices, food and meeting-spot selection, and a small romantic payoff. Built with Next.js App Router, React, TypeScript, and CSS modules.

## Run locally

Use Node.js 20.9+ and npm. Install the locked dependencies and start the demo:

```sh
npm ci
npm run dev
```

Open [localhost:3000](http://localhost:3000). The entire public story works without credentials. Analytics acknowledges events without storing them when `DATABASE_URL` is absent. Private invitations require the server configuration below.

If Windows has reserved port 3000 and reports `EACCES`, use `npm run dev -- --port 3300`, open `http://localhost:3300`, and use that exact origin for `APP_ORIGIN` while testing private mode.

## The photo, music, and personal details

The supplied pet photo and MP3 are already selected in **`src/config/invitation.ts`**. This is the single place to change their paths, photo framing, music volume, food labels, Telegram destination, and timezone.

| Setting | Current value |
| --- | --- |
| `assetPaths.petImage` | `/assets/images/ChatGPT Image Sep 14, 2026, 05_00_08 PM (2).png` |
| `assetPaths.backgroundAudio` | `/assets/audio/alisher-uzoqov-oshiq-yurak_(uzhits.net).mp3` |
| `petImageObjectFit` | `contain` — preserves the supplied composition |
| `petImageObjectPosition` | `50% 50%` |
| `timeZone` | `Asia/Tashkent` |

Put replacement images in `public/assets/images/` and audio in `public/assets/audio/`, then update the matching config path. Public URLs omit `public`. PNG, JPG, JPEG, and WebP images fit a responsive container; use `cover` if you prefer a crop. The intended music is MP3; WAV and M4A can also be configured when the browser supports their encoding.

Autoplay is attempted without blocking rendering. If browser policy blocks it, a natural pointer, touch, or keyboard interaction starts another attempt. There is no player, permanent indicator, or “tap anywhere” instruction. Reduced motion stops decorative animation and makes NO stationary but responsive. A webpage cannot determine the operating system's mute state.

Files in `public` are publicly accessible after deployment, including the pet photo and song.

## Server configuration

Copy `.env.example` to `.env.local` and enter real values. PowerShell:

```powershell
Copy-Item .env.example .env.local
```

On macOS/Linux, use `cp .env.example .env.local`. Next.js and the administrative commands load this file. Keep it out of Git; the repository already ignores it.

| Variable | Purpose |
| --- | --- |
| `APP_ORIGIN` | Exact canonical origin, such as `http://localhost:3000` locally or `https://your-domain.example` in production. No path or trailing slash. Required in production. |
| `DATABASE_URL` | Server-only **Neon Postgres** connection string. Runtime queries use Neon's HTTP driver. |
| `TELEGRAM_BOT_TOKEN` | Server-only Telegram bot credential. |
| `TELEGRAM_CHAT_ID` | The private chat that receives milestone and booking notifications. |
| `INVITE_TOKEN_PEPPER` | Distinct high-entropy secret for hashing invitation tokens. |
| `INVITE_SESSION_SECRET` | Distinct high-entropy secret for signing session cookies. |
| `TELEGRAM_DELIVERY_MODE` | `after` by default; `direct` awaits delivery after persistence before returning the API response. |

Generate each signing secret separately with:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Create a bot through [BotFather](https://t.me/BotFather). Send your new bot a message so it can contact your chat, and obtain that chat's ID through the [Telegram Bot API](https://core.telegram.org/bots/api#getupdates). Put credentials only in server environment variables, never `NEXT_PUBLIC_*` variables. Use separate credentials/databases for production and test environments.

Apply the checked-in migrations:

```sh
npm run db:migrate
```

The migration command checks file hashes, applies each migration transactionally, and preserves existing bookings. Do not edit a migration after it has been applied; add a new SQL migration for later schema changes. `db:generate` is a development aid for schema changes, not a required setup step. The checked-in migrations also contain the atomic reservation function, which is not generated from the TypeScript schema.

## Public and private invitations

The ordinary `/` URL is always **public/demo**, even if the browser has an existing private cookie. Friends can replay the whole experience freely; public events never send Telegram notifications and public selections never write reservations.

Create a private invitation from your trusted terminal:

```sh
npm run invite:create
```

Save the printed invite ID for administration. Share the complete generated URL:

```text
https://your-domain.example/invite#invite=SECURE_RANDOM_TOKEN
```

The token uses 32 cryptographically random bytes. The fragment keeps it out of the initial HTTP request. The client removes it from the address bar before resolving it, sends it once to the server, and does not put it in browser storage or analytics. Legacy `?invite=TOKEN` links work too and are scrubbed immediately during client initialization; unlike fragments, query parameters necessarily reach the server on the initial request. Prefer fragment links.

The server verifies the token against an HMAC hash and establishes a signed `HttpOnly`, `SameSite=Strict` cookie, with `Secure` in production. Cookies last 31 days; reopening an active invitation link restores access. Refreshing `/invite` uses that authenticated session. A missing or revoked invitation shows a recovery screen instead of silently treating the visitor as private. Tokens have no automatic expiry; revoke them explicitly:

```sh
npm run invite:revoke -- INVITE_UUID
```

Revocation preserves booking history and disables further authenticated changes and notification delivery. Rotating the pepper invalidates old invitation links; rotating the session secret invalidates old cookies.

The link proves possession of an invitation, not a person's physical identity. No IP address, user agent, device model, OS, browser fingerprint, phone number, or inferred identity is used for authentication.

Private event, save, and replay-reconciliation requests also carry the resolved non-secret invite ID. The server requires it to match the invite inside the signed cookie. If another private link replaces that cookie in a different tab, an older tab receives a session-changed error and cannot write or attribute events to the newer invitation.

## One saved plan, deliberate revisions

Each private invite owns **one current reservation**. The first food selection saves it. Replaying or refreshing the story never creates another booking. Identical choices return the existing reservation. Different choices show a review screen and require **Save these changes ♡**; **Keep our original plan** discards the proposed change.

Every intentional update keeps the same reservation ID, increments its version, and appends an immutable revision. A database row lock serializes concurrent writes. A request ID makes repeated submissions safe; expected-version checks stop an old tab from silently overwriting a newer plan. The browser retains unresolved request IDs so a refresh or network retry can recover safely. The final success screen appears only after private persistence succeeds.

Returning from Telegram or replaying the story resets the presentation; the saved server reservation remains intact. The final link visibly says **Back to him ♡** and opens `https://t.me/realferuzbek`, allowing Telegram's normal app/browser handling.

## Telegram delivery and manual recovery

A private visit records this exact message once per invitation/tab session:

> 👀 Your private invitation was opened.

The opaque visit ID lives in `sessionStorage`, so refresh and replay reuse it. A separate visit can produce a new opened milestone. Deduplication happens in the database; the visit ID is not an authentication credential. YES is tracked as an event without an extra Telegram notification.

The first private reservation sends “💌 SHE SAID YES.” with its selected date, time, food, timezone, status, and submission timestamp. An intentional revision sends a clearly labeled “💌 Date plans updated.” notification. It remains an update to the existing booking.

Reservation, revision, request record, and notification ledger commit in one transaction **before** Telegram is called. Milestone events and their notification ledger also commit together. An atomic claim prevents two requests from sending the same ledger entry. Telegram calls time out after eight seconds.

`after` uses Next.js's request lifecycle support; [Vercel recommends this API for supported Next.js versions](https://vercel.com/docs/functions/functions-api-reference/vercel-functions-package#usage-with-nextjs). It is not a durable queue, and deployment-specific behavior still needs a live smoke test. If that test is unreliable, set `TELEGRAM_DELIVERY_MODE=direct` and redeploy. Direct mode still saves first. There are **no cron jobs, scheduler endpoints, or automatic retries**.

Inspect events and delivery outcomes:

```sh
npm run events:report
```

| Delivery state | Meaning and action |
| --- | --- |
| `pending` | Persisted and awaiting its initial delivery attempt. Inspect runtime logs if it stays here; the retry command deliberately refuses it. |
| `sending` | Claimed; an interrupted attempt may have delivered. Treat a stale record as uncertain. |
| `sent` | Telegram confirmed a message ID. No further send. |
| `failed` | Definitively rejected, or credentials were missing before any send. Correct the cause, then retry manually. |
| `unknown` | A timeout, network failure, or inconclusive response means delivery cannot be determined. Never automatically resend. |

Retry one definitively failed notification:

```sh
npm run notifications:retry -- NOTIFICATION_UUID
```

This command atomically claims **only `failed`** entries belonging to an active invitation. It refuses `unknown`, `sending`, `pending`, and `sent` entries. Concurrent administrative retries cannot claim the same entry. Do not relabel an uncertain delivery as failed just to force a resend. Telegram does not provide an idempotency key for `sendMessage`, so an uncertain network outcome cannot honestly be called exactly-once delivery. The persisted booking remains safe regardless of the notification outcome.

Historical outbox records remain preserved. Migration imports old nonconfirmed deliveries as `unknown`; it does not resend them.

## Architecture and event model

```text
src/app/                       Pages, layout, native Next route handlers
  invite/                      Private entry page
  api/invitation/{resolve,session}/  Token exchange and session recovery
  api/reservation/             Authenticated read/save
  api/events/                  Validated event batches
src/config/invitation.ts       Personal assets, copy options, time/food/event constants
src/features/invitation/       Story reducer, React stages, CSS modules
  hooks/                       Audio, NO geometry, session resolution, analytics
src/lib/server/               Authentication, validation, bookings, Telegram delivery
src/lib/db/                   Neon transport and Drizzle schema
drizzle/                      Transactional migrations and booking SQL function
scripts/                      Migration, invitation, reporting, retry, event purge
public/assets/{images,audio}/  Supplied personal media
tests/{unit,integration,e2e}/  State, geometry, server, SQL, and browser checks
```

The client story is a reducer with question → reaction → surprise → schedule → food → final states. Authentication, analytics, audio, and presentation are separate. Native date/time fields use Tashkent time; both client and server validate input. NO keeps its deterministic escape scoring, checks the whole movement path for collisions with YES, and measures layout coordinates independently of its current animation. Keyboard and reduced-motion users get stationary playful feedback.

Events use an allowlist:

```text
visit_started, screen_1_viewed, no_button_attempted, yes_clicked,
screen_2_viewed, okay_clicked, date_screen_viewed, date_selected,
time_selected, date_confirmed, food_screen_viewed, food_selected,
final_screen_viewed, telegram_clicked
```

Each event contains a random event ID, opaque session ID, name, explicit public/private mode, client occurrence timestamp, and server receipt timestamp. Private events are associated with the server-authenticated invite. Analytics stores no selected date/time/food values, raw tokens, free-form metadata, IP addresses, or user agents. Date/time/food live only in booking records when private selections are saved.

Event IDs deduplicate retries. Client batches are bounded and flushed on milestones and page lifecycle changes; browser termination can still lose unsent analytics. Only authenticated private `visit_started` events can create opened notifications. Public batches ignore private cookies entirely.

All mutation routes enforce same-origin requests, strict schemas, limited request bodies, and parameterized SQL. Reservation writes require server authentication regardless of client fields. Rate limiting is process-local and best effort; database constraints provide persistent deduplication. Private responses use `no-store`. Security headers restrict framing, referrers, and resource origins; metadata requests no indexing. Static assets are public, while bot credentials and token hashes stay server-side.

Purge old events manually when appropriate:

```sh
npm run data:purge
```

It removes events older than 30 days. No automatic purge is installed. Reservation history and notification deduplication records remain until the administrator deliberately removes them; revocation alone does not delete history.

## Tests and visual QA

```sh
npm run lint
npm run typecheck
npm run test
npm run build
npx playwright install chromium firefox webkit
npm run test:e2e
npm run test:screenshots
```

Vitest exercises the state machine, validation, token/session security, audio lifecycle, NO geometry, event batching, real SQL migrations/transactions using temporary PGlite, and mocked Telegram outcomes. Browser tests exercise public/private flows separately, retries, replay, intentional revisions, pointer and touch interaction, keyboard access, reduced motion, asset playback, accessibility, and six widths: 360, 390, 768, 1024, 1440, 1920 pixels. Browser private APIs are mocked so routine QA cannot send a real notification. See `tests/README.md` for the detailed suite map and screenshot locations.

To test a production build, start `npm run start` on another port and set `PLAYWRIGHT_BASE_URL` to its origin before `npm run test:e2e`. Set `APP_ORIGIN` to the same origin. The Playwright runner uses that server instead of starting development mode.

## Deploy and verify the live private flow

1. Import this repository into Vercel as a Next.js project and connect a Neon database.
2. Add the environment variables above. Use the final HTTPS domain for `APP_ORIGIN`; configure separate values for Preview if needed.
3. Apply the checked-in migrations against that database from a trusted terminal. Build and deploy. No cron configuration is needed.
4. Generate a **separate test invitation** with the production configuration. Open the fragment link and verify the address bar is clean, an opened ledger record is `sent`, and the exact opened message reaches your chat.
5. Finish that test flow. Verify one current reservation, one revision, and a reservation notification. Refresh and replay identical choices: the reservation/revision count must stay unchanged. Deliberately change a choice, confirm it, and verify version two and one update notification.
6. Open `/` in that same browser and finish the public flow. Verify no new private booking or Telegram notification. Revoke the test invite when finished.
7. If the `after` delivery fails on the target runtime, switch to `direct`, redeploy, and repeat with another test invite. Retry only definitively failed ledger records using the command above.
8. Generate the real private invitation and share its fragment URL privately.

Local automated SQL and mocked Telegram checks do not prove that a particular production database, bot/chat, or Vercel environment is configured correctly. The live smoke test is the final deployment check.
