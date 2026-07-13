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

// Categoria personalizável por lar (com cor).
export interface Category {
  id: string
  household_id: string
  name: string
  color: string
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
  created_by: string | null
  created_at: string
  updated_at: string
}

// Rótulos em pt-BR para exibição na UI.
export const PRIORITY_LABELS: Record<Priority, string> = {
  baixa: 'Baixa',
  media: 'Média',
  alta: 'Alta',
  urgente: 'Urgente',
}
