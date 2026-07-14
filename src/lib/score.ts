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
  { id: 'primeira', emoji: '🌱', name: 'Primeiros passos', desc: 'Concluiu a 1ª tarefa' },
  { id: 'prazo10', emoji: '⏰', name: 'Pontual', desc: '10 tarefas no prazo' },
  { id: 'prazo30', emoji: '🎯', name: 'Relojoeiro', desc: '30 tarefas no prazo' },
  { id: 'dia5', emoji: '🌪️', name: 'Furacão', desc: '5 tarefas num só dia' },
  { id: 'streak7', emoji: '🔥', name: 'Chama de 7', desc: '7 dias seguidos' },
  { id: 'streak30', emoji: '⚡', name: 'Chama de 30', desc: '30 dias seguidos' },
  { id: 'urgente10', emoji: '🚨', name: 'Bombeiro', desc: '10 urgentes concluídas' },
  { id: 'pts500', emoji: '💎', name: 'Meio milhar', desc: '500 pontos no total' },
  { id: 'pts2000', emoji: '👑', name: 'Realeza', desc: '2000 pontos no total' },
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

export interface ProfileStats {
  totalPoints: number
  weekPoints: number
  completions: number
  onTimeCount: number
  urgentCount: number
  maxInDay: number
  streak: number
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
  for (const e of own) {
    perDay.set(e.event_day, (perDay.get(e.event_day) ?? 0) + 1)
  }

  return {
    totalPoints: own.reduce((sum, e) => sum + e.points, 0),
    weekPoints: own
      .filter((e) => e.event_day >= monday)
      .reduce((sum, e) => sum + e.points, 0),
    completions: own.length,
    onTimeCount: own.filter((e) => e.on_time === true).length,
    urgentCount: own.filter((e) => e.priority === 'urgente').length,
    maxInDay: perDay.size > 0 ? Math.max(...perDay.values()) : 0,
    streak: computeStreak(new Set(perDay.keys())),
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

// Conquistas cujos critérios as estatísticas satisfazem.
export function earnedBadges(stats: ProfileStats): Badge[] {
  const earned: Record<string, boolean> = {
    primeira: stats.completions >= 1,
    prazo10: stats.onTimeCount >= 10,
    prazo30: stats.onTimeCount >= 30,
    dia5: stats.maxInDay >= 5,
    streak7: stats.streak >= 7,
    streak30: stats.streak >= 30,
    urgente10: stats.urgentCount >= 10,
    pts500: stats.totalPoints >= 500,
    pts2000: stats.totalPoints >= 2000,
  }
  return BADGES.filter((b) => earned[b.id])
}
