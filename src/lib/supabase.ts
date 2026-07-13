import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

if (!url || !anonKey) {
  // Aviso em desenvolvimento quando as variáveis ainda não foram configuradas.
  console.warn(
    'Supabase: variáveis VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY ausentes. ' +
      'Copie .env.example para .env e preencha com as chaves do projeto.',
  )
}

export const supabase = createClient(url ?? '', anonKey ?? '')
