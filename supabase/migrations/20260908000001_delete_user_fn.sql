-- Allows authenticated users to delete their own auth.users row.
-- SECURITY DEFINER runs as the function owner (postgres), which has
-- permission to delete from auth.users. The WHERE clause ensures each
-- user can only delete themselves. All child table rows cascade automatically
-- via the ON DELETE CASCADE constraints set up in the initial schema migration.
CREATE OR REPLACE FUNCTION delete_user()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM auth.users WHERE id = auth.uid();
END;
$$;
