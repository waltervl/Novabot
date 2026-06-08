import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Renderer build. The main process (Electron) is compiled separately by tsc
// (`build:main`); this config only owns the React renderer.
//
// `base: './'` makes all asset URLs relative so the packaged app can load the
// built `index.html` over `file://` (loadFile) without a dev server.
export default defineConfig({
  root: 'src/renderer',
  base: './',
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: '../../dist/renderer',
    emptyOutDir: true,
  },
});
