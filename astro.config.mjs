import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://albannnnnnnnnn.github.io/BARZ-/',
  base: '/BARZ-/',
  output: 'static',
  adapter: undefined,
  compressHTML: true,
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