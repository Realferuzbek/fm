DO $$ BEGIN
  CREATE TYPE invite_status AS ENUM ('active', 'revoked');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE event_mode AS ENUM ('public', 'private');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE outbox_state AS ENUM ('pending', 'sending', 'sent', 'failed', 'ambiguous');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE outbox_operation AS ENUM ('send', 'edit');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), token_hash varchar(64) NOT NULL,
  status invite_status NOT NULL DEFAULT 'active', created_at timestamptz NOT NULL DEFAULT now(), revoked_at timestamptz
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS invites_token_hash_unique ON invites(token_hash);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), invite_id uuid NOT NULL REFERENCES invites(id),
  date varchar(10) NOT NULL, time varchar(5) NOT NULL, food varchar(32) NOT NULL,
  time_zone varchar(64) NOT NULL DEFAULT 'Asia/Tashkent', created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS reservations_invite_id_unique ON reservations(invite_id);
--> statement-breakpoint
-- Historical outbox is retained, but no runtime code reads or delivers it.
CREATE TABLE IF NOT EXISTS notification_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), reservation_id uuid NOT NULL REFERENCES reservations(id),
  state outbox_state NOT NULL DEFAULT 'pending', operation outbox_operation NOT NULL DEFAULT 'send',
  payload_hash varchar(64) NOT NULL, telegram_message_id varchar(64), attempts integer NOT NULL DEFAULT 0,
  last_error varchar(512), last_attempt_at timestamptz, next_attempt_at timestamptz, ambiguous_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS notification_outbox_reservation_id_unique ON notification_outbox(reservation_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), event_id varchar(64) NOT NULL, session_id varchar(128) NOT NULL,
  name varchar(64) NOT NULL, mode event_mode NOT NULL, invite_id uuid REFERENCES invites(id) ON DELETE SET NULL,
  occurred_at timestamptz NOT NULL, received_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS events_event_id_unique ON events(event_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS events_received_at_idx ON events(received_at);
