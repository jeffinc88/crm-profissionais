import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base './' para funcionar em https://<usuario>.github.io/<repositorio>/
export default defineConfig({
  plugins: [react()],
  base: './',
})
