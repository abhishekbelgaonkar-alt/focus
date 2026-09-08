-- Optional sub-tasks per session. Users add them at setup time; check them
-- off during the timer. Duration for each completed task = time between its
-- check-off and the previous check-off (or session start for the first).
-- Unfinished tasks have completed_at = NULL.
CREATE TABLE session_tasks (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id        uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  name              text NOT NULL,
  position          integer NOT NULL,
  completed_at      timestamptz,
  duration_seconds  integer,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX session_tasks_session_id_idx ON session_tasks (session_id, position);

ALTER TABLE session_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_session_tasks" ON session_tasks
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM sessions s
      WHERE s.id = session_id AND s.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM sessions s
      WHERE s.id = session_id AND s.user_id = auth.uid()
    )
  );
