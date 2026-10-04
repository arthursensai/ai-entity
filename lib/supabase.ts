import { createClient } from '@supabase/supabase-js'

const url  = process.env.NEXT_PUBLIC_SUPABASE_URL!
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const svc  = process.env.SUPABASE_SERVICE_ROLE_KEY!

// Browser — read-only, public
export const supabase = createClient(url, anon)

// Server — write access, bypasses RLS
export const supabaseAdmin = createClient(url, svc)
