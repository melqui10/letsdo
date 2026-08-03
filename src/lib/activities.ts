import { supabase } from './supabase'
import type { Activity, ActivityKind, KanbanStatus, Priority } from '../types'

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
  kind?: ActivityKind
  end_at?: string | null
  show_in_agenda?: boolean
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

// Conclusões por ocorrência. `occurrence_date` é o dia (yyyy-MM-dd) da
// ocorrência concluída — é ele que faz a mensal de setembro ser independente da
// de agosto. Ver `supabase/migrations/0012_activity_occurrences.sql`.
export interface ActivityCompletion {
  activity_id: string
  occurrence_date: string
  completed_by: string | null
  completed_at: string
}

// Conclusões recentes do lar. A janela evita trazer o histórico inteiro: a
// Lista só precisa saber sobre a ocorrência corrente de cada tarefa.
export async function listCompletions(
  activityIds: string[],
  desde: string,
): Promise<ActivityCompletion[]> {
  if (activityIds.length === 0) return []
  const { data, error } = await supabase
    .from('activity_completions')
    .select('*')
    .in('activity_id', activityIds)
    .gte('occurrence_date', desde)
  if (error) throw error
  return data ?? []
}

// Conclui ou reabre UMA ocorrência. O trigger no banco cuida de espelhar
// `is_done`/`completed_at` na atividade e de lançar (ou estornar) os pontos.
export async function toggleDone(
  id: string,
  isDone: boolean,
  occurrenceDate: string,
  userId: string | null,
): Promise<void> {
  if (isDone) {
    const { error } = await supabase
      .from('activity_completions')
      .insert({
        activity_id: id,
        occurrence_date: occurrenceDate,
        completed_by: userId,
      })
    if (error) throw error
    return
  }
  const { error } = await supabase
    .from('activity_completions')
    .delete()
    .eq('activity_id', id)
    .eq('occurrence_date', occurrenceDate)
  if (error) throw error
}

// Virada de ocorrência: a atividade ficou marcada como concluída, mas a
// ocorrência corrente é outra (ex.: a mensal virou o mês). Reabre a linha sem
// mexer nas conclusões passadas — os pontos daquelas ocorrências ficam.
export async function reopenForNewOccurrence(ids: string[]): Promise<void> {
  if (ids.length === 0) return
  const { error } = await supabase
    .from('activities')
    .update({ is_done: false, completed_at: null, kanban_status: 'a_fazer' })
    .in('id', ids)
  if (error) throw error
}

export async function deleteActivity(id: string): Promise<void> {
  const { error } = await supabase.from('activities').delete().eq('id', id)
  if (error) throw error
}
