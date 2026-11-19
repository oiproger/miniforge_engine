import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
export default defineConfig({
  root: 'apps/editor',
  base: './',
  plugins: [react()],
  assetsInclude: ['**/*.wasm'],
  optimizeDeps: { exclude: ['assimpjs'] },
  server: { host: '0.0.0.0', fs: { allow: [process.cwd()] } },
  build: { outDir: '../../dist/editor', emptyOutDir: true },
})
