import {
  addDays,
  addMonths,
  addWeeks,
  differenceInCalendarDays,
  differenceInCalendarMonths,
  differenceInCalendarWeeks,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from 'date-fns'
import type { Activity } from '../types'
import { recurrenceOptionFromRule, weekdaysFromRule } from './recurrence'

// Semana começando no domingo (padrão pt-BR).
const WEEK_OPTS = { weekStartsOn: 0 as const }

// Chave de dia (yyyy-MM-dd) usada para agrupar ocorrências por data.
export function dayKey(date: Date): string {
  return format(date, 'yyyy-MM-dd')
}

// Todos os dias visíveis na grade do mês — do domingo da 1ª semana ao
// sábado da última, cobrindo dias "vazando" do mês anterior/seguinte.
export function monthGridDays(cursor: Date): Date[] {
  const start = startOfWeek(startOfMonth(cursor), WEEK_OPTS)
  const end = endOfWeek(endOfMonth(cursor), WEEK_OPTS)
  return eachDayOfInterval({ start, end })
}

// Uma aparição concreta de uma atividade numa data (base ou recorrente).
export interface Occurrence {
  activity: Activity
  date: Date
}

// Passos e diferenças por tipo de recorrência (as únicas que a UI gera).
const STEP = {
  diaria: (d: Date, n: number) => addDays(d, n),
  semanal: (d: Date, n: number) => addWeeks(d, n),
  mensal: (d: Date, n: number) => addMonths(d, n),
}
const DIFF = {
  diaria: differenceInCalendarDays,
  semanal: differenceInCalendarWeeks,
  mensal: differenceInCalendarMonths,
}

// Ocorrências de UMA atividade dentro do intervalo [rangeStart, rangeEnd].
function occurrencesFor(a: Activity, rangeStart: Date, rangeEnd: Date): Date[] {
  if (!a.due_at) return []
  const base = new Date(a.due_at)
  const opt = recurrenceOptionFromRule(a.recurrence_rule)

  if (opt === 'nenhuma') {
    return base >= rangeStart && base <= rangeEnd ? [base] : []
  }

  // Dias específicos da semana (ex.: toda seg/qua): percorre o intervalo dia a
  // dia e emite ocorrência nos dias marcados, no mesmo horário da data original.
  if (opt === 'dias_semana') {
    const wanted = new Set(weekdaysFromRule(a.recurrence_rule))
    if (wanted.size === 0) return []
    const out: Date[] = []
    let d = startOfDay(base > rangeStart ? base : rangeStart)
    let guard = 0
    while (d <= rangeEnd && guard < 60) {
      if (wanted.has(d.getDay())) {
        const occ = new Date(d)
        occ.setHours(base.getHours(), base.getMinutes(), 0, 0)
        if (occ >= base && occ >= rangeStart && occ <= rangeEnd) out.push(occ)
      }
      d = addDays(d, 1)
      guard++
    }
    return out
  }

  // Avança direto para a primeira ocorrência dentro (ou logo antes) do range,
  // evitando iterar desde a data original quando ela é muito antiga.
  const skip = Math.max(0, DIFF[opt](rangeStart, base))
  let d = STEP[opt](base, skip)
  const out: Date[] = []
  let guard = 0
  while (d <= rangeEnd && guard < 400) {
    if (d >= rangeStart) out.push(new Date(d))
    d = STEP[opt](d, 1)
    guard++
  }
  return out
}

// Expande todas as atividades em ocorrências dentro do intervalo dado.
export function expandOccurrences(
  activities: Activity[],
  rangeStart: Date,
  rangeEnd: Date,
): Occurrence[] {
  const out: Occurrence[] = []
  for (const a of activities) {
    for (const date of occurrencesFor(a, rangeStart, rangeEnd)) {
      out.push({ activity: a, date })
    }
  }
  return out
}

// Agrupa ocorrências por dia (yyyy-MM-dd), ordenadas por horário dentro do dia.
export function groupByDay(occurrences: Occurrence[]): Map<string, Occurrence[]> {
  const map = new Map<string, Occurrence[]>()
  for (const occ of occurrences) {
    const key = dayKey(occ.date)
    const bucket = map.get(key)
    if (bucket) bucket.push(occ)
    else map.set(key, [occ])
  }
  for (const bucket of map.values()) {
    bucket.sort((a, b) => {
      // Eventos de dia inteiro primeiro; depois por horário.
      if (a.activity.is_all_day !== b.activity.is_all_day)
        return a.activity.is_all_day ? -1 : 1
      return a.date.getTime() - b.date.getTime()
    })
  }
  return map
}
