import { RRule } from 'rrule'

export type RecurrenceOption =
  | 'nenhuma'
  | 'diaria'
  | 'semanal'
  | 'dias_semana'
  | 'mensal'
  | 'mensal_dia_semana'

export const RECURRENCE_LABELS: Record<RecurrenceOption, string> = {
  nenhuma: 'Não repete',
  diaria: 'Diariamente',
  semanal: 'Semanalmente',
  dias_semana: 'Dias da semana',
  mensal: 'Mensalmente (mesmo dia do mês)',
  mensal_dia_semana: 'Mensalmente (por dia da semana)',
}

// Nomes por extenso indexados por getDay() (0 = domingo).
const WEEKDAY_FULL = [
  'domingo',
  'segunda-feira',
  'terça-feira',
  'quarta-feira',
  'quinta-feira',
  'sexta-feira',
  'sábado',
]
const ORDINALS = ['', '1ª', '2ª', '3ª', '4ª', 'última']

// Qual posição no mês (1..4, ou -1 = última) a data ocupa para seu dia da semana.
function nthOfMonth(date: Date): number {
  const nth = Math.ceil(date.getDate() / 7)
  return nth > 4 ? -1 : nth
}

// Descrição legível: "Toda 1ª segunda-feira do mês".
export function describeMonthlyWeekday(date: Date): string {
  const nth = nthOfMonth(date)
  const ord = nth === -1 ? 'última' : ORDINALS[nth]
  return `Toda ${ord} ${WEEKDAY_FULL[date.getDay()]} do mês`
}

// Rótulos curtos indexados por getDay() (0 = domingo … 6 = sábado).
export const WEEKDAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

// Mapa getDay() (0 = domingo) -> objeto Weekday do rrule.
const JS_TO_RRULE = [
  RRule.SU,
  RRule.MO,
  RRule.TU,
  RRule.WE,
  RRule.TH,
  RRule.FR,
  RRule.SA,
]

// Monta a string RRULE a partir da opção escolhida na UI.
// `weekdays` (getDay(): 0=dom..6=sáb) só é usado quando option = 'dias_semana'.
export function buildRecurrenceRule(
  option: RecurrenceOption,
  start?: Date,
  weekdays?: number[],
): string | null {
  if (option === 'nenhuma') return null

  if (option === 'dias_semana') {
    if (!weekdays || weekdays.length === 0) return null
    const rule = new RRule({
      freq: RRule.WEEKLY,
      byweekday: weekdays.map((d) => JS_TO_RRULE[d]),
      dtstart: start ?? new Date(),
    })
    return rule.toString()
  }

  // Mensal por dia da semana: "1ª segunda", "última sexta"… derivado da data.
  if (option === 'mensal_dia_semana') {
    const d = start ?? new Date()
    const rule = new RRule({
      freq: RRule.MONTHLY,
      byweekday: [JS_TO_RRULE[d.getDay()].nth(nthOfMonth(d))],
      dtstart: d,
    })
    return rule.toString()
  }

  const freq = {
    diaria: RRule.DAILY,
    semanal: RRule.WEEKLY,
    mensal: RRule.MONTHLY,
  }[option]
  const rule = new RRule({ freq, dtstart: start ?? new Date() })
  return rule.toString()
}

// Converte a RRULE de volta para a opção da UI.
export function recurrenceOptionFromRule(rule: string | null): RecurrenceOption {
  if (!rule) return 'nenhuma'
  try {
    const opts = RRule.fromString(rule).options
    // Mensal com posição (ex.: +1MO) vem em bynweekday.
    if (
      opts.freq === RRule.MONTHLY &&
      Array.isArray(opts.bynweekday) &&
      opts.bynweekday.length > 0
    ) {
      return 'mensal_dia_semana'
    }
    if (
      opts.freq === RRule.WEEKLY &&
      Array.isArray(opts.byweekday) &&
      opts.byweekday.length > 0
    ) {
      return 'dias_semana'
    }
    switch (opts.freq) {
      case RRule.DAILY:
        return 'diaria'
      case RRule.WEEKLY:
        return 'semanal'
      case RRule.MONTHLY:
        return 'mensal'
      default:
        return 'nenhuma'
    }
  } catch {
    return 'nenhuma'
  }
}

// Dias da semana (getDay(): 0=dom..6=sáb) de uma RRULE semanal com BYDAY.
// Vazio para qualquer outra recorrência.
export function weekdaysFromRule(rule: string | null): number[] {
  if (!rule) return []
  try {
    const opts = RRule.fromString(rule).options
    if (
      opts.freq === RRule.WEEKLY &&
      Array.isArray(opts.byweekday) &&
      opts.byweekday.length > 0
    ) {
      // rrule numera 0=segunda..6=domingo; getDay() usa 0=domingo.
      return opts.byweekday.map((n) => (n + 1) % 7).sort((a, b) => a - b)
    }
  } catch {
    return []
  }
  return []
}

// Posição + dia da semana de uma RRULE mensal com BYDAY posicional (ex.: +1MO).
// `nth`: 1..4 ou -1 (última); `weekday`: getDay() (0=dom..6=sáb). Null se não aplicável.
export function monthlyWeekdayFromRule(
  rule: string | null,
): { nth: number; weekday: number } | null {
  if (!rule) return null
  try {
    const opts = RRule.fromString(rule).options
    const byn = opts.bynweekday
    if (opts.freq === RRule.MONTHLY && Array.isArray(byn) && byn.length > 0) {
      const [wd, n] = byn[0] // [dia rrule (0=seg), posição]
      return { nth: n, weekday: (wd + 1) % 7 }
    }
  } catch {
    return null
  }
  return null
}
