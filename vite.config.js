import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// For GitHub Pages: https://<user>.github.io/<repo>/
const repoName = 'cacacards'

export default defineConfig({
  plugins: [react()],
  base: `/${repoName}/`,
  server: {
    port: 5173,
    strictPort: true,
  },
})
