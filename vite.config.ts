import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Relative base so the same build works at https://<account>.github.io/<repository>/
// and on any other static host (Build Plan 12.5).
export default defineConfig({
  base: './',
  plugins: [react()],
})
