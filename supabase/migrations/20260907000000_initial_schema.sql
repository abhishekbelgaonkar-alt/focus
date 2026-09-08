-- goals
CREATE TABLE goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'completed', 'abandoned')),
  schedule text[],
  last_used_duration_minutes integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- categories (for goal-less sessions)
CREATE TABLE categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- sessions
CREATE TABLE sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  goal_id uuid REFERENCES goals(id) ON DELETE SET NULL,
  category_id uuid REFERENCES categories(id) ON DELETE SET NULL,
  session_name text,
  planned_duration_minutes integer NOT NULL,
  actual_duration_minutes integer NOT NULL,
  started_at timestamptz NOT NULL,
  ended_at timestamptz NOT NULL,
  rating numeric(3,1) CHECK (rating >= 1.0 AND rating <= 5.0),
  notes text,
  end_reason text CHECK (
    end_reason IN ('on_time', 'still_focused', 'distracted', 'forgot_to_end', 'other')
  ),
  created_at timestamptz NOT NULL DEFAULT now(),
  -- prevents linking both goal and category on one session
  CONSTRAINT not_both_goal_and_category CHECK (
    NOT (goal_id IS NOT NULL AND category_id IS NOT NULL)
  )
);

-- distraction tags (per user, seeded with defaults on signup via trigger below)
CREATE TABLE distraction_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- session ↔ tag join table
CREATE TABLE session_distraction_tags (
  session_id uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES distraction_tags(id) ON DELETE CASCADE,
  PRIMARY KEY (session_id, tag_id)
);

-- freeform notes per day / week / month (heatmap tap target)
CREATE TABLE period_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  period_type text NOT NULL CHECK (period_type IN ('day', 'week', 'month')),
  period_date date NOT NULL,
  note text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, period_type, period_date)
);

-- Row-Level Security
ALTER TABLE goals                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories               ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE distraction_tags         ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_distraction_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE period_notes             ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_goals" ON goals
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "own_categories" ON categories
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "own_sessions" ON sessions
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "own_tags" ON distraction_tags
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "own_session_tags" ON session_distraction_tags
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

CREATE POLICY "own_period_notes" ON period_notes
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Seed default distraction tags when any new user is created (including anonymous)
CREATE OR REPLACE FUNCTION seed_distraction_tags()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO distraction_tags (user_id, name) VALUES
    (NEW.id, 'Phone'),
    (NEW.id, 'Social media'),
    (NEW.id, 'Noise'),
    (NEW.id, 'Hunger'),
    (NEW.id, 'Tiredness'),
    (NEW.id, 'Intrusive thoughts'),
    (NEW.id, 'Other people'),
    (NEW.id, 'Procrastination'),
    (NEW.id, 'Physical discomfort'),
    (NEW.id, 'Task felt too hard'),
    (NEW.id, 'Unclear what to do next');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION seed_distraction_tags();
