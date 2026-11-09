// Pochettes à la bonne taille : Deezer et la Cover Art Archive savent servir plusieurs tailles de la même image.
// Les sorties sont enregistrées en 1000x1000 (~250 Ko) ; une vignette de 170 px n'a besoin que de 250 ou 500.

// Largeur affichée d'une vignette dans les grilles (2 colonnes sur mobile)
export const TILE_SIZES = '(max-width: 900px) 50vw, 220px';

// Image qui ne charge pas : on la retire et la pochette affiche son dégradé et son titre
export const COVER_ONERROR = "this.parentNode.classList.add('is-broken');this.remove()";

const DEEZER = /\/(\d+)x\1-(\d{6}-\d+-\d+-\d+\.jpg)$/;
const CAA = /\/front(-\d+)?$/;

// small : vignette de grille (≈ 190 px affichés) ; 500 px suffisent même sur un écran 3x, au lieu de 1000 px
// (~4 fois plus lourd) que le navigateur choisirait sinon sur un téléphone récent
export function coverSources(src: string, small = false): { src: string; srcset?: string } {
  if (DEEZER.test(src)) {
    const at = (n: number) => src.replace(DEEZER, `/${n}x${n}-$2`);
    return { src: at(500), srcset: small ? `${at(250)} 250w, ${at(500)} 500w` : `${at(250)} 250w, ${at(500)} 500w, ${at(1000)} 1000w` };
  }
  if (src.includes('coverartarchive.org') && CAA.test(src)) {
    const at = (n: number) => src.replace(CAA, `/front-${n}`);
    return { src: at(500), srcset: small ? `${at(250)} 250w, ${at(500)} 500w` : `${at(250)} 250w, ${at(500)} 500w, ${at(1200)} 1200w` };
  }
  return { src };
}
