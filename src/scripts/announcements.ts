// Annonces d'albums et d'EP sans fiche (table announcements, supabase/announcements.sql) : lecture, affichage,
// signalement par un membre. Utilisé par « À venir », la fiche artiste et la page /annonces.
import { BASE, coverHtml, escapeHtml, requireSession, supabase } from './social';

export type Precision = 'day' | 'month' | 'season' | 'year' | 'soon';
export type Announcement = {
  id: string;
  title: string | null;
  kind: 'album' | 'ep';
  release_date: string | null;
  date_precision: Precision;
  source: string;
  source_url: string;
  note: string | null;
  cover_url: string | null;
  status: string;
  created_at: string;
  artist: { id: string; name: string; slug: string; image_url: string | null } | null;
  author?: { username: string; display_name: string } | null; // membre qui l'a signalée (file à valider)
};

export const ANNOUNCEMENT_FIELDS = 'id, title, kind, release_date, date_precision, source, source_url, note, cover_url, status, created_at, artist:artists(id, name, slug, image_url)';
export const PRECISIONS: [Precision, string][] = [
  ['day', 'Jour exact'],
  ['month', 'Mois'],
  ['season', 'Saison'],
  ['year', 'Année'],
  ['soon', 'Date inconnue'],
];

const SEASONS = ['en hiver', 'en hiver', 'au printemps', 'au printemps', 'au printemps', 'en été', 'en été', 'en été', 'en automne', 'en automne', 'en automne', 'en hiver'];
const todayIso = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });

// « Sortie le 12 mars », « Prévu en mars 2027 », « Prévu au printemps 2027 », « Prévu en 2027 », « Date à venir »
export function announceWhen(a: Pick<Announcement, 'release_date' | 'date_precision'>): string {
  if (!a.release_date || a.date_precision === 'soon') return 'Date à venir';
  const d = new Date(`${a.release_date}T12:00:00`);
  if (a.date_precision === 'day') return `Sortie le ${d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}`;
  if (a.date_precision === 'month') return `Prévu en ${d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}`;
  if (a.date_precision === 'season') return `Prévu ${SEASONS[d.getMonth()]} ${d.getFullYear()}`;
  return `Prévu en ${d.getFullYear()}`;
}

// Compte à rebours seulement avec une date exacte : « J-12 », « Demain », « Aujourd'hui »
export function countdown(a: Pick<Announcement, 'release_date' | 'date_precision'>): string | null {
  if (a.date_precision !== 'day' || !a.release_date) return null;
  const days = Math.round((Date.parse(`${a.release_date}T12:00:00`) - Date.parse(`${todayIso()}T12:00:00`)) / 86_400_000);
  return days > 1 ? `J-${days}` : days === 1 ? 'Demain' : days === 0 ? 'Aujourd’hui' : null;
}

// Encore d'actualité : pas une date exacte déjà passée, pas un mois ou une année déjà finis
export function stillAhead(a: Pick<Announcement, 'release_date' | 'date_precision'>): boolean {
  if (!a.release_date || a.date_precision === 'soon') return true;
  const today = todayIso();
  if (a.date_precision === 'day') return a.release_date >= today;
  if (a.date_precision === 'year') return a.release_date.slice(0, 4) >= today.slice(0, 4);
  const months = a.date_precision === 'season' ? 3 : 1;
  const end = new Date(`${a.release_date}T12:00:00`);
  end.setMonth(end.getMonth() + months);
  return end.toISOString().slice(0, 10) > today;
}

// Tri : les dates exactes les plus proches d'abord, puis les mois, les saisons, les années, et « Date à venir »
const ORDER: Record<Precision, number> = { day: 0, month: 1, season: 2, year: 3, soon: 4 };
export const byWhen = (a: Announcement, b: Announcement) =>
  (a.release_date ?? '9999').localeCompare(b.release_date ?? '9999') || ORDER[a.date_precision] - ORDER[b.date_precision];

export async function publishedAnnouncements(artistId?: string): Promise<Announcement[]> {
  if (!supabase) return [];
  let q = supabase.from('announcements').select(ANNOUNCEMENT_FIELDS).eq('status', 'published').limit(200);
  if (artistId) q = q.eq('artist_id', artistId);
  const { data, error } = await q;
  if (error) return []; // table absente : SQL pas encore lancé
  return ((data ?? []) as unknown as Announcement[]).filter(stillAhead).sort(byWhen);
}

const recordLabel = (a: Announcement) => (a.kind === 'ep' ? 'EP annoncé' : 'Album annoncé');

// Carte d'annonce : vers la fiche de l'artiste (« À venir ») ou vers la source (fiche artiste)
export function announcementCardHtml(a: Announcement, options: { toSource?: boolean } = {}): string {
  const title = a.title ?? (a.kind === 'ep' ? 'Nouvel EP' : 'Nouvel album');
  const href = options.toSource ? a.source_url : `${BASE}artiste?a=${encodeURIComponent(a.artist?.slug ?? '')}`;
  const badge = countdown(a);
  return `<a class="bz-ctile bz-announce" href="${escapeHtml(href)}"${options.toSource ? ' target="_blank" rel="noopener"' : ''}>
    ${coverHtml(title, a.cover_url ?? a.artist?.image_url ?? null)}
    <span class="bz-ctile-row"><b>${escapeHtml(title)}</b>${badge ? `<span class="bz-score">${escapeHtml(badge)}</span>` : ''}</span>
    <span class="bz-ctile-sub">${options.toSource ? recordLabel(a) : `${escapeHtml(a.artist?.name ?? '')} · ${recordLabel(a)}`}</span>
    <span class="bz-reason">${escapeHtml(announceWhen(a))}</span>
  </a>`;
}

// Date enregistrée selon la précision : premier jour du mois (ou du début de saison) ou de l'année
export function normalizeDate(date: string, precision: Precision): string | null {
  if (precision === 'soon' || !date) return null;
  if (precision === 'day') return date;
  if (precision === 'year') return `${date.slice(0, 4)}-01-01`;
  return `${date.slice(0, 7)}-01`;
}

// Un membre signale une annonce : elle attend la validation d'Alban
export async function suggestAnnouncement(input: { artistId: string; title: string; kind: 'album' | 'ep'; date: string; precision: Precision; sourceUrl: string; note: string }) {
  const session = await requireSession();
  if (!session || !supabase) return;
  if (!/^https?:\/\/\S+\.\S+/.test(input.sourceUrl)) throw new Error('Ajoute le lien où l’annonce a été faite (post, article, vidéo…).');
  if (input.precision !== 'soon' && !input.date) throw new Error('Choisis une date, ou « Date inconnue ».');
  const { error } = await supabase.from('announcements').insert({
    artist_id: input.artistId,
    title: input.title.trim() || null,
    kind: input.kind,
    release_date: normalizeDate(input.date, input.precision),
    date_precision: input.precision,
    source: 'member',
    source_url: input.sourceUrl.trim(),
    note: input.note.trim() || null,
    status: 'pending',
    created_by: session.user.id,
  });
  if (error) throw error;
}
