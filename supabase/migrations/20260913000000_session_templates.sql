-- session_templates: reusable session "recipes" — name, duration, task list,
-- optional goal link, optional weekday schedule. Tapping one on the home page
-- fills the setup form; scheduled ones surface in Today's plan.
CREATE TABLE session_templates (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  goal_id                   uuid REFERENCES goals(id) ON DELETE SET NULL,
  name                      text NOT NULL,
  planned_duration_minutes  integer NOT NULL,
  tasks                     jsonb NOT NULL DEFAULT '[]'::jsonb,
  schedule                  text[],
  created_at                timestamptz NOT NULL DEFAULT now(),
  last_used_at              timestamptz
);

CREATE INDEX session_templates_user_id_idx ON session_templates (user_id);
CREATE INDEX session_templates_goal_id_idx ON session_templates (goal_id);

ALTER TABLE session_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_templates" ON session_templates
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
