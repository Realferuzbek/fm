import {
  index,
  integer,
  pgEnum,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar
} from "drizzle-orm/pg-core";

export const inviteStatusEnum = pgEnum("invite_status", ["active", "revoked"]);
export const eventModeEnum = pgEnum("event_mode", ["public", "private"]);
export const outboxStateEnum = pgEnum("outbox_state", ["pending", "sending", "sent", "failed", "ambiguous"]);
export const outboxOperationEnum = pgEnum("outbox_operation", ["send", "edit"]);

/**
 * An invite is deliberately minimal: a one-way HMAC of the bearer token is
 * enough to validate it, so a database leak cannot turn into usable links.
 */
export const invites = pgTable(
  "invites",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    status: inviteStatusEnum("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true })
  },
  (table) => [uniqueIndex("invites_token_hash_unique").on(table.tokenHash), index("invites_status_idx").on(table.status)]
);

/** One current reservation per private invite; later valid submissions update it. */
export const reservations = pgTable(
  "reservations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    inviteId: uuid("invite_id")
      .notNull()
      .references(() => invites.id, { onDelete: "cascade" }),
    date: varchar("date", { length: 10 }).notNull(),
    time: varchar("time", { length: 5 }).notNull(),
    food: varchar("food", { length: 32 }).notNull(),
    timeZone: varchar("time_zone", { length: 64 }).notNull().default("Asia/Tashkent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [uniqueIndex("reservations_invite_id_unique").on(table.inviteId)]
);

/**
 * The outbox makes Telegram delivery durable and lets an updated reservation
 * edit the original message instead of creating a second notification.
 */
export const notificationOutbox = pgTable(
  "notification_outbox",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    reservationId: uuid("reservation_id")
      .notNull()
      .references(() => reservations.id, { onDelete: "cascade" }),
    state: outboxStateEnum("state").notNull().default("pending"),
    operation: outboxOperationEnum("operation").notNull().default("send"),
    payloadHash: varchar("payload_hash", { length: 64 }).notNull(),
    telegramMessageId: varchar("telegram_message_id", { length: 64 }),
    attempts: integer("attempts").notNull().default(0),
    lastError: varchar("last_error", { length: 512 }),
    lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
    ambiguousAt: timestamp("ambiguous_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    uniqueIndex("notification_outbox_reservation_id_unique").on(table.reservationId),
    index("notification_outbox_due_idx").on(table.state, table.nextAttemptAt)
  ]
);

/**
 * Milestone-only telemetry. There are intentionally no IP, user-agent,
 * fingerprint, raw invite token, or free-form properties columns here.
 */
export const events = pgTable(
  "events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    eventId: varchar("event_id", { length: 64 }).notNull(),
    sessionId: varchar("session_id", { length: 128 }).notNull(),
    name: varchar("name", { length: 64 }).notNull(),
    mode: eventModeEnum("mode").notNull(),
    inviteId: uuid("invite_id").references(() => invites.id, { onDelete: "set null" }),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    uniqueIndex("events_event_id_unique").on(table.eventId),
    index("events_received_at_idx").on(table.receivedAt),
    index("events_invite_id_idx").on(table.inviteId)
  ]
);

export type Invite = typeof invites.$inferSelect;
export type Reservation = typeof reservations.$inferSelect;
export type NotificationOutbox = typeof notificationOutbox.$inferSelect;
