import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    sourcemap: false,
    rolldownOptions: {
      external: ['html2canvas'], // optional jsPDF dep we never use — keep out of bundle
      output: {
        // Vite 8 bundles with Rolldown, which has no object-form manualChunks. Each
        // group captures the matched modules plus their dependencies (like the old
        // object form did); higher priority claims first, so React stays in
        // vendor-react instead of being pulled into the Recharts/Sentry chunks.
        codeSplitting: {
          groups: [
            // Stable vendor chunks — browsers keep these cached across deployments
            // even when app code changes, since these libraries rarely update.
            { name: 'vendor-react',    priority: 30, test: /[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
            { name: 'vendor-recharts', priority: 20, test: /[\\/]node_modules[\\/]recharts[\\/]/ },
            { name: 'vendor-supabase', priority: 20, test: /[\\/]node_modules[\\/]@supabase[\\/]/ },
            { name: 'vendor-sentry',   priority: 20, test: /[\\/]node_modules[\\/]@sentry(-internal)?[\\/]/ },
            // Large data files — split so they cache independently from app code.
            // taxEngine: state tax brackets; loanEngine: loan metadata + county limits.
            // When app logic changes, users don't re-download these stable data chunks.
            { name: 'data-taxengine',  priority: 10, test: /[\\/]src[\\/]lib[\\/]taxEngine\.js$/ },
            { name: 'data-loanengine', priority: 10, test: /[\\/]src[\\/]lib[\\/]loanEngine\.js$/ },
          ],
        },
      },
    },
  },
  server: {
    port: 3000,
  },
});
