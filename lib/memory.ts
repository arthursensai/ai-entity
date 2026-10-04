import { supabaseAdmin } from '@/lib/supabase-admin'
import type { MemoryPlan, StoredMemory } from '@/lib/memory-plan'

/** Load the entity's current mind: scratchpad + long-term shelf. */
export async function loadMind(): Promise<{ workingMemory: string; memories: StoredMemory[] }> {
  const [state, mem] = await Promise.all([
    supabaseAdmin.from('entity_state').select('working_memory').eq('id', 1).maybeSingle(),
    supabaseAdmin
      .from('entity_memories')
      .select('id, content, times_kept, created_iteration')
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
