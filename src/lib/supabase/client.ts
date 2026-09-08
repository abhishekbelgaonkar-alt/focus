import { createBrowserClient } from '@supabase/ssr'

// Build-time defaults: allow `next build` to prerender pages when no
// .env.local is present. Real values are baked in at build time via
// NEXT_PUBLIC_ env vars in any real deploy.
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co'
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'placeholder-anon-key'

export function createClient() {
  return createBrowserClient(URL, KEY)
}
