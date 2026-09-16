CREATE TABLE IF NOT EXISTS reservation_requests (
  invite_id uuid NOT NULL REFERENCES invites(id) ON DELETE RESTRICT,
  request_id uuid NOT NULL, expected_version integer NOT NULL,
  date varchar(10) NOT NULL, time varchar(5) NOT NULL, food varchar(32) NOT NULL,
  revision_id uuid REFERENCES reservation_revisions(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(invite_id,request_id)
);
--> statement-breakpoint
INSERT INTO reservation_requests(invite_id,request_id,expected_version,date,time,food,revision_id,created_at)
SELECT r.invite_id,v.request_id,v.version-1,v.date,v.time,v.food,v.id,v.created_at
FROM reservation_revisions v JOIN reservations r ON r.id=v.reservation_id
ON CONFLICT(invite_id,request_id) DO NOTHING;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION save_invitation_reservation(
  p_invite uuid,p_request uuid,p_expected integer,p_date text,p_time text,p_food text
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
    IF prior.date<>p_date OR prior.time<>p_time OR prior.food<>p_food OR prior.expected_version<>p_expected THEN
      RETURN jsonb_build_object('status','conflict','reservation',invitation_reservation_snapshot(current_row));
    END IF;
    SELECT id,status INTO delivery_id,delivery_status FROM notification_deliveries WHERE notification_deliveries.revision_id=prior.revision_id;
    RETURN jsonb_build_object('status','replayed','reservation',invitation_reservation_snapshot(current_row),'notificationId',delivery_id,'notificationStatus',delivery_status);
  END IF;
  IF current_row.id IS NOT NULL AND current_row.date=p_date AND current_row.time=p_time AND current_row.food=p_food THEN
    INSERT INTO reservation_requests(invite_id,request_id,expected_version,date,time,food)
    VALUES(p_invite,p_request,p_expected,p_date,p_time,p_food);
    RETURN jsonb_build_object('status','unchanged','reservation',invitation_reservation_snapshot(current_row),'notificationStatus',NULL);
  END IF;
  IF COALESCE(current_row.version,0)<>p_expected THEN
    RETURN jsonb_build_object('status','conflict','reservation',invitation_reservation_snapshot(current_row));
  END IF;
  IF p_food NOT IN ('donar','lavash','shashlik','taco','lagmon','osh') OR
    p_date !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR p_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' OR
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
  INSERT INTO reservation_requests(invite_id,request_id,expected_version,date,time,food,revision_id)
  VALUES(p_invite,p_request,p_expected,p_date,p_time,p_food,revision_id);
  INSERT INTO notification_deliveries(invite_id,kind,dedupe_key,revision_id)
  VALUES(p_invite,CASE WHEN result_kind='created' THEN 'reservation_confirmed' ELSE 'reservation_updated' END,'revision:'||revision_id,revision_id)
  RETURNING id,status INTO delivery_id,delivery_status;
  RETURN jsonb_build_object('status',result_kind,'reservation',invitation_reservation_snapshot(current_row),'notificationId',delivery_id,'notificationStatus',delivery_status);
END $$;
