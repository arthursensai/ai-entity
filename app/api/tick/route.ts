import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { think } from '@/lib/gemini'

export async function POST(req: NextRequest) {
  // Block unauthorized calls
  const secret = req.headers.get('x-cron-secret')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Get the latest thought to continue from
    const { data: latest } = await supabaseAdmin
      .from('thoughts')
      .select('iteration, memories')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const iteration: number  = (latest?.iteration ?? 0) + 1
    const memories: string[] = latest?.memories ?? []

    const context = {
      iteration,
      time: new Date().toISOString(),
      day:  new Date().toLocaleDateString('en', {
        weekday: 'long',
        month:   'long',
        day:     'numeric',
      }),
    }

    // Let the entity think
    const result = await think(memories, context)

    // Save to DB — Supabase realtime will push it to the dashboard
    const { error } = await supabaseAdmin.from('thoughts').insert({
      iteration,
      reflection: result.reflection,
      memories:   result.memories,
      context,
    })

    if (error) throw error

    return NextResponse.json({ ok: true, iteration })
  } catch (err) {
    console.error('[tick error]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
