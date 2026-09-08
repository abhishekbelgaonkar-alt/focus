-- Add more default distraction tags. Replaces the seeding function so any
-- new user gets the expanded set, and backfills the additions for existing
-- users (idempotent — won't create duplicates).
CREATE OR REPLACE FUNCTION seed_distraction_tags()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO distraction_tags (user_id, name) VALUES
    (NEW.id, 'Phone'),
    (NEW.id, 'Text messages'),
    (NEW.id, 'Social media'),
    (NEW.id, 'Email'),
    (NEW.id, 'Slack/chat'),
    (NEW.id, 'Meeting'),
    (NEW.id, 'Noise'),
    (NEW.id, 'Music/video'),
    (NEW.id, 'Hunger'),
    (NEW.id, 'Snack break'),
    (NEW.id, 'Bathroom'),
    (NEW.id, 'Getting up'),
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

-- Backfill the newly-added defaults for every existing user, skipping any
-- name they already have.
INSERT INTO distraction_tags (user_id, name)
SELECT u.id, new_tag
FROM auth.users u
CROSS JOIN (VALUES
  ('Text messages'),
  ('Email'),
  ('Slack/chat'),
  ('Meeting'),
  ('Music/video'),
  ('Snack break'),
  ('Bathroom'),
  ('Getting up')
) AS extras(new_tag)
WHERE NOT EXISTS (
  SELECT 1 FROM distraction_tags t
  WHERE t.user_id = u.id AND t.name = extras.new_tag
);
