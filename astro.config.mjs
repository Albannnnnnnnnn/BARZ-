import { defineConfig } from 'astro/config';
import react from '@astrojs/react';

export default defineConfig({
  site: 'https://barz.app',
  base: '/',
  output: 'static',
  adapter: undefined,
  compressHTML: true,
  integrations: [react()],
  build: {
    inlineStylesheets: 'auto',
  },
  vite: {
    css: {
      preprocessorOptions: {
        css: {
          charset: false,
        },
      },
    },
  },
});