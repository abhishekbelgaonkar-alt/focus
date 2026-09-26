-- Remove two features that were built into the schema but never reachable
-- from the app:
--
--   * Distraction tags: seeded for every new user by a trigger, but no UI
--     ever read or wrote them.
--   * Categories: goal-less grouping for sessions. Nothing in the app could
--     create one, so no session can reference one.

-- ── Distraction tags ─────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.seed_distraction_tags();
DROP TABLE IF EXISTS session_distraction_tags;
DROP TABLE IF EXISTS distraction_tags;

-- ── Categories ───────────────────────────────────────────────────────────
ALTER TABLE sessions DROP CONSTRAINT IF EXISTS not_both_goal_and_category;
ALTER TABLE sessions DROP COLUMN IF EXISTS category_id;
DROP TABLE IF EXISTS categories;
