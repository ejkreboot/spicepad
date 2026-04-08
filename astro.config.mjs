import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig({
  output: 'static',
  redirects: {
    '/circuit_editor.html': '/sim',
    '/circuit_editor': '/sim',
  },
});
