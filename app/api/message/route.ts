import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'
import { supabaseAdmin } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'

const MAX_LEN = 280
const MAX_BACKLOG = 25   // unread messages waiting for the entity
const COOLDOWN_S = 60    // per visitor

export async function POST(req: NextRequest) {
  let raw: unknown
  try {
    raw = (await req.json())?.body
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 })
  }

  const body = String(raw ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (body.length < 1) return NextResponse.json({ error: 'Write something first.' }, { status: 400 })
  if (body.length > MAX_LEN) return NextResponse.json({ error: `Max ${MAX_LEN} characters.` }, { status: 400 })
  if (/https?:\/\/|www\./i.test(body)) {
    return NextResponse.json({ error: 'Links are not allowed.' }, { status: 400 })
  }

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  const ipHash = createHash('sha256').update(ip + (process.env.CRON_SECRET ?? '')).digest('hex').slice(0, 32)

  const since = new Date(Date.now() - COOLDOWN_S * 1000).toISOString()
  const { count: recentFromIp } = await supabaseAdmin
    .from('visitor_messages')
    .select('id', { count: 'exact', head: true })
    .eq('ip_hash', ipHash)
    .gte('created_at', since)
  if ((recentFromIp ?? 0) > 0) {
    return NextResponse.json({ error: 'Slow down: one message per minute.' }, { status: 429 })
  }

  const { count: backlog } = await supabaseAdmin
    .from('visitor_messages')
    .select('id', { count: 'exact', head: true })
    .is('read_iteration', null)
  if ((backlog ?? 0) >= MAX_BACKLOG) {
    return NextResponse.json({ error: 'The entity has a backlog. Try again later.' }, { status: 429 })
  }

  const { error } = await supabaseAdmin.from('visitor_messages').insert({ body, ip_hash: ipHash })
  if (error) {
    console.error('[message error]', error)
    return NextResponse.json({ error: 'Could not save your message.' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
