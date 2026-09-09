-- Support "save for later" — a session can now exist in an in-progress state,
-- with elapsed time saved so the user can resume later on any device.
--
-- Also loosens NOT NULL constraints on fields that only apply once a session
-- is concluded (ended_at, actual_duration_minutes).

ALTER TABLE sessions ALTER COLUMN ended_at DROP NOT NULL;
ALTER TABLE sessions ALTER COLUMN actual_duration_minutes DROP NOT NULL;

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'completed'
  CHECK (status IN ('in_progress', 'completed'));

-- Cumulative work-time (paused time excluded) at the moment the session was
-- saved-for-later. Only set for in_progress rows; cleared on completion.
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS elapsed_seconds integer;

CREATE INDEX IF NOT EXISTS sessions_user_status_idx ON sessions (user_id, status);

-- Update the goal-stats RPC to only aggregate COMPLETED sessions.
CREATE OR REPLACE FUNCTION get_goal_stats()
RETURNS TABLE (
  goal_id        uuid,
  name           text,
  status         text,
  schedule       text[],
  created_at     timestamptz,
  session_count  integer,
  total_minutes  integer,
  avg_rating     numeric,
  last_session_at timestamptz
) LANGUAGE sql SECURITY INVOKER AS $$
  SELECT
    g.id,
    g.name,
    g.status,
    g.schedule,
    g.created_at,
    COUNT(s.id)::integer                                  AS session_count,
    COALESCE(SUM(s.actual_duration_minutes), 0)::integer  AS total_minutes,
    ROUND(AVG(s.rating)::numeric, 1)                      AS avg_rating,
    MAX(s.started_at)                                     AS last_session_at
  FROM goals g
  LEFT JOIN sessions s
    ON s.goal_id = g.id
   AND s.status = 'completed'
  WHERE g.user_id = auth.uid()
  GROUP BY g.id
  ORDER BY MAX(s.started_at) DESC NULLS LAST;
$$;
