-- Friends system: user profiles with public handles, invite links, friend
-- requests (pending state), and friendships (accepted, mutual).
--
-- Design principles baked in:
--   * Handles are auto-generated on signup so anonymous users have an identity
--     immediately.
--   * Invite links are per-user (one reusable link per user), not per-invite.
--     Regenerating the code invalidates the previous.
--   * Requests are a separate table from friendships. A friendship is only
--     created when the recipient accepts.
--   * Friendships use canonical ordering (user_a_id < user_b_id) so the
--     relation is stored exactly once, not mirrored.

-- ── user_profiles ─────────────────────────────────────────────────────────
-- Public-facing profile row per user. For now just the handle; later this
-- can carry display_name, bio, avatar, privacy settings, etc.
CREATE TABLE user_profiles (
  user_id     uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  handle      text UNIQUE NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- Any signed-in user can read any profile (needed to render handles in
-- invite prompts, friend lists, room presence, etc.).
CREATE POLICY "profiles_readable" ON user_profiles
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- Only the owner can update their own profile (handle changes).
CREATE POLICY "own_profile_update" ON user_profiles
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Inserts happen server-side (trigger or backfill); no direct client insert.
-- (No INSERT policy = clients can't insert.)


-- ── friend_invites ────────────────────────────────────────────────────────
-- One reusable link per user. Regenerating replaces the short_code, which
-- invalidates the old URL immediately.
CREATE TABLE friend_invites (
  user_id      uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  short_code   text UNIQUE NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE friend_invites ENABLE ROW LEVEL SECURITY;

-- Owner can manage their own invite.
CREATE POLICY "own_invite" ON friend_invites
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Anyone signed in can look up an invite by short_code (needed for the
-- /invite/[code] landing page to identify who created the link).
CREATE POLICY "read_invite_by_code" ON friend_invites
  FOR SELECT
  USING (auth.role() = 'authenticated');


-- ── friend_requests ───────────────────────────────────────────────────────
-- Pending state only. Accepting a request promotes it to a friendship row
-- (and deletes the request). Declining just deletes the request.
CREATE TABLE friend_requests (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  to_user_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (from_user_id, to_user_id),
  CHECK (from_user_id != to_user_id)
);

CREATE INDEX friend_requests_to_user_idx ON friend_requests (to_user_id);
CREATE INDEX friend_requests_from_user_idx ON friend_requests (from_user_id);

ALTER TABLE friend_requests ENABLE ROW LEVEL SECURITY;

-- Sender and recipient can both read their own requests.
CREATE POLICY "requests_readable_by_both" ON friend_requests
  FOR SELECT
  USING (auth.uid() = from_user_id OR auth.uid() = to_user_id);

-- Sender can create their own outbound requests.
CREATE POLICY "insert_own_outbound_request" ON friend_requests
  FOR INSERT
  WITH CHECK (auth.uid() = from_user_id);

-- Sender can cancel (delete) their own outbound requests. Recipient can
-- delete inbound requests (which is how "decline" works).
CREATE POLICY "delete_own_request" ON friend_requests
  FOR DELETE
  USING (auth.uid() = from_user_id OR auth.uid() = to_user_id);


-- ── friendships ───────────────────────────────────────────────────────────
-- Accepted, mutual. Canonical ordering (a < b) prevents duplicate rows.
CREATE TABLE friendships (
  user_a_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_b_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_a_id, user_b_id),
  CHECK (user_a_id < user_b_id)
);

CREATE INDEX friendships_user_a_idx ON friendships (user_a_id);
CREATE INDEX friendships_user_b_idx ON friendships (user_b_id);

ALTER TABLE friendships ENABLE ROW LEVEL SECURITY;

-- Only rows where the user is one of the two participants are visible.
CREATE POLICY "friendships_readable_by_participants" ON friendships
  FOR SELECT
  USING (auth.uid() = user_a_id OR auth.uid() = user_b_id);

-- Users can unfriend themselves out of a friendship (deleting the row).
CREATE POLICY "unfriend_own" ON friendships
  FOR DELETE
  USING (auth.uid() = user_a_id OR auth.uid() = user_b_id);

-- Inserts happen server-side via accept_friend_request(); no direct client
-- insert.


-- ── Handle generation ─────────────────────────────────────────────────────
-- Auto-generates a handle in [Adjective][Animal][2-digit number] format,
-- retrying up to 10 times on collision. Words chosen to fit the warm/quiet
-- identity (no aggressive/hustle language).
CREATE OR REPLACE FUNCTION generate_handle() RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  adjectives text[] := ARRAY[
    'Quiet', 'Warm', 'Slow', 'Soft', 'Kind', 'Calm', 'Steady', 'Small',
    'Wise', 'Deep', 'Late', 'Early', 'Blue', 'Rain', 'Sun', 'Neat',
    'Still', 'Bright', 'Fair', 'Even', 'Gentle', 'Light', 'Clear',
    'Plain', 'True', 'Free', 'Open', 'Round', 'Fresh', 'Mild'
  ];
  animals text[] := ARRAY[
    'Otter', 'Fox', 'Owl', 'Sparrow', 'Hare', 'Deer', 'Cat', 'Crane',
    'Heron', 'Bear', 'Sheep', 'Duck', 'Turtle', 'Finch', 'Wren', 'Moth',
    'Robin', 'Fawn', 'Lamb', 'Swan', 'Dove', 'Mole', 'Badger', 'Rabbit',
    'Squirrel', 'Beaver', 'Marten', 'Ferret', 'Newt', 'Toad'
  ];
  candidate text;
  attempts  integer := 0;
BEGIN
  LOOP
    candidate :=
      adjectives[1 + floor(random() * array_length(adjectives, 1))::int] ||
      animals[1 + floor(random() * array_length(animals, 1))::int] ||
      lpad((floor(random() * 100))::int::text, 2, '0');
    IF NOT EXISTS (SELECT 1 FROM user_profiles WHERE handle = candidate) THEN
      RETURN candidate;
    END IF;
    attempts := attempts + 1;
    IF attempts >= 10 THEN
      -- Fall back to a UUID-ish suffix if we somehow can't find a free slot
      RETURN 'user' || substring(gen_random_uuid()::text, 1, 8);
    END IF;
  END LOOP;
END;
$$;


-- Same pattern for invite short_codes. Short enough to fit cleanly in a URL,
-- long enough that collisions are effectively impossible.
CREATE OR REPLACE FUNCTION generate_invite_code() RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  chars     text := 'abcdefghijklmnopqrstuvwxyz0123456789';
  candidate text;
  attempts  integer := 0;
BEGIN
  LOOP
    candidate := '';
    FOR i IN 1..8 LOOP
      candidate := candidate || substr(chars, 1 + floor(random() * length(chars))::int, 1);
    END LOOP;
    IF NOT EXISTS (SELECT 1 FROM friend_invites WHERE short_code = candidate) THEN
      RETURN candidate;
    END IF;
    attempts := attempts + 1;
    IF attempts >= 10 THEN
      RETURN substring(gen_random_uuid()::text, 1, 8);
    END IF;
  END LOOP;
END;
$$;


-- ── Auto-create user_profile and friend_invite on new auth user ───────────
CREATE OR REPLACE FUNCTION ensure_user_profile() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO user_profiles (user_id, handle)
    VALUES (NEW.id, generate_handle())
    ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO friend_invites (user_id, short_code)
    VALUES (NEW.id, generate_invite_code())
    ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never let profile creation block user creation. Swallow errors; the
  -- client will lazily create the profile on first access if the trigger
  -- fails for any reason.
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_profile ON auth.users;
CREATE TRIGGER on_auth_user_created_profile
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION ensure_user_profile();


-- ── Backfill for existing users ───────────────────────────────────────────
-- Any auth.users row that predates this migration gets a profile + invite.
INSERT INTO user_profiles (user_id, handle)
  SELECT id, generate_handle()
  FROM auth.users
  WHERE id NOT IN (SELECT user_id FROM user_profiles);

INSERT INTO friend_invites (user_id, short_code)
  SELECT id, generate_invite_code()
  FROM auth.users
  WHERE id NOT IN (SELECT user_id FROM friend_invites);


-- ── Server function: accept a friend request ──────────────────────────────
-- Atomically deletes the pending request and creates the friendship in
-- canonical order. Only the recipient of the request can call this.
CREATE OR REPLACE FUNCTION accept_friend_request(request_id uuid) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  req_from uuid;
  req_to   uuid;
  a_id     uuid;
  b_id     uuid;
BEGIN
  SELECT from_user_id, to_user_id INTO req_from, req_to
    FROM friend_requests WHERE id = request_id;

  IF req_to IS NULL THEN
    RAISE EXCEPTION 'Request not found';
  END IF;

  IF req_to != auth.uid() THEN
    RAISE EXCEPTION 'Only the recipient can accept a request';
  END IF;

  -- Canonical ordering: lower UUID first.
  IF req_from < req_to THEN
    a_id := req_from;
    b_id := req_to;
  ELSE
    a_id := req_to;
    b_id := req_from;
  END IF;

  INSERT INTO friendships (user_a_id, user_b_id)
    VALUES (a_id, b_id)
    ON CONFLICT DO NOTHING;

  DELETE FROM friend_requests WHERE id = request_id;
END;
$$;

GRANT EXECUTE ON FUNCTION accept_friend_request(uuid) TO authenticated;


-- ── Server function: send a friend request from the invite page ──────────
-- Given a short_code, sends a request from the current user to the invite
-- owner. Idempotent: if a request already exists or they're already
-- friends, no-op silently.
CREATE OR REPLACE FUNCTION send_friend_request_by_code(invite_code text) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_user_id uuid;
  a_id           uuid;
  b_id           uuid;
BEGIN
  SELECT user_id INTO target_user_id
    FROM friend_invites WHERE short_code = invite_code;

  IF target_user_id IS NULL THEN
    RETURN 'not_found';
  END IF;

  IF target_user_id = auth.uid() THEN
    RETURN 'self';
  END IF;

  -- Already friends?
  IF auth.uid() < target_user_id THEN
    a_id := auth.uid(); b_id := target_user_id;
  ELSE
    a_id := target_user_id; b_id := auth.uid();
  END IF;

  IF EXISTS (SELECT 1 FROM friendships WHERE user_a_id = a_id AND user_b_id = b_id) THEN
    RETURN 'already_friends';
  END IF;

  -- Existing request in either direction? Idempotent handling.
  IF EXISTS (
    SELECT 1 FROM friend_requests
    WHERE (from_user_id = auth.uid() AND to_user_id = target_user_id)
       OR (from_user_id = target_user_id AND to_user_id = auth.uid())
  ) THEN
    RETURN 'already_requested';
  END IF;

  INSERT INTO friend_requests (from_user_id, to_user_id)
    VALUES (auth.uid(), target_user_id);

  RETURN 'sent';
END;
$$;

GRANT EXECUTE ON FUNCTION send_friend_request_by_code(text) TO authenticated;


-- ── Server function: regenerate the current user's invite code ────────────
CREATE OR REPLACE FUNCTION regenerate_invite_code() RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_code text;
BEGIN
  new_code := generate_invite_code();
  UPDATE friend_invites SET short_code = new_code, created_at = now()
    WHERE user_id = auth.uid();
  RETURN new_code;
END;
$$;

GRANT EXECUTE ON FUNCTION regenerate_invite_code() TO authenticated;
