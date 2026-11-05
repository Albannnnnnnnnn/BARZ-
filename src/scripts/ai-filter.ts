// Case « Masquer les artistes IA » : préférence gardée dans le navigateur, liste lue via ai_artist_ids (supabase/ai-flags.sql)
import { supabase } from './social';

const PREF = 'barz-hide-ai';

export function hideAiPref(): boolean {
  try {
    return localStorage.getItem(PREF) === '1';
  } catch {
    return false;
  }
}

export function setHideAiPref(on: boolean) {
  try {
    localStorage.setItem(PREF, on ? '1' : '0');
  } catch {
    /* navigation privée : la case marche quand même pour la page */
  }
}

let cache: Promise<Set<string>> | null = null;
export function aiArtistIds(): Promise<Set<string>> {
  cache ??= (async () => {
    if (!supabase) return new Set<string>();
    const { data, error } = await supabase.rpc('ai_artist_ids' as never);
    if (error) return new Set<string>(); // script SQL pas encore lancé : rien à masquer
    return new Set(((data ?? []) as unknown[]).map((row) => String(typeof row === 'object' && row ? Object.values(row)[0] : row)));
  })();
  return cache;
}

// Relie une case à cocher : coche selon la préférence, et rappelle onChange avec la liste à masquer (vide si décochée)
export function wireAiToggle(input: HTMLInputElement | null, onChange: (hidden: Set<string>) => void) {
  if (!input) return;
  input.checked = hideAiPref();
  const run = async () => onChange(input.checked ? await aiArtistIds() : new Set());
  input.addEventListener('change', () => {
    setHideAiPref(input.checked);
    run();
  });
  if (input.checked) run();
}
