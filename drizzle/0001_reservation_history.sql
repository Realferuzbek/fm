ALTER TABLE reservations ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS reservation_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), reservation_id uuid NOT NULL REFERENCES reservations(id) ON DELETE RESTRICT,
  version integer NOT NULL CHECK (version > 0), request_id uuid NOT NULL,
  date varchar(10) NOT NULL, time varchar(5) NOT NULL, food varchar(32) NOT NULL,
  time_zone varchar(64) NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reservation_revisions_version_unique UNIQUE(reservation_id, version),
  CONSTRAINT reservation_revisions_request_unique UNIQUE(reservation_id, request_id)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS notification_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), invite_id uuid NOT NULL REFERENCES invites(id) ON DELETE RESTRICT,
  kind varchar(32) NOT NULL CHECK (kind IN ('invitation_opened','reservation_confirmed','reservation_updated')),
  dedupe_key varchar(160) NOT NULL, revision_id uuid REFERENCES reservation_revisions(id) ON DELETE RESTRICT,
  status varchar(16) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sending','sent','failed','unknown')),
  telegram_message_id varchar(64), attempts integer NOT NULL DEFAULT 0, last_error varchar(256),
  last_attempt_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notification_deliveries_dedupe_unique UNIQUE(invite_id, kind, dedupe_key)
);
--> statement-breakpoint
INSERT INTO reservation_revisions(reservation_id,version,request_id,date,time,food,time_zone,created_at)
SELECT id,version,gen_random_uuid(),date,time,food,time_zone,updated_at FROM reservations
ON CONFLICT (reservation_id,version) DO NOTHING;
--> statement-breakpoint
-- Legacy pending/error records are never automatically redelivered. Preserve their original outbox verbatim.
INSERT INTO notification_deliveries(invite_id,kind,dedupe_key,revision_id,status,telegram_message_id,attempts,last_error,last_attempt_at,created_at)
SELECT r.invite_id,'reservation_confirmed','revision:'||v.id,v.id,
  CASE WHEN o.state='sent' THEN 'sent' ELSE 'unknown' END,
  o.telegram_message_id,COALESCE(o.attempts,0),
  CASE WHEN o.state='sent' THEN NULL ELSE 'Imported historical delivery; do not resend.' END,
  o.last_attempt_at,v.created_at
FROM reservations r JOIN reservation_revisions v ON v.reservation_id=r.id AND v.version=r.version
LEFT JOIN notification_outbox o ON o.reservation_id=r.id
ON CONFLICT (invite_id,kind,dedupe_key) DO NOTHING;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION invitation_reservation_snapshot(r reservations) RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT CASE WHEN r.id IS NULL THEN NULL ELSE jsonb_build_object('id',r.id,'date',r.date,'time',r.time,'food',r.food,'version',r.version) END
$$;
--> statement-breakpoint
-- An invite row lock serializes initial inserts, retries, and intentional updates.
-- The whole function runs in one Postgres transaction, including its notification ledger write.
CREATE OR REPLACE FUNCTION save_invitation_reservation(
  p_invite uuid,p_request uuid,p_expected integer,p_date text,p_time text,p_food text
) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  current_row reservations%ROWTYPE;
  prior reservation_revisions%ROWTYPE;
  revision_id uuid;
  delivery_id uuid;
  delivery_status text;
  result_kind text;
BEGIN
  PERFORM id FROM invites WHERE id=p_invite AND status='active' FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status','forbidden'); END IF;
  SELECT * INTO current_row FROM reservations WHERE invite_id=p_invite;
  IF current_row.id IS NOT NULL THEN
    SELECT * INTO prior FROM reservation_revisions WHERE reservation_id=current_row.id AND request_id=p_request;
    IF prior.id IS NOT NULL THEN
      IF prior.date<>p_date OR prior.time<>p_time OR prior.food<>p_food OR prior.version<>p_expected+1 THEN
        RETURN jsonb_build_object('status','conflict','reservation',invitation_reservation_snapshot(current_row));
      END IF;
      SELECT id,status INTO delivery_id,delivery_status FROM notification_deliveries WHERE revision_id=prior.id;
      RETURN jsonb_build_object('status','replayed','reservation',invitation_reservation_snapshot(current_row),'notificationId',delivery_id,'notificationStatus',delivery_status);
    END IF;
    IF current_row.date=p_date AND current_row.time=p_time AND current_row.food=p_food THEN
      RETURN jsonb_build_object('status','unchanged','reservation',invitation_reservation_snapshot(current_row),'notificationStatus',NULL);
    END IF;
  END IF;
  IF COALESCE(current_row.version,0)<>p_expected THEN
    RETURN jsonb_build_object('status','conflict','reservation',invitation_reservation_snapshot(current_row));
  END IF;
  IF p_food NOT IN ('donar','lavash','shashlik','taco','lagmon','osh') OR
     (p_date||' '||p_time)::timestamp AT TIME ZONE 'Asia/Tashkent' <= now() THEN
    RETURN jsonb_build_object('status','invalid','reservation',invitation_reservation_snapshot(current_row));
  END IF;
  IF current_row.id IS NULL THEN
    INSERT INTO reservations(invite_id,date,time,food,time_zone,version)
    VALUES(p_invite,p_date,p_time,p_food,'Asia/Tashkent',1) RETURNING * INTO current_row;
    result_kind := 'created';
  ELSE
    UPDATE reservations SET date=p_date,time=p_time,food=p_food,version=version+1,updated_at=now()
    WHERE id=current_row.id RETURNING * INTO current_row;
    result_kind := 'updated';
  END IF;
  INSERT INTO reservation_revisions(reservation_id,version,request_id,date,time,food,time_zone)
  VALUES(current_row.id,current_row.version,p_request,p_date,p_time,p_food,'Asia/Tashkent') RETURNING id INTO revision_id;
  INSERT INTO notification_deliveries(invite_id,kind,dedupe_key,revision_id)
  VALUES(p_invite,CASE WHEN result_kind='created' THEN 'reservation_confirmed' ELSE 'reservation_updated' END,'revision:'||revision_id,revision_id)
  RETURNING id,status INTO delivery_id,delivery_status;
  RETURN jsonb_build_object('status',result_kind,'reservation',invitation_reservation_snapshot(current_row),'notificationId',delivery_id,'notificationStatus',delivery_status);
END $$;
