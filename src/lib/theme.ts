// Tema da interface: claro, escuro ou seguindo o sistema.
export type Theme = 'light' | 'dark' | 'system'

const KEY = 'letsdo:theme'

export function getTheme(): Theme {
  const v = localStorage.getItem(KEY)
  return v === 'light' || v === 'dark' ? v : 'system'
}

function prefersDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

// Aplica (ou remove) a classe .dark no <html> conforme o tema efetivo.
function apply(theme: Theme): void {
  const dark = theme === 'dark' || (theme === 'system' && prefersDark())
  document.documentElement.classList.toggle('dark', dark)
}

export function setTheme(theme: Theme): void {
  if (theme === 'system') localStorage.removeItem(KEY)
  else localStorage.setItem(KEY, theme)
  apply(theme)
}

// Chamado uma vez no start: aplica o tema salvo e acompanha o sistema
// quando o modo for "system".
export function initTheme(): void {
  apply(getTheme())
  window
    .matchMedia('(prefers-color-scheme: dark)')
    .addEventListener('change', () => {
      if (getTheme() === 'system') apply('system')
    })
}
