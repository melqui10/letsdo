import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Activity, Category, Household, Priority, Profile } from '../types'
import { PRIORITY_LABELS } from '../types'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'
import { getHouseholdMembers } from '../lib/household'
import { createCategory, listCategories } from '../lib/categories'
import { errMsg } from '../lib/errors'
import { todaySP } from '../lib/score'
import {
  createActivity,
  deleteActivity,
  listActivities,
  toggleDone,
  updateActivity,
  type ActivityInput,
} from '../lib/activities'
import { ActivityCard } from '../components/ActivityCard'
import { ActivityForm } from '../components/ActivityForm'

type Filter = 'todas' | 'minhas' | 'pendentes'

const FILTER_LABELS: Record<Filter, string> = {
  todas: 'Todas',
  minhas: 'Minhas',
  pendentes: 'Pendentes',
}

const PRIORITY_ORDER: Record<Priority, number> = {
  urgente: 0,
  alta: 1,
  media: 2,
  baixa: 3,
}

export function ListaTarefas({ household }: { household: Household }) {
  const { user } = useAuth()
  const [activities, setActivities] = useState<Activity[]>([])
  const [members, setMembers] = useState<Profile[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [filter, setFilter] = useState<Filter>('todas')
  const [catFilter, setCatFilter] = useState<string>('todas')
  const [prioFilter, setPrioFilter] = useState<Priority | 'todas'>('todas')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Activity | null>(null)
  const [loading, setLoading] = useState(true)
  const [showShare, setShowShare] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Executa uma mutação, tratando falhas com uma mensagem visível ao usuário.
  const run = (p: Promise<unknown>) =>
    p
      .then(() => setError(null))
      .catch((e) => setError(errMsg(e, 'Não foi possível salvar.')))

  const load = useCallback(async () => {
    const [acts, mem, cats] = await Promise.all([
      listActivities(household.id),
      getHouseholdMembers(household.id),
      listCategories(household.id),
    ])
    setActivities(acts)
    setMembers(mem)
    setCategories(cats)
    setLoading(false)
  }, [household.id])

  const handleCreateCategory = async (
    name: string,
    color: string,
    icon: string | null,
  ) => {
    const cat = await createCategory(household.id, name, color, icon)
    setCategories(await listCategories(household.id))
    return cat
  }

  useEffect(() => {
    load()
    // Sincronização em tempo real: recarrega ao mudar qualquer atividade do lar.
    const channel = supabase
      .channel(`activities-${household.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'activities',
          filter: `household_id=eq.${household.id}`,
        },
        () => load(),
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [household.id, load])

  const visible = useMemo(() => {
    const hoje = todaySP()
    // A Lista é de tarefas; compromissos vivem na Agenda.
    let list = activities.filter((a) => a.kind !== 'compromisso')
    // Oculta tarefas concluídas em dias anteriores; mantém as concluídas hoje.
    list = list.filter(
      (a) =>
        !a.is_done ||
        (a.completed_at != null && todaySP(new Date(a.completed_at)) === hoje),
    )
    if (filter === 'minhas')
      list = list.filter((a) => a.assignee_id === user?.id)
    if (filter === 'pendentes') list = list.filter((a) => !a.is_done)
    if (catFilter !== 'todas')
      list = list.filter((a) => a.category_id === catFilter)
    if (prioFilter !== 'todas')
      list = list.filter((a) => a.priority === prioFilter)
    return list.sort((a, b) => {
      if (a.is_done !== b.is_done) return a.is_done ? 1 : -1
      const p = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]
      if (p !== 0) return p
      if (a.due_at && b.due_at) return a.due_at.localeCompare(b.due_at)
      if (a.due_at) return -1
      if (b.due_at) return 1
      return 0
    })
  }, [activities, filter, catFilter, prioFilter, user?.id])

  const handleSubmit = async (input: ActivityInput) => {
    try {
      if (editing) {
        await updateActivity(editing.id, input)
      } else if (user) {
        await createActivity(household.id, user.id, input)
      }
      setError(null)
    } catch (e) {
      setError(errMsg(e, 'Não foi possível salvar.'))
    }
    setShowForm(false)
    setEditing(null)
    load()
  }

  const pendentes = activities.filter(
    (a) => a.kind !== 'compromisso' && !a.is_done,
  ).length

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col">
      <header className="sticky top-0 z-10 flex items-center justify-between bg-white px-4 py-3 shadow-sm">
        <div>
          <h1 className="text-lg font-bold text-gray-900">{household.name}</h1>
          <p className="text-xs text-gray-500">
            {pendentes} {pendentes === 1 ? 'tarefa pendente' : 'tarefas pendentes'}
          </p>
        </div>
        <button
          onClick={() => setShowShare(true)}
          className="rounded-lg bg-indigo-50 px-3 py-1.5 text-sm font-medium text-indigo-600"
        >
          Compartilhar
        </button>
      </header>

      <div className="flex gap-2 px-4 py-2">
        {(Object.keys(FILTER_LABELS) as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full px-3 py-1 text-sm ${
              filter === f
                ? 'bg-indigo-600 text-white'
                : 'bg-white text-gray-600'
            }`}
          >
            {FILTER_LABELS[f]}
          </button>
        ))}
      </div>

      <div className="flex gap-2 px-4 pb-2">
        <select
          value={catFilter}
          onChange={(e) => setCatFilter(e.target.value)}
          className="flex-1 rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-700"
        >
          <option value="todas">Todas as categorias</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.icon ? `${c.icon} ${c.name}` : c.name}
            </option>
          ))}
        </select>
        <select
          value={prioFilter}
          onChange={(e) => setPrioFilter(e.target.value as Priority | 'todas')}
          className="flex-1 rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-700"
        >
          <option value="todas">Todas as prioridades</option>
          {(Object.keys(PRIORITY_LABELS) as Priority[]).map((p) => (
            <option key={p} value={p}>
              {PRIORITY_LABELS[p]}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <div className="mx-4 mb-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <main className="flex-1 px-4 pb-28">
        {loading ? (
          <p className="mt-10 text-center text-gray-400">Carregando…</p>
        ) : visible.length === 0 ? (
          <p className="mt-10 text-center text-gray-400">
            Nenhuma tarefa por aqui. Toque em + para criar.
          </p>
        ) : (
          <ul className="space-y-2">
            {visible.map((a) => (
              <ActivityCard
                key={a.id}
                activity={a}
                members={members}
                categories={categories}
                onToggle={(x) =>
                  run(toggleDone(x.id, !x.is_done)).then(load)
                }
                onEdit={(x) => {
                  setEditing(x)
                  setShowForm(true)
                }}
                onDelete={(x) => run(deleteActivity(x.id)).then(load)}
              />
            ))}
          </ul>
        )}
      </main>

      <button
        onClick={() => {
          setEditing(null)
          setShowForm(true)
        }}
        aria-label="Nova tarefa"
        className="fixed bottom-20 right-4 z-20 flex h-14 w-14 items-center justify-center rounded-full bg-indigo-600 text-3xl text-white shadow-lg"
      >
        +
      </button>

      {showForm && (
        <ActivityForm
          initial={editing}
          members={members}
          categories={categories}
          onCreateCategory={handleCreateCategory}
          onCancel={() => {
            setShowForm(false)
            setEditing(null)
          }}
          onSubmit={handleSubmit}
        />
      )}

      {showShare && (
        <ShareModal
          household={household}
          onClose={() => setShowShare(false)}
        />
      )}
    </div>
  )
}

function ShareModal({
  household,
  onClose,
}: {
  household: Household
  onClose: () => void
}) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(household.id)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 p-6">
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
        <h2 className="mb-2 text-lg font-semibold text-gray-900">
          Compartilhar o lar
        </h2>
        <p className="mb-3 text-sm text-gray-500">
          Envie este código para outra pessoa. Ao entrar com ele, vocês usarão a
          mesma lista.
        </p>
        <div className="mb-3 break-all rounded-lg bg-gray-100 p-3 text-center font-mono text-sm text-gray-700">
          {household.id}
        </div>
        <div className="flex gap-2">
          <button
            onClick={copy}
            className="flex-1 rounded-lg bg-indigo-600 py-2 font-medium text-white"
          >
            {copied ? 'Copiado!' : 'Copiar código'}
          </button>
          <button
            onClick={onClose}
            className="flex-1 rounded-lg border border-gray-300 py-2 font-medium text-gray-700"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  )
}
