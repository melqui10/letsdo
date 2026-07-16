import { useEffect, useRef, useState } from 'react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import type { Activity, Category, Profile } from '../types'
import { estimatePoints } from '../lib/score'
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

  // Celebração local ao concluir: o card é keyed por activity.id, então este
  // estado sobrevive ao reload da lista que o onToggle dispara.
  const [justDone, setJustDone] = useState(false)
  const [floatPts, setFloatPts] = useState<number | null>(null)
  const timers = useRef<number[]>([])
  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  // Visual otimista: mostra concluída já no clique, antes do banco responder.
  const done = activity.is_done || justDone

  function handleToggle() {
    // Guarda com `done` (inclui o otimista) para não celebrar duas vezes num
    // clique duplo rápido, antes de a prop is_done chegar do reload.
    if (!done) {
      timers.current.forEach(clearTimeout)
      timers.current = []
      setJustDone(true)
      const pts = estimatePoints(activity)
      if (pts > 0) setFloatPts(pts)
      navigator.vibrate?.(35)
      timers.current.push(window.setTimeout(() => setJustDone(false), 700))
      timers.current.push(window.setTimeout(() => setFloatPts(null), 1300))
    }
    onToggle(activity)
  }

  return (
    <li className="flex items-start gap-3 rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
      <div className="relative mt-0.5 shrink-0">
        <button
          onClick={handleToggle}
          aria-label={done ? 'Reabrir tarefa' : 'Concluir tarefa'}
          className={`flex h-6 w-6 items-center justify-center rounded-full border-2 ${
            done
              ? 'border-indigo-600 bg-indigo-600 text-white'
              : 'border-gray-300 text-transparent'
          } ${justDone ? 'check-pop' : ''}`}
        >
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" aria-hidden>
            <path
              d="M3 8.5l3.5 3.5L13 4.5"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={justDone ? 'check-draw' : ''}
            />
          </svg>
        </button>
        {floatPts !== null && (
          <span className="pts-float rounded-full bg-indigo-600 px-2 py-0.5 text-xs font-semibold text-white shadow">
            +{floatPts} pts
          </span>
        )}
      </div>

      <button
        onClick={() => onEdit(activity)}
        className="min-w-0 flex-1 text-left"
      >
        <p className={`font-medium ${done ? 'text-gray-400' : 'text-gray-900'}`}>
          <span
            className={
              done ? `title-strike ${justDone ? 'title-strike-anim' : ''}` : ''
            }
          >
            {activity.title}
          </span>
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-gray-500">
          <PriorityBadge priority={activity.priority} />
          {category && (
            <span
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5"
              style={{ backgroundColor: `${category.color}22`, color: category.color }}
            >
              {category.icon ? (
                <span>{category.icon}</span>
              ) : (
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: category.color }}
                />
              )}
              {category.name}
            </span>
          )}
          {activity.due_at && (
            <span>
              {format(
                new Date(activity.due_at),
                activity.is_all_day ? 'dd MMM' : "dd MMM 'às' HH:mm",
                { locale: ptBR },
              )}
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
