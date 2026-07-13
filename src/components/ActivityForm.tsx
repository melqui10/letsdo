import { useState, type FormEvent } from 'react'
import type { Activity, Category, Priority, Profile } from '../types'
import { CATEGORY_COLORS, PRIORITY_LABELS } from '../types'
import type { ActivityInput } from '../lib/activities'
import {
  buildRecurrenceRule,
  RECURRENCE_LABELS,
  recurrenceOptionFromRule,
  type RecurrenceOption,
} from '../lib/recurrence'

interface Props {
  initial?: Activity | null
  members: Profile[]
  categories: Category[]
  onCreateCategory: (name: string, color: string) => Promise<Category>
  onCancel: () => void
  onSubmit: (input: ActivityInput) => Promise<void>
}

// Converte ISO -> valor aceito por <input type="datetime-local"> (hora local).
function toLocalInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`
}

export function ActivityForm({
  initial,
  members,
  categories,
  onCreateCategory,
  onCancel,
  onSubmit,
}: Props) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [priority, setPriority] = useState<Priority>(initial?.priority ?? 'media')
  const [categoryId, setCategoryId] = useState(initial?.category_id ?? '')
  const [assignee, setAssignee] = useState(initial?.assignee_id ?? '')
  const [dueAt, setDueAt] = useState(toLocalInput(initial?.due_at ?? null))
  const [recurrence, setRecurrence] = useState<RecurrenceOption>(
    recurrenceOptionFromRule(initial?.recurrence_rule ?? null),
  )
  const [saving, setSaving] = useState(false)

  // Criação inline de categoria.
  const [creatingCat, setCreatingCat] = useState(false)
  const [newCatName, setNewCatName] = useState('')
  const [newCatColor, setNewCatColor] = useState<string>(CATEGORY_COLORS[0])
  const [catError, setCatError] = useState<string | null>(null)

  const handleCreateCategory = async () => {
    if (!newCatName.trim()) return
    setCatError(null)
    try {
      const cat = await onCreateCategory(newCatName.trim(), newCatColor)
      setCategoryId(cat.id)
      setCreatingCat(false)
      setNewCatName('')
    } catch (e) {
      setCatError(e instanceof Error ? e.message : 'Não foi possível criar.')
    }
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    setSaving(true)
    const due = dueAt ? new Date(dueAt) : null
    try {
      await onSubmit({
        title: title.trim(),
        description: description.trim() || null,
        priority,
        category_id: categoryId || null,
        assignee_id: assignee || null,
        due_at: due ? due.toISOString() : null,
        recurrence_rule: buildRecurrenceRule(recurrence, due ?? undefined),
      })
    } finally {
      setSaving(false)
    }
  }

  const field = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-base'

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/40 sm:items-center">
      <form
        onSubmit={handleSubmit}
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-4 shadow-xl sm:rounded-2xl"
      >
        <h2 className="mb-3 text-lg font-semibold text-gray-900">
          {initial ? 'Editar tarefa' : 'Nova tarefa'}
        </h2>

        <div className="space-y-3">
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="O que precisa ser feito?"
            className={field}
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Detalhes (opcional)"
            rows={2}
            className={`${field} text-sm`}
          />

          <div className="grid grid-cols-2 gap-3 text-sm">
            <label>
              <span className="mb-1 block text-gray-600">Prioridade</span>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as Priority)}
                className={field}
              >
                {(Object.keys(PRIORITY_LABELS) as Priority[]).map((v) => (
                  <option key={v} value={v}>
                    {PRIORITY_LABELS[v]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="mb-1 block text-gray-600">Categoria</span>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className={field}
              >
                <option value="">Sem categoria</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="mb-1 block text-gray-600">Responsável</span>
              <select
                value={assignee}
                onChange={(e) => setAssignee(e.target.value)}
                className={field}
              >
                <option value="">De ambos</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.display_name || 'Sem nome'}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="mb-1 block text-gray-600">Repetir</span>
              <select
                value={recurrence}
                onChange={(e) =>
                  setRecurrence(e.target.value as RecurrenceOption)
                }
                className={field}
              >
                {(Object.keys(RECURRENCE_LABELS) as RecurrenceOption[]).map(
                  (v) => (
                    <option key={v} value={v}>
                      {RECURRENCE_LABELS[v]}
                    </option>
                  ),
                )}
              </select>
            </label>
          </div>

          <label className="block text-sm">
            <span className="mb-1 block text-gray-600">Data e hora</span>
            <input
              type="datetime-local"
              value={dueAt}
              onChange={(e) => setDueAt(e.target.value)}
              className={field}
            />
          </label>

          <div className="text-sm">
            {!creatingCat ? (
              <button
                type="button"
                onClick={() => setCreatingCat(true)}
                className="font-medium text-indigo-600"
              >
                ＋ Nova categoria
              </button>
            ) : (
              <div className="space-y-2 rounded-lg border border-gray-200 p-3">
                <input
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  placeholder="Nome da categoria"
                  className={field}
                />
                <div className="flex flex-wrap gap-2">
                  {CATEGORY_COLORS.map((c) => (
                    <button
                      type="button"
                      key={c}
                      onClick={() => setNewCatColor(c)}
                      aria-label={`Cor ${c}`}
                      className={`h-7 w-7 rounded-full ${
                        newCatColor === c
                          ? 'ring-2 ring-gray-400 ring-offset-2'
                          : ''
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
                {catError && <p className="text-xs text-red-600">{catError}</p>}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleCreateCategory}
                    className="flex-1 rounded-lg bg-indigo-600 py-1.5 font-medium text-white"
                  >
                    Adicionar
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCreatingCat(false)
                      setCatError(null)
                    }}
                    className="flex-1 rounded-lg border border-gray-300 py-1.5 font-medium text-gray-700"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-lg border border-gray-300 py-2 font-medium text-gray-700"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex-1 rounded-lg bg-indigo-600 py-2 font-medium text-white disabled:opacity-60"
          >
            {saving ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </form>
    </div>
  )
}
