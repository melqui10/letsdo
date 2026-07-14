// Edge Function: send-push
// Envia uma notificação Web Push (VAPID) para todos os dispositivos de um
// usuário (profile_id) ou de todos os membros de um lar (household_id).
//
// Chamada por gatilhos internos (pg_cron / triggers) usando a service role key.
// Secrets necessários (supabase secrets set):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (ex.: mailto:voce@email.com)
//   SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY já são injetados pelo runtime.

import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

interface Payload {
  profile_id?: string
  household_id?: string
  // Não notificar quem disparou a ação (ex.: o criador da tarefa).
  exclude_profile_id?: string
  // Filtra destinatários pela preferência correspondente.
  type?: 'feed' | 'daily' | 'before_event'
  title: string
  body?: string
  url?: string
  tag?: string
}

// Coluna de preferência para cada tipo e o default quando não há linha salva.
const PREF_BY_TYPE: Record<
  NonNullable<Payload['type']>,
  { col: string; def: boolean }
> = {
  feed: { col: 'feed_enabled', def: true },
  daily: { col: 'daily_enabled', def: false },
  before_event: { col: 'before_event_enabled', def: false },
}

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

webpush.setVapidDetails(
  Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@letsdo.app',
  Deno.env.get('VAPID_PUBLIC_KEY')!,
  Deno.env.get('VAPID_PRIVATE_KEY')!,
)

async function profileIdsFor(payload: Payload): Promise<string[]> {
  if (payload.profile_id) return [payload.profile_id]
  if (!payload.household_id) return []

  const { data } = await supabase
    .from('household_members')
    .select('profile_id')
    .eq('household_id', payload.household_id)
  let ids = (data ?? []).map((r) => r.profile_id as string)

  if (payload.exclude_profile_id) {
    ids = ids.filter((id) => id !== payload.exclude_profile_id)
  }

  // Respeita a preferência do usuário para este tipo de notificação.
  if (payload.type && ids.length) {
    const { col, def } = PREF_BY_TYPE[payload.type]
    const { data: prefs } = await supabase
      .from('notification_prefs')
      .select(`profile_id, ${col}`)
      .in('profile_id', ids)
    const rows = (prefs ?? []) as Record<string, unknown>[]
    ids = ids.filter((id) => {
      const row = rows.find((r) => r.profile_id === id)
      return row ? Boolean(row[col]) : def // sem linha salva = default
    })
  }

  return ids
}

Deno.serve(async (req) => {
  try {
    const payload = (await req.json()) as Payload
    if (!payload.title) {
      return new Response('title obrigatório', { status: 400 })
    }

    const ids = await profileIdsFor(payload)
    if (ids.length === 0) return new Response('sem destinatários', { status: 200 })

    const { data: subs } = await supabase
      .from('push_subscriptions')
      .select('*')
      .in('profile_id', ids)

    const message = JSON.stringify({
      title: payload.title,
      body: payload.body ?? '',
      url: payload.url ?? '/',
      tag: payload.tag,
    })

    let sent = 0
    for (const s of subs ?? []) {
      const subscription = {
        endpoint: s.endpoint,
        keys: { p256dh: s.p256dh, auth: s.auth },
      }
      try {
        await webpush.sendNotification(subscription, message)
        sent++
      } catch (err) {
        // 404/410 = subscription expirada; remove do banco.
        const status = (err as { statusCode?: number }).statusCode
        if (status === 404 || status === 410) {
          await supabase
            .from('push_subscriptions')
            .delete()
            .eq('endpoint', s.endpoint)
        }
      }
    }

    return new Response(JSON.stringify({ sent }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(String(err), { status: 500 })
  }
})
