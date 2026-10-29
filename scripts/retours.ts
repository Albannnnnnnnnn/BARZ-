// Retours des membres à traiter (supabase/feedback.sql), du plus ancien au plus récent
//
//   npm run retours          → retours reçus ou prévus
//   npm run retours -- tous  → tous les retours
//
// Le statut se change sur la page /retours, connecté avec le compte d'Alban.
import { supabase } from './lib/common';

const KINDS: Record<string, string> = { bug: '🐞 Bug', idee: '💡 Idée', remarque: '💬 Remarque' };
const STATUSES: Record<string, string> = { nouveau: 'reçu', prevu: 'prévu', fait: 'fait', ecarte: 'écarté' };

async function main() {
  const all = process.argv.includes('tous');
  let query = supabase.from('feedback').select('kind, body, page, status, created_at, author:profiles(username)').order('created_at').limit(500);
  if (!all) query = query.in('status', ['nouveau', 'prevu']);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const items = (data ?? []) as unknown as { kind: string; body: string; page: string | null; status: string; created_at: string; author: { username: string } | null }[];
  if (!items.length) return console.log(all ? 'Aucun retour pour l’instant.' : 'Aucun retour à traiter.');

  for (const item of items) {
    const date = new Date(item.created_at).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'short', timeStyle: 'short' });
    const who = item.author ? `@${item.author.username}` : 'sans compte';
    console.log(`\n${KINDS[item.kind] ?? item.kind} · ${STATUSES[item.status] ?? item.status} · ${date} · ${who}${item.page ? ` · ${item.page}` : ''}`);
    console.log(item.body);
  }
  console.log(`\n${items.length} retour${items.length > 1 ? 's' : ''}.`);
}

main().catch((err) => {
  console.error('❌', err instanceof Error ? err.message : err);
  process.exit(1);
});
