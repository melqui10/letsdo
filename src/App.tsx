import { useEffect, useState } from 'react'
import { AuthProvider, useAuth } from './lib/AuthContext'
import { Login } from './pages/Login'
import { Onboarding } from './pages/Onboarding'
import { ListaTarefas } from './pages/ListaTarefas'
import { Calendario } from './pages/Calendario'
import { Placar } from './pages/Placar'
import { Configuracoes } from './pages/Configuracoes'
import { ensureProfile, getMyHouseholds } from './lib/household'
import type { Household } from './types'

type Tab = 'lista' | 'calendario' | 'kanban' | 'placar' | 'ajustes'

function Splash() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-indigo-50 text-indigo-400">
      Carregando…
    </div>
  )
}

function Placeholder({ title }: { title: string }) {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center px-6 text-center">
      <p className="text-5xl">🚧</p>
      <h2 className="mt-3 text-xl font-bold text-gray-800">{title}</h2>
      <p className="mt-1 text-sm text-gray-500">Em breve, na próxima fase.</p>
    </div>
  )
}

function BottomNav({ tab, setTab }: { tab: Tab; setTab: (t: Tab) => void }) {
  const items: { key: Tab; label: string; icon: string }[] = [
    { key: 'lista', label: 'Lista', icon: '📋' },
    { key: 'calendario', label: 'Agenda', icon: '📅' },
    { key: 'kanban', label: 'Quadro', icon: '🗂️' },
    { key: 'placar', label: 'Placar', icon: '🏆' },
    { key: 'ajustes', label: 'Ajustes', icon: '⚙️' },
  ]
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 mx-auto flex max-w-md items-stretch justify-around border-t border-gray-200 bg-white">
      {items.map((it) => (
        <button
          key={it.key}
          onClick={() => setTab(it.key)}
          className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-xs ${
            tab === it.key ? 'text-indigo-600' : 'text-gray-400'
          }`}
        >
          <span className="text-lg">{it.icon}</span>
          {it.label}
        </button>
      ))}
    </nav>
  )
}

function Shell() {
  const { user, loading, signOut } = useAuth()
  const [households, setHouseholds] = useState<Household[] | null>(null)
  const [tab, setTab] = useState<Tab>('lista')

  const loadHouseholds = async () => {
    const hs = await getMyHouseholds()
    setHouseholds(hs)
  }

  useEffect(() => {
    if (user) {
      ensureProfile(user.id, user.email)
        .then(loadHouseholds)
        .catch(() => setHouseholds([])) // evita travar no splash; cai no onboarding
    } else {
      setHouseholds(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

  if (loading) return <Splash />
  if (!user) return <Login />
  if (households === null) return <Splash />
  if (households.length === 0)
    return <Onboarding userId={user.id} onDone={loadHouseholds} />

  const household = households[0]

  return (
    <div className="min-h-screen bg-gray-50 pb-16">
      {tab === 'lista' && <ListaTarefas household={household} />}
      {tab === 'calendario' && <Calendario household={household} />}
      {tab === 'kanban' && <Placeholder title="Quadro Kanban" />}
      {tab === 'placar' && <Placar household={household} />}
      {tab === 'ajustes' && <Configuracoes onSignOut={signOut} />}
      <BottomNav tab={tab} setTab={setTab} />
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <Shell />
    </AuthProvider>
  )
}
