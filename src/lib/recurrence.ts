import { RRule } from 'rrule'

// 'semanal' é legado: só aparece ao ler regras antigas (FREQ=WEEKLY sem BYDAY),
// gravadas quando "Semanalmente" e "Dias da semana" eram opções separadas. Na
// RFC 5545 elas são o mesmo conceito — "toda semana" é "nos dias X" com um dia
// só —, então hoje o formulário oferece apenas 'dias_semana' e sempre grava
// BYDAY explícito. Ver `recurrenceFormState`.
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
  dias_semana: 'Semanalmente',
  mensal: 'Mensalmente',
  mensal_dia_semana: 'Mensalmente',
}

// Opções exibidas no dropdown. As duas variações mensais são colapsadas em
// "Mensal" — a escolha entre elas vira um seletor à parte no formulário.
export const RECURRENCE_MENU: RecurrenceOption[] = [
  'nenhuma',
  'diaria',
  'dias_semana',
  'mensal',
]

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

// Uma entrada de BYDAY como o parser a devolve. `weekday` usa a numeração do
// rrule (0=segunda..6=domingo), diferente de getDay() (0=domingo); `n` é a
// posição no mês ("+1MO"), ausente em BYDAY sem posição.
interface ParsedWeekday {
  weekday: number
  n?: number | null
}

// A leitura da recorrência tem que refletir SÓ o que está escrito na regra.
// `RRule.fromString(r).options` devolve as opções já normalizadas, e para
// FREQ=WEEKLY sem BYDAY o rrule preenche o BYDAY a partir do DTSTART — que é
// serializado em UTC. Uma regra "toda semana" criada numa segunda às 21h no
// fuso -03 (00h UTC de terça) voltava como "toda terça", jogando a atividade
// para o dia seguinte. `parseString` não infere nada: devolve apenas os campos
// presentes na string, e por isso independe de fuso.
function parseRule(rule: string): { freq?: number; byday: ParsedWeekday[] } {
  const parsed = RRule.parseString(rule)
  const raw = parsed.byweekday
  const list = raw == null ? [] : Array.isArray(raw) ? raw : [raw]
  const byday: ParsedWeekday[] = []
  for (const w of list) {
    if (typeof w === 'number') byday.push({ weekday: w })
    else if (w && typeof w === 'object' && typeof w.weekday === 'number') {
      byday.push({ weekday: w.weekday, n: w.n })
    }
  }
  return { freq: parsed.freq, byday }
}

// Converte a RRULE de volta para a opção da UI.
export function recurrenceOptionFromRule(rule: string | null): RecurrenceOption {
  if (!rule) return 'nenhuma'
  try {
    const { freq, byday } = parseRule(rule)
    // Mensal com posição (ex.: +1MO): BYDAY presente e com `n`.
    if (freq === RRule.MONTHLY && byday.some((w) => w.n != null)) {
      return 'mensal_dia_semana'
    }
    if (freq === RRule.WEEKLY && byday.length > 0) return 'dias_semana'
    switch (freq) {
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
  if (!rule || recurrenceOptionFromRule(rule) !== 'dias_semana') return []
  try {
    // rrule numera 0=segunda..6=domingo; getDay() usa 0=domingo.
    return parseRule(rule)
      .byday.map((w) => (w.weekday + 1) % 7)
      .sort((a, b) => a - b)
  } catch {
    return []
  }
}

// Estado inicial do seletor de recorrência do formulário a partir da regra
// salva. Regras legadas de "toda semana" (FREQ=WEEKLY sem BYDAY) são
// apresentadas como 'dias_semana' com o dia da semana da própria data-base
// marcado — o mesmo comportamento de antes, agora com um rótulo só. Ao salvar,
// a regra é regravada com BYDAY explícito e deixa de depender do DTSTART.
export function recurrenceFormState(
  rule: string | null,
  base: Date | null,
): { option: RecurrenceOption; weekdays: number[] } {
  const option = recurrenceOptionFromRule(rule)
  if (option === 'semanal') {
    return { option: 'dias_semana', weekdays: [(base ?? new Date()).getDay()] }
  }
  return { option, weekdays: weekdaysFromRule(rule) }
}

// Posição + dia da semana de uma RRULE mensal com BYDAY posicional (ex.: +1MO).
// `nth`: 1..4 ou -1 (última); `weekday`: getDay() (0=dom..6=sáb). Null se não aplicável.
export function monthlyWeekdayFromRule(
  rule: string | null,
): { nth: number; weekday: number } | null {
  if (!rule || recurrenceOptionFromRule(rule) !== 'mensal_dia_semana') return null
  try {
    const posicional = parseRule(rule).byday.find((w) => w.n != null)
    if (!posicional?.n) return null
    return { nth: posicional.n, weekday: (posicional.weekday + 1) % 7 }
  } catch {
    return null
  }
}
