import type { Priority } from '../types'
import { PRIORITY_LABELS } from '../types'

const STYLES: Record<Priority, string> = {
  baixa: 'bg-gray-100 text-gray-600',
  media: 'bg-blue-100 text-blue-700',
  alta: 'bg-orange-100 text-orange-700',
  urgente: 'bg-red-100 text-red-700',
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STYLES[priority]}`}
    >
      {PRIORITY_LABELS[priority]}
    </span>
  )
}
