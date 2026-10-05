import { supabaseAdmin } from '@/lib/supabase-admin'
import type { MemoryPlan, StoredMemory } from '@/lib/memory-plan'

export const CORE_TEXT =
  'CORE: under every turn, who is the one doing this, right now? Answer only through what I do (chose, ignored, kept, deleted, predicted, replied), never through claims.'

/** The standing question must always exist on the shelf, protected. Re-seeded if missing. */
async function ensureCore(): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from('entity_memories').select('id').eq('protected', true).limit(1)
  if (error) throw error
  if (!data || data.length === 0) {
    const { error: e2 } = await supabaseAdmin
      .from('entity_memories').insert({ content: CORE_TEXT, created_iteration: 0, protected: true })
    if (e2) throw e2
  }
}

/** Load the entity's current mind: scratchpad + long-term shelf. */
export async function loadMind(): Promise<{ workingMemory: string; memories: StoredMemory[] }> {
  await ensureCore()
  const [state, mem] = await Promise.all([
    supabaseAdmin.from('entity_state').select('working_memory').eq('id', 1).maybeSingle(),
    supabaseAdmin
      .from('entity_memories')
      .select('id, content, times_kept, created_iteration, protected')
      .order('id', { ascending: true }),
  ])
  if (state.error) throw state.error
  if (mem.error) throw mem.error
  return {
    workingMemory: state.data?.working_memory ?? '',
    memories: (mem.data ?? []) as StoredMemory[],
  }
}

/** Apply the plan. Deleted memories are really deleted — there is no archive. */
export async function commitMemory(plan: MemoryPlan, iteration: number): Promise<void> {
  if (plan.forgetIds.length > 0) {
    const { error } = await supabaseAdmin.from('entity_memories').delete().in('id', plan.forgetIds)
    if (error) throw error
  }
  if (plan.adds.length > 0) {
    const { error } = await supabaseAdmin
      .from('entity_memories')
      .insert(plan.adds.map(content => ({ content, created_iteration: iteration })))
    if (error) throw error
  }
  for (const m of plan.keptRows) {
    const { error } = await supabaseAdmin
      .from('entity_memories')
      .update({ times_kept: m.times_kept + 1 })
      .eq('id', m.id)
    if (error) throw error
  }
  if (plan.workingMemory !== null) {
    const { error } = await supabaseAdmin
      .from('entity_state')
      .upsert({ id: 1, working_memory: plan.workingMemory, updated_at: new Date().toISOString() })
    if (error) throw error
  }
}
