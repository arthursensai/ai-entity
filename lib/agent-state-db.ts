import { supabaseAdmin } from '@/lib/supabase-admin'
import { defaultState, normalizeState, type AgentState } from '@/lib/agent-state'

export async function loadAgentState(): Promise<{ state: AgentState; revision: number }> {
  const { data, error } = await supabaseAdmin
    .from('agent_state').select('state, revision').eq('id', 1).maybeSingle()
  if (error) throw error
  if (!data) return { state: defaultState(), revision: 0 }
  return { state: normalizeState(data.state), revision: data.revision ?? 0 }
}

export async function saveAgentState(state: AgentState, revision: number): Promise<void> {
  const { error } = await supabaseAdmin
    .from('agent_state')
    .upsert({ id: 1, state, revision, updated_at: new Date().toISOString() })
  if (error) throw error
}

export type ExperimentLogRow = {
  iteration: number
  experiment_version: string
  requested_version: string
  model: string
  temperature: number
  deterministic: boolean
  input: unknown
  retrieved_memory_ids: number[]
  hidden_memory_ids: number[]
  new_memories: string[]
  deleted_memories: string[]
  state_before: AgentState | null
  state_after: AgentState | null
  extra?: unknown
}

export async function logExperiment(row: ExperimentLogRow): Promise<void> {
  const { error } = await supabaseAdmin.from('experiment_log').insert(row)
  if (error) throw error
}
