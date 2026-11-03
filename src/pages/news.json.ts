// /news.json : la dernière entrée des Nouveautés, lue au déploiement pour l'annoncer sur Discord (scripts/news-discord.mjs)
import { LATEST_CHANGE, changeDate } from '../lib/changelog';

export function GET() {
  return new Response(JSON.stringify({ ...LATEST_CHANGE, date: changeDate(LATEST_CHANGE.id) }), { headers: { 'Content-Type': 'application/json' } });
}
