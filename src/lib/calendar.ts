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
  isSameDay,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from 'date-fns'
import { ptBR } from 'date-fns/locale'
import type { Activity, Category, Profile } from '../types'
import {
  monthlyWeekdayFromRule,
  recurrenceOptionFromRule,
  weekdaysFromRule,
} from './recurrence'

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

// A data da n-ésima ocorrência de `weekday` (getDay) no mês de `monthStart`.
// `nth`: 1..4 ou -1 (última). Null se não existir (ex.: 5ª sem 5 semanas).
function nthWeekdayOfMonth(
  monthStart: Date,
  weekday: number,
  nth: number,
): Date | null {
  const year = monthStart.getFullYear()
  const month = monthStart.getMonth()
  const daysInMonth = endOfMonth(monthStart).getDate()
  if (nth === -1) {
    for (let day = daysInMonth; day >= 1; day--) {
      const dt = new Date(year, month, day)
      if (dt.getDay() === weekday) return dt
    }
    return null
  }
  let count = 0
  for (let day = 1; day <= daysInMonth; day++) {
    const dt = new Date(year, month, day)
    if (dt.getDay() === weekday && ++count === nth) return dt
  }
  return null
}

// Ocorrências de UMA atividade dentro do intervalo [rangeStart, rangeEnd].
function occurrencesFor(a: Activity, rangeStart: Date, rangeEnd: Date): Date[] {
  if (!a.due_at) return []
  const base = new Date(a.due_at)
  const opt = recurrenceOptionFromRule(a.recurrence_rule)

  if (opt === 'nenhuma') {
    // Compromisso de vários dias (fim em outro dia): ocupa cada dia do
    // intervalo. O 1º dia mantém o horário de início; os demais começam à
    // meia-noite (aparecem no topo, como o evento "em andamento" do dia).
    if (a.end_at) {
      const end = new Date(a.end_at)
      if (end > base && differenceInCalendarDays(end, base) >= 1) {
        const out: Date[] = []
        const lastDay = startOfDay(end)
        let d = startOfDay(base)
        let guard = 0
        while (d <= lastDay && guard < 400) {
          if (d >= startOfDay(rangeStart) && d <= rangeEnd) {
            out.push(differenceInCalendarDays(d, base) === 0 ? new Date(base) : new Date(d))
          }
          d = addDays(d, 1)
          guard++
        }
        return out
      }
    }
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

  // Mensal por dia da semana (ex.: 1ª segunda): percorre mês a mês e emite a
  // ocorrência na posição certa, no mesmo horário da data original.
  if (opt === 'mensal_dia_semana') {
    const info = monthlyWeekdayFromRule(a.recurrence_rule)
    if (!info) return []
    const out: Date[] = []
    let m = startOfMonth(base > rangeStart ? base : rangeStart)
    const lastMonth = startOfMonth(rangeEnd)
    let guard = 0
    while (m <= lastMonth && guard < 24) {
      const day = nthWeekdayOfMonth(m, info.weekday, info.nth)
      if (day) {
        const occ = new Date(day)
        occ.setHours(base.getHours(), base.getMinutes(), 0, 0)
        if (occ >= base && occ >= rangeStart && occ <= rangeEnd) out.push(occ)
      }
      m = addMonths(m, 1)
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

// Rótulo de horário de uma ocorrência para o texto de export.
// Considera dia inteiro e compromissos que se estendem por vários dias.
function occurrenceTimeLabel(occ: Occurrence): string {
  const a = occ.activity
  if (a.is_all_day) return 'Dia inteiro'
  if (!a.due_at) return ''
  const start = new Date(a.due_at)
  const end = a.end_at ? new Date(a.end_at) : null
  // Compromisso de vários dias: distingue início, meio e fim.
  if (end && differenceInCalendarDays(end, start) >= 1) {
    if (!isSameDay(occ.date, start)) {
      return isSameDay(occ.date, end)
        ? `até ${format(end, 'HH:mm')}`
        : 'o dia todo'
    }
    return `a partir de ${format(start, 'HH:mm')}`
  }
  const startTxt = format(start, 'HH:mm')
  if (end && isSameDay(end, start)) return `${startTxt}–${format(end, 'HH:mm')}`
  return startTxt
}

// Monta um texto (pt-BR) com os compromissos do mês do `cursor`, pronto para
// enviar via WhatsApp. Agrupa por dia e lista horário, título e responsável.
export function buildMonthAgendaText(
  cursor: Date,
  activities: Activity[],
  members: Profile[],
  categories: Category[],
): string {
  const monthStart = startOfMonth(cursor)
  const monthEnd = endOfMonth(cursor)
  monthEnd.setHours(23, 59, 59, 999)

  const agenda = activities.filter(
    (a) => a.kind === 'compromisso' || a.show_in_agenda,
  )
  const byDay = groupByDay(expandOccurrences(agenda, monthStart, monthEnd))

  const titulo = format(cursor, "MMMM 'de' yyyy", { locale: ptBR })
  const header = `📅 *Compromissos de ${titulo.charAt(0).toUpperCase()}${titulo.slice(1)}*`

  const dias = eachDayOfInterval({ start: monthStart, end: endOfMonth(cursor) })
  const blocos: string[] = []
  for (const dia of dias) {
    const itens = byDay.get(dayKey(dia))
    if (!itens || itens.length === 0) continue
    const cabecalho = format(dia, "EEEE, dd/MM", { locale: ptBR })
    const linhas = itens.map((occ) => {
      const hora = occurrenceTimeLabel(occ)
      const cat = categories.find((c) => c.id === occ.activity.category_id)
      const resp = members.find((m) => m.id === occ.activity.assignee_id)
      const partes = [hora, occ.activity.title].filter(Boolean).join(' — ')
      const extras = [cat?.icon && cat.name ? `${cat.icon} ${cat.name}` : cat?.name, resp?.display_name]
        .filter(Boolean)
        .join(' · ')
      return `• ${partes}${extras ? ` (${extras})` : ''}`
    })
    blocos.push(
      `*${cabecalho.charAt(0).toUpperCase()}${cabecalho.slice(1)}*\n${linhas.join('\n')}`,
    )
  }

  if (blocos.length === 0) return `${header}\n\nNenhum compromisso neste mês.`
  return `${header}\n\n${blocos.join('\n\n')}`
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
