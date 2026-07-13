import { useState, type FormEvent } from 'react'
import { createHousehold, joinHousehold } from '../lib/household'

interface Props {
  userId: string
  onDone: () => void
}

export function Onboarding({ userId, onDone }: Props) {
  const [mode, setMode] = useState<'criar' | 'entrar'>('criar')
  const [name, setName] = useState('Nossa Casa')
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      if (mode === 'criar') {
        await createHousehold(name.trim() || 'Nossa Casa')
      } else {
        await joinHousehold(code.trim(), userId)
      }
      onDone()
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Não foi possível concluir.',
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-indigo-50 p-6">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-lg">
        <h1 className="mb-4 text-center text-xl font-bold text-gray-900">
          Vamos configurar seu lar
        </h1>
        <div className="mb-4 flex rounded-lg bg-gray-100 p-1 text-sm">
          <button
            onClick={() => setMode('criar')}
            className={`flex-1 rounded-md py-1.5 ${
              mode === 'criar' ? 'bg-white shadow' : 'text-gray-500'
            }`}
          >
            Criar novo
          </button>
          <button
            onClick={() => setMode('entrar')}
            className={`flex-1 rounded-md py-1.5 ${
              mode === 'entrar' ? 'bg-white shadow' : 'text-gray-500'
            }`}
          >
            Entrar com código
          </button>
        </div>
        <form onSubmit={submit} className="space-y-3">
          {mode === 'criar' ? (
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nome do lar (ex.: Nossa Casa)"
              className="w-full rounded-lg border border-gray-300 px-3 py-2"
            />
          ) : (
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Cole o código do lar"
              className="w-full rounded-lg border border-gray-300 px-3 py-2"
            />
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-indigo-600 py-2 font-medium text-white disabled:opacity-60"
          >
            {loading ? 'Aguarde…' : mode === 'criar' ? 'Criar lar' : 'Entrar'}
          </button>
        </form>
        <p className="mt-4 text-center text-xs text-gray-400">
          Crie um lar e compartilhe o código com sua esposa para vocês usarem a
          mesma lista.
        </p>
      </div>
    </div>
  )
}
