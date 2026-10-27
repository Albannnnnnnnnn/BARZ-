import { defineConfig } from 'astro/config';
import { loadEnv } from 'vite';

// Le navigateur a besoin de l'URL Supabase et de la clé anon (publique, protégée par les règles RLS)
// pour la connexion et les fonctions sociales. Jamais la clé service_role.
const env = { ...loadEnv(process.env.NODE_ENV ?? 'production', process.cwd(), ''), ...process.env };

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
    define: {
      'import.meta.env.PUBLIC_SUPABASE_URL': JSON.stringify(env.SUPABASE_URL ?? ''),
      'import.meta.env.PUBLIC_SUPABASE_ANON_KEY': JSON.stringify(env.SUPABASE_ANON_KEY ?? ''),
    },
    css: {
      preprocessorOptions: {
        css: {
          charset: false,
        },
      },
    },
  },
});
