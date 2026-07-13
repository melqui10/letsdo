import { supabase } from './supabase'
import type { Activity, KanbanStatus, Priority } from '../types'

export interface ActivityInput {
  title: string
  description?: string | null
  priority: Priority
  category_id?: string | null
  assignee_id?: string | null
  due_at?: string | null
  is_all_day?: boolean
  kanban_status?: KanbanStatus
  recurrence_rule?: string | null
}

export async function listActivities(householdId: string): Promise<Activity[]> {
  const { data, error } = await supabase
    .from('activities')
    .select('*')
    .eq('household_id', householdId)
  if (error) throw error
  return data ?? []
}

export async function createActivity(
  householdId: string,
  userId: string,
  input: ActivityInput,
): Promise<Activity> {
  const { data, error } = await supabase
    .from('activities')
    .insert({ ...input, household_id: householdId, created_by: userId })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateActivity(
  id: string,
  patch: Partial<ActivityInput> & {
    is_done?: boolean
    kanban_status?: KanbanStatus
  },
): Promise<void> {
  const { error } = await supabase.from('activities').update(patch).eq('id', id)
  if (error) throw error
}

export async function toggleDone(id: string, isDone: boolean): Promise<void> {
  const { error } = await supabase
    .from('activities')
    .update({ is_done: isDone, kanban_status: isDone ? 'feito' : 'a_fazer' })
    .eq('id', id)
  if (error) throw error
}

export async function deleteActivity(id: string): Promise<void> {
  const { error } = await supabase.from('activities').delete().eq('id', id)
  if (error) throw error
}
