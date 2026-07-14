// Tipos que espelham o schema do banco (Supabase).

export type Priority = 'baixa' | 'media' | 'alta' | 'urgente'
export type KanbanStatus = 'a_fazer' | 'fazendo' | 'feito'

export interface Profile {
  id: string
  display_name: string
  avatar_url: string | null
  created_at: string
}

export interface Household {
  id: string
  name: string
  created_at: string
}

// Categoria personalizável por lar (com cor e ícone).
export interface Category {
  id: string
  household_id: string
  name: string
  color: string
  icon: string | null
  created_at: string
}

// Paleta de cores oferecida ao criar uma categoria.
export const CATEGORY_COLORS = [
  '#4f46e5',
  '#0ea5e9',
  '#16a34a',
  '#f59e0b',
  '#ef4444',
  '#db2777',
  '#7c3aed',
  '#6b7280',
] as const

// Paleta de ícones (emoji) oferecida ao criar uma categoria.
export const CATEGORY_ICONS = [
  '🏠',
  '⛪',
  '🛒',
  '💰',
  '🍽️',
  '🧹',
  '🚗',
  '💊',
  '🎓',
  '💼',
  '🏋️',
  '🐾',
  '🎉',
  '✈️',
  '📌',
  '❤️',
] as const

// Distingue um afazer (tarefa) de um evento com hora marcada (compromisso).
export type ActivityKind = 'tarefa' | 'compromisso'

export const ACTIVITY_KIND_LABELS: Record<ActivityKind, string> = {
  tarefa: 'Tarefa',
  compromisso: 'Compromisso',
}

export interface Activity {
  id: string
  household_id: string
  title: string
  description: string | null
  priority: Priority
  category_id: string | null
  assignee_id: string | null
  due_at: string | null
  is_all_day: boolean
  kanban_status: KanbanStatus
  is_done: boolean
  recurrence_rule: string | null
  kind: ActivityKind
  end_at: string | null
  show_in_agenda: boolean
  created_by: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
}

// Tipo de evento no livro-razão de pontos (gamificação).
export type ScoreEventType = 'conclusao' | 'bonus'

// Espelha `public.score_events`: um lançamento imutável por conclusão.
export interface ScoreEvent {
  id: number
  household_id: string
  profile_id: string
  activity_id: string | null
  event_type: ScoreEventType
  points: number
  priority: Priority | null
  on_time: boolean | null
  event_day: string // YYYY-MM-DD (fuso America/Sao_Paulo)
  created_at: string
}

// Preferências de notificação push (por usuário).
export interface NotificationPrefs {
  profile_id: string
  daily_enabled: boolean
  daily_time: string // 'HH:MM'
  before_event_enabled: boolean
  before_event_minutes: number
  feed_enabled: boolean
  updated_at: string
}

// Rótulos em pt-BR para exibição na UI.
export const PRIORITY_LABELS: Record<Priority, string> = {
  baixa: 'Baixa',
  media: 'Média',
  alta: 'Alta',
  urgente: 'Urgente',
}
