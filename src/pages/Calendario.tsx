import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  addMonths,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  subMonths,
} from 'date-fns'
import { ptBR } from 'date-fns/locale'
import type { Activity, Category, Household, Profile } from '../types'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'
import { getHouseholdMembers } from '../lib/household'
import { createCategory, listCategories } from '../lib/categories'
import { errMsg } from '../lib/errors'
import {
  createActivity,
  deleteActivity,
  listActivities,
  toggleDone,
  updateActivity,
  type ActivityInput,
} from '../lib/activities'
import {
  dayKey,
  expandOccurrences,
  groupByDay,
  monthGridDays,
  type Occurrence,
} from '../lib/calendar'
import { ActivityCard } from '../components/ActivityCard'
import { ActivityForm } from '../components/ActivityForm'

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const DOT_FALLBACK = '#6366f1' // indigo p/ ocorrências sem categoria

// "julho de 2026" -> "Julho de 2026"
function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function Calendario({ household }: { household: Household }) {
  const { user } = useAuth()
  const [cursor, setCursor] = useState(() => new Date())
  const [selected, setSelected] = useState(() => new Date())
  const [activities, setActivities] = useState<Activity[]>([])
  const [members, setMembers] = useState<Profile[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Activity | null>(null)

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

  useEffect(() => {
    load()
    const channel = supabase
      .channel(`calendar-activities-${household.id}`)
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

  const days = useMemo(() => monthGridDays(cursor), [cursor])

  // Ocorrências (incl. recorrentes) agrupadas por dia da grade visível.
  const byDay = useMemo<Map<string, Occurrence[]>>(() => {
    if (days.length === 0) return new Map()
    const start = days[0]
    const end = new Date(days[days.length - 1])
    end.setHours(23, 59, 59, 999)
    // Agenda mostra compromissos + tarefas marcadas como "mostrar na agenda".
    const agenda = activities.filter(
      (a) => a.kind === 'compromisso' || a.show_in_agenda,
    )
    return groupByDay(expandOccurrences(agenda, start, end))
  }, [activities, days])

  const catColor = useCallback(
    (id: string | null) =>
      categories.find((c) => c.id === id)?.color ?? DOT_FALLBACK,
    [categories],
  )

  const selectedItems = byDay.get(dayKey(selected)) ?? []

  const handleCreateCategory = async (
    name: string,
    color: string,
    icon: string | null,
  ) => {
    const cat = await createCategory(household.id, name, color, icon)
    setCategories(await listCategories(household.id))
    return cat
  }

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

  // Novo evento no dia selecionado, às 09:00 por padrão.
  const newOnSelected = () => {
    setEditing(null)
    setShowForm(true)
  }
  const defaultDueAt = useMemo(() => {
    const d = new Date(selected)
    d.setHours(9, 0, 0, 0)
    return d.toISOString()
  }, [selected])

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col">
      <header className="sticky top-0 z-10 flex items-center justify-between bg-white px-4 py-3 shadow-sm">
        <button
          onClick={() => setCursor((c) => subMonths(c, 1))}
          aria-label="Mês anterior"
          className="h-9 w-9 rounded-lg text-xl text-gray-500 hover:bg-gray-100"
        >
          ‹
        </button>
        <div className="text-center">
          <h1 className="text-base font-bold text-gray-900">
            {capitalize(format(cursor, "MMMM 'de' yyyy", { locale: ptBR }))}
          </h1>
          <button
            onClick={() => {
              const now = new Date()
              setCursor(now)
              setSelected(now)
            }}
            className="text-xs font-medium text-indigo-600"
          >
            Hoje
          </button>
        </div>
        <button
          onClick={() => setCursor((c) => addMonths(c, 1))}
          aria-label="Próximo mês"
          className="h-9 w-9 rounded-lg text-xl text-gray-500 hover:bg-gray-100"
        >
          ›
        </button>
      </header>

      {error && (
        <div className="mx-4 mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Grade do mês */}
      <div className="px-2 pt-2">
        <div className="grid grid-cols-7 text-center text-xs font-medium text-gray-400">
          {WEEKDAYS.map((w) => (
            <div key={w} className="py-1">
              {w}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-0.5">
          {days.map((day) => {
            const items = byDay.get(dayKey(day)) ?? []
            const outside = !isSameMonth(day, cursor)
            const isSel = isSameDay(day, selected)
            const today = isToday(day)
            return (
              <button
                key={day.toISOString()}
                onClick={() => setSelected(day)}
                className={`flex min-h-14 flex-col items-center rounded-lg py-1 ${
                  isSel ? 'bg-indigo-50 ring-1 ring-indigo-300' : ''
                }`}
              >
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-sm ${
                    today
                      ? 'bg-indigo-600 font-semibold text-white'
                      : outside
                        ? 'text-gray-300'
                        : 'text-gray-700'
                  }`}
                >
                  {day.getDate()}
                </span>
                <div className="mt-0.5 flex h-3 flex-wrap items-center justify-center gap-0.5">
                  {items.slice(0, 3).map((occ, i) => (
                    <span
                      key={i}
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ backgroundColor: catColor(occ.activity.category_id) }}
                    />
                  ))}
                  {items.length > 3 && (
                    <span className="text-[9px] leading-none text-gray-400">
                      +{items.length - 3}
                    </span>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Painel do dia selecionado */}
      <div className="mt-2 flex items-center justify-between px-4">
        <h2 className="text-sm font-semibold text-gray-700">
          {capitalize(
            format(selected, "EEEE, dd 'de' MMMM", { locale: ptBR }),
          )}
        </h2>
        <span className="text-xs text-gray-400">
          {selectedItems.length}{' '}
          {selectedItems.length === 1 ? 'evento' : 'eventos'}
        </span>
      </div>

      <main className="flex-1 px-4 pb-28 pt-2">
        {loading ? (
          <p className="mt-6 text-center text-gray-400">Carregando…</p>
        ) : selectedItems.length === 0 ? (
          <p className="mt-6 text-center text-sm text-gray-400">
            Nenhum evento neste dia. Toque em + para criar.
          </p>
        ) : (
          <ul className="space-y-2">
            {selectedItems.map((occ) => (
              <ActivityCard
                key={`${occ.activity.id}-${occ.date.toISOString()}`}
                activity={occ.activity}
                members={members}
                categories={categories}
                onToggle={(x) => run(toggleDone(x.id, !x.is_done)).then(load)}
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
        onClick={newOnSelected}
        aria-label="Novo evento"
        className="fixed bottom-20 right-4 z-20 flex h-14 w-14 items-center justify-center rounded-full bg-indigo-600 text-3xl text-white shadow-lg"
      >
        +
      </button>

      {showForm && (
        <ActivityForm
          initial={editing}
          members={members}
          categories={categories}
          defaultDueAt={editing ? undefined : defaultDueAt}
          defaultKind={editing ? undefined : 'compromisso'}
          onCreateCategory={handleCreateCategory}
          onCancel={() => {
            setShowForm(false)
            setEditing(null)
          }}
          onSubmit={handleSubmit}
        />
      )}
    </div>
  )
}
