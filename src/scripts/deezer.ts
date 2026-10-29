// Deezer côté navigateur : relier son profil pour importer ses artistes favoris (fonction Supabase « deezer »).
// Deezer n'accepte plus de nouvelles applis : pas de connexion, seulement les favoris publics du profil.
import { supabase } from './social';

export type DeezerImport = { linked: boolean; favorites?: number; matched?: number };

async function call(body: Record<string, unknown>): Promise<DeezerImport> {
  if (!supabase) throw new Error('Supabase n’est pas configuré.');
  const { data, error } = await supabase.functions.invoke('deezer', { body });
  if (error) {
    // Message d'erreur renvoyé par la fonction, s'il y en a un
    const detail = await (error as { context?: Response }).context?.json?.().catch(() => null);
    throw new Error(detail?.error ?? error.message);
  }
  return data as DeezerImport;
}

export const deezerLink = (profile: string) => call({ action: 'link', profile });
export const deezerRefresh = () => call({ action: 'refresh' });
export const deezerUnlink = () => call({ action: 'unlink' });
