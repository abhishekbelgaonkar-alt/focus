-- Fix "Database error creating anonymous user".
--
-- Supabase's auth backend calls the on_auth_user_created trigger inside the
-- same transaction as the auth.users INSERT. If the trigger raises, the whole
-- INSERT rolls back and the client sees a generic auth error.
--
-- The original seed_distraction_tags() was missing two things:
--   1. An explicit SET search_path — SECURITY DEFINER functions called from
--      Supabase's auth schema don't inherit a useful search_path, so unqualified
--      table names can't be resolved.
--   2. An EXCEPTION handler — if seeding ever fails, we still want the user
--      to be created; the app can re-seed lazily on first login.

CREATE OR REPLACE FUNCTION public.seed_distraction_tags()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.distraction_tags (user_id, name) VALUES
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
EXCEPTION WHEN OTHERS THEN
  -- Never block user creation. Log and continue.
  RAISE WARNING 'seed_distraction_tags failed for user %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

-- Ensure the trigger is present (should already exist from initial_schema.sql
-- but is harmless to re-create).
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.seed_distraction_tags();
