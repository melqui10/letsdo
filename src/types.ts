// Tipos que espelham o schema do banco (Supabase).

export type Priority = 'baixa' | 'media' | 'alta' | 'urgente'
export type Category = 'casa' | 'igreja' | 'mercado' | 'financeiro' | 'outro'
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

export interface Activity {
  id: string
  household_id: string
  title: string
  description: string | null
  priority: Priority
  category: Category
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

export const CATEGORY_LABELS: Record<Category, string> = {
  casa: 'Casa',
  igreja: 'Igreja',
  mercado: 'Mercado',
  financeiro: 'Financeiro',
  outro: 'Outro',
}
