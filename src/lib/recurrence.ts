import { RRule } from 'rrule'

export type RecurrenceOption = 'nenhuma' | 'diaria' | 'semanal' | 'mensal'

export const RECURRENCE_LABELS: Record<RecurrenceOption, string> = {
  nenhuma: 'Não repete',
  diaria: 'Diariamente',
  semanal: 'Semanalmente',
  mensal: 'Mensalmente',
}

// Monta a string RRULE a partir da opção escolhida na UI.
export function buildRecurrenceRule(
  option: RecurrenceOption,
  start?: Date,
): string | null {
  if (option === 'nenhuma') return null
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
    switch (RRule.fromString(rule).options.freq) {
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
