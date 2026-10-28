// /version.json : la version en ligne, comparée par chaque page ouverte à la sienne
import { BUILD_ID } from '../lib/build-id';

export function GET() {
  return new Response(JSON.stringify({ version: BUILD_ID }), { headers: { 'Content-Type': 'application/json' } });
}
