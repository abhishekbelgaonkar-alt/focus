-- Per-task ratings (0-5). Session rating stays authoritative, but when
-- any tasks are rated the session's rating is derived from the aggregate.
-- Because that aggregate can land below 1.0, we widen the sessions.rating
-- check constraint to allow the full 0-5 range.

-- Drop the original >= 1.0 check by looking up its auto-generated name.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'sessions'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%rating%>=%1%'
  LOOP
    EXECUTE 'ALTER TABLE sessions DROP CONSTRAINT ' || quote_ident(r.conname);
  END LOOP;
END $$;

ALTER TABLE sessions
  ADD CONSTRAINT sessions_rating_range CHECK (rating >= 0 AND rating <= 5);

-- Optional per-task rating.
ALTER TABLE session_tasks
  ADD COLUMN IF NOT EXISTS rating numeric(3,1)
    CHECK (rating IS NULL OR (rating >= 0 AND rating <= 5));
