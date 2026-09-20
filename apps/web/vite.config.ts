import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { devApi } from './vite/dev-api.ts'

export default defineConfig({
  // `devApi` runs the `api/` handlers in the dev server, so the endpoint the
  // browser calls locally is the same code Vercel deploys as a function.
  plugins: [react(), tailwindcss(), devApi()],
  server: { port: 5180, strictPort: true },
})
