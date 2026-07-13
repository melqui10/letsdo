// Extrai uma mensagem legível de qualquer erro — incluindo os erros do Supabase
// (PostgrestError), que são objetos simples com `.message` e NÃO instâncias de Error.
export function errMsg(e: unknown, fallback: string): string {
  if (e instanceof Error) return e.message
  if (e && typeof e === 'object' && 'message' in e) {
    const m = (e as { message?: unknown }).message
    if (typeof m === 'string' && m.trim()) return m
  }
  return fallback
}
