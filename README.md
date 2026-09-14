# A tiny date story ♡

A polished, single-page date invitation designed to feel personal: a playful evasive **NO** button, a real date-and-time choice, a personal food choice, and a private Telegram notification only for the intended invitation link.

It is intentionally a two-mode experience:

- **Public/demo mode** is the ordinary URL. Anyone can enjoy the complete flow, but it never sends a reservation notification.
- **Private invitation mode** starts from a secure invite token. Only a server-verified private session can create or update the Telegram reservation.

## Quick start

### Requirements

- Node.js 20.9 or newer
- npm 10 or newer
- A Neon/Postgres database for private invitations and events
- A Telegram bot and the private chat ID that should receive reservations

### Local setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy the environment template and fill in the server-only values:

   ```bash
   Copy-Item .env.example .env.local
   ```

   On macOS/Linux:

   ```bash
   cp .env.example .env.local
   ```

3. Create the database schema:

   ```bash
   npm run db:generate
   npm run db:migrate
   ```

4. Add the optional personal assets described below.

5. Start the site:

   ```bash
   npm run dev
   ```

   Visit [http://localhost:3000](http://localhost:3000) for public/demo mode.

## Personal assets

Keep private/personal media out of Git unless that is intentional.

| Asset | Default location | Supported formats | Notes |
| --- | --- | --- | --- |
| Pet photo | `public/assets/images/pet-photo.jpg` | `.png`, `.jpg`, `.jpeg`, `.webp` | The photo lives in a responsive, cropped frame, so source dimensions do not need to match a fixed size. |
| Background music | `public/assets/audio/background.mp3` | `.mp3`, `.wav`, `.m4a` | It is loaded without visible player controls and does not block initial rendering. |

To use a different filename, edit the single asset-path entry in `src/config/invitation.ts`. The image crop can also be adjusted there with its CSS object-position setting.

The app attempts autoplay on first load. Browsers may block that attempt; when they do, the app quietly tries again on the first natural pointer or keyboard interaction. It does not claim to detect system mute or speaker volume, because a webpage cannot reliably do that.

## Telegram setup

1. Create a bot with [@BotFather](https://t.me/BotFather) and copy its token.
2. Send the bot a message from the private target chat/group, then obtain the chat ID using your preferred Telegram Bot API workflow.
3. Set `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` in `.env.local` locally and in Vercel's encrypted environment variables in production.
4. Never add either value to client code, `NEXT_PUBLIC_*` variables, committed files, screenshots, or issue reports.

The first completed private invitation writes one reservation and sends one Telegram message. A retried request returns the same reservation rather than sending another message. If the private visitor changes their date, time, or food later, the server updates the existing Telegram message instead of creating a second notification. A failed delivery stays in the outbox for the secured scheduled retry.

## Creating and sharing a private invitation

Generate an invitation only from a trusted terminal with server environment variables available:

```bash
npm run invite:create
```

The command prints a link in this form exactly once:

```text
https://your-domain.example/#invite=SECURE_RANDOM_TOKEN
```

Send that complete URL only to the intended recipient. The `#invite=` form is canonical because URL fragments are not sent in the initial page request. For compatibility, `?invite=TOKEN` also works; the client resolves it and immediately removes it from the visible address bar.

The raw token is never stored in the database. The server stores an HMAC/SHA-256-derived value using `INVITE_TOKEN_PEPPER`, validates the invite, and sets a signed, `HttpOnly`, `SameSite=Strict` session cookie. Client-side state is never trusted as proof of private mode.

To revoke an invite:

```bash
npm run invite:revoke -- INVITE_ID
```

Private invite tokens do not expire automatically. Revocation disables future reservation updates without affecting public/demo visitors.

## How the two modes work

| Capability | Public/demo | Private invitation |
| --- | --- | --- |
| Complete the five-screen story | Yes | Yes |
| Save a private reservation | No | Yes, after server token verification |
| Send or edit Telegram notification | Never | Yes, once per invite/reservation |
| Consume or affect another visitor's flow | No | No |
| Use identifiable device/IP/fingerprint checks | No | No |

No visitor is identified from an IP address, phone model, browser, operating system, fingerprint, or user agent. The invite token is the only identity signal that enables the private flow.

## Event tracking and privacy

The application records only product milestones needed to understand whether the story works:

```text
visit_started
screen_1_viewed
no_button_attempted
yes_clicked
screen_2_viewed
okay_clicked
date_screen_viewed
date_selected
time_selected
date_confirmed
food_screen_viewed
food_selected
final_screen_viewed
telegram_clicked
```

Each event contains an opaque session ID, event ID, allowlisted name, client occurrence time, and server receipt time. It does **not** store raw invite tokens, IP addresses, user agents, fingerprints, free-form event properties, or selected date/time/food values as analytics data. Event records are retained for 30 days. Private reservation data is retained only while its invite is active and is removed by the purge job after revocation.

## Environment variables

Copy `.env.example`; do not commit `.env.local`.

| Variable | Required | Purpose |
| --- | --- | --- |
| `APP_ORIGIN` | Yes | Canonical public origin; used for same-origin validation and generated invite links. |
| `DATABASE_URL` | Yes | Neon/Postgres connection URL, used only by server/database code. |
| `TELEGRAM_BOT_TOKEN` | Yes for private notifications | Telegram Bot API credential; server only. |
| `TELEGRAM_CHAT_ID` | Yes for private notifications | Target chat/group; server only. |
| `INVITE_TOKEN_PEPPER` | Yes | HMAC secret for one-way invite-token storage. |
| `INVITE_SESSION_SECRET` | Yes | Signing secret for private-session cookies. |
| `CRON_SECRET` | Yes in production | Authorizes the scheduled notification-outbox endpoint. |

Use distinct, high-entropy secrets for local, preview, and production environments. Rotating `INVITE_TOKEN_PEPPER` invalidates existing token lookups; rotating `INVITE_SESSION_SECRET` ends existing private sessions.

## API and security model

All state-changing endpoints are server-side and same-origin only:

| Endpoint | Purpose |
| --- | --- |
| `POST /api/invitation/resolve` | Verifies a supplied invite token and establishes a signed private session. |
| `POST /api/events` | Receives strictly allowlisted lightweight milestone events. |
| `POST /api/reservation` | Validates date, time, and food; requires a valid private session; creates/updates the reservation and Telegram outbox item. |
| `POST /api/internal/outbox` | Protected scheduled retry for pending Telegram notifications. |

The backend validates every input again, rejects a client-supplied `private` flag, limits body sizes, rate-limits abusive requests, disables permissive CORS, and uses `no-store` for invite resolution. Production headers include a restrictive content-security policy, `Referrer-Policy: no-referrer`, and `noindex` behavior to avoid accidental indexing or referrer leakage.

## Database operations and retention

Expected operational commands:

```bash
npm run db:generate
npm run db:migrate
npm run data:purge
```

Run `data:purge` as a protected daily scheduled task in production. The scheduled outbox retry should run separately through Vercel Cron and authenticate with `CRON_SECRET`; it must not be a publicly usable Telegram-send endpoint.

## Testing and quality checks

Run the full local verification suite before deployment:

```bash
npm run lint
npm run typecheck
npm run test
npm run test:e2e
npm run build
```

Tests cover the invitation reducer and schedule validation, Tashkent display formatting, allowlisted analytics events, NO-button bounds, private-token/session handling, route validation, idempotent reservation behavior, and public-versus-private notification isolation. Browser checks cover keyboard access, reduced motion, desktop and touch NO-button behavior, refresh recovery, no horizontal overflow, and the Telegram CTA.

## Deploying to Vercel

1. Create a Neon Postgres database through Vercel Marketplace (or connect an existing Neon project) and set `DATABASE_URL`.
2. Import this repository into Vercel.
3. Add every variable from `.env.example` to Production; add safe, separate values for Preview if preview private flows are needed.
4. Run migrations against the production database before enabling private links.
5. Configure the outbox retry schedule to call `/api/internal/outbox` with the `CRON_SECRET` authorization value.
6. Set `APP_ORIGIN` to the final `https://` custom domain, deploy, create a fresh private invite, and test it from a non-logged-in browser session.

Do not use a real private invitation link in public demos, screen recordings, issue trackers, or shared analytics. If one is exposed, revoke it and generate a new token.

## Design and accessibility notes

The NO button is intentionally playful, not a keyboard trap: desktop movement responds to pointer proximity, touch attempts cause a bounded alternate move, and keyboard users remain able to focus and activate it. It never leaves its reserved interaction region or causes layout shift. The experience supports `prefers-reduced-motion`, uses semantic buttons/labels, maintains visible focus, and uses real native date/time controls for mobile usability.

The final CTA visibly says only **Back to him ♡** and opens [Telegram](https://t.me/realferuzbek). Telegram itself handles the appropriate app/web fallback.
