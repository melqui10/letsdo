import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Letsdo',
        short_name: 'Letsdo',
        description: 'Hub doméstico compartilhado: tarefas, calendário e Kanban.',
        theme_color: '#4f46e5',
        background_color: '#ffffff',
        display: 'standalone',
        lang: 'pt-BR',
        start_url: '/',
        icons: [
          { src: '/vite.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
      },
    }),
  ],
})
