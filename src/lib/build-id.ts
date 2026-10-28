// Identifiant de la version du code : le commit GitHub construit (GITHUB_SHA dans GitHub Actions),
// sinon l'heure du build en local. Les reconstructions automatiques (nouvelles sorties) gardent le même
// commit : seul du nouveau code fait apparaître le bandeau « Mettre à jour » (src/components/UpdateBanner.astro).
export const BUILD_ID = process.env.GITHUB_SHA?.slice(0, 12) ?? `local-${Date.now()}`;
