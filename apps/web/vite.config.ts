import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { devApi } from './vite/dev-api.ts'

export default defineConfig({
  plugins: [react(), tailwindcss(), devApi()],
  server: { port: 5180, strictPort: true },
})
