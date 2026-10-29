// Fonction Supabase « deezer-proxy » (Deno) : relaie les appels à l'API Deezer depuis Paris.
// Deezer met les sorties en ligne à minuit selon le pays de la requête ; les serveurs GitHub Actions sont aux
// États-Unis et ne voient les sorties du vendredi que vers 6h-9h (heure de Paris). La synchro de minuit passe donc
// par cette fonction, appelée avec l'en-tête x-region: eu-west-3 (Paris) : voir deezerFetch dans scripts/lib/common.ts.
//
// Déploiement (par Alban) : npx supabase@latest functions deploy deezer-proxy --use-api
// Aucun secret à ajouter.

// Rôle du jeton : sa signature est déjà vérifiée par la passerelle Supabase (verify_jwt, actif par défaut)
function jwtRole(token: string): string | null {
  try {
    const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(payload)).role ?? null;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  // Réservé à la synchro (clé service_role) : la clé anon est publique et épuiserait le quota d'appels
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer /, '');
  if (jwtRole(token) !== 'service_role') return new Response(JSON.stringify({ error: 'Non autorisé.' }), { status: 401 });

  // ?path=/artist/27/albums?limit=30 : seulement des lectures sur api.deezer.com
  const path = new URL(req.url).searchParams.get('path') ?? '';
  if (req.method !== 'GET' || !path.startsWith('/') || path.startsWith('//')) {
    return new Response(JSON.stringify({ error: 'Chemin Deezer attendu (?path=/…).' }), { status: 400 });
  }

  try {
    const res = await fetch(`https://api.deezer.com${path}`, { signal: AbortSignal.timeout(15_000) });
    return new Response(await res.text(), { status: res.status, headers: { 'Content-Type': 'application/json' } });
  } catch {
    return new Response(JSON.stringify({ error: 'Deezer injoignable.' }), { status: 504 });
  }
});
