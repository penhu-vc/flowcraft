import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:3001',
      '/generated': 'http://127.0.0.1:3001',
      '/socket.io': 'http://127.0.0.1:3001',
    },
  },
})
