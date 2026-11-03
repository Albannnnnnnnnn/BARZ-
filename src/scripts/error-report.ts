// Relevé des erreurs JavaScript des membres : envoyées à la fonction notify (action « client-error »), qui les poste
// dans le salon privé #alertes du Discord. Seulement les erreurs du code de BARZ¡ (pas celles des extensions du
// navigateur), 3 au plus par page et une seule fois chacune.
import { supabase } from './social';

const MAX_PER_PAGE = 3;
const IGNORED = [/ResizeObserver loop/, /^Script error\.?$/, /Load failed/, /Failed to fetch/, /NetworkError/, /AbortError/];
const sent = new Set<string>();

function report(message: string, source: string, stack: string) {
  if (!supabase || !message || sent.size >= MAX_PER_PAGE || sent.has(message)) return;
  if (IGNORED.some((re) => re.test(message))) return;
  // Fichier d'un autre site (extension, script tiers) : pas notre erreur
  if (source && !source.startsWith(location.origin)) return;
  sent.add(message);
  supabase.functions
    .invoke('notify', {
      body: {
        action: 'client-error',
        message,
        source,
        stack,
        page: location.pathname + location.search,
        device: navigator.userAgent,
        version: document.getElementById('update-banner')?.dataset.version ?? '',
      },
    })
    .catch(() => {});
}

window.addEventListener('error', (event) => {
  report(String(event.message ?? ''), event.filename ? `${event.filename}:${event.lineno}:${event.colno}` : '', String(event.error?.stack ?? ''));
});
window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason;
  const message = reason instanceof Error ? reason.message : String(reason ?? '');
  report(`Promesse rejetée : ${message}`, '', reason instanceof Error ? String(reason.stack ?? '') : '');
});
