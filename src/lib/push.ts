import { supabase } from './supabase'
import type { NotificationPrefs } from '../types'

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as
  | string
  | undefined

// --- Detecção de ambiente -------------------------------------------------

export function pushSupported(): boolean {
  return (
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

export function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}

// PWA instalado na tela inicial (obrigatório para push no iOS).
export function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // Safari iOS expõe navigator.standalone
    (navigator as unknown as { standalone?: boolean }).standalone === true
  )
}

export function permission(): NotificationPermission {
  return Notification.permission
}

// --- Assinatura de push ---------------------------------------------------

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  const out = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

// Pede permissão, assina no PushManager e salva a subscription no Supabase.
export async function enablePush(profileId: string): Promise<void> {
  if (!pushSupported()) throw new Error('Este dispositivo não suporta push.')
  if (isIos() && !isStandalone()) {
    throw new Error(
      'No iPhone, adicione o app à tela inicial (Compartilhar → Adicionar à Tela de Início) antes de ativar as notificações.',
    )
  }
  if (!VAPID_PUBLIC_KEY) throw new Error('Chave VAPID não configurada.')

  const perm = await Notification.requestPermission()
  if (perm !== 'granted') throw new Error('Permissão de notificação negada.')

  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
  })

  const json = sub.toJSON()
  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      profile_id: profileId,
      endpoint: json.endpoint,
      p256dh: json.keys?.p256dh,
      auth: json.keys?.auth,
    },
    { onConflict: 'endpoint' },
  )
  if (error) throw error
}

// Remove a subscription deste dispositivo (local + banco).
export async function disablePush(): Promise<void> {
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  if (!sub) return
  const endpoint = sub.endpoint
  await sub.unsubscribe()
  await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint)
}

export async function isSubscribed(): Promise<boolean> {
  if (!pushSupported()) return false
  const reg = await navigator.serviceWorker.ready
  return Boolean(await reg.pushManager.getSubscription())
}

// --- Preferências ---------------------------------------------------------

const DEFAULT_PREFS: Omit<NotificationPrefs, 'profile_id' | 'updated_at'> = {
  daily_enabled: false,
  daily_time: '08:00',
  before_event_enabled: false,
  before_event_minutes: 30,
  feed_enabled: true,
}

export async function getPrefs(profileId: string): Promise<NotificationPrefs> {
  const { data, error } = await supabase
    .from('notification_prefs')
    .select('*')
    .eq('profile_id', profileId)
    .maybeSingle()
  if (error) throw error
  if (data) return data as NotificationPrefs
  return {
    profile_id: profileId,
    updated_at: new Date().toISOString(),
    ...DEFAULT_PREFS,
  }
}

export async function savePrefs(
  profileId: string,
  patch: Partial<Omit<NotificationPrefs, 'profile_id' | 'updated_at'>>,
): Promise<void> {
  const current = await getPrefs(profileId)
  const { error } = await supabase.from('notification_prefs').upsert(
    {
      profile_id: profileId,
      daily_enabled: current.daily_enabled,
      daily_time: current.daily_time,
      before_event_enabled: current.before_event_enabled,
      before_event_minutes: current.before_event_minutes,
      feed_enabled: current.feed_enabled,
      ...patch,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'profile_id' },
  )
  if (error) throw error
}
