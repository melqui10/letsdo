import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import type { Activity, Category, Profile } from '../types'
import { PriorityBadge } from './PriorityBadge'

interface Props {
  activity: Activity
  members: Profile[]
  categories: Category[]
  onToggle: (a: Activity) => void
  onEdit: (a: Activity) => void
  onDelete: (a: Activity) => void
}

export function ActivityCard({
  activity,
  members,
  categories,
  onToggle,
  onEdit,
  onDelete,
}: Props) {
  const assignee = members.find((m) => m.id === activity.assignee_id)
  const category = categories.find((c) => c.id === activity.category_id)
  const recurring = Boolean(activity.recurrence_rule)

  return (
    <li className="flex items-start gap-3 rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
      <button
        onClick={() => onToggle(activity)}
        aria-label={activity.is_done ? 'Reabrir tarefa' : 'Concluir tarefa'}
        className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 text-sm ${
          activity.is_done
            ? 'border-indigo-600 bg-indigo-600 text-white'
            : 'border-gray-300 text-transparent'
        }`}
      >
        ✓
      </button>

      <button
        onClick={() => onEdit(activity)}
        className="min-w-0 flex-1 text-left"
      >
        <p
          className={`font-medium ${
            activity.is_done ? 'text-gray-400 line-through' : 'text-gray-900'
          }`}
        >
          {activity.title}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-gray-500">
          <PriorityBadge priority={activity.priority} />
          {category && (
            <span
              className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5"
            >
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: category.color }}
              />
              {category.name}
            </span>
          )}
          {activity.due_at && (
            <span>
              {format(new Date(activity.due_at), "dd MMM 'às' HH:mm", {
                locale: ptBR,
              })}
            </span>
          )}
          {recurring && <span title="Tarefa recorrente">🔁</span>}
          {assignee && <span>· {assignee.display_name}</span>}
        </div>
      </button>

      <button
        onClick={() => onDelete(activity)}
        aria-label="Excluir tarefa"
        className="shrink-0 px-1 text-gray-300 hover:text-red-500"
      >
        ✕
      </button>
    </li>
  )
}
