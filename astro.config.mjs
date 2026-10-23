import { defineConfig } from 'astro/config';
import react from '@astrojs/react';

export default defineConfig({
  site: 'https://albannnnnnnnnn.github.io/BARZ-/',
  base: '/BARZ-/',
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