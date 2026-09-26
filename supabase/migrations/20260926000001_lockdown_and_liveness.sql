-- Lock down rooms, friends, and goal sharing; add room liveness; add
-- atomic session save and search RPCs.
--
-- Why: every visitor gets an anonymous account, so "any authenticated user"
-- means anyone. Several tables were readable or writable that broadly:
--   * rooms, friend invites, and goal-share invites could be listed whole
--   * users could insert themselves into any room and edit their own join times
--   * goal-share invites could be created for someone else's goal
--   * room goals marked private were readable by every participant
-- After this migration, tables are read directly only where the reader is
-- entitled to the row, and every write that crosses users goes through a
-- SECURITY DEFINER function that checks it.
--
-- Liveness: rooms used to end only when the last person pressed End. Closed
-- tabs left ghost participants forever. Participants now send a heartbeat;
-- anyone silent for 5 minutes is marked as timed out (and revived if they
-- come back), and a room with nobody active for an hour ends.


-- ── Internal helpers (not callable through the API) ─────────────────────

-- 12 hex characters (48 random bits) for share codes.
CREATE OR REPLACE FUNCTION random_code() RETURNS text
LANGUAGE sql VOLATILE
AS $$
  SELECT substring(replace(gen_random_uuid()::text, '-', ''), 1, 12);
$$;

-- The goal id if the caller owns it, else NULL.
CREATE OR REPLACE FUNCTION owned_goal(p_goal_id uuid) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT id FROM goals WHERE id = p_goal_id AND user_id = auth.uid();
$$;

-- Normalizes a task list to [{name}], trimmed, non-empty, at most 50 tasks
-- of at most 200 characters. Room task lists are broadcast to everyone in
-- the room, so their size is bounded here.
CREATE OR REPLACE FUNCTION clean_tasks(p jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object('name', n) ORDER BY ord), '[]'::jsonb)
  FROM (
    SELECT left(trim(elem->>'name'), 200) AS n, ord
    FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof(p) = 'array' THEN p ELSE '[]'::jsonb END
    ) WITH ORDINALITY AS t(elem, ord)
    WHERE jsonb_typeof(elem) = 'object' AND COALESCE(trim(elem->>'name'), '') <> ''
    ORDER BY ord
    LIMIT 50
  ) s;
$$;

REVOKE EXECUTE ON FUNCTION random_code(), owned_goal(uuid), clean_tasks(jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION generate_handle(), generate_invite_code()
  FROM PUBLIC, anon, authenticated;


-- ── Share codes: longer and from a proper random source ─────────────────

CREATE OR REPLACE FUNCTION generate_invite_code() RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  candidate text;
BEGIN
  LOOP
    candidate := random_code();
    EXIT WHEN NOT EXISTS (SELECT 1 FROM friend_invites WHERE short_code = candidate);
  END LOOP;
  RETURN candidate;
END;
$$;


-- ── Profiles: visible only to people with a reason to see them ──────────

-- Yourself, friends, pending requests either way, anyone you've shared a
-- room with, and anyone you share a linked goal with.
CREATE OR REPLACE FUNCTION can_see_profile(target uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT target = auth.uid()
    OR EXISTS (
      SELECT 1 FROM friendships
      WHERE (user_a_id = auth.uid() AND user_b_id = target)
         OR (user_b_id = auth.uid() AND user_a_id = target))
    OR EXISTS (
      SELECT 1 FROM friend_requests
      WHERE (from_user_id = auth.uid() AND to_user_id = target)
         OR (to_user_id = auth.uid() AND from_user_id = target))
    OR EXISTS (
      SELECT 1 FROM room_participants me
      JOIN room_participants them ON them.room_id = me.room_id
      WHERE me.user_id = auth.uid() AND them.user_id = target)
    OR EXISTS (
      SELECT 1 FROM goals mine
      JOIN goals theirs ON theirs.link_group_id = mine.link_group_id
      WHERE mine.user_id = auth.uid() AND mine.link_group_id IS NOT NULL
        AND theirs.user_id = target);
$$;

GRANT EXECUTE ON FUNCTION can_see_profile(uuid) TO authenticated;

DROP POLICY IF EXISTS "profiles_readable" ON user_profiles;
CREATE POLICY "profiles_visible" ON user_profiles
  FOR SELECT USING (can_see_profile(user_id));

-- Handle changes go through update_handle(), which validates them.
DROP POLICY IF EXISTS "own_profile_update" ON user_profiles;

ALTER TABLE user_profiles
  ADD CONSTRAINT handle_length CHECK (char_length(handle) BETWEEN 1 AND 32);

CREATE OR REPLACE FUNCTION update_handle(p_new_handle text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  p_new_handle := trim(p_new_handle);
  IF length(p_new_handle) = 0 THEN
    RETURN jsonb_build_object('status', 'empty');
  END IF;
  IF length(p_new_handle) > 32 THEN
    RETURN jsonb_build_object('status', 'too_long');
  END IF;
  IF p_new_handle ~ '[[:cntrl:]]' THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;

  BEGIN
    UPDATE user_profiles SET handle = p_new_handle WHERE user_id = auth.uid();
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('status', 'taken');
  END;

  RETURN jsonb_build_object('status', 'ok', 'handle', p_new_handle);
END;
$$;

-- Nothing subscribes to profile changes any more; stop broadcasting them.
ALTER PUBLICATION supabase_realtime DROP TABLE user_profiles;


-- ── Friend invites: owner-only reads, lookup by code through an RPC ─────

DROP POLICY IF EXISTS "read_invite_by_code" ON friend_invites;
DROP POLICY IF EXISTS "own_invite" ON friend_invites;
CREATE POLICY "own_invite_read" ON friend_invites
  FOR SELECT USING (auth.uid() = user_id);

-- Who owns an invite code, for the invite landing page.
CREATE OR REPLACE FUNCTION get_friend_invite(p_code text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_owner uuid;
BEGIN
  SELECT user_id INTO v_owner FROM friend_invites WHERE short_code = p_code;
  IF v_owner IS NULL THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;
  RETURN jsonb_build_object(
    'status', CASE WHEN v_owner = auth.uid() THEN 'self' ELSE 'ok' END,
    'handle', (SELECT handle FROM user_profiles WHERE user_id = v_owner)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_friend_invite(text) TO authenticated;


-- ── Friend requests: only by invite code or after sharing a room ────────

DROP POLICY IF EXISTS "insert_own_outbound_request" ON friend_requests;

-- Shared by both entry points. Idempotent.
CREATE OR REPLACE FUNCTION create_friend_request(target uuid) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF target = auth.uid() THEN
    RETURN 'self';
  END IF;
  IF EXISTS (
    SELECT 1 FROM friendships
    WHERE user_a_id = LEAST(auth.uid(), target) AND user_b_id = GREATEST(auth.uid(), target)
  ) THEN
    RETURN 'already_friends';
  END IF;
  IF EXISTS (
    SELECT 1 FROM friend_requests
    WHERE (from_user_id = auth.uid() AND to_user_id = target)
       OR (from_user_id = target AND to_user_id = auth.uid())
  ) THEN
    RETURN 'already_requested';
  END IF;
  INSERT INTO friend_requests (from_user_id, to_user_id) VALUES (auth.uid(), target);
  RETURN 'sent';
END;
$$;

REVOKE EXECUTE ON FUNCTION create_friend_request(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION send_friend_request_by_code(invite_code text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  target uuid;
BEGIN
  SELECT user_id INTO target FROM friend_invites WHERE short_code = invite_code;
  IF target IS NULL THEN
    RETURN 'not_found';
  END IF;
  RETURN create_friend_request(target);
END;
$$;

-- From the Rate page: befriend someone you were just in a room with.
CREATE OR REPLACE FUNCTION send_friend_request_to_roommate(p_to uuid) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM room_participants me
    JOIN room_participants them ON them.room_id = me.room_id
    WHERE me.user_id = auth.uid() AND them.user_id = p_to
  ) THEN
    RETURN 'not_allowed';
  END IF;
  RETURN create_friend_request(p_to);
END;
$$;

GRANT EXECUTE ON FUNCTION send_friend_request_to_roommate(uuid) TO authenticated;


-- ── Room participants: liveness, private goals, no direct writes ────────

ALTER TABLE room_participants
  ADD COLUMN last_seen_at timestamptz NOT NULL DEFAULT now(),
  -- 'left' = pressed End; 'timeout' = went silent (revived on return).
  ADD COLUMN left_reason text CHECK (left_reason IN ('left', 'timeout')),
  -- Set by "stay with": a participant's own end time, visible to the room.
  ADD COLUMN target_end_at timestamptz;

UPDATE room_participants SET left_reason = 'left' WHERE left_at IS NOT NULL;

-- Deleting a session shouldn't be blocked by the room still pointing at it.
ALTER TABLE room_participants DROP CONSTRAINT IF EXISTS room_participants_session_id_fkey;
ALTER TABLE room_participants
  ADD CONSTRAINT room_participants_session_id_fkey
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE SET NULL;

-- Each participant's goal is private to them, so it moves out of the
-- broadcast row into an owner-only table.
CREATE TABLE room_participant_goals (
  room_id     uuid NOT NULL,
  user_id     uuid NOT NULL,
  goal_id     uuid REFERENCES goals(id) ON DELETE SET NULL,
  goal_label  text,
  PRIMARY KEY (room_id, user_id),
  FOREIGN KEY (room_id, user_id)
    REFERENCES room_participants(room_id, user_id) ON DELETE CASCADE
);

ALTER TABLE room_participant_goals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_room_goal_read" ON room_participant_goals
  FOR SELECT USING (auth.uid() = user_id);

INSERT INTO room_participant_goals (room_id, user_id, goal_id, goal_label)
  SELECT room_id, user_id, goal_id, goal_label
  FROM room_participants
  WHERE goal_id IS NOT NULL OR goal_label IS NOT NULL;

-- Hosts' goals lived on the room row; give them a private row too.
INSERT INTO room_participant_goals (room_id, user_id, goal_id, goal_label)
  SELECT r.id, r.host_user_id, r.goal_id, r.goal_label
  FROM rooms r
  JOIN room_participants p ON p.room_id = r.id AND p.user_id = r.host_user_id
  WHERE r.goal_id IS NOT NULL
  ON CONFLICT (room_id, user_id) DO NOTHING;

ALTER TABLE room_participants DROP COLUMN goal_id, DROP COLUMN goal_label;
ALTER TABLE rooms DROP COLUMN goal_id;

DROP POLICY IF EXISTS "insert_own_participation" ON room_participants;
DROP POLICY IF EXISTS "update_own_participation" ON room_participants;


-- ── Rooms: participants only; lookup by code through an RPC ─────────────

DROP POLICY IF EXISTS "read_room" ON rooms;
DROP POLICY IF EXISTS "host_writes_own_room" ON rooms;
CREATE POLICY "participants_read_room" ON rooms
  FOR SELECT USING (is_room_participant(id));

DROP FUNCTION IF EXISTS cancel_room(uuid);   -- never called by the app

-- Times out silent participants and ends rooms nobody has touched in an hour.
CREATE OR REPLACE FUNCTION sweep_room(p_room_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE room_participants
    SET left_at = last_seen_at, left_reason = 'timeout'
    WHERE room_id = p_room_id AND left_at IS NULL
      AND last_seen_at < now() - interval '5 minutes';

  UPDATE rooms
    SET ended_at = COALESCE(
      (SELECT max(COALESCE(left_at, last_seen_at)) FROM room_participants WHERE room_id = p_room_id),
      now())
    WHERE id = p_room_id AND ended_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM room_participants WHERE room_id = p_room_id AND left_at IS NULL)
      AND NOT EXISTS (
        SELECT 1 FROM room_participants
        WHERE room_id = p_room_id AND last_seen_at > now() - interval '1 hour');
END;
$$;

REVOKE EXECUTE ON FUNCTION sweep_room(uuid) FROM PUBLIC, anon, authenticated;

-- What the invite card needs, for anyone holding the code.
CREATE OR REPLACE FUNCTION get_room_preview(p_code text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  r rooms%ROWTYPE;
BEGIN
  SELECT * INTO r FROM rooms WHERE short_code = p_code;
  IF r.id IS NULL THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;
  PERFORM sweep_room(r.id);
  SELECT * INTO r FROM rooms WHERE id = r.id;
  IF r.ended_at IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'ended');
  END IF;
  RETURN jsonb_build_object(
    'status', 'ok',
    'room_id', r.id,
    'host_handle', (SELECT handle FROM user_profiles WHERE user_id = r.host_user_id),
    'session_name', r.session_name,
    'planned_duration_minutes', r.planned_duration_minutes,
    -- The host's goal is only shared when they chose to share their setup.
    'goal_label', CASE WHEN r.propagate_setup THEN r.goal_label END,
    'is_member', EXISTS (
      SELECT 1 FROM room_participants
      WHERE room_id = r.id AND user_id = auth.uid()
        AND (left_at IS NULL OR left_reason = 'timeout'))
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_room_preview(text) TO authenticated;

CREATE OR REPLACE FUNCTION create_room(
  p_duration integer,
  p_session_name text,
  p_goal_id uuid,
  p_goal_label text,
  p_tasks jsonb,
  p_propagate_setup boolean
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  new_code text;
  new_room_id uuid;
  v_goal uuid := owned_goal(p_goal_id);
  v_label text := NULLIF(left(trim(p_goal_label), 200), '');
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not signed in';
  END IF;
  IF p_duration IS NULL OR p_duration < 1 OR p_duration > 600 THEN
    RAISE EXCEPTION 'Duration must be between 1 and 600 minutes';
  END IF;

  LOOP
    new_code := random_code();
    EXIT WHEN NOT EXISTS (SELECT 1 FROM rooms WHERE short_code = new_code);
  END LOOP;

  INSERT INTO rooms (
    short_code, host_user_id, planned_duration_minutes,
    session_name, goal_label, tasks, propagate_setup
  ) VALUES (
    new_code, auth.uid(), p_duration,
    NULLIF(left(trim(p_session_name), 200), ''), v_label,
    clean_tasks(p_tasks), COALESCE(p_propagate_setup, false)
  ) RETURNING id INTO new_room_id;

  INSERT INTO room_participants (room_id, user_id, tasks)
    VALUES (new_room_id, auth.uid(), clean_tasks(p_tasks));

  IF v_goal IS NOT NULL OR v_label IS NOT NULL THEN
    INSERT INTO room_participant_goals (room_id, user_id, goal_id, goal_label)
      VALUES (new_room_id, auth.uid(), v_goal, v_label);
  END IF;

  RETURN new_code;
END;
$$;

CREATE OR REPLACE FUNCTION join_room_by_code(p_code text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  r rooms%ROWTYPE;
  me room_participants%ROWTYPE;
  v_active integer;
  v_host_link uuid;
  v_linked_goal uuid;
BEGIN
  SELECT * INTO r FROM rooms WHERE short_code = p_code FOR UPDATE;
  IF r.id IS NULL THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;
  PERFORM sweep_room(r.id);
  SELECT * INTO r FROM rooms WHERE id = r.id;
  IF r.ended_at IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'ended');
  END IF;

  SELECT * INTO me FROM room_participants WHERE room_id = r.id AND user_id = auth.uid();

  IF me.user_id IS NOT NULL THEN
    IF me.left_at IS NULL OR me.left_reason = 'timeout' THEN
      -- Still here, or coming back after going quiet: keep the clock.
      UPDATE room_participants
        SET left_at = NULL, left_reason = NULL, last_seen_at = now()
        WHERE room_id = r.id AND user_id = auth.uid();
    ELSE
      -- Pressed End earlier and came back: a fresh clock, same task list.
      UPDATE room_participants
        SET joined_at = now(), left_at = NULL, left_reason = NULL,
            last_seen_at = now(), target_end_at = NULL
        WHERE room_id = r.id AND user_id = auth.uid();
    END IF;
    RETURN jsonb_build_object('status', 'rejoined', 'room_id', r.id);
  END IF;

  SELECT count(*) INTO v_active
    FROM room_participants WHERE room_id = r.id AND left_at IS NULL;
  IF v_active >= 8 THEN
    RETURN jsonb_build_object('status', 'full');
  END IF;

  INSERT INTO room_participants (room_id, user_id, tasks)
    VALUES (r.id, auth.uid(), CASE WHEN r.propagate_setup THEN r.tasks ELSE '[]'::jsonb END);

  IF r.propagate_setup THEN
    -- If the joiner has a linked copy of the host's goal, use it.
    SELECT g.link_group_id INTO v_host_link
      FROM room_participant_goals pg JOIN goals g ON g.id = pg.goal_id
      WHERE pg.room_id = r.id AND pg.user_id = r.host_user_id;
    IF v_host_link IS NOT NULL THEN
      SELECT id INTO v_linked_goal FROM goals
        WHERE user_id = auth.uid() AND link_group_id = v_host_link LIMIT 1;
    END IF;
    IF v_linked_goal IS NOT NULL OR r.goal_label IS NOT NULL THEN
      INSERT INTO room_participant_goals (room_id, user_id, goal_id, goal_label)
        VALUES (r.id, auth.uid(), v_linked_goal, r.goal_label);
    END IF;
  END IF;

  RETURN jsonb_build_object('status', 'joined', 'room_id', r.id);
END;
$$;

-- Called every minute from the room page. Revives a participant who timed
-- out; tells the caller whether they're still in the room.
CREATE OR REPLACE FUNCTION room_heartbeat(p_room_id uuid) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_ended timestamptz;
BEGIN
  SELECT ended_at INTO v_ended FROM rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN 'not_found';
  END IF;
  IF v_ended IS NOT NULL THEN
    RETURN 'ended';
  END IF;

  UPDATE room_participants
    SET last_seen_at = now(), left_at = NULL, left_reason = NULL
    WHERE room_id = p_room_id AND user_id = auth.uid()
      AND (left_at IS NULL OR left_reason = 'timeout');
  IF NOT FOUND THEN
    RETURN 'left';
  END IF;

  PERFORM sweep_room(p_room_id);
  RETURN 'active';
END;
$$;

GRANT EXECUTE ON FUNCTION room_heartbeat(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION leave_room(p_room_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- Lock the room so two people leaving at once can't both see the other
  -- as still present and leave the room open.
  PERFORM 1 FROM rooms WHERE id = p_room_id FOR UPDATE;

  UPDATE room_participants
    SET left_at = now(), left_reason = 'left'
    WHERE room_id = p_room_id AND user_id = auth.uid()
      AND (left_at IS NULL OR left_reason = 'timeout');

  PERFORM sweep_room(p_room_id);

  IF NOT EXISTS (
    SELECT 1 FROM room_participants WHERE room_id = p_room_id AND left_at IS NULL
  ) THEN
    UPDATE rooms SET ended_at = now() WHERE id = p_room_id AND ended_at IS NULL;
  END IF;
END;
$$;

DROP FUNCTION IF EXISTS update_participant_setup(uuid, jsonb, uuid, text);

CREATE OR REPLACE FUNCTION update_participant_setup(
  p_room_id uuid,
  p_tasks jsonb,
  p_goal_id uuid,
  p_goal_label text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE room_participants
    SET tasks = clean_tasks(p_tasks)
    WHERE room_id = p_room_id AND user_id = auth.uid() AND left_at IS NULL;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  INSERT INTO room_participant_goals (room_id, user_id, goal_id, goal_label)
    VALUES (p_room_id, auth.uid(), owned_goal(p_goal_id), NULLIF(left(trim(p_goal_label), 200), ''))
    ON CONFLICT (room_id, user_id) DO UPDATE
      SET goal_id = EXCLUDED.goal_id, goal_label = EXCLUDED.goal_label;
END;
$$;

GRANT EXECUTE ON FUNCTION update_participant_setup(uuid, jsonb, uuid, text) TO authenticated;

-- "Stay with": move your own end time. Visible to the room so others see
-- your real time left.
CREATE OR REPLACE FUNCTION set_room_target_end(p_room_id uuid, p_target_end timestamptz)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE room_participants
    SET target_end_at = p_target_end
    WHERE room_id = p_room_id AND user_id = auth.uid() AND left_at IS NULL
      AND p_target_end BETWEEN joined_at AND joined_at + interval '24 hours';
END;
$$;

GRANT EXECUTE ON FUNCTION set_room_target_end(uuid, timestamptz) TO authenticated;


-- ── Goal sharing: owner-only reads, lookup by code through an RPC ───────

DROP POLICY IF EXISTS "read_goal_invite" ON goal_share_invites;
-- This policy let anyone create an invite for a goal they don't own.
DROP POLICY IF EXISTS "creator_manages_goal_invite" ON goal_share_invites;
CREATE POLICY "creator_reads_goal_invite" ON goal_share_invites
  FOR SELECT USING (auth.uid() = created_by);

CREATE OR REPLACE FUNCTION generate_goal_share_code(p_goal_id uuid) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  new_code text;
BEGIN
  IF owned_goal(p_goal_id) IS NULL THEN
    RAISE EXCEPTION 'Only the goal owner can share it';
  END IF;
  LOOP
    new_code := random_code();
    EXIT WHEN NOT EXISTS (SELECT 1 FROM goal_share_invites WHERE short_code = new_code);
  END LOOP;
  INSERT INTO goal_share_invites (short_code, goal_id, created_by)
    VALUES (new_code, p_goal_id, auth.uid());
  RETURN new_code;
END;
$$;

-- What the goal-invite page needs, for anyone holding the code.
CREATE OR REPLACE FUNCTION get_goal_invite(p_code text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  g goals%ROWTYPE;
BEGIN
  SELECT goals.* INTO g
    FROM goal_share_invites i JOIN goals ON goals.id = i.goal_id
    WHERE i.short_code = p_code;
  IF g.id IS NULL THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;
  RETURN jsonb_build_object(
    'status', CASE
      WHEN g.user_id = auth.uid() THEN 'self'
      WHEN g.link_group_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM goals WHERE user_id = auth.uid() AND link_group_id = g.link_group_id
      ) THEN 'already_linked'
      ELSE 'ok' END,
    'goal_name', g.name,
    'owner_handle', (SELECT handle FROM user_profiles WHERE user_id = g.user_id)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_goal_invite(text) TO authenticated;

-- Handles of the other people holding a copy of one of your goals.
CREATE OR REPLACE FUNCTION get_linked_goal_handles(p_goal_id uuid) RETURNS text[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(array_agg(p.handle ORDER BY p.handle), '{}')
  FROM goals mine
  JOIN goals theirs ON theirs.link_group_id = mine.link_group_id AND theirs.user_id <> mine.user_id
  JOIN user_profiles p ON p.user_id = theirs.user_id
  WHERE mine.id = p_goal_id AND mine.user_id = auth.uid() AND mine.link_group_id IS NOT NULL;
$$;

GRANT EXECUTE ON FUNCTION get_linked_goal_handles(uuid) TO authenticated;


-- ── Sessions: one atomic save, and search ───────────────────────────────

-- Saves a session and everything attached to it in one transaction, so a
-- failure part-way can't leave half-saved data. Used by the Rate page
-- (status 'completed') and by Save & continue later ('in_progress').
CREATE OR REPLACE FUNCTION save_session(
  p_session_id uuid,          -- existing in-progress row to update, or NULL
  p_status text,              -- 'completed' | 'in_progress'
  p_goal_id uuid,
  p_new_goal_name text,       -- creates a goal when p_goal_id is NULL
  p_session_name text,
  p_planned_minutes integer,
  p_actual_minutes integer,   -- completed only
  p_elapsed_seconds integer,  -- in_progress only
  p_started_at timestamptz,
  p_rating numeric,
  p_notes text,
  p_end_reason text,
  p_room_id uuid,
  p_tasks jsonb,              -- [{name, position, completed_at, duration_seconds, rating}]
  p_save_as_template boolean
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_done boolean := p_status = 'completed';
  v_goal uuid := owned_goal(p_goal_id);
  v_room uuid;
  v_session uuid;
  v_name text := NULLIF(left(trim(p_session_name), 200), '');
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in';
  END IF;
  IF p_status NOT IN ('completed', 'in_progress') THEN
    RAISE EXCEPTION 'Invalid status';
  END IF;
  IF p_planned_minutes IS NULL OR p_planned_minutes < 1 OR p_planned_minutes > 1440 THEN
    RAISE EXCEPTION 'Invalid planned duration';
  END IF;

  IF v_goal IS NULL AND NULLIF(trim(p_new_goal_name), '') IS NOT NULL THEN
    INSERT INTO goals (user_id, name, color)
      VALUES (
        v_uid,
        left(trim(p_new_goal_name), 200),
        (ARRAY['#16a34a','#d9642e','#0284c7','#7c3aed','#db2777','#0d9488','#a16207','#475569'])
          [1 + floor(random() * 8)::int]
      )
      RETURNING id INTO v_goal;
  END IF;

  SELECT room_id INTO v_room FROM room_participants
    WHERE room_id = p_room_id AND user_id = v_uid;

  IF p_session_id IS NOT NULL THEN
    -- started_at is left alone: a resumed session keeps its original start.
    UPDATE sessions SET
      goal_id = v_goal,
      session_name = v_name,
      planned_duration_minutes = p_planned_minutes,
      actual_duration_minutes = CASE WHEN v_done THEN GREATEST(p_actual_minutes, 0) END,
      elapsed_seconds = CASE WHEN v_done THEN NULL ELSE GREATEST(p_elapsed_seconds, 0) END,
      ended_at = CASE WHEN v_done THEN now() END,
      rating = p_rating,
      notes = NULLIF(p_notes, ''),
      end_reason = p_end_reason,
      status = p_status,
      room_id = v_room
    WHERE id = p_session_id AND user_id = v_uid AND status = 'in_progress'
    RETURNING id INTO v_session;
    IF v_session IS NULL THEN
      RAISE EXCEPTION 'Session not found';
    END IF;
    DELETE FROM session_tasks WHERE session_id = v_session;
  ELSE
    INSERT INTO sessions (
      user_id, goal_id, session_name, planned_duration_minutes,
      actual_duration_minutes, elapsed_seconds, started_at, ended_at,
      rating, notes, end_reason, status, room_id
    ) VALUES (
      v_uid, v_goal, v_name, p_planned_minutes,
      CASE WHEN v_done THEN GREATEST(p_actual_minutes, 0) END,
      CASE WHEN v_done THEN NULL ELSE GREATEST(p_elapsed_seconds, 0) END,
      p_started_at,
      CASE WHEN v_done THEN now() END,
      p_rating, NULLIF(p_notes, ''), p_end_reason, p_status, v_room
    ) RETURNING id INTO v_session;
  END IF;

  INSERT INTO session_tasks (session_id, name, position, completed_at, duration_seconds, rating)
    SELECT v_session,
           left(trim(t->>'name'), 200),
           COALESCE((t->>'position')::int, ord::int - 1),
           (t->>'completed_at')::timestamptz,
           (t->>'duration_seconds')::int,
           (t->>'rating')::numeric
    FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof(p_tasks) = 'array' THEN p_tasks ELSE '[]'::jsonb END
    ) WITH ORDINALITY AS x(t, ord)
    WHERE COALESCE(trim(t->>'name'), '') <> ''
    LIMIT 100;

  IF v_done AND v_goal IS NOT NULL THEN
    UPDATE goals SET last_used_duration_minutes = p_planned_minutes WHERE id = v_goal;
  END IF;

  IF v_done AND p_save_as_template THEN
    INSERT INTO session_templates (user_id, goal_id, name, planned_duration_minutes, tasks)
      VALUES (v_uid, v_goal, COALESCE(v_name, 'Untitled session'), p_planned_minutes, clean_tasks(p_tasks));
  END IF;

  IF v_done AND v_room IS NOT NULL THEN
    UPDATE room_participants SET session_id = v_session
      WHERE room_id = v_room AND user_id = v_uid;
  END IF;

  RETURN jsonb_build_object('session_id', v_session, 'goal_id', v_goal);
END;
$$;

GRANT EXECUTE ON FUNCTION save_session(
  uuid, text, uuid, text, text, integer, integer, integer, timestamptz,
  numeric, text, text, uuid, jsonb, boolean
) TO authenticated;

-- Case-insensitive substring search over your session names and notes.
-- Replaces a client-built filter that broke on commas and parentheses.
CREATE OR REPLACE FUNCTION search_sessions(p_query text)
RETURNS TABLE (
  id uuid,
  session_name text,
  notes text,
  rating numeric,
  started_at timestamptz,
  goal_id uuid,
  goal_name text,
  goal_color text
)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public
AS $$
  SELECT s.id, s.session_name, s.notes, s.rating, s.started_at, g.id, g.name, g.color
  FROM sessions s
  LEFT JOIN goals g ON g.id = s.goal_id
  WHERE s.user_id = auth.uid()
    AND length(trim(p_query)) > 0
    AND (strpos(lower(COALESCE(s.session_name, '')), lower(trim(p_query))) > 0
      OR strpos(lower(COALESCE(s.notes, '')), lower(trim(p_query))) > 0)
  ORDER BY s.started_at DESC
  LIMIT 20;
$$;

GRANT EXECUTE ON FUNCTION search_sessions(text) TO authenticated;


-- ── Account deletion ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION delete_user() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  DELETE FROM auth.users WHERE id = auth.uid();
END;
$$;

REVOKE EXECUTE ON FUNCTION delete_user() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION delete_user() TO authenticated;
