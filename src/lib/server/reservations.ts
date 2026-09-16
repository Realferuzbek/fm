import "server-only";
import type { LocationId } from "@/config/invitation";
import { executeSql, type SqlExecutor } from "@/lib/db";
import type { ReservationInput } from "./validation";

export interface ReservationSnapshot {
  id: string;
  date: string;
  time: string;
  food: string;
  location: LocationId | null;
  version: number;
}

export interface SaveReservationResult {
  status: "created" | "updated" | "replayed" | "unchanged" | "conflict" | "forbidden" | "invalid";
  reservation: ReservationSnapshot | null;
  notificationId?: string;
  notificationStatus?: string | null;
}

export async function getCurrentReservation(inviteId: string, sql: SqlExecutor = executeSql) {
  const [row] = await sql<ReservationSnapshot>(
    "SELECT id,date,time,food,location,version FROM reservations WHERE invite_id=$1", [inviteId]);
  return row ?? null;
}

export async function saveReservation(inviteId: string, input: ReservationInput, sql: SqlExecutor = executeSql) {
  // A single Postgres function locks the invite and commits booking, revision,
  // idempotency record, and delivery ledger together over Neon's HTTP transport.
  const [row] = await sql<{ result: SaveReservationResult }>(
    "SELECT save_invitation_reservation($1::uuid,$2::uuid,$3::integer,$4::text,$5::text,$6::text,$7::text) AS result",
    [inviteId, input.requestId, input.expectedVersion, input.date, input.time, input.food, input.location]);
  return row.result;
}
