import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // The backend only trusts this origin (CORS_ORIGINS in backend/app/config.py).
    // strictPort stops the dev server from silently drifting to 5174/5175/5176 when
    // 5173 is taken: an untrusted origin makes every API call fail CORS, which the
    // browser reports to the app as "cannot reach the EDFlow API" — i.e. a confusing
    // "backend is down" message for what is really a port mismatch.
    port: 5173,
    strictPort: true,
  },
})
