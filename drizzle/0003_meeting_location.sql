-- Preserve every existing booking, immutable revision, request, and delivery.
-- A null location means the booking predates meeting-spot selection.
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS location varchar(16)
  CONSTRAINT reservations_location_check CHECK (location IN ('IB','LRC','Lyceum','SHB','ATB','Sport Hall'));
--> statement-breakpoint
ALTER TABLE reservation_revisions ADD COLUMN IF NOT EXISTS location varchar(16)
  CONSTRAINT reservation_revisions_location_check CHECK (location IN ('IB','LRC','Lyceum','SHB','ATB','Sport Hall'));
--> statement-breakpoint
ALTER TABLE reservation_requests ADD COLUMN IF NOT EXISTS location varchar(16)
  CONSTRAINT reservation_requests_location_check CHECK (location IN ('IB','LRC','Lyceum','SHB','ATB','Sport Hall'));
--> statement-breakpoint
CREATE OR REPLACE FUNCTION invitation_reservation_snapshot(r reservations) RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT CASE WHEN r.id IS NULL THEN NULL ELSE jsonb_build_object(
    'id',r.id,'date',r.date,'time',r.time,'food',r.food,'location',r.location,'version',r.version) END
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION save_invitation_reservation(
  p_invite uuid,p_request uuid,p_expected integer,p_date text,p_time text,p_food text,p_location text
) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  current_row reservations%ROWTYPE;
  prior reservation_requests%ROWTYPE;
  revision_id uuid;
  delivery_id uuid;
  delivery_status text;
  result_kind text;
BEGIN
  PERFORM id FROM invites WHERE id=p_invite AND status='active' FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status','forbidden'); END IF;
  SELECT * INTO current_row FROM reservations WHERE invite_id=p_invite;
  SELECT * INTO prior FROM reservation_requests WHERE invite_id=p_invite AND request_id=p_request;
  IF prior.request_id IS NOT NULL THEN
    IF prior.date IS DISTINCT FROM p_date OR prior.time IS DISTINCT FROM p_time OR
      prior.food IS DISTINCT FROM p_food OR prior.location IS DISTINCT FROM p_location OR
      prior.expected_version IS DISTINCT FROM p_expected THEN
      RETURN jsonb_build_object('status','conflict','reservation',invitation_reservation_snapshot(current_row));
    END IF;
    SELECT id,status INTO delivery_id,delivery_status FROM notification_deliveries WHERE notification_deliveries.revision_id=prior.revision_id;
    RETURN jsonb_build_object('status','replayed','reservation',invitation_reservation_snapshot(current_row),'notificationId',delivery_id,'notificationStatus',delivery_status);
  END IF;
  IF current_row.id IS NOT NULL AND current_row.date=p_date AND current_row.time=p_time AND current_row.food=p_food AND current_row.location IS NOT DISTINCT FROM p_location THEN
    INSERT INTO reservation_requests(invite_id,request_id,expected_version,date,time,food,location)
    VALUES(p_invite,p_request,p_expected,p_date,p_time,p_food,p_location);
    RETURN jsonb_build_object('status','unchanged','reservation',invitation_reservation_snapshot(current_row),'notificationStatus',NULL);
  END IF;
  IF COALESCE(current_row.version,0)<>p_expected THEN
    RETURN jsonb_build_object('status','conflict','reservation',invitation_reservation_snapshot(current_row));
  END IF;
  -- Current rules apply to new bookings and intentional revisions only.
  -- Historical retries above preserve their original choices and delivery state.
  IF p_location IS NULL OR p_location NOT IN ('IB','LRC','Lyceum','SHB','ATB','Sport Hall') OR
    p_food IS NULL OR p_food NOT IN ('donar','lavash','shashlik','taco','lagmon','osh') OR
    p_date IS NULL OR p_date !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR
    p_time IS NULL OR p_time !~ '^((09|1[0-9]):(00|30)|20:00)$' THEN
    RETURN jsonb_build_object('status','invalid','reservation',invitation_reservation_snapshot(current_row));
  END IF;
  IF (p_date||' '||p_time)::timestamp AT TIME ZONE 'Asia/Tashkent' <= now() THEN
    RETURN jsonb_build_object('status','invalid','reservation',invitation_reservation_snapshot(current_row));
  END IF;
  IF current_row.id IS NULL THEN
    INSERT INTO reservations(invite_id,date,time,food,location,time_zone,version)
    VALUES(p_invite,p_date,p_time,p_food,p_location,'Asia/Tashkent',1) RETURNING * INTO current_row;
    result_kind := 'created';
  ELSE
    UPDATE reservations SET date=p_date,time=p_time,food=p_food,location=p_location,version=version+1,updated_at=now()
    WHERE id=current_row.id RETURNING * INTO current_row;
    result_kind := 'updated';
  END IF;
  INSERT INTO reservation_revisions(reservation_id,version,request_id,date,time,food,location,time_zone)
  VALUES(current_row.id,current_row.version,p_request,p_date,p_time,p_food,p_location,'Asia/Tashkent') RETURNING id INTO revision_id;
  INSERT INTO reservation_requests(invite_id,request_id,expected_version,date,time,food,location,revision_id)
  VALUES(p_invite,p_request,p_expected,p_date,p_time,p_food,p_location,revision_id);
  INSERT INTO notification_deliveries(invite_id,kind,dedupe_key,revision_id)
  VALUES(p_invite,CASE WHEN result_kind='created' THEN 'reservation_confirmed' ELSE 'reservation_updated' END,'revision:'||revision_id,revision_id)
  RETURNING id,status INTO delivery_id,delivery_status;
  RETURN jsonb_build_object('status',result_kind,'reservation',invitation_reservation_snapshot(current_row),'notificationId',delivery_id,'notificationStatus',delivery_status);
END $$;
--> statement-breakpoint
-- Preserve the old signature for in-flight historical retries during rollout.
-- It cannot create a new booking or revision without a meeting spot.
CREATE OR REPLACE FUNCTION save_invitation_reservation(
  p_invite uuid,p_request uuid,p_expected integer,p_date text,p_time text,p_food text
) RETURNS jsonb LANGUAGE sql AS $$
  SELECT save_invitation_reservation(p_invite,p_request,p_expected,p_date,p_time,p_food,NULL::text)
$$;
