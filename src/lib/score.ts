// Placar (gamificação): leitura e agregação de `score_events`.
//
// Toda a pontuação é calculada no banco (trigger `award_score`, ver
// supabase/migrations/0009_gamification.sql). Aqui só lemos o livro-razão e
// agregamos para exibir — nada aqui grava pontos.

import { supabase } from './supabase'
import type { Priority, ScoreEvent } from '../types'

// Pontuação base por prioridade — só para exibição/estimativa. O valor real
// de cada evento já vem congelado em `score_events.points`.
export const BASE_POINTS: Record<Priority, number> = {
  baixa: 5,
  media: 10,
  alta: 20,
  urgente: 30,
}

// Estimativa dos pontos que uma conclusão renderia AGORA — espelha o trigger
// `award_score` (migration 0011). O valor real é gravado pelo banco; isto é
// só feedback imediato de UI (toast "+X pts" ao concluir).
export function estimatePoints(a: {
  kind: string
  priority: Priority
  due_at: string | null
}): number {
  if (a.kind !== 'tarefa') return 0
  const base = BASE_POINTS[a.priority]
  const factor =
    a.due_at === null
      ? 1.0
      : Date.now() <= new Date(a.due_at).getTime()
        ? 1.5
        : 0.5
  return Math.round(base * factor)
}

export interface Level {
  level: number
  min: number
  title: string
}

// Ordem crescente: o nível vigente é o de maior `min` <= pontos totais.
export const LEVELS: Level[] = [
  { level: 1, min: 0, title: 'Aprendiz' },
  { level: 2, min: 100, title: 'Caseiro' },
  { level: 3, min: 250, title: 'Organizado' },
  { level: 4, min: 500, title: 'Produtivo' },
  { level: 5, min: 900, title: 'Mestre do Lar' },
  { level: 6, min: 1400, title: 'Imparável' },
  { level: 7, min: 2000, title: 'Lenda Doméstica' },
]

export interface Badge {
  id: string
  emoji: string
  name: string
  desc: string
}

export const BADGES: Badge[] = [
  // Marcos de volume
  { id: 'primeira', emoji: '🌱', name: 'Primeiros passos', desc: 'Concluiu a 1ª tarefa' },
  { id: 'cent100', emoji: '🏅', name: 'Centurião', desc: '100 tarefas concluídas' },
  { id: 'cent250', emoji: '🚀', name: 'Máquina', desc: '250 tarefas concluídas' },
  { id: 'pts500', emoji: '💎', name: 'Meio milhar', desc: '500 pontos no total' },
  { id: 'pts2000', emoji: '👑', name: 'Realeza', desc: '2000 pontos no total' },
  { id: 'pts5000', emoji: '💰', name: 'Milionário do lar', desc: '5000 pontos no total' },
  // Intensidade num dia
  { id: 'dia5', emoji: '🌪️', name: 'Furacão', desc: '5 tarefas num só dia' },
  { id: 'dia10', emoji: '🌋', name: 'Dia lendário', desc: '10 tarefas num só dia' },
  // Pontualidade
  { id: 'prazo10', emoji: '⏰', name: 'Pontual', desc: '10 tarefas no prazo' },
  { id: 'prazo30', emoji: '🎯', name: 'Relojoeiro', desc: '30 tarefas no prazo' },
  { id: 'prazo50', emoji: '✨', name: 'Impecável', desc: '50 tarefas no prazo' },
  { id: 'mesPontual', emoji: '🎖️', name: 'Mês pontual', desc: 'Um mês inteiro sem atraso (10+ tarefas)' },
  { id: 'urgente10', emoji: '🚨', name: 'Bombeiro', desc: '10 urgentes concluídas' },
  { id: 'urgente30', emoji: '🧊', name: 'Sangue frio', desc: '30 urgentes concluídas' },
  // Horário
  { id: 'cedo10', emoji: '🌅', name: 'Madrugador', desc: '10 tarefas antes das 8h' },
  { id: 'tarde10', emoji: '🦉', name: 'Coruja', desc: '10 tarefas depois das 22h' },
  { id: 'manha5', emoji: '☕', name: 'Café com produtividade', desc: '5 tarefas antes do meio-dia num só dia' },
  // Dia da semana
  { id: 'fds20', emoji: '🧹', name: 'Sábado em ação', desc: '20 tarefas em fins de semana' },
  { id: 'seg15', emoji: '😤', name: 'Segunda sem drama', desc: '15 tarefas em segundas-feiras' },
  // Streak e consistência
  { id: 'streak7', emoji: '🔥', name: 'Chama de 7', desc: '7 dias seguidos' },
  { id: 'streak30', emoji: '⚡', name: 'Chama de 30', desc: '30 dias seguidos' },
  { id: 'streak100', emoji: '💯', name: 'Chama de 100', desc: '100 dias seguidos' },
  { id: 'semanaPerfeita', emoji: '📅', name: 'Semana perfeita', desc: 'Tarefas todos os dias, de segunda a domingo' },
  { id: 'fenix', emoji: '🔄', name: 'Fênix', desc: 'Refez um streak de 7+ depois de perdê-lo' },
  // Casal
  { id: 'heroi10', emoji: '🦸', name: 'Herói do outro', desc: '10 tarefas que eram do parceiro' },
  { id: 'campeao5', emoji: '🏆', name: 'Campeão da semana', desc: 'Venceu o placar semanal 5 vezes' },
  { id: 'dupla30', emoji: '🤝', name: 'Dupla dinâmica', desc: 'Os dois concluíram no mesmo dia, 30 vezes' },
  { id: 'equilibrio', emoji: '⚖️', name: 'Equilíbrio perfeito', desc: 'Semana com diferença menor que 10%' },
  { id: 'virada', emoji: '😈', name: 'Virada épica', desc: 'Perdia na sexta e venceu a semana' },
]

// Todos os eventos de pontuação do lar (a RLS já restringe aos membros).
export async function fetchScoreEvents(householdId: string): Promise<ScoreEvent[]> {
  const { data, error } = await supabase
    .from('score_events')
    .select('*')
    .eq('household_id', householdId)
  if (error) throw error
  return (data ?? []) as ScoreEvent[]
}

const SP_TZ = 'America/Sao_Paulo'
const spDayFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: SP_TZ })
const spWeekdayFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: SP_TZ,
  weekday: 'short',
})
const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
}

// "Hoje" no fuso America/Sao_Paulo, como YYYY-MM-DD.
export function todaySP(date: Date = new Date()): string {
  return spDayFormatter.format(date)
}

// Soma/subtrai dias de uma data YYYY-MM-DD (aritmética de calendário pura,
// sem reconversão de fuso — evita o "off-by-one" de usar Intl duas vezes).
function addDaysSP(dayStr: string, delta: number): string {
  const [y, m, d] = dayStr.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + delta)).toISOString().slice(0, 10)
}

// Segunda-feira da semana corrente (fuso America/Sao_Paulo), como YYYY-MM-DD.
export function mondaySP(date: Date = new Date()): string {
  const today = todaySP(date)
  const weekday = spWeekdayFormatter.format(date)
  const diff = (WEEKDAY_INDEX[weekday] + 6) % 7 // dias desde a segunda (seg=0)
  return addDaysSP(today, -diff)
}

// Dia da semana (0=dom … 6=sáb) de uma data YYYY-MM-DD — aritmética de
// calendário pura, sem fuso (a data já está no calendário SP).
function weekdayOf(dayStr: string): number {
  const [y, m, d] = dayStr.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

// Segunda-feira da semana que contém o dia dado (chave de agrupamento semanal).
function mondayOf(dayStr: string): string {
  return addDaysSP(dayStr, -((weekdayOf(dayStr) + 6) % 7))
}

const spHourFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: SP_TZ,
  hour: 'numeric',
  hour12: false,
})

// Hora (0–23) de um timestamp ISO no fuso America/Sao_Paulo.
// O `% 24` cobre o "24" que o en-US devolve à meia-noite com hour12:false.
function hourSP(iso: string): number {
  return Number(spHourFormatter.format(new Date(iso))) % 24
}

// Comprimentos das sequências de dias consecutivos (para Fênix: duas
// sequências de 7+ significam que um streak foi perdido e refeito).
function consecutiveRuns(days: Set<string>): number[] {
  const sorted = [...days].sort()
  const runs: number[] = []
  let len = 0
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i] === addDaysSP(sorted[i - 1], 1)) {
      len++
    } else {
      if (len > 0) runs.push(len)
      len = 1
    }
  }
  if (len > 0) runs.push(len)
  return runs
}

export interface ProfileStats {
  totalPoints: number
  weekPoints: number
  completions: number
  onTimeCount: number
  urgentCount: number
  maxInDay: number
  streak: number
  earlyCount: number // conclusões antes das 8h (fuso SP)
  lateCount: number // conclusões a partir das 22h
  maxMorningInDay: number // máx. de conclusões antes do meio-dia num mesmo dia
  weekendCount: number // conclusões em sábados/domingos
  mondayCount: number // conclusões em segundas-feiras
  perfectWeek: boolean // alguma semana com os 7 dias (seg–dom) ativos
  phoenixRuns: number // sequências de 7+ dias consecutivos (2+ = Fênix)
  punctualMonth: boolean // algum mês fechado com 10+ conclusões e zero atrasos
  heroCount: number // conclusões de tarefas cujo responsável era outra pessoa
}

// Maior sequência de dias consecutivos com ao menos 1 evento, terminando em
// hoje ou ontem (fuso SP). Se o dia mais recente com evento for anterior a
// ontem, a sequência está "quebrada" e o streak é 0.
function computeStreak(days: Set<string>): number {
  if (days.size === 0) return 0
  const mostRecent = [...days].sort().at(-1)!
  const today = todaySP()
  const yesterday = addDaysSP(today, -1)
  if (mostRecent !== today && mostRecent !== yesterday) return 0

  let streak = 1
  let cursor = mostRecent
  while (days.has(addDaysSP(cursor, -1))) {
    cursor = addDaysSP(cursor, -1)
    streak++
  }
  return streak
}

// Agrega os eventos de conclusão de um perfil em estatísticas para o placar.
export function statsForProfile(
  events: ScoreEvent[],
  profileId: string,
): ProfileStats {
  const monday = mondaySP()
  const own = events.filter(
    (e) => e.profile_id === profileId && e.event_type === 'conclusao',
  )

  const perDay = new Map<string, number>()
  const morningPerDay = new Map<string, number>()
  const perMonth = new Map<string, { count: number; late: boolean }>()
  let earlyCount = 0
  let lateCount = 0
  let weekendCount = 0
  let mondayCount = 0
  let heroCount = 0

  for (const e of own) {
    perDay.set(e.event_day, (perDay.get(e.event_day) ?? 0) + 1)

    const hour = hourSP(e.created_at)
    if (hour < 8) earlyCount++
    if (hour >= 22) lateCount++
    if (hour < 12) {
      morningPerDay.set(e.event_day, (morningPerDay.get(e.event_day) ?? 0) + 1)
    }

    const weekday = weekdayOf(e.event_day)
    if (weekday === 0 || weekday === 6) weekendCount++
    if (weekday === 1) mondayCount++

    const monthKey = e.event_day.slice(0, 7)
    const month = perMonth.get(monthKey) ?? { count: 0, late: false }
    month.count++
    if (e.on_time === false) month.late = true
    perMonth.set(monthKey, month)

    if (e.assignee_id && e.assignee_id !== profileId) heroCount++
  }

  const days = new Set(perDay.keys())

  // Semana perfeita: alguma segunda-feira cujos 7 dias (seg–dom) têm evento.
  let perfectWeek = false
  for (const weekMonday of new Set([...days].map(mondayOf))) {
    let full = true
    for (let i = 0; i < 7; i++) {
      if (!days.has(addDaysSP(weekMonday, i))) {
        full = false
        break
      }
    }
    if (full) {
      perfectWeek = true
      break
    }
  }

  // Mês pontual: só meses FECHADOS contam (o corrente ainda pode atrasar).
  const currentMonth = todaySP().slice(0, 7)
  const punctualMonth = [...perMonth.entries()].some(
    ([key, m]) => key < currentMonth && m.count >= 10 && !m.late,
  )

  return {
    totalPoints: own.reduce((sum, e) => sum + e.points, 0),
    weekPoints: own
      .filter((e) => e.event_day >= monday)
      .reduce((sum, e) => sum + e.points, 0),
    completions: own.length,
    onTimeCount: own.filter((e) => e.on_time === true).length,
    urgentCount: own.filter((e) => e.priority === 'urgente').length,
    maxInDay: perDay.size > 0 ? Math.max(...perDay.values()) : 0,
    streak: computeStreak(days),
    earlyCount,
    lateCount,
    maxMorningInDay:
      morningPerDay.size > 0 ? Math.max(...morningPerDay.values()) : 0,
    weekendCount,
    mondayCount,
    perfectWeek,
    phoenixRuns: consecutiveRuns(days).filter((len) => len >= 7).length,
    punctualMonth,
    heroCount,
  }
}

export interface LevelInfo {
  level: number
  title: string
  min: number
  nextMin: number | null
  progress: number // 0..1 até o próximo nível (1 no nível máximo)
}

export function levelFor(totalPoints: number): LevelInfo {
  let current = LEVELS[0]
  for (const lvl of LEVELS) {
    if (totalPoints >= lvl.min) current = lvl
  }
  const next = LEVELS[current.level] ?? null // níveis são 1-indexados e sequenciais
  const progress = next
    ? Math.min(1, (totalPoints - current.min) / (next.min - current.min))
    : 1
  return {
    level: current.level,
    title: current.title,
    min: current.min,
    nextMin: next ? next.min : null,
    progress,
  }
}

// Estatísticas competitivas de um perfil contra os demais membros do lar.
// Só semanas FECHADAS contam (a corrente ainda pode virar).
export interface CoupleStats {
  weeklyWins: number // semanas vencidas (mais pontos que todos os outros)
  duoDays: number // dias em que TODOS os membros concluíram algo
  balancedWeek: boolean // semana com todos pontuando e diferença < 10%
  comebackWin: boolean // semana vencida estando atrás no fim da sexta
}

export const EMPTY_COUPLE_STATS: CoupleStats = {
  weeklyWins: 0,
  duoDays: 0,
  balancedWeek: false,
  comebackWin: false,
}

export function coupleStatsForProfile(
  events: ScoreEvent[],
  profileId: string,
  memberIds: string[],
): CoupleStats {
  // Conquistas de casal só fazem sentido com 2+ membros.
  if (memberIds.length < 2) return EMPTY_COUPLE_STATS

  const all = events.filter(
    (e) => e.event_type === 'conclusao' && memberIds.includes(e.profile_id),
  )

  // Por semana (chave = segunda) e por perfil: pontos totais e até sexta.
  const weeks = new Map<string, Map<string, { total: number; thruFri: number }>>()
  const profilesPerDay = new Map<string, Set<string>>()
  for (const e of all) {
    const weekKey = mondayOf(e.event_day)
    let perProfile = weeks.get(weekKey)
    if (!perProfile) {
      perProfile = new Map()
      weeks.set(weekKey, perProfile)
    }
    let agg = perProfile.get(e.profile_id)
    if (!agg) {
      agg = { total: 0, thruFri: 0 }
      perProfile.set(e.profile_id, agg)
    }
    agg.total += e.points
    if (e.event_day <= addDaysSP(weekKey, 4)) agg.thruFri += e.points

    let dayProfiles = profilesPerDay.get(e.event_day)
    if (!dayProfiles) {
      dayProfiles = new Set()
      profilesPerDay.set(e.event_day, dayProfiles)
    }
    dayProfiles.add(e.profile_id)
  }

  let duoDays = 0
  for (const profiles of profilesPerDay.values()) {
    if (memberIds.every((id) => profiles.has(id))) duoDays++
  }

  const currentMonday = mondaySP()
  const otherIds = memberIds.filter((id) => id !== profileId)
  let weeklyWins = 0
  let balancedWeek = false
  let comebackWin = false

  for (const [weekKey, perProfile] of weeks) {
    if (weekKey >= currentMonday) continue // semana ainda aberta

    const mine = perProfile.get(profileId)?.total ?? 0
    const othersBest = Math.max(
      0,
      ...otherIds.map((id) => perProfile.get(id)?.total ?? 0),
    )
    const won = mine > 0 && mine > othersBest

    if (won) {
      weeklyWins++
      const mineFri = perProfile.get(profileId)?.thruFri ?? 0
      const othersFriBest = Math.max(
        0,
        ...otherIds.map((id) => perProfile.get(id)?.thruFri ?? 0),
      )
      if (mineFri < othersFriBest) comebackWin = true
    }

    const totals = memberIds.map((id) => perProfile.get(id)?.total ?? 0)
    if (totals.every((t) => t > 0)) {
      const max = Math.max(...totals)
      const min = Math.min(...totals)
      if (max - min < 0.1 * max) balancedWeek = true
    }
  }

  return { weeklyWins, duoDays, balancedWeek, comebackWin }
}

// Conquistas cujos critérios as estatísticas satisfazem.
export function earnedBadges(
  stats: ProfileStats,
  couple: CoupleStats = EMPTY_COUPLE_STATS,
): Badge[] {
  const earned: Record<string, boolean> = {
    primeira: stats.completions >= 1,
    cent100: stats.completions >= 100,
    cent250: stats.completions >= 250,
    pts500: stats.totalPoints >= 500,
    pts2000: stats.totalPoints >= 2000,
    pts5000: stats.totalPoints >= 5000,
    dia5: stats.maxInDay >= 5,
    dia10: stats.maxInDay >= 10,
    prazo10: stats.onTimeCount >= 10,
    prazo30: stats.onTimeCount >= 30,
    prazo50: stats.onTimeCount >= 50,
    mesPontual: stats.punctualMonth,
    urgente10: stats.urgentCount >= 10,
    urgente30: stats.urgentCount >= 30,
    cedo10: stats.earlyCount >= 10,
    tarde10: stats.lateCount >= 10,
    manha5: stats.maxMorningInDay >= 5,
    fds20: stats.weekendCount >= 20,
    seg15: stats.mondayCount >= 15,
    streak7: stats.streak >= 7,
    streak30: stats.streak >= 30,
    streak100: stats.streak >= 100,
    semanaPerfeita: stats.perfectWeek,
    fenix: stats.phoenixRuns >= 2,
    heroi10: stats.heroCount >= 10,
    campeao5: couple.weeklyWins >= 5,
    dupla30: couple.duoDays >= 30,
    equilibrio: couple.balancedWeek,
    virada: couple.comebackWin,
  }
  return BADGES.filter((b) => earned[b.id])
}
