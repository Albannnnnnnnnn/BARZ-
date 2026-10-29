// Fonctions sociales côté navigateur : compte, spin list, écoutés, Barz, j'aime.
// Le site est statique : tout ce qui dépend de l'utilisateur est lu et écrit ici, directement
// dans Supabase avec la clé anon. Les règles RLS (supabase/social.sql) protègent les données.
import { createClient, type Session } from '@supabase/supabase-js';
import { featLabel } from '../lib/feat';
import { formatAudience } from '../lib/audience';

export const BASE = '/BARZ-/';

const url = import.meta.env.PUBLIC_SUPABASE_URL as string;
const anonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY as string;

export const supabase = url && anonKey ? createClient(url, anonKey, { auth: { persistSession: true, autoRefreshToken: true } }) : null;

export type Profile = {
  id: string;
  username: string;
  display_name: string;
  bio: string | null;
  created_at: string;
  favorite_genres?: string[];
  onboarded?: boolean;
  lastfm_username?: string | null;
  share_listening?: boolean;
  avatar_path?: string | null;
};
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
  profile: Pick<Profile, 'username' | 'display_name' | 'avatar_path'> | null;
  release: ReleaseLite | null;
  likes: { user_id: string }[];
  replies: BarzReply[];
};
export type BarzReply = {
  id: string;
  barz_id: string;
  user_id: string;
  body: string;
  created_at: string;
  profile: Pick<Profile, 'username' | 'display_name'> | null;
};

const RELEASE_LITE = 'id, title, slug, cover_url, genres, release_type, artist:artists!artist_id(name)';
const BARZ_FIELDS = `id, score, body, created_at, user_id, profile:profiles!barz_user_id_fkey(username, display_name, avatar_path), release:releases(${RELEASE_LITE}), likes:barz_likes(user_id)`;

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

// Texte lisible pour n'importe quelle erreur (les erreurs Supabase ne sont pas des Error)
export function errorText(err: unknown): string {
  const message = (err as { message?: unknown })?.message;
  return authErrorMessage(typeof message === 'string' ? message : String(err));
}

// Traduction des erreurs d'authentification les plus courantes
export function authErrorMessage(message: string): string {
  if (/invalid login credentials/i.test(message)) return 'E-mail ou mot de passe incorrect.';
  if (/email not confirmed/i.test(message)) return 'Confirme d’abord ton adresse e-mail (lien reçu par mail).';
  if (/already registered/i.test(message)) return 'Un compte existe déjà avec cet e-mail : connecte-toi.';
  if (/password.*(6|characters|short)/i.test(message)) return 'Le mot de passe doit faire au moins 6 caractères.';
  if (/rate limit/i.test(message)) return 'Trop de tentatives, réessaie dans quelques minutes.';
  if (/signups? (are|is) (disabled|not allowed)/i.test(message)) return 'Les inscriptions sont fermées pour le moment.';
  if (/relation .* does not exist|schema cache|column .* does not exist/i.test(message)) return 'Il manque des tables dans Supabase : exécute supabase/social.sql puis supabase/discovery.sql.';
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

export async function barzFeed(options: { releaseId?: string; userId?: string; limit?: number; replies?: boolean } = {}): Promise<Barz[]> {
  if (!supabase) return [];
  let query = supabase.from('barz').select(BARZ_FIELDS).order('created_at', { ascending: false }).limit(options.limit ?? 30);
  if (options.releaseId) query = query.eq('release_id', options.releaseId);
  if (options.userId) query = query.eq('user_id', options.userId);
  const barz = ((must(await query) ?? []) as unknown as Barz[]).map((b) => ({ ...b, replies: [] as BarzReply[] }));
  if (options.replies === false || !barz.length) return barz;
  // Réponses lues à part : sans la table (supabase/barz-replies.sql), les Barz s'affichent quand même
  const { data } = await supabase
    .from('barz_replies')
    .select('id, barz_id, user_id, body, created_at, profile:profiles(username, display_name)')
    .in('barz_id', barz.map((b) => b.id))
    .order('created_at');
  const byBarz = new Map(barz.map((b) => [b.id, b]));
  for (const r of (data ?? []) as unknown as BarzReply[]) byBarz.get(r.barz_id)?.replies.push(r);
  return barz;
}

export async function replyToBarz(barzId: string, body: string) {
  const session = await requireSession();
  if (!session || !supabase) return;
  must(await supabase.from('barz_replies').insert({ barz_id: barzId, user_id: session.user.id, body: body.trim().slice(0, 280) }));
}

export async function deleteReply(id: string) {
  if (!supabase) return;
  must(await supabase.from('barz_replies').delete().eq('id', id));
}

// Fils de réponses ouverts : ils restent ouverts quand la liste est redessinée (après un j'aime, une réponse…)
const openThreads = new Set<string>();

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
  const replies = b.replies ?? [];
  const open = openThreads.has(b.id);
  const repliesHtml = replies
    .map((r) => {
      const author = r.profile ? `<a href="${BASE}profil?u=${encodeURIComponent(r.profile.username)}"><b>${escapeHtml(r.profile.display_name)}</b></a>` : '<b>Membre</b>';
      const canDelete = !!myId && (myId === r.user_id || myId === b.user_id);
      return `<li>${author} <span class="barz-handle">${escapeHtml(timeAgo(r.created_at))}</span>
        <p>${escapeHtml(r.body)}</p>
        ${canDelete ? `<button type="button" class="barz-delete" data-delete-reply="${escapeHtml(r.id)}">Supprimer</button>` : ''}</li>`;
    })
    .join('');
  const thread = `<div class="barz-thread" data-thread="${escapeHtml(b.id)}"${open ? '' : ' hidden'}>
      ${repliesHtml ? `<ul class="barz-replies">${repliesHtml}</ul>` : ''}
      ${
        myId
          ? `<form class="barz-reply-form" data-reply-form="${escapeHtml(b.id)}">
              <input class="bz-input" name="reply" maxlength="280" placeholder="Ta réponse…" autocomplete="off" aria-label="Ta réponse" required />
              <button type="submit" class="bz-btn bz-btn--lime bz-btn--small">Répondre</button>
            </form>`
          : `<a class="barz-reply-login" href="${loginUrl()}">Connecte-toi pour répondre</a>`
      }
    </div>`;
  const scoreInline = options.showRelease === false ? ` · <b class="barz-score-inline">${formatScore(b.score)}</b>` : '';
  return `<article class="barz-card${release ? '' : ' barz-card--solo'}" data-barz-id="${escapeHtml(b.id)}">
    <div class="barz-body">
      <header>
        <a class="barz-avatar" href="${profileHref}">${b.profile?.avatar_path ? `<img src="${escapeHtml(avatarUrl(b.profile.avatar_path))}" alt="" loading="lazy" />` : initial}</a>
        <a href="${profileHref}"><b>${escapeHtml(name)}</b></a>
        <span class="barz-handle">${escapeHtml(handle)} · ${escapeHtml(timeAgo(b.created_at))}${scoreInline}</span>
      </header>
      <p class="barz-text">« ${escapeHtml(b.body)} »</p>
      <footer>
        <button type="button" class="barz-like${liked ? ' is-liked' : ''}" data-like="${escapeHtml(b.id)}" aria-pressed="${liked}">♥ <span>${b.likes.length}</span></button>
        <button type="button" class="barz-like" data-replies="${escapeHtml(b.id)}" aria-expanded="${open}">💬 <span>${replies.length ? replies.length : 'Répondre'}</span></button>
        ${myId && myId === b.user_id ? `<button type="button" class="barz-delete" data-delete="${escapeHtml(b.id)}">Supprimer</button>` : ''}
      </footer>
      ${thread}
    </div>
    ${release}
  </article>`;
}

// Gestion des clics "j'aime" / "répondre" / "supprimer" sur une liste de Barz
export function wireBarzActions(container: HTMLElement, onChange: () => void) {
  container.addEventListener('submit', async (event) => {
    const form = (event.target as HTMLElement).closest<HTMLFormElement>('[data-reply-form]');
    if (!form) return;
    event.preventDefault();
    const input = form.elements.namedItem('reply') as HTMLInputElement;
    if (!input.value.trim()) return;
    const button = form.querySelector('button')!;
    button.disabled = true;
    try {
      await replyToBarz(form.dataset.replyForm!, input.value);
      openThreads.add(form.dataset.replyForm!);
      onChange();
    } catch (err) {
      button.disabled = false;
      alert(errorText(err));
    }
  });

  container.addEventListener('click', async (event) => {
    const target = event.target as HTMLElement;
    const like = target.closest<HTMLButtonElement>('[data-like]');
    const del = target.closest<HTMLButtonElement>('[data-delete]');
    const toggle = target.closest<HTMLButtonElement>('[data-replies]');
    const delReply = target.closest<HTMLButtonElement>('[data-delete-reply]');
    if (toggle) {
      const id = toggle.dataset.replies!;
      const thread = container.querySelector<HTMLElement>(`[data-thread="${CSS.escape(id)}"]`);
      if (!thread) return;
      thread.hidden = !thread.hidden;
      toggle.setAttribute('aria-expanded', String(!thread.hidden));
      if (thread.hidden) openThreads.delete(id);
      else {
        openThreads.add(id);
        thread.querySelector<HTMLInputElement>('input')?.focus();
      }
      return;
    }
    try {
      if (delReply && confirm('Supprimer cette réponse ?')) {
        await deleteReply(delReply.dataset.deleteReply!);
        onChange();
      } else if (like) {
        like.disabled = true;
        await toggleLike(like.dataset.like!, like.getAttribute('aria-pressed') === 'true');
        onChange();
      } else if (del && confirm('Supprimer ce Barz ?')) {
        await deleteBarz(del.dataset.delete!);
        onChange();
      }
    } catch (err) {
      alert(errorText(err));
    }
  });
}

// ============================================================
// ARTISTES SUIVIS, GOÛTS DÉCLARÉS (supabase/discovery.sql)
// ============================================================
export type ArtistLite = { id: string; name: string; slug: string; image_url: string | null; popularity: number | null; lastfm_listeners?: number | null; genres: string[] | null };
export const ARTIST_LITE = 'id, name, slug, image_url, popularity, lastfm_listeners, genres';

export async function myFollows(): Promise<ArtistLite[]> {
  const session = await getSession();
  if (!session || !supabase) return [];
  const rows = must(await supabase.from('follows').select(`created_at, artist:artists(${ARTIST_LITE})`).eq('user_id', session.user.id).order('created_at', { ascending: false }));
  return ((rows ?? []) as any[]).map((r) => r.artist).filter(Boolean);
}

export async function setFollow(artistId: string, on: boolean) {
  const session = await requireSession();
  if (!session || !supabase) return;
  if (on) must(await supabase.from('follows').upsert({ user_id: session.user.id, artist_id: artistId }));
  else must(await supabase.from('follows').delete().eq('user_id', session.user.id).eq('artist_id', artistId));
}

export async function updateMyProfile(fields: Partial<Pick<Profile, 'display_name' | 'bio' | 'username' | 'avatar_path'>> & { favorite_genres?: string[]; onboarded?: boolean; lastfm_username?: string | null; share_listening?: boolean }) {
  const session = await requireSession();
  if (!session || !supabase) return;
  must(await supabase.from('profiles').update(fields).eq('id', session.user.id));
  profilePromise = null;
}

export function formatFans(n: number | null | undefined): string {
  if (!n) return '';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace('.0', '')} M de fans`;
  if (n >= 1_000) return `${Math.round(n / 1_000)} k fans`;
  return `${n} fans`;
}

export function slugify(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
}

// Vignette ronde d'artiste avec bouton Suivre (catalogue, accueil, fiche artiste)
export function artistCardHtml(a: ArtistLite, following: boolean, extra = ''): string {
  const photo = a.image_url
    ? `<img src="${escapeHtml(a.image_url)}" alt="" loading="lazy" />`
    : `<span class="bz-artist-initial">${escapeHtml(a.name.slice(0, 1).toUpperCase())}</span>`;
  return `<div class="bz-artist" data-artist-id="${escapeHtml(a.id)}">
    <a class="bz-artist-photo" href="${BASE}artiste?a=${encodeURIComponent(a.slug)}">${photo}</a>
    <a class="bz-artist-name" href="${BASE}artiste?a=${encodeURIComponent(a.slug)}">${escapeHtml(a.name)}</a>
    <span class="bz-artist-meta">${escapeHtml(extra || formatAudience(a))}</span>
    <button type="button" class="bz-follow${following ? ' is-on' : ''}" data-follow="${escapeHtml(a.id)}" aria-pressed="${following}">${following ? 'Suivi' : 'Suivre'}</button>
  </div>`;
}

// Gestion des boutons Suivre d'une zone de la page
export function wireFollowButtons(container: HTMLElement, onChange?: (artistId: string, on: boolean) => void) {
  container.addEventListener('click', async (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-follow]');
    if (!button) return;
    if (!(await getSession())) return void (location.href = loginUrl());
    const on = button.getAttribute('aria-pressed') !== 'true';
    const paint = (state: boolean) => {
      button.classList.toggle('is-on', state);
      button.setAttribute('aria-pressed', String(state));
      button.textContent = state ? 'Suivi' : 'Suivre';
    };
    paint(on);
    try {
      await setFollow(button.dataset.follow!, on);
      onChange?.(button.dataset.follow!, on);
    } catch (err) {
      paint(!on);
      alert(errorText(err));
    }
  });
}

const TYPE_LABELS: Record<string, string> = { album: 'Album', ep: 'EP', compilation: 'Compilation', single: 'Single', live: 'Live', remix: 'Remix', soundtrack: 'B.O.' };

// Vignette album (même rendu que AlbumTile.astro), avec une raison de reco facultative
export function releaseTileHtml(r: { title: string; slug: string; cover_url: string | null; release_type: string; artist?: { name: string } | null; featuring?: string[] }, options: { badge?: string; reason?: string } = {}): string {
  const feat = featLabel(r.featuring);
  return `<a class="bz-ctile" href="${BASE}releases/${encodeURIComponent(r.slug)}">
    ${coverHtml(r.title, r.cover_url)}
    <span class="bz-ctile-row"><b>${escapeHtml(r.title)}</b>${options.badge ? `<span class="bz-score">${escapeHtml(options.badge)}</span>` : ''}</span>
    <span class="bz-ctile-sub">${escapeHtml(r.artist?.name ?? '')}${feat ? ` ${escapeHtml(feat)}` : ''}${TYPE_LABELS[r.release_type] ? ` · ${TYPE_LABELS[r.release_type]}` : ''}</span>
    ${options.reason ? `<span class="bz-reason">${escapeHtml(options.reason)}</span>` : ''}
  </a>`;
}

// ============================================================
// AMIS (supabase/friends.sql) : demande, puis acceptation
// ============================================================
export type FriendStatus = 'none' | 'sent' | 'received' | 'friends';
export type Friendship = { requester_id: string; addressee_id: string; status: 'pending' | 'accepted'; created_at: string };
export type FriendEntry = { profile: Pick<Profile, 'id' | 'username' | 'display_name' | 'avatar_path' | 'bio'>; status: FriendStatus; since: string };

const pairFilter = (a: string, b: string) => `and(requester_id.eq.${a},addressee_id.eq.${b}),and(requester_id.eq.${b},addressee_id.eq.${a})`;

export async function friendStatusWith(otherId: string): Promise<FriendStatus> {
  const session = await getSession();
  if (!session || !supabase) return 'none';
  const row = must(await supabase.from('friendships').select('requester_id, status').or(pairFilter(session.user.id, otherId)).maybeSingle()) as Pick<Friendship, 'requester_id' | 'status'> | null;
  if (!row) return 'none';
  if (row.status === 'accepted') return 'friends';
  return row.requester_id === session.user.id ? 'sent' : 'received';
}

export async function sendFriendRequest(otherId: string) {
  const session = await requireSession();
  if (!session || !supabase) return;
  must(await supabase.from('friendships').insert({ requester_id: session.user.id, addressee_id: otherId }));
}

export async function acceptFriendRequest(requesterId: string) {
  const session = await requireSession();
  if (!session || !supabase) return;
  must(await supabase.from('friendships').update({ status: 'accepted', accepted_at: new Date().toISOString() }).eq('requester_id', requesterId).eq('addressee_id', session.user.id));
}

// Refuser, annuler une demande ou retirer un ami
export async function removeFriendship(otherId: string) {
  const session = await requireSession();
  if (!session || !supabase) return;
  must(await supabase.from('friendships').delete().or(pairFilter(session.user.id, otherId)));
}

// Mes amis et demandes en cours, avec le profil de l'autre personne
export async function myFriendships(): Promise<FriendEntry[]> {
  const session = await getSession();
  if (!session || !supabase) return [];
  const me = session.user.id;
  const rows = must(
    await supabase
      .from('friendships')
      .select('requester_id, addressee_id, status, created_at, requester:profiles!friendships_requester_id_fkey(id, username, display_name, avatar_path, bio), addressee:profiles!friendships_addressee_id_fkey(id, username, display_name, avatar_path, bio)')
      .or(`requester_id.eq.${me},addressee_id.eq.${me}`)
      .order('created_at', { ascending: false })
  ) as any[];
  return rows
    .map((r) => {
      const mine = r.requester_id === me;
      const status: FriendStatus = r.status === 'accepted' ? 'friends' : mine ? 'sent' : 'received';
      return { profile: mine ? r.addressee : r.requester, status, since: r.created_at };
    })
    .filter((f) => f.profile);
}

// Recherche d'un membre par pseudo ou nom affiché
export async function searchMembers(query: string): Promise<Pick<Profile, 'id' | 'username' | 'display_name' | 'bio'>[]> {
  if (!supabase) return [];
  const q = query.trim().replace(/^@/, '').replace(/[%_,()]/g, '');
  if (q.length < 2) return [];
  return must(await supabase.from('profiles').select('id, username, display_name, bio').or(`username.ilike.%${q}%,display_name.ilike.%${q}%`).limit(8)) as any[];
}

// ============================================================
// PHOTO DE PROFIL (supabase/avatars.sql) : espace public « avatars », un dossier par membre
// ============================================================
const AVATAR_SIZE = 400;

export function avatarUrl(path: string): string {
  return `${url}/storage/v1/object/public/avatars/${path}`;
}

// Recadre au centre en carré de 400 px et convertit en WebP (ce qui retire aussi les métadonnées, GPS compris)
async function squareWebp(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = AVATAR_SIZE;
  canvas.getContext('2d')!.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.85));
  if (!blob) throw new Error('Impossible de préparer cette image.');
  return blob;
}

export async function uploadAvatar(file: File): Promise<string> {
  const session = await requireSession();
  if (!session || !supabase) throw new Error('Connecte-toi pour changer ta photo.');
  if (!file.type.startsWith('image/')) throw new Error('Choisis une image (JPG, PNG ou WebP).');
  if (file.size > 15 * 1024 * 1024) throw new Error('Image trop lourde (15 Mo maximum).');
  const blob = await squareWebp(file);
  const path = `${session.user.id}/avatar-${Date.now()}.webp`;
  must(await supabase.storage.from('avatars').upload(path, blob, { contentType: 'image/webp', cacheControl: '31536000' }));
  const previous = (await getMyProfile())?.avatar_path;
  await updateMyProfile({ avatar_path: path });
  if (previous) await supabase.storage.from('avatars').remove([previous]);
  return path;
}

export async function removeAvatar() {
  const previous = (await getMyProfile())?.avatar_path;
  await updateMyProfile({ avatar_path: null });
  if (previous && supabase) await supabase.storage.from('avatars').remove([previous]);
}
