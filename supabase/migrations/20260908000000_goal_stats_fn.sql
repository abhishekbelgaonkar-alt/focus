-- Returns one row per goal for the currently-authenticated user,
-- with aggregated session stats. SECURITY INVOKER means the caller's
-- RLS policies apply — only the user's own goals are returned.
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
  LEFT JOIN sessions s ON s.goal_id = g.id
  WHERE g.user_id = auth.uid()
  GROUP BY g.id
  ORDER BY MAX(s.started_at) DESC NULLS LAST;
$$;
