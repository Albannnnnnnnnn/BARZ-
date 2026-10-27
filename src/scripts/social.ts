// Fonctions sociales côté navigateur : compte, spin list, écoutés, Barz, j'aime.
// Le site est statique : tout ce qui dépend de l'utilisateur est lu et écrit ici, directement
// dans Supabase avec la clé anon. Les règles RLS (supabase/social.sql) protègent les données.
import { createClient, type Session } from '@supabase/supabase-js';

export const BASE = '/BARZ-/';

const url = import.meta.env.PUBLIC_SUPABASE_URL as string;
const anonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY as string;

export const supabase = url && anonKey ? createClient(url, anonKey, { auth: { persistSession: true, autoRefreshToken: true } }) : null;

export type Profile = { id: string; username: string; display_name: string; bio: string | null; created_at: string };
export type ReleaseLite = {
  id: string;
  title: string;
  slug: string;
  cover_url: string | null;
  genres: string[] | null;
  release_type: string;
  artist: { name: string } | null;
};
export type Barz = {
  id: string;
  score: number;
  body: string;
  created_at: string;
  user_id: string;
  profile: Pick<Profile, 'username' | 'display_name'> | null;
  release: ReleaseLite | null;
  likes: { user_id: string }[];
};

const RELEASE_LITE = 'id, title, slug, cover_url, genres, release_type, artist:artists!artist_id(name)';
const BARZ_FIELDS = `id, score, body, created_at, user_id, profile:profiles!barz_user_id_fkey(username, display_name), release:releases(${RELEASE_LITE}), likes:barz_likes(user_id)`;

function must<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

// ============================================================
// AFFICHAGE
// ============================================================
export function escapeHtml(text: unknown): string {
  return String(text ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

const PALETTES = [
  ['#d9b56a', '#4f6b3f', '#12382d'],
  ['#f0553a', '#8a2a4f', '#2a1446'],
  ['#2f6bff', '#9be3a0', '#e4ff5c'],
  ['#e7a3c5', '#a4506e', '#5d1a2a'],
  ['#ff3b55', '#a0172e', '#1a0a0e'],
  ['#c9d3dc', '#59677a', '#1c232c'],
  ['#7fd6c4', '#3b6a8a', '#2c2a6b'],
  ['#f6a33a', '#e0533b', '#a0257a'],
];

// Même rendu que le composant Cover.astro, pour les contenus affichés par le navigateur
export function coverHtml(title: string, src: string | null): string {
  if (src) return `<div class="bz-cover"><img src="${escapeHtml(src)}" alt="" loading="lazy" /></div>`;
  let hash = 0;
  for (const ch of title) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const [c1, c2, c3] = PALETTES[hash % PALETTES.length];
  return `<div class="bz-cover" style="--c1:${c1};--c2:${c2};--c3:${c3}"><span>${escapeHtml(title)}</span></div>`;
}

export function timeAgo(iso: string): string {
  const minutes = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (minutes < 1) return 'à l’instant';
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.round(hours / 24);
  return days < 30 ? `il y a ${days} j` : new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

export const formatScore = (score: number) => Number(score).toFixed(1);

// ============================================================
// COMPTE
// ============================================================
let sessionPromise: Promise<Session | null> | null = null;
let profilePromise: Promise<Profile | null> | null = null;

export function getSession(): Promise<Session | null> {
  if (!supabase) return Promise.resolve(null);
  sessionPromise ??= supabase.auth.getSession().then(({ data }) => data.session);
  return sessionPromise;
}

export function getMyProfile(): Promise<Profile | null> {
  profilePromise ??= getSession().then(async (session) => {
    if (!session || !supabase) return null;
    const { data } = await supabase.from('profiles').select('*').eq('id', session.user.id).maybeSingle();
    return (data as Profile | null) ?? null;
  });
  return profilePromise;
}

export function loginUrl(): string {
  return `${BASE}connexion?next=${encodeURIComponent(location.pathname + location.search)}`;
}

export async function requireSession(): Promise<Session | null> {
  const session = await getSession();
  if (!session) location.href = loginUrl();
  return session;
}

export async function signOut() {
  await supabase?.auth.signOut();
  location.href = BASE;
}

// Traduction des erreurs d'authentification les plus courantes
export function authErrorMessage(message: string): string {
  if (/invalid login credentials/i.test(message)) return 'E-mail ou mot de passe incorrect.';
  if (/email not confirmed/i.test(message)) return 'Confirme d’abord ton adresse e-mail (lien reçu par mail).';
  if (/already registered/i.test(message)) return 'Un compte existe déjà avec cet e-mail : connecte-toi.';
  if (/password.*(6|characters|short)/i.test(message)) return 'Le mot de passe doit faire au moins 6 caractères.';
  if (/rate limit/i.test(message)) return 'Trop de tentatives, réessaie dans quelques minutes.';
  if (/signups? (are|is) (disabled|not allowed)/i.test(message)) return 'Les inscriptions sont fermées pour le moment.';
  if (/relation .* does not exist|schema cache/i.test(message)) return 'Les tables sociales n’existent pas encore dans Supabase (voir supabase/social.sql).';
  return message;
}

// ============================================================
// SPIN LIST, ÉCOUTÉS
// ============================================================
export type Shelf = 'spin_list' | 'listened';

export async function isOnShelf(shelf: Shelf, releaseId: string): Promise<boolean> {
  const session = await getSession();
  if (!session || !supabase) return false;
  const { count } = await supabase.from(shelf).select('*', { count: 'exact', head: true }).eq('user_id', session.user.id).eq('release_id', releaseId);
  return (count ?? 0) > 0;
}

export async function setOnShelf(shelf: Shelf, releaseId: string, on: boolean) {
  const session = await requireSession();
  if (!session || !supabase) return;
  if (on) must(await supabase.from(shelf).upsert({ user_id: session.user.id, release_id: releaseId }));
  else must(await supabase.from(shelf).delete().eq('user_id', session.user.id).eq('release_id', releaseId));
}

export async function shelfOf(shelf: Shelf, userId: string): Promise<{ created_at: string; release: ReleaseLite }[]> {
  if (!supabase) return [];
  const rows = must(await supabase.from(shelf).select(`created_at, release:releases(${RELEASE_LITE})`).eq('user_id', userId).order('created_at', { ascending: false }));
  return ((rows ?? []) as any[]).filter((r) => r.release);
}

// ============================================================
// BARZ
// ============================================================
export async function saveBarz(releaseId: string, score: number, body: string) {
  const session = await requireSession();
  if (!session || !supabase) return;
  must(
    await supabase
      .from('barz')
      .upsert({ user_id: session.user.id, release_id: releaseId, score, body: body.trim(), created_at: new Date().toISOString() }, { onConflict: 'user_id,release_id' })
  );
}

export async function deleteBarz(id: string) {
  if (!supabase) return;
  must(await supabase.from('barz').delete().eq('id', id));
}

export async function barzFeed(options: { releaseId?: string; userId?: string; limit?: number } = {}): Promise<Barz[]> {
  if (!supabase) return [];
  let query = supabase.from('barz').select(BARZ_FIELDS).order('created_at', { ascending: false }).limit(options.limit ?? 30);
  if (options.releaseId) query = query.eq('release_id', options.releaseId);
  if (options.userId) query = query.eq('user_id', options.userId);
  return (must(await query) ?? []) as unknown as Barz[];
}

export async function toggleLike(barzId: string, liked: boolean) {
  const session = await requireSession();
  if (!session || !supabase) return;
  if (liked) must(await supabase.from('barz_likes').delete().eq('user_id', session.user.id).eq('barz_id', barzId));
  else must(await supabase.from('barz_likes').insert({ user_id: session.user.id, barz_id: barzId }));
}

// Carte d'un Barz, partagée par la Communauté, les fiches et les profils
export function barzCardHtml(b: Barz, myId: string | null, options: { showRelease?: boolean } = {}): string {
  const liked = !!myId && b.likes.some((l) => l.user_id === myId);
  const name = b.profile?.display_name ?? 'Membre';
  const handle = b.profile ? `@${b.profile.username}` : '';
  const initial = escapeHtml(name.slice(0, 1).toUpperCase());
  const profileHref = b.profile ? `${BASE}profil?u=${encodeURIComponent(b.profile.username)}` : '#';
  const release = options.showRelease !== false && b.release
    ? `<a class="barz-album" href="${BASE}releases/${encodeURIComponent(b.release.slug)}">
        ${coverHtml(b.release.title, b.release.cover_url)}
        <span class="barz-album-row"><b>${escapeHtml(b.release.title)}</b><span class="bz-score">${formatScore(b.score)}</span></span>
      </a>`
    : '';
  const scoreInline = options.showRelease === false ? ` · <b class="barz-score-inline">${formatScore(b.score)}</b>` : '';
  return `<article class="barz-card${release ? '' : ' barz-card--solo'}" data-barz-id="${escapeHtml(b.id)}">
    <div class="barz-body">
      <header>
        <a class="barz-avatar" href="${profileHref}">${initial}</a>
        <a href="${profileHref}"><b>${escapeHtml(name)}</b></a>
        <span class="barz-handle">${escapeHtml(handle)} · ${escapeHtml(timeAgo(b.created_at))}${scoreInline}</span>
      </header>
      <p class="barz-text">« ${escapeHtml(b.body)} »</p>
      <footer>
        <button type="button" class="barz-like${liked ? ' is-liked' : ''}" data-like="${escapeHtml(b.id)}" aria-pressed="${liked}">♥ <span>${b.likes.length}</span></button>
        ${myId && myId === b.user_id ? `<button type="button" class="barz-delete" data-delete="${escapeHtml(b.id)}">Supprimer</button>` : ''}
      </footer>
    </div>
    ${release}
  </article>`;
}

// Gestion des clics "j'aime" / "supprimer" sur une liste de Barz
export function wireBarzActions(container: HTMLElement, onChange: () => void) {
  container.addEventListener('click', async (event) => {
    const target = event.target as HTMLElement;
    const like = target.closest<HTMLButtonElement>('[data-like]');
    const del = target.closest<HTMLButtonElement>('[data-delete]');
    try {
      if (like) {
        like.disabled = true;
        await toggleLike(like.dataset.like!, like.getAttribute('aria-pressed') === 'true');
        onChange();
      } else if (del && confirm('Supprimer ce Barz ?')) {
        await deleteBarz(del.dataset.delete!);
        onChange();
      }
    } catch (err) {
      alert(authErrorMessage(err instanceof Error ? err.message : String(err)));
    }
  });
}
