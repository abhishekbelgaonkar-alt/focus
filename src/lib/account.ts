import type { SupabaseClient } from '@supabase/supabase-js'

export type AttachResult =
  | { status: 'attached' }
  | { status: 'confirm' }        // Supabase sent a confirmation email first
  | { status: 'error'; message: string }

/**
 * Attach an email + password to the current (anonymous) account. Same user
 * id, so all data stays reachable. When the Supabase project requires email
 * confirmation, the email isn't attached until the link is clicked.
 */
export async function attachEmail(
  supabase: SupabaseClient,
  email: string,
  password: string
): Promise<AttachResult> {
  const { data, error } = await supabase.auth.updateUser({ email: email.trim(), password })
  if (error) return { status: 'error', message: error.message }
  return data.user?.email ? { status: 'attached' } : { status: 'confirm' }
}
