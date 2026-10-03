-- Fixes from the second audit.
--
--   * Rooms: pressing End no longer closes a room while someone who went
--     quiet (usually a locked phone) might still come back. A member whose
--     room ended while they were away can still save their session.
--   * Rooms: the host's goal label is no longer readable by participants.
--   * Rooms: deleting the host's account no longer deletes the room.
--   * Stats: per-day totals computed in the database, returned as one JSON
--     value, so they aren't cut off at the API's 1000-row limit.
--   * Search: only completed sessions.
--   * Goal sharing: one reusable link per goal, and a way to turn it off.
--   * Profiles: a way to create a missing profile if the sign-up trigger
--     failed.


-- ── Profiles ────────────────────────────────────────────────────────────

-- Creates the caller's profile and invite link if either is missing.
CREATE OR REPLACE FUNCTION ensure_my_profile() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM user_profiles WHERE user_id = auth.uid()) THEN
    INSERT INTO user_profiles (user_id, handle) VALUES (auth.uid(), generate_handle())
      ON CONFLICT (user_id) DO NOTHING;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM friend_invites WHERE user_id = auth.uid()) THEN
    INSERT INTO friend_invites (user_id, short_code) VALUES (auth.uid(), generate_invite_code())
      ON CONFLICT (user_id) DO NOTHING;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION ensure_my_profile() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION ensure_my_profile() TO authenticated;


-- ── Rooms: host deletion leaves the room to everyone else ───────────────

ALTER TABLE rooms ALTER COLUMN host_user_id DROP NOT NULL;
ALTER TABLE rooms DROP CONSTRAINT IF EXISTS rooms_host_user_id_fkey;
ALTER TABLE rooms
  ADD CONSTRAINT rooms_host_user_id_fkey
  FOREIGN KEY (host_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


-- ── Rooms: participants can read every column except the host's goal ────

REVOKE SELECT ON rooms FROM anon, authenticated;
GRANT SELECT (
  id, short_code, host_user_id, planned_duration_minutes, session_name,
  tasks, propagate_setup, started_at, ended_at, created_at
) ON rooms TO authenticated;


-- ── Rooms: wait for people who went quiet ───────────────────────────────

-- Times out silent participants, and ends the room once nobody is active
-- and nobody who timed out has been seen within the hour. People who pressed
-- End don't hold the room open.
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
        SELECT 1 FROM room_participants
        WHERE room_id = p_room_id
          AND (left_at IS NULL
               OR (left_reason = 'timeout' AND last_seen_at > now() - interval '1 hour')));
END;
$$;

REVOKE EXECUTE ON FUNCTION sweep_room(uuid) FROM PUBLIC, anon, authenticated;

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
END;
$$;

-- Adds room_id and is_member when the room has ended, so a member who was
-- away when it ended can still load their time and save it. Only offered
-- for a day after the room ends.
CREATE OR REPLACE FUNCTION get_room_preview(p_code text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  r rooms%ROWTYPE;
  v_member boolean;
BEGIN
  SELECT * INTO r FROM rooms WHERE short_code = p_code;
  IF r.id IS NULL THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;
  PERFORM sweep_room(r.id);
  SELECT * INTO r FROM rooms WHERE id = r.id;

  -- Still in the room, or went quiet without pressing End.
  v_member := EXISTS (
    SELECT 1 FROM room_participants
    WHERE room_id = r.id AND user_id = auth.uid()
      AND (left_at IS NULL OR left_reason = 'timeout'));

  IF r.ended_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'status', 'ended',
      'room_id', r.id,
      'is_member', v_member AND r.ended_at > now() - interval '1 day');
  END IF;

  RETURN jsonb_build_object(
    'status', 'ok',
    'room_id', r.id,
    'host_handle', (SELECT handle FROM user_profiles WHERE user_id = r.host_user_id),
    'session_name', r.session_name,
    'planned_duration_minutes', r.planned_duration_minutes,
    -- The host's goal is only shared when they chose to share their setup.
    'goal_label', CASE WHEN r.propagate_setup THEN r.goal_label END,
    'is_member', v_member
  );
END;
$$;


-- ── Stats: per-day totals ───────────────────────────────────────────────

-- One entry per local day with completed sessions: session count, minutes,
-- and the sum and count of ratings (so callers can average over any span).
-- p_tz is an IANA zone name like 'Asia/Dubai'. Optional goal filter.
CREATE OR REPLACE FUNCTION get_daily_totals(p_tz text, p_goal_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'date', day,
           'sessions', sessions,
           'minutes', minutes,
           'rating_sum', rating_sum,
           'rated', rated) ORDER BY day), '[]'::jsonb)
  FROM (
    SELECT (started_at AT TIME ZONE p_tz)::date AS day,
           count(*)::int AS sessions,
           COALESCE(sum(actual_duration_minutes), 0)::int AS minutes,
           COALESCE(sum(rating), 0) AS rating_sum,
           count(rating)::int AS rated
    FROM sessions
    WHERE user_id = auth.uid() AND status = 'completed'
      AND (p_goal_id IS NULL OR goal_id = p_goal_id)
    GROUP BY 1
  ) d;
$$;

REVOKE EXECUTE ON FUNCTION get_daily_totals(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_daily_totals(text, uuid) TO authenticated;


-- ── Search: completed sessions only ─────────────────────────────────────

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
    AND s.status = 'completed'
    AND length(trim(p_query)) > 0
    AND (strpos(lower(COALESCE(s.session_name, '')), lower(trim(p_query))) > 0
      OR strpos(lower(COALESCE(s.notes, '')), lower(trim(p_query))) > 0)
  ORDER BY s.started_at DESC
  LIMIT 20;
$$;


-- ── Goal sharing: one link per goal, and a way to turn it off ───────────

-- Returns the goal's existing share code when there is one.
CREATE OR REPLACE FUNCTION generate_goal_share_code(p_goal_id uuid) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  new_code text;
BEGIN
  IF owned_goal(p_goal_id) IS NULL THEN
    RAISE EXCEPTION 'Only the goal owner can share it';
  END IF;
  SELECT short_code INTO new_code FROM goal_share_invites
    WHERE goal_id = p_goal_id AND created_by = auth.uid()
    ORDER BY created_at DESC LIMIT 1;
  IF new_code IS NOT NULL THEN
    RETURN new_code;
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

-- "Stop sharing" deletes the owner's links for a goal.
CREATE POLICY "creator_deletes_goal_invite" ON goal_share_invites
  FOR DELETE USING (auth.uid() = created_by);
