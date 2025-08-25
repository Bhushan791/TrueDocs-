import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  optimizeDeps: {
    include: ['web3', 'jszip'], // pre-bundle these CommonJS packages
  },
  build: {
    commonjsOptions: {
      transformMixedEsModules: true, // ensures mixed ESM/CJS modules work
    },
  },
})
