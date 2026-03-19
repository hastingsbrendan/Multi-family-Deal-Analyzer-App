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
        },
      },
    },
  },
  server: {
    port: 3000,
  },
});
