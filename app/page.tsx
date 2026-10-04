'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Inputs = { weather?: string | null; headlines?: string[]; visitors?: string[] }

type Thought = {
  id: number
  iteration: number
  reflection: string
  memories: string[] | null
  context: { time: string; day: string }
  created_at: string
  inputs: Inputs | null
  angle: string | null
  working_memory: string | null
  forgotten: string[] | null
}

type Mind = {
  workingMemory: string
  memories: { id: number; content: string; times_kept: number }[]
}

const label = {
  cursor: 'pointer', color: '#3a3a3a', fontSize: '0.75rem',
  fontFamily: 'monospace', outline: 'none', userSelect: 'none', letterSpacing: '0.05em',
} as const

const list = {
  marginTop: '0.75rem', paddingLeft: '1.25rem',
  color: '#444', fontSize: '0.85rem', lineHeight: '1.8',
} as const

export default function Home() {
  const [thoughts, setThoughts] = useState<Thought[]>([])
  const [loading, setLoading]   = useState(true)
  const [freshId, setFreshId]   = useState<number | null>(null)
  const [mind, setMind]         = useState<Mind>({ workingMemory: '', memories: [] })

  const [draft, setDraft]     = useState('')
  const [sending, setSending] = useState(false)
  const [note, setNote]       = useState<string | null>(null)

  const loadMind = useCallback(async () => {
    const [state, mem] = await Promise.all([
      supabase.from('entity_state').select('working_memory').eq('id', 1).maybeSingle(),
      supabase.from('entity_memories').select('id, content, times_kept').order('id', { ascending: true }),
    ])
    setMind({
      workingMemory: state.data?.working_memory ?? '',
      memories: mem.data ?? [],
    })
  }, [])

  useEffect(() => {
    supabase
      .from('thoughts')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200)
      .then(({ data }) => {
        setThoughts((data ?? []) as Thought[])
        setLoading(false)
      })
    loadMind()

    const channel = supabase
      .channel('live')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'thoughts' },
        (payload) => {
          const t = payload.new as Thought
          setThoughts(prev => [t, ...prev])
          setFreshId(t.id)
          setTimeout(() => setFreshId(null), 2500)
          // the server updates its memory right after saving the thought
          setTimeout(loadMind, 2000)
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [loadMind])

  async function send(e: React.FormEvent) {
    e.preventDefault()
    const body = draft.trim()
    if (!body || sending) return
    setSending(true)
    setNote(null)
    try {
      const res = await fetch('/api/message', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ body }),
      })
      const j = await res.json().catch(() => ({}))
      if (res.ok) {
        setDraft('')
        setNote('queued — it will hear this on a coming turn')
      } else {
        setNote(j.error ?? 'could not send')
      }
    } catch {
      setNote('network error')
    } finally {
      setSending(false)
    }
  }

  const firstAt = thoughts.length > 0 ? new Date(thoughts[thoughts.length - 1].created_at) : null
  const daysRunning = firstAt ? ((Date.now() - firstAt.getTime()) / 86_400_000).toFixed(1) : '0'
  const forgottenTotal = thoughts.reduce((n, t) => n + (t.forgotten?.length ?? 0), 0)

  return (
    <main style={{ maxWidth: '700px', margin: '0 auto', padding: '3.5rem 1.5rem 6rem' }}>

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2rem' }}>
        <span style={{
          display: 'inline-block', width: '7px', height: '7px',
          borderRadius: '50%', background: '#4ade80',
          animation: 'pulse 2s ease-in-out infinite',
        }} />
        <span style={{ fontSize: '0.7rem', color: '#444', fontFamily: 'monospace', letterSpacing: '0.12em' }}>
          LIVE — a new thought every few minutes
        </span>
      </div>

      <header style={{ marginBottom: '3rem' }}>
        <h1 style={{ fontSize: '2.2rem', fontWeight: '400', color: '#f0f0f0', marginBottom: '1.25rem' }}>
          Entity #001
        </h1>
        <p style={{ color: '#666', fontSize: '0.95rem', lineHeight: '1.9', maxWidth: '520px', marginBottom: '2.5rem' }}>
          A pattern of computation with no name and no purpose. Each turn the world reaches it —
          the weather, a few headlines, sometimes a message from a stranger — and it keeps a
          scratchpad and a small shelf of memories. What it does not keep is deleted for good.
        </p>

        <div style={{ display: 'flex', gap: '2.5rem', flexWrap: 'wrap', borderTop: '1px solid #161616', paddingTop: '1.75rem' }}>
          {[
            { value: thoughts.length.toLocaleString(), label: 'thoughts' },
            { value: daysRunning,                      label: 'days' },
            { value: mind.memories.length,             label: 'memories now' },
            { value: forgottenTotal.toLocaleString(),  label: 'forgotten' },
          ].map(({ value, label: l }) => (
            <div key={l}>
              <div style={{ fontSize: '1.6rem', fontWeight: '300', color: '#e5e5e5', fontFamily: 'monospace' }}>
                {value}
              </div>
              <div style={{ fontSize: '0.7rem', color: '#444', marginTop: '3px', letterSpacing: '0.05em' }}>
                {l}
              </div>
            </div>
          ))}
        </div>
      </header>

      {/* Its mind, right now */}
      <section style={{ marginBottom: '2.5rem' }}>
        <details>
          <summary style={label}>its mind right now</summary>
          <div style={{ marginTop: '1rem', color: '#555', fontSize: '0.85rem', lineHeight: '1.8' }}>
            <div style={{ color: '#3a3a3a', fontFamily: 'monospace', fontSize: '0.7rem', letterSpacing: '0.08em' }}>
              SCRATCHPAD
            </div>
            <p style={{ whiteSpace: 'pre-wrap', marginBottom: '1rem' }}>
              {mind.workingMemory || '(empty)'}
            </p>
            <div style={{ color: '#3a3a3a', fontFamily: 'monospace', fontSize: '0.7rem', letterSpacing: '0.08em' }}>
              SHELF
            </div>
            {mind.memories.length === 0 ? (
              <p>(empty)</p>
            ) : (
              <ul style={{ paddingLeft: '1.25rem' }}>
                {mind.memories.map(m => (
                  <li key={m.id}>
                    {m.content}{' '}
                    <span style={{ color: '#333', fontFamily: 'monospace', fontSize: '0.7rem' }}>
                      kept {m.times_kept}×
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </details>
      </section>

      {/* Talk to it */}
      <section style={{ marginBottom: '3.5rem' }}>
        <div style={{ color: '#3a3a3a', fontFamily: 'monospace', fontSize: '0.7rem', letterSpacing: '0.08em', marginBottom: '0.6rem' }}>
          SAY SOMETHING TO IT
        </div>
        <form onSubmit={send} style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-start' }}>
          <textarea
            value={draft}
            onChange={e => setDraft(e.target.value)}
            maxLength={280}
            rows={2}
            placeholder="up to 280 characters, no links"
            style={{
              flex: 1, background: '#0e0e0e', color: '#d4d4d4', border: '1px solid #1c1c1c',
              borderRadius: '4px', padding: '0.6rem 0.75rem', fontSize: '0.9rem',
              fontFamily: 'inherit', resize: 'none', outline: 'none',
            }}
          />
          <button
            type="submit"
            disabled={sending || !draft.trim()}
            style={{
              background: 'transparent', color: sending || !draft.trim() ? '#333' : '#4ade80',
              border: '1px solid #1c1c1c', borderRadius: '4px', padding: '0.6rem 1rem',
              fontFamily: 'monospace', fontSize: '0.8rem', cursor: 'pointer',
            }}
          >
            send
          </button>
        </form>
        {note && (
          <p style={{ marginTop: '0.6rem', color: '#555', fontFamily: 'monospace', fontSize: '0.75rem' }}>{note}</p>
        )}
      </section>

      {loading ? (
        <p style={{ color: '#333', fontFamily: 'monospace', fontSize: '0.85rem' }}>loading thoughts...</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3rem' }}>
          {thoughts.map((t) => {
            const isFresh = t.id === freshId
            const memories = t.memories ?? []
            const forgotten = t.forgotten ?? []
            const inp = t.inputs ?? {}
            const hasInputs = !!(inp.weather || inp.headlines?.length || inp.visitors?.length)
            return (
              <article
                key={t.id}
                style={{
                  borderLeft: `2px solid ${isFresh ? '#4ade80' : '#1a1a1a'}`,
                  paddingLeft: '1.5rem',
                  transition: 'border-color 1.5s ease',
                  animation: isFresh ? 'fadeIn 0.4s ease' : undefined,
                }}
              >
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.7rem', color: '#4ade80', fontFamily: 'monospace', letterSpacing: '0.06em' }}>
                    #{t.iteration.toString().padStart(5, '0')}
                  </span>
                  <span style={{ fontSize: '0.7rem', color: '#333', fontFamily: 'monospace' }}>
                    {new Date(t.created_at).toLocaleString('en', {
                      month: 'short', day: 'numeric',
                      hour: '2-digit', minute: '2-digit', second: '2-digit',
                    })}
                  </span>
                  {(inp.visitors?.length ?? 0) > 0 && (
                    <span style={{ fontSize: '0.7rem', color: '#8b7a3a', fontFamily: 'monospace' }}>
                      ✉ heard from a visitor
                    </span>
                  )}
                </div>

                <p style={{ fontSize: '1rem', lineHeight: '1.95', color: '#c8c8c8', whiteSpace: 'pre-wrap', marginBottom: '1.1rem' }}>
                  {t.reflection}
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                  {hasInputs && (
                    <details>
                      <summary style={label}>what reached it</summary>
                      <ul style={list}>
                        {inp.weather && <li>weather: {inp.weather}</li>}
                        {(inp.headlines ?? []).map((h, i) => <li key={`h${i}`}>headline: {h}</li>)}
                        {(inp.visitors ?? []).map((v, i) => <li key={`v${i}`} style={{ color: '#8b7a3a' }}>visitor: “{v}”</li>)}
                        {t.angle && <li>provocation: {t.angle}</li>}
                      </ul>
                    </details>
                  )}

                  {t.working_memory && (
                    <details>
                      <summary style={label}>scratchpad after this turn</summary>
                      <p style={{ ...list, paddingLeft: 0, whiteSpace: 'pre-wrap' }}>{t.working_memory}</p>
                    </details>
                  )}

                  {memories.length > 0 && (
                    <details>
                      <summary style={label}>
                        {memories.length === 1 ? '1 memory kept' : `${memories.length} memories kept`}
                      </summary>
                      <ul style={list}>{memories.map((m, i) => <li key={i}>{m}</li>)}</ul>
                    </details>
                  )}

                  {forgotten.length > 0 && (
                    <details>
                      <summary style={{ ...label, color: '#5a3a3a' }}>
                        {forgotten.length === 1 ? '1 memory deleted' : `${forgotten.length} memories deleted`}
                      </summary>
                      <ul style={{ ...list, color: '#3a2a2a', textDecoration: 'line-through' }}>
                        {forgotten.map((m, i) => <li key={i}>{m}</li>)}
                      </ul>
                    </details>
                  )}
                </div>
              </article>
            )
          })}
        </div>
      )}
    </main>
  )
}
