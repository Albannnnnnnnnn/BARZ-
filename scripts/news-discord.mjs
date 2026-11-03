// Annonce Discord des Nouveautés, lancé par le déploiement après le build : compare la dernière entrée construite
// (dist/news.json) à celle encore en ligne. Si elle est nouvelle, écrit le message du webhook dans la sortie
// « payload » du job ; le job de déploiement l'envoie une fois le site en ligne. Sinon, n'écrit rien.
import { appendFileSync, readFileSync } from 'node:fs';

const SITE = 'https://albannnnnnnnnn.github.io/BARZ-/';
const ACCENT = 0x3d5afe;

const built = JSON.parse(readFileSync('dist/news.json', 'utf8'));
let live;
try {
  const res = await fetch(`${SITE}news.json?t=${Date.now()}`, { cache: 'no-store' });
  live = res.ok ? await res.json() : null; // 404 : pas encore de journal en ligne
} catch {
  console.log('Site injoignable : pas d’annonce, pour ne pas la publier deux fois.');
  process.exit(0);
}
if (live && live.id >= built.id) {
  console.log(`Rien de nouveau (${built.id} déjà en ligne).`);
  process.exit(0);
}

const url = `${SITE}nouveautes#${built.id}`;
const list = built.items.map((item) => `**${item.title}**\n${item.text}`).join('\n\n');
const more = `\n\n[Tout lire sur BARZ¡](${url})`;
const payload = {
  username: 'BARZ¡',
  avatar_url: `${SITE}icon-192.png`,
  embeds: [
    {
      title: `Quoi de neuf ? ${built.title}`.slice(0, 256),
      url,
      description: (list.length + more.length > 4096 ? `${list.slice(0, 4090 - more.length)}…` : list) + more,
      color: ACCENT,
      footer: { text: `Mise à jour du ${built.date}` },
    },
  ],
};
appendFileSync(process.env.GITHUB_OUTPUT ?? '/dev/stdout', `payload=${JSON.stringify(payload)}\n`);
console.log(`Nouvelle entrée ${built.id} : annonce prête.`);
