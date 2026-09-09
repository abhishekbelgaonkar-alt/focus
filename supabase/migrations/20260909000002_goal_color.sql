-- Each goal can carry a color used for its label + dot indicator across
-- the app. Nullable so existing rows survive; the client picks a deterministic
-- default from a palette (hashed off the goal id) when color IS NULL.
ALTER TABLE goals ADD COLUMN IF NOT EXISTS color text;

-- Include the color in get_goal_stats() output. Return-type changed, so
-- Postgres requires dropping the old function first.
DROP FUNCTION IF EXISTS get_goal_stats();

CREATE FUNCTION get_goal_stats()
RETURNS TABLE (
  goal_id        uuid,
  name           text,
  status         text,
  color          text,
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
    g.color,
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
