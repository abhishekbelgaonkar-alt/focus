-- ── Per-participant setup in rooms ──────────────────────────────────────
--
-- The rooms model shifts here from "host's session with spectators" to
-- "shared space where everyone brings their own work." Each participant
-- gets their own task list and their own goal:
--
--   * tasks jsonb        — public list of task names; visible to everyone
--                          in the room via Realtime. Check-off state is NOT
--                          stored server-side; that stays client-side and
--                          private.
--   * goal_id uuid       — the goal this participant will attach their
--                          session to at End. Private (not shown to others).
--   * goal_label text    — free-typed goal name when the participant wants
--                          a one-off goal without creating a real Goal row.
--                          Also private.
--
-- On join:
--   * If room.propagate_setup is TRUE, joiner's tasks are seeded from
--     room.tasks so they inherit the host's setup by default.
--   * If room.propagate_setup is FALSE, joiner's tasks start empty and
--     they can build their own from scratch (using quick-start /
--     scheduled goal / continue-in-progress / manual entry from the UI).
--
-- Everything else about the room stays the same: personal timers,
-- Realtime presence, stay-with sync, room persists until last leaves.


-- ── Columns ──────────────────────────────────────────────────────────────

ALTER TABLE room_participants
  ADD COLUMN IF NOT EXISTS tasks jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS goal_id uuid REFERENCES goals(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS goal_label text;


-- ── RPC: join_room_by_code (replaces prior version) ───────────────────────
-- Now seeds the joiner's task list from the room's setup when the host
-- opted to propagate. Handles rejoin case (keeps the prior tasks, doesn't
-- reset them) and the new-joiner case (seeds from room).
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
  v_propagate boolean;
  v_room_tasks jsonb;
  v_room_goal_label text;
BEGIN
  SELECT id, ended_at, propagate_setup, tasks, goal_label
    INTO v_room_id, v_ended, v_propagate, v_room_tasks, v_room_goal_label
    FROM rooms WHERE short_code = p_code;

  IF v_room_id IS NULL THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;

  IF v_ended IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'ended');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM room_participants
    WHERE room_id = v_room_id AND user_id = auth.uid()
  ) INTO v_existing;

  IF v_existing THEN
    -- Rejoin: preserve their prior task list; only reopen the row.
    UPDATE room_participants
      SET joined_at = now(), left_at = NULL
      WHERE room_id = v_room_id AND user_id = auth.uid();
    RETURN jsonb_build_object('status', 'rejoined', 'room_id', v_room_id);
  END IF;

  SELECT count(*) INTO v_active_count
    FROM room_participants
    WHERE room_id = v_room_id AND left_at IS NULL;

  IF v_active_count >= 8 THEN
    RETURN jsonb_build_object('status', 'full');
  END IF;

  INSERT INTO room_participants (room_id, user_id, tasks, goal_label)
    VALUES (
      v_room_id,
      auth.uid(),
      CASE WHEN v_propagate THEN v_room_tasks ELSE '[]'::jsonb END,
      CASE WHEN v_propagate THEN v_room_goal_label ELSE NULL END
    );

  RETURN jsonb_build_object('status', 'joined', 'room_id', v_room_id);
END;
$$;

GRANT EXECUTE ON FUNCTION join_room_by_code(text) TO authenticated;


-- ── RPC: update_participant_setup ────────────────────────────────────────
-- Called by any participant to change their own tasks, goal_id, or
-- goal_label. Any of the params can be NULL to leave that field unchanged
-- vs. an explicit clear, we use a distinct "clear" sentinel — but for
-- simplicity here we just accept the values as-is: a NULL goal_id/label
-- clears them, an empty array clears tasks. Callers pass the full
-- desired state.
CREATE OR REPLACE FUNCTION update_participant_setup(
  p_room_id uuid,
  p_tasks jsonb,
  p_goal_id uuid,
  p_goal_label text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE room_participants
    SET tasks = COALESCE(p_tasks, '[]'::jsonb),
        goal_id = p_goal_id,
        goal_label = p_goal_label
    WHERE room_id = p_room_id
      AND user_id = auth.uid()
      AND left_at IS NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION update_participant_setup(uuid, jsonb, uuid, text) TO authenticated;


-- ── RPC: update_room_propagate ───────────────────────────────────────────
-- Host-only toggle. Affects future joiners only; existing participants
-- keep whatever task list they already have.
CREATE OR REPLACE FUNCTION update_room_propagate(
  p_room_id uuid,
  p_propagate boolean
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE rooms
    SET propagate_setup = p_propagate
    WHERE id = p_room_id
      AND host_user_id = auth.uid()
      AND ended_at IS NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION update_room_propagate(uuid, boolean) TO authenticated;
