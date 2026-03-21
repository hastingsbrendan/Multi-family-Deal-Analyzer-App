import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      external: ['html2canvas'], // optional jsPDF dep we never use — keep out of bundle
      output: {
        manualChunks: {
          // Stable vendor chunks — browsers keep these cached across deployments
          // even when app code changes, since these libraries rarely update.
          'vendor-react':    ['react', 'react-dom'],
          'vendor-recharts': ['recharts'],
          'vendor-supabase': ['@supabase/supabase-js'],
          'vendor-sentry':   ['@sentry/react'],
          // Large data files — split so they cache independently from app code.
          // taxEngine: 865 lines of state tax brackets; loanEngine: 889 lines of loan metadata.
          // When app logic changes, users don't re-download these stable data chunks.
          'data-taxengine':  ['./src/lib/taxEngine.js'],
          'data-loanengine': ['./src/lib/loanEngine.js'],
        },
      },
    },
  },
  server: {
    port: 3000,
  },
});
