// Spotify côté navigateur : connexion (OAuth PKCE) et écoute en direct.
// Le navigateur ne voit jamais les jetons : il passe le code OAuth à la fonction Supabase « spotify »
// (supabase/functions/spotify), qui les garde et interroge Spotify.
import { BASE, escapeHtml, supabase } from './social';

const CLIENT_ID = import.meta.env.PUBLIC_SPOTIFY_CLIENT_ID as string;
const SCOPES = 'user-read-currently-playing user-read-playback-state';
const PENDING_KEY = 'barz-spotify-pending';

export type NowPlaying = { playing: boolean; title?: string; artists?: string; album?: string; image?: string | null; url?: string | null; progressMs?: number; durationMs?: number };

export const spotifyAvailable = () => !!CLIENT_ID && !!supabase;
const redirectUri = () => `${location.origin}${BASE}spotify`;

const base64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const randomString = (size: number) => base64url(crypto.getRandomValues(new Uint8Array(size)));

// Étape 1 : vers la page d'autorisation de Spotify
export async function startSpotifyLogin(next = `${BASE}profil`) {
  const verifier = randomString(48);
  const state = randomString(16);
  const challenge = base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
  sessionStorage.setItem(PENDING_KEY, JSON.stringify({ verifier, state, next }));
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: 'code',
    redirect_uri: redirectUri(),
    code_challenge_method: 'S256',
    code_challenge: challenge,
    state,
    scope: SCOPES,
  });
  location.href = `https://accounts.spotify.com/authorize?${params}`;
}

async function call<T>(body: Record<string, unknown>): Promise<T> {
  if (!supabase) throw new Error('Supabase n’est pas configuré.');
  const { data, error } = await supabase.functions.invoke('spotify', { body });
  if (error) {
    // Message d'erreur renvoyé par la fonction, s'il y en a un
    const detail = await (error as { context?: Response }).context?.json?.().catch(() => null);
    throw new Error(detail?.error ?? error.message);
  }
  return data as T;
}

// Étape 2 : retour de Spotify sur /spotify?code=…&state=…
export async function finishSpotifyLogin(): Promise<{ next: string }> {
  const params = new URLSearchParams(location.search);
  const pending = JSON.parse(sessionStorage.getItem(PENDING_KEY) ?? 'null') as { verifier: string; state: string; next: string } | null;
  sessionStorage.removeItem(PENDING_KEY);
  if (params.get('error')) throw new Error(params.get('error') === 'access_denied' ? 'Connexion Spotify annulée.' : `Spotify : ${params.get('error')}`);
  if (!pending || pending.state !== params.get('state') || !params.get('code')) throw new Error('La connexion a expiré, recommence depuis ton profil.');
  await call({ action: 'connect', code: params.get('code'), verifier: pending.verifier, redirectUri: redirectUri() });
  return { next: pending.next };
}

export const spotifyStatus = () => call<{ connected: boolean; name: string | null }>({ action: 'status' });
export const spotifyDisconnect = () => call<{ connected: false }>({ action: 'disconnect' });

// Ce qu'écoutent ces membres (la fonction ne répond que pour soi-même et les amis qui partagent)
export async function nowPlaying(userIds: string[]): Promise<Record<string, NowPlaying | null>> {
  if (!spotifyAvailable() || !userIds.length) return {};
  return (await call<{ listening: Record<string, NowPlaying | null> }>({ action: 'now-playing', userIds })).listening ?? {};
}

// Carte « En écoute » (profil)
export function nowPlayingHtml(np: NowPlaying, label: string): string {
  const cover = np.image ? `<img src="${escapeHtml(np.image)}" alt="" />` : '<span class="np-cover-empty"></span>';
  const progress = np.durationMs ? Math.min(100, Math.round(((np.progressMs ?? 0) / np.durationMs) * 100)) : 0;
  const inner = `${cover}
    <span class="np-text">
      <span class="np-label">${np.playing ? '<span class="np-dot" aria-hidden="true"></span>' : ''}${escapeHtml(label)}</span>
      <b>${escapeHtml(np.title ?? '')}</b>
      <span>${escapeHtml(np.artists ?? '')}</span>
      ${np.playing ? `<span class="np-bar"><span style="width:${progress}%"></span></span>` : ''}
    </span>`;
  return np.url ? `<a class="np" href="${escapeHtml(np.url)}" target="_blank" rel="noopener">${inner}</a>` : `<div class="np">${inner}</div>`;
}
