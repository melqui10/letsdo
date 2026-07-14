import { useEffect, useState } from 'react'
import type { NotificationPrefs } from '../types'
import { useAuth } from '../lib/AuthContext'
import { getMyProfile, updateDisplayName } from '../lib/household'
import { errMsg } from '../lib/errors'
import {
  disablePush,
  enablePush,
  getPrefs,
  isIos,
  isStandalone,
  isSubscribed,
  permission,
  pushSupported,
  savePrefs,
} from '../lib/push'

function Toggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
        checked ? 'bg-indigo-600' : 'bg-gray-300'
      } disabled:opacity-40`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
          checked ? 'translate-x-5' : 'translate-x-0.5'
        }`}
      />
    </button>
  )
}

export function Configuracoes({ onSignOut }: { onSignOut: () => void }) {
  const { user } = useAuth()
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null)
  const [subscribed, setSubscribed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [savedName, setSavedName] = useState('')
  const [nameSaving, setNameSaving] = useState(false)

  const iosNeedsInstall = isIos() && !isStandalone()
  const denied = pushSupported() && permission() === 'denied'

  useEffect(() => {
    if (!user) return
    getPrefs(user.id).then(setPrefs).catch((e) => setError(errMsg(e, 'Erro ao carregar.')))
    isSubscribed().then(setSubscribed)
    getMyProfile(user.id)
      .then((p) => {
        setName(p?.display_name ?? '')
        setSavedName(p?.display_name ?? '')
      })
      .catch((e) => setError(errMsg(e, 'Erro ao carregar o perfil.')))
  }, [user])

  const saveName = async () => {
    if (!user) return
    const trimmed = name.trim()
    if (!trimmed || trimmed === savedName) return
    setNameSaving(true)
    setError(null)
    try {
      await updateDisplayName(user.id, trimmed)
      setSavedName(trimmed)
    } catch (e) {
      setError(errMsg(e, 'Não foi possível salvar o nome.'))
    } finally {
      setNameSaving(false)
    }
  }

  const toggleSubscription = async (on: boolean) => {
    if (!user) return
    setBusy(true)
    setError(null)
    try {
      if (on) await enablePush(user.id)
      else await disablePush()
      setSubscribed(on)
    } catch (e) {
      setError(errMsg(e, 'Não foi possível alterar as notificações.'))
    } finally {
      setBusy(false)
    }
  }

  const update = async (patch: Partial<NotificationPrefs>) => {
    if (!user || !prefs) return
    setPrefs({ ...prefs, ...patch })
    try {
      await savePrefs(user.id, patch)
      setError(null)
    } catch (e) {
      setError(errMsg(e, 'Não foi possível salvar.'))
    }
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col">
      <header className="sticky top-0 z-10 bg-white px-4 py-3 shadow-sm">
        <h1 className="text-lg font-bold text-gray-900">Ajustes</h1>
      </header>

      <main className="flex-1 space-y-6 px-4 pb-28 pt-4">
        {error && (
          <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <section>
          <h2 className="mb-2 text-sm font-semibold text-gray-500">Perfil</h2>
          <div className="rounded-xl bg-white p-4 shadow-sm">
            <label className="block text-sm font-medium text-gray-900">
              Seu nome
            </label>
            <p className="mb-2 text-xs text-gray-500">
              É como você aparece para o restante do lar.
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={saveName}
                maxLength={40}
                placeholder="Ex.: Melqui"
                className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
              <button
                type="button"
                onClick={saveName}
                disabled={nameSaving || !name.trim() || name.trim() === savedName}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
              >
                {nameSaving ? '…' : 'Salvar'}
              </button>
            </div>
          </div>
        </section>

        <section>
          <h2 className="mb-2 text-sm font-semibold text-gray-500">
            Notificações
          </h2>

          {!pushSupported() ? (
            <p className="rounded-xl bg-white p-4 text-sm text-gray-500 shadow-sm">
              Este dispositivo/navegador não suporta notificações push.
            </p>
          ) : (
            <div className="space-y-3">
              {iosNeedsInstall && (
                <div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
                  📲 No iPhone, primeiro adicione o Letsdo à tela inicial
                  (botão Compartilhar → <b>Adicionar à Tela de Início</b>) e
                  abra o app por lá. Só então dá para ativar as notificações.
                </div>
              )}
              {denied && (
                <div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
                  As notificações foram bloqueadas. Libere nas configurações do
                  navegador para este site.
                </div>
              )}

              <div className="flex items-center justify-between rounded-xl bg-white p-4 shadow-sm">
                <div className="pr-3">
                  <p className="font-medium text-gray-900">
                    Ativar neste aparelho
                  </p>
                  <p className="text-xs text-gray-500">
                    Permite receber notificações neste dispositivo.
                  </p>
                </div>
                <Toggle
                  checked={subscribed}
                  disabled={busy || iosNeedsInstall || denied}
                  onChange={toggleSubscription}
                />
              </div>

              {/* Tipos de notificação */}
              <fieldset
                disabled={!subscribed || !prefs}
                className="space-y-3 disabled:opacity-50"
              >
                <div className="rounded-xl bg-white p-4 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div className="pr-3">
                      <p className="font-medium text-gray-900">
                        Resumo diário
                      </p>
                      <p className="text-xs text-gray-500">
                        Tarefas do dia, todo dia no horário escolhido.
                      </p>
                    </div>
                    <Toggle
                      checked={prefs?.daily_enabled ?? false}
                      onChange={(v) => update({ daily_enabled: v })}
                    />
                  </div>
                  {prefs?.daily_enabled && (
                    <label className="mt-3 flex items-center justify-between text-sm text-gray-600">
                      Horário
                      <input
                        type="time"
                        value={prefs.daily_time.slice(0, 5)}
                        onChange={(e) => update({ daily_time: e.target.value })}
                        className="rounded-lg border border-gray-300 px-2 py-1"
                      />
                    </label>
                  )}
                </div>

                <div className="rounded-xl bg-white p-4 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div className="pr-3">
                      <p className="font-medium text-gray-900">
                        Antes de um evento
                      </p>
                      <p className="text-xs text-gray-500">
                        Aviso antes de tarefas/eventos com horário.
                      </p>
                    </div>
                    <Toggle
                      checked={prefs?.before_event_enabled ?? false}
                      onChange={(v) => update({ before_event_enabled: v })}
                    />
                  </div>
                  {prefs?.before_event_enabled && (
                    <label className="mt-3 flex items-center justify-between text-sm text-gray-600">
                      Antecedência
                      <select
                        value={prefs.before_event_minutes}
                        onChange={(e) =>
                          update({ before_event_minutes: Number(e.target.value) })
                        }
                        className="rounded-lg border border-gray-300 px-2 py-1"
                      >
                        <option value={10}>10 min</option>
                        <option value={30}>30 min</option>
                        <option value={60}>1 hora</option>
                        <option value={120}>2 horas</option>
                        <option value={1440}>1 dia</option>
                      </select>
                    </label>
                  )}
                </div>

                <div className="flex items-center justify-between rounded-xl bg-white p-4 shadow-sm">
                  <div className="pr-3">
                    <p className="font-medium text-gray-900">Atividade do lar</p>
                    <p className="text-xs text-gray-500">
                      Quando alguém cria ou conclui uma tarefa.
                    </p>
                  </div>
                  <Toggle
                    checked={prefs?.feed_enabled ?? false}
                    onChange={(v) => update({ feed_enabled: v })}
                  />
                </div>
              </fieldset>
            </div>
          )}
        </section>

        <section>
          <button
            onClick={onSignOut}
            className="w-full rounded-xl bg-white p-4 text-left font-medium text-red-600 shadow-sm"
          >
            Sair da conta
          </button>
        </section>
      </main>
    </div>
  )
}
