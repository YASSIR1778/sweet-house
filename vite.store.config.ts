import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'
import { brandHtml } from './brand-html'

// The Store website: same code as the Services site, its own address
// (https://yassir1778.github.io/sweet-house-store/), built into dist-store.
export default defineConfig({
  base: '/sweet-house-store/',
  plugins: [react(), tailwindcss(), brandHtml('store')],
  define: { 'import.meta.env.VITE_BRAND': JSON.stringify('store') },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    outDir: 'dist-store',
    rollupOptions: { input: { site: fileURLToPath(new URL('./index.html', import.meta.url)) } },
  },
})
