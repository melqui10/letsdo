import { useCallback, useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import type { Household, Profile, ScoreEvent } from '../types'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'
import { getHouseholdMembers } from '../lib/household'
import { errMsg } from '../lib/errors'
import {
  BADGES,
  earnedBadges,
  fetchScoreEvents,
  levelFor,
  mondaySP,
  statsForProfile,
  type ProfileStats,
} from '../lib/score'

// "Semana de 08–14 jul" (ou "28 jun–04 jul" quando cruza o mês).
function weekRangeLabel(mondayStr: string): string {
  const monday = new Date(`${mondayStr}T00:00:00`)
  const sunday = new Date(monday)
  sunday.setDate(sunday.getDate() + 6)
  const sameMonth = monday.getMonth() === sunday.getMonth()
  const start = sameMonth
    ? format(monday, 'dd')
    : format(monday, 'dd MMM', { locale: ptBR })
  const end = format(sunday, 'dd MMM', { locale: ptBR })
  return `Semana de ${start}–${end}`
}

function Avatar({ profile }: { profile: Profile }) {
  if (profile.avatar_url) {
    return (
      <img
        src={profile.avatar_url}
        alt={profile.display_name}
        className="h-10 w-10 shrink-0 rounded-full object-cover"
      />
    )
  }
  const initial = (profile.display_name.trim().charAt(0) || '?').toUpperCase()
  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-100 font-semibold text-indigo-600">
      {initial}
    </div>
  )
}

export function Placar({ household }: { household: Household }) {
  const { user } = useAuth()
  const [members, setMembers] = useState<Profile[]>([])
  const [events, setEvents] = useState<ScoreEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [badgeProfileId, setBadgeProfileId] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const [mem, evs] = await Promise.all([
        getHouseholdMembers(household.id),
        fetchScoreEvents(household.id),
      ])
      setMembers(mem)
      setEvents(evs)
      setError(null)
    } catch (e) {
      setError(errMsg(e, 'Não foi possível carregar o placar.'))
    } finally {
      setLoading(false)
    }
  }, [household.id])

  useEffect(() => {
    load()
    // Sincronização em tempo real: refaz o fetch a cada novo evento de pontuação.
    const channel = supabase
      .channel(`score-events-${household.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'score_events',
          filter: `household_id=eq.${household.id}`,
        },
        () => load(),
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [household.id, load])

  // Escolhe a própria aba de conquistas por padrão, assim que os membros chegam.
  useEffect(() => {
    if (badgeProfileId || members.length === 0) return
    const mine = user && members.some((m) => m.id === user.id) ? user.id : null
    setBadgeProfileId(mine ?? members[0].id)
  }, [members, user, badgeProfileId])

  // Recalculado a cada render (barato) para não congelar na virada da semana
  // se o app ficar aberto — useMemo com deps vazias manteria a segunda antiga.
  const monday = mondaySP()
  const weekLabel = weekRangeLabel(monday)

  const statsByProfile = useMemo(() => {
    const map = new Map<string, ProfileStats>()
    for (const m of members) map.set(m.id, statsForProfile(events, m.id))
    return map
  }, [members, events])

  // Líder da semana: quem tem mais pontos, só quando não há empate no topo.
  const leaderId = useMemo(() => {
    let best: { id: string; points: number } | null = null
    let tie = false
    for (const m of members) {
      const pts = statsByProfile.get(m.id)?.weekPoints ?? 0
      if (pts <= 0) continue
      if (!best || pts > best.points) {
        best = { id: m.id, points: pts }
        tie = false
      } else if (pts === best.points) {
        tie = true
      }
    }
    return best && !tie ? best.id : null
  }, [members, statsByProfile])

  const activeBadgeId = badgeProfileId ?? members[0]?.id ?? null
  const earnedIds = useMemo(() => {
    const stats = activeBadgeId ? statsByProfile.get(activeBadgeId) : undefined
    return new Set(stats ? earnedBadges(stats).map((b) => b.id) : [])
  }, [activeBadgeId, statsByProfile])

  const hasAnyCompletion = events.some((e) => e.event_type === 'conclusao')

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col">
      <header className="sticky top-0 z-10 bg-white px-4 py-3 shadow-sm">
        <h1 className="text-lg font-bold text-gray-900">🏆 Placar</h1>
        <p className="text-xs text-gray-500">{weekLabel}</p>
      </header>

      {error && (
        <div className="mx-4 mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <main className="flex-1 space-y-6 px-4 pb-28 pt-4">
        {loading ? (
          <p className="mt-10 text-center text-gray-400">Carregando…</p>
        ) : !hasAnyCompletion ? (
          <p className="mt-10 text-center text-gray-400">
            Conclua tarefas para pontuar!
          </p>
        ) : (
          <>
            {/* Comparativo dos membros */}
            <section className="space-y-3">
              {members.map((m) => {
                const stats = statsByProfile.get(m.id)
                if (!stats) return null
                const lvl = levelFor(stats.totalPoints)
                const isLeader = leaderId === m.id
                return (
                  <div
                    key={m.id}
                    className={`rounded-xl bg-white p-4 shadow-sm ${
                      isLeader ? 'ring-2 ring-indigo-400' : ''
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Avatar profile={m} />
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-1 font-medium text-gray-900">
                          <span className="truncate">
                            {m.display_name || 'Sem nome'}
                          </span>
                          {isLeader && <span title="Líder da semana">👑</span>}
                        </p>
                        <p className="text-xs text-gray-500">
                          {lvl.title} · nível {lvl.level}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-xl font-bold text-indigo-600">
                          {stats.weekPoints}
                        </p>
                        <p className="text-[11px] text-gray-400">
                          pts na semana
                        </p>
                      </div>
                    </div>

                    <div className="mt-3">
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                        <div
                          className="h-full rounded-full bg-indigo-500"
                          style={{ width: `${Math.round(lvl.progress * 100)}%` }}
                        />
                      </div>
                      <div className="mt-1 flex items-center justify-between text-[11px] text-gray-400">
                        <span>{stats.totalPoints} pts no total</span>
                        {lvl.nextMin !== null ? (
                          <span>
                            faltam {lvl.nextMin - stats.totalPoints} p/ o próximo
                            nível
                          </span>
                        ) : (
                          <span>nível máximo</span>
                        )}
                      </div>
                    </div>

                    {stats.streak > 0 && (
                      <p className="mt-2 text-xs text-gray-600">
                        🔥 {stats.streak}{' '}
                        {stats.streak === 1 ? 'dia seguido' : 'dias seguidos'}
                      </p>
                    )}
                  </div>
                )
              })}
            </section>

            {/* Conquistas */}
            <section>
              <h2 className="mb-2 text-sm font-semibold text-gray-500">
                Conquistas
              </h2>

              {members.length > 1 && (
                <div className="mb-3 flex gap-2">
                  {members.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => setBadgeProfileId(m.id)}
                      className={`rounded-full px-3 py-1 text-sm ${
                        activeBadgeId === m.id
                          ? 'bg-indigo-600 text-white'
                          : 'bg-white text-gray-600'
                      }`}
                    >
                      {m.display_name || 'Sem nome'}
                    </button>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-3 gap-2">
                {BADGES.map((b) => {
                  const got = earnedIds.has(b.id)
                  return (
                    <div
                      key={b.id}
                      title={`${b.name} — ${b.desc}`}
                      aria-label={`${b.name}: ${b.desc}${
                        got ? ' (conquistada)' : ' (não conquistada)'
                      }`}
                      className={`flex flex-col items-center rounded-xl bg-white p-3 text-center shadow-sm ${
                        got ? '' : 'opacity-40 grayscale'
                      }`}
                    >
                      <span className="text-2xl">{b.emoji}</span>
                      <span className="mt-1 text-[11px] font-medium leading-tight text-gray-900">
                        {b.name}
                      </span>
                      <span className="mt-0.5 text-[10px] leading-tight text-gray-400">
                        {b.desc}
                      </span>
                    </div>
                  )
                })}
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  )
}
