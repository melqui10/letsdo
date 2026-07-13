import { RRule } from 'rrule'

export type RecurrenceOption =
  | 'nenhuma'
  | 'diaria'
  | 'semanal'
  | 'dias_semana'
  | 'mensal'

export const RECURRENCE_LABELS: Record<RecurrenceOption, string> = {
  nenhuma: 'Não repete',
  diaria: 'Diariamente',
  semanal: 'Semanalmente',
  dias_semana: 'Dias da semana',
  mensal: 'Mensalmente',
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
