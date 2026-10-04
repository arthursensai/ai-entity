import { createClient } from '@supabase/supabase-js'

// Browser client — public anon key only. Safe to import from client components.
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)
