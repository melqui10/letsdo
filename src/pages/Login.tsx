import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'

export function Login() {
  const [mode, setMode] = useState<'entrar' | 'criar'>('entrar')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setInfo(null)
    setLoading(true)
    try {
      if (mode === 'entrar') {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        })
        if (error) throw error
      } else {
        const { error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        setInfo(
          'Conta criada! Se a confirmação por e-mail estiver ativa, verifique sua caixa de entrada.',
        )
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Algo deu errado.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-indigo-50 p-6">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-lg">
        <h1 className="mb-1 text-center text-2xl font-bold text-indigo-700">
          Letsdo
        </h1>
        <p className="mb-6 text-center text-sm text-gray-500">
          Suas tarefas, calendário e Kanban num só lugar.
        </p>
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="E-mail"
            className="w-full rounded-lg border border-gray-300 px-3 py-2"
          />
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Senha"
            className="w-full rounded-lg border border-gray-300 px-3 py-2"
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          {info && <p className="text-sm text-green-600">{info}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-indigo-600 py-2 font-medium text-white disabled:opacity-60"
          >
            {loading ? 'Aguarde…' : mode === 'entrar' ? 'Entrar' : 'Criar conta'}
          </button>
        </form>
        <button
          onClick={() => setMode(mode === 'entrar' ? 'criar' : 'entrar')}
          className="mt-4 w-full text-center text-sm text-indigo-600"
        >
          {mode === 'entrar'
            ? 'Não tem conta? Criar agora'
            : 'Já tem conta? Entrar'}
        </button>
      </div>
    </div>
  )
}
