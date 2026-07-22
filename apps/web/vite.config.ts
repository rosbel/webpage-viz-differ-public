import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [tailwindcss(), sveltekit()],
  ssr: {
    // Native deps (better-sqlite3, playwright) must be required at runtime,
    // not bundled by Vite.
    external: ['@webpage-viz-differ/core']
  }
});
