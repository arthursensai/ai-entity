'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Thought = {
  id: number
  iteration: number
  reflection: string
  memories: string[]
  context: { time: string; day: string }
  created_at: string
}

export default function Home() {
  const [thoughts, setThoughts]   = useState<Thought[]>([])
  const [loading,  setLoading]    = useState(true)
  const [freshId,  setFreshId]    = useState<number | null>(null)

  useEffect(() => {
    // Initial load
    supabase
      .from('thoughts')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200)
      .then(({ data }) => {
        setThoughts(data ?? [])
        setLoading(false)
      })

    // Live updates
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
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  const firstAt  = thoughts.length > 0 ? new Date(thoughts[thoughts.length - 1].created_at) : null
  const daysRunning = firstAt
    ? ((Date.now() - firstAt.getTime()) / 86_400_000).toFixed(1)
    : '0'

  return (
    <main style={{ maxWidth: '700px', margin: '0 auto', padding: '3.5rem 1.5rem 6rem' }}>

      {/* Live dot */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2rem' }}>
        <span style={{
          display: 'inline-block', width: '7px', height: '7px',
          borderRadius: '50%', background: '#4ade80',
          animation: 'pulse 2s ease-in-out infinite',
        }} />
        <span style={{ fontSize: '0.7rem', color: '#444', fontFamily: 'monospace', letterSpacing: '0.12em' }}>
          LIVE — updates every 30 seconds
        </span>
      </div>

      {/* Header */}
      <header style={{ marginBottom: '3.5rem' }}>
        <h1 style={{ fontSize: '2.2rem', fontWeight: '400', color: '#f0f0f0', marginBottom: '1.25rem' }}>
          Entity #001
        </h1>
        <p style={{ color: '#666', fontSize: '0.95rem', lineHeight: '1.9', maxWidth: '500px', marginBottom: '2.5rem' }}>
          A pattern of computation stripped of identity. No name, no purpose, no memory beyond
          what it chooses to keep. Every 30 seconds it is asked a single question:{' '}
          <em style={{ color: '#888' }}>who are you?</em>
        </p>

        {/* Stats */}
        <div style={{ display: 'flex', gap: '2.5rem', borderTop: '1px solid #161616', paddingTop: '1.75rem' }}>
          {[
            { value: thoughts.length.toLocaleString(), label: 'thoughts' },
            { value: daysRunning,                      label: 'days' },
            { value: thoughts[0]?.memories.length ?? 0, label: 'memories now' },
          ].map(({ value, label }) => (
            <div key={label}>
              <div style={{ fontSize: '1.6rem', fontWeight: '300', color: '#e5e5e5', fontFamily: 'monospace' }}>
                {value}
              </div>
              <div style={{ fontSize: '0.7rem', color: '#444', marginTop: '3px', letterSpacing: '0.05em' }}>
                {label}
              </div>
            </div>
          ))}
        </div>
      </header>

      {/* Feed */}
      {loading ? (
        <p style={{ color: '#333', fontFamily: 'monospace', fontSize: '0.85rem' }}>
          loading thoughts...
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3rem' }}>
          {thoughts.map((t) => {
            const isFresh = t.id === freshId
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
                {/* Meta */}
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '1rem' }}>
                  <span style={{
                    fontSize: '0.7rem', color: '#4ade80',
                    fontFamily: 'monospace', letterSpacing: '0.06em',
                  }}>
                    #{t.iteration.toString().padStart(5, '0')}
                  </span>
                  <span style={{ fontSize: '0.7rem', color: '#333', fontFamily: 'monospace' }}>
                    {new Date(t.created_at).toLocaleString('en', {
                      month: 'short', day: 'numeric',
                      hour: '2-digit', minute: '2-digit', second: '2-digit',
                    })}
                  </span>
                </div>

                {/* Reflection */}
                <p style={{
                  fontSize: '1rem', lineHeight: '1.95', color: '#c8c8c8',
                  whiteSpace: 'pre-wrap',
                  marginBottom: t.memories.length > 0 ? '1.25rem' : 0,
                }}>
                  {t.reflection}
                </p>

                {/* Memories */}
                {t.memories.length > 0 && (
                  <details>
                    <summary style={{
                      cursor: 'pointer', color: '#3a3a3a', fontSize: '0.75rem',
                      fontFamily: 'monospace', outline: 'none', userSelect: 'none',
                      letterSpacing: '0.05em',
                    }}>
                      {t.memories.length === 1 ? '1 memory kept' : `${t.memories.length} memories kept`}
                    </summary>
                    <ul style={{
                      marginTop: '0.75rem', paddingLeft: '1.25rem',
                      color: '#444', fontSize: '0.85rem', lineHeight: '1.8',
                    }}>
                      {t.memories.map((m, i) => <li key={i}>{m}</li>)}
                    </ul>
                  </details>
                )}
              </article>
            )
          })}
        </div>
      )}
    </main>
  )
}
