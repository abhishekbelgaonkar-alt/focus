-- Rooms + linked shared goals
--
-- Design summary:
--   * Rooms are lightweight: a shared session container identified by a
--     short_code, holding setup metadata plus a list of participants.
--   * Each participant runs their own personal timer (starts at joined_at,
--     runs planned_duration_minutes toward zero, then into overtime).
--   * Sessions gain a nullable room_id so we can identify shared sessions
--     and compute together-time.
--   * Linked goals use a link_group_id on the existing goals table. Each
--     user still has their own goal row; the link_group_id ties copies
--     together across accounts. No shared ownership, no permission model.

-- ── rooms ─────────────────────────────────────────────────────────────────
CREATE TABLE rooms (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  short_code                text UNIQUE NOT NULL,
  host_user_id              uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  planned_duration_minutes  integer NOT NULL,
  session_name              text,
  goal_id                   uuid REFERENCES goals(id) ON DELETE SET NULL,   -- host's own goal, if any
  goal_label                text,                                            -- name propagated to non-linked joiners
  tasks                     jsonb NOT NULL DEFAULT '[]'::jsonb,
  propagate_setup           boolean NOT NULL DEFAULT false,
  started_at                timestamptz NOT NULL DEFAULT now(),
  ended_at                  timestamptz,
  created_at                timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX rooms_short_code_idx ON rooms (short_code);
CREATE INDEX rooms_host_user_id_idx ON rooms (host_user_id);


-- ── room_participants ─────────────────────────────────────────────────────
-- One row per (room, user). Records their arc through the room: when they
-- joined, when they left (if applicable), and the session they saved.
-- Rejoin case: existing row is updated (joined_at reset, left_at cleared),
-- session_id stays linked so accumulated presence time keeps compounding.
CREATE TABLE room_participants (
  room_id       uuid REFERENCES rooms(id) ON DELETE CASCADE,
  user_id       uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  joined_at     timestamptz NOT NULL DEFAULT now(),
  left_at       timestamptz,
  session_id    uuid REFERENCES sessions(id),
  PRIMARY KEY (room_id, user_id)
);

CREATE INDEX room_participants_user_id_idx ON room_participants (user_id);


-- ── sessions.room_id ──────────────────────────────────────────────────────
-- Nullable. Set when the session was part of a room. Used to identify
-- shared sessions for together-time and cross-view display on linked goals.
ALTER TABLE sessions ADD COLUMN room_id uuid REFERENCES rooms(id) ON DELETE SET NULL;
CREATE INDEX sessions_room_id_idx ON sessions (room_id);


-- ── goals.link_group_id ──────────────────────────────────────────────────
-- Nullable. When set, this goal is part of a linked collaboration group.
-- All goals with the same link_group_id are "copies" living on different
-- users' accounts. No shared ownership. Each user retains full autonomy
-- over their own copy.
ALTER TABLE goals ADD COLUMN link_group_id uuid;
CREATE INDEX goals_link_group_id_idx ON goals (link_group_id);


-- ── goal_share_invites ────────────────────────────────────────────────────
-- Invite links for linking a goal into a shared group. Similar mechanic
-- to friend_invites but scoped to a specific goal.
CREATE TABLE goal_share_invites (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  short_code   text UNIQUE NOT NULL,
  goal_id      uuid NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  created_by   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX goal_share_invites_short_code_idx ON goal_share_invites (short_code);


-- ── Helper: is_room_participant ──────────────────────────────────────────
-- SECURITY DEFINER so RLS policies on room_participants can query the same
-- table without recursion.
CREATE OR REPLACE FUNCTION is_room_participant(target_room_id uuid) RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM room_participants
    WHERE room_id = target_room_id AND user_id = auth.uid()
  );
$$;

GRANT EXECUTE ON FUNCTION is_room_participant(uuid) TO authenticated;


-- ── RLS policies ─────────────────────────────────────────────────────────

ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;

-- Anyone signed in can read a room by short_code (needed for the join flow
-- to look up who owns the room before joining).
CREATE POLICY "read_room" ON rooms
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- Only host can create/update/delete their own room.
CREATE POLICY "host_writes_own_room" ON rooms
  FOR ALL
  USING (auth.uid() = host_user_id)
  WITH CHECK (auth.uid() = host_user_id);


ALTER TABLE room_participants ENABLE ROW LEVEL SECURITY;

-- Participants of a room can see each other's rows (needed to render the
-- participant list). Non-participants can't see who's in a room.
CREATE POLICY "participants_read_each_other" ON room_participants
  FOR SELECT
  USING (is_room_participant(room_id));

-- Users can insert themselves as participants. Server-side RPC does the
-- capacity check and rejoin logic, but this allows direct inserts too if
-- needed.
CREATE POLICY "insert_own_participation" ON room_participants
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own participation row (left_at, session_id).
CREATE POLICY "update_own_participation" ON room_participants
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);


ALTER TABLE goal_share_invites ENABLE ROW LEVEL SECURITY;

-- Anyone signed in can read by short_code (to resolve the invite).
CREATE POLICY "read_goal_invite" ON goal_share_invites
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- Only the creator can manage their own invites.
CREATE POLICY "creator_manages_goal_invite" ON goal_share_invites
  FOR ALL
  USING (auth.uid() = created_by)
  WITH CHECK (auth.uid() = created_by);


-- ── RPC: create_room ─────────────────────────────────────────────────────
-- Creates a room and inserts the host as the first participant.
-- Returns the short_code so the client can navigate to /r/[code].
CREATE OR REPLACE FUNCTION create_room(
  p_duration integer,
  p_session_name text,
  p_goal_id uuid,
  p_goal_label text,
  p_tasks jsonb,
  p_propagate_setup boolean
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_code text;
  new_room_id uuid;
BEGIN
  -- Generate a unique short_code
  LOOP
    new_code := lower(substring(gen_random_uuid()::text, 1, 8));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM rooms WHERE short_code = new_code);
  END LOOP;

  INSERT INTO rooms (
    short_code, host_user_id, planned_duration_minutes,
    session_name, goal_id, goal_label, tasks, propagate_setup
  ) VALUES (
    new_code, auth.uid(), p_duration,
    p_session_name, p_goal_id, p_goal_label, p_tasks, p_propagate_setup
  ) RETURNING id INTO new_room_id;

  -- Insert host as first participant
  INSERT INTO room_participants (room_id, user_id)
    VALUES (new_room_id, auth.uid());

  RETURN new_code;
END;
$$;

GRANT EXECUTE ON FUNCTION create_room(integer, text, uuid, text, jsonb, boolean) TO authenticated;


-- ── RPC: join_room_by_code ───────────────────────────────────────────────
-- Look up the room, verify it's joinable, insert or update the caller's
-- participant row. Handles capacity limit (max 8) and rejoin case.
CREATE OR REPLACE FUNCTION join_room_by_code(p_code text) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room_id uuid;
  v_ended timestamptz;
  v_active_count integer;
  v_existing boolean;
BEGIN
  SELECT id, ended_at INTO v_room_id, v_ended
    FROM rooms WHERE short_code = p_code;

  IF v_room_id IS NULL THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;

  IF v_ended IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'ended');
  END IF;

  -- Already a participant? Rejoin flow.
  SELECT EXISTS (
    SELECT 1 FROM room_participants
    WHERE room_id = v_room_id AND user_id = auth.uid()
  ) INTO v_existing;

  IF v_existing THEN
    UPDATE room_participants
      SET joined_at = now(), left_at = NULL
      WHERE room_id = v_room_id AND user_id = auth.uid();
    RETURN jsonb_build_object('status', 'rejoined', 'room_id', v_room_id);
  END IF;

  -- New joiner: check capacity (max 8 active participants)
  SELECT count(*) INTO v_active_count
    FROM room_participants
    WHERE room_id = v_room_id AND left_at IS NULL;

  IF v_active_count >= 8 THEN
    RETURN jsonb_build_object('status', 'full');
  END IF;

  INSERT INTO room_participants (room_id, user_id)
    VALUES (v_room_id, auth.uid());

  RETURN jsonb_build_object('status', 'joined', 'room_id', v_room_id);
END;
$$;

GRANT EXECUTE ON FUNCTION join_room_by_code(text) TO authenticated;


-- ── RPC: leave_room ──────────────────────────────────────────────────────
-- Marks the caller's participant row with left_at. If no active participants
-- remain, marks the room as ended.
CREATE OR REPLACE FUNCTION leave_room(p_room_id uuid) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_remaining integer;
BEGIN
  UPDATE room_participants
    SET left_at = now()
    WHERE room_id = p_room_id AND user_id = auth.uid() AND left_at IS NULL;

  SELECT count(*) INTO v_remaining
    FROM room_participants
    WHERE room_id = p_room_id AND left_at IS NULL;

  IF v_remaining = 0 THEN
    UPDATE rooms SET ended_at = now()
      WHERE id = p_room_id AND ended_at IS NULL;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION leave_room(uuid) TO authenticated;


-- ── RPC: cancel_room ─────────────────────────────────────────────────────
-- Host-only shortcut. Marks the room ended without saving any session.
-- Used when the host wants to bail before starting solo.
CREATE OR REPLACE FUNCTION cancel_room(p_room_id uuid) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE rooms SET ended_at = now()
    WHERE id = p_room_id
      AND host_user_id = auth.uid()
      AND ended_at IS NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION cancel_room(uuid) TO authenticated;


-- ── RPC: update_handle ───────────────────────────────────────────────────
-- Globally updates the caller's handle in user_profiles. Enforces
-- uniqueness. Called from Settings and from within a room.
CREATE OR REPLACE FUNCTION update_handle(p_new_handle text) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Trim + sanity check
  p_new_handle := trim(p_new_handle);
  IF length(p_new_handle) = 0 THEN
    RETURN jsonb_build_object('status', 'empty');
  END IF;
  IF length(p_new_handle) > 32 THEN
    RETURN jsonb_build_object('status', 'too_long');
  END IF;

  IF EXISTS (
    SELECT 1 FROM user_profiles
    WHERE handle = p_new_handle AND user_id != auth.uid()
  ) THEN
    RETURN jsonb_build_object('status', 'taken');
  END IF;

  UPDATE user_profiles SET handle = p_new_handle
    WHERE user_id = auth.uid();

  RETURN jsonb_build_object('status', 'ok', 'handle', p_new_handle);
END;
$$;

GRANT EXECUTE ON FUNCTION update_handle(text) TO authenticated;


-- ── RPC: generate_goal_share_code ────────────────────────────────────────
-- Owner-only. Creates a share invite for the given goal.
CREATE OR REPLACE FUNCTION generate_goal_share_code(p_goal_id uuid) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
  new_code text;
BEGIN
  SELECT user_id INTO v_owner FROM goals WHERE id = p_goal_id;

  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'Goal not found';
  END IF;

  IF v_owner != auth.uid() THEN
    RAISE EXCEPTION 'Only the goal owner can share it';
  END IF;

  LOOP
    new_code := lower(substring(gen_random_uuid()::text, 1, 8));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM goal_share_invites WHERE short_code = new_code);
  END LOOP;

  INSERT INTO goal_share_invites (short_code, goal_id, created_by)
    VALUES (new_code, p_goal_id, auth.uid());

  RETURN new_code;
END;
$$;

GRANT EXECUTE ON FUNCTION generate_goal_share_code(uuid) TO authenticated;


-- ── RPC: redeem_goal_share_invite ────────────────────────────────────────
-- Given a share code, links the caller to the goal group. If the source
-- goal has no link_group_id, generate one and set it on the source. Then
-- create a new goal on the caller's account with the same link_group_id.
CREATE OR REPLACE FUNCTION redeem_goal_share_invite(p_code text) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_source_goal_id uuid;
  v_source_owner uuid;
  v_source_name text;
  v_existing_link_group uuid;
  v_new_link_group uuid;
  v_new_goal_id uuid;
BEGIN
  SELECT goal_id INTO v_source_goal_id
    FROM goal_share_invites WHERE short_code = p_code;

  IF v_source_goal_id IS NULL THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;

  SELECT user_id, name, link_group_id
    INTO v_source_owner, v_source_name, v_existing_link_group
    FROM goals WHERE id = v_source_goal_id;

  IF v_source_owner = auth.uid() THEN
    RETURN jsonb_build_object('status', 'self');
  END IF;

  -- If caller already has a copy in this link group, no-op
  IF v_existing_link_group IS NOT NULL AND EXISTS (
    SELECT 1 FROM goals
    WHERE user_id = auth.uid() AND link_group_id = v_existing_link_group
  ) THEN
    RETURN jsonb_build_object('status', 'already_linked');
  END IF;

  -- Establish or reuse the link group
  IF v_existing_link_group IS NULL THEN
    v_new_link_group := gen_random_uuid();
    UPDATE goals SET link_group_id = v_new_link_group WHERE id = v_source_goal_id;
  ELSE
    v_new_link_group := v_existing_link_group;
  END IF;

  -- Create a copy on the caller's account
  INSERT INTO goals (user_id, name, link_group_id, status)
    VALUES (auth.uid(), v_source_name, v_new_link_group, 'active')
    RETURNING id INTO v_new_goal_id;

  RETURN jsonb_build_object(
    'status', 'linked',
    'goal_id', v_new_goal_id,
    'name', v_source_name
  );
END;
$$;

GRANT EXECUTE ON FUNCTION redeem_goal_share_invite(text) TO authenticated;


-- ── Realtime enablement ──────────────────────────────────────────────────
-- Room participants + user profiles need to broadcast to Realtime channels
-- so participant lists and handle changes propagate to other clients.
ALTER PUBLICATION supabase_realtime ADD TABLE room_participants;
ALTER PUBLICATION supabase_realtime ADD TABLE user_profiles;
