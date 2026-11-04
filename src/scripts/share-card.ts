// Cartes de partage au format story (1080 × 1920) : un Barz, un top, le bilan du mois, la série aux jeux.
// Dessinées dans le navigateur (canvas), aux couleurs et polices de l'appli, avec le logo et le lien ; partagées
// avec le menu du téléphone (Instagram, WhatsApp…) ou téléchargées sur ordinateur. Les pochettes de Deezer, Apple et
// Spotify autorisent ce dessin (en-tête CORS) ; une image qui ne charge pas est remplacée par un aplat.

const W = 1080;
const H = 1920;
const PAD = 90;
const SITE_LABEL = 'albannnnnnnnnn.github.io/BARZ-';

type Theme = { bg: string; ink: string; accent: string; onAccent: string; muted: string; display: string; sans: string };

function theme(): Theme {
  const css = getComputedStyle(document.documentElement);
  const v = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
  return {
    bg: v('--color-bg', '#f3ecdc'),
    ink: v('--color-ink', '#141a2e'),
    accent: v('--color-accent', '#3d5afe'),
    onAccent: v('--color-on-accent', '#ffffff'),
    muted: v('--color-text-muted', '#5b6070'),
    display: v('--font-display', 'sans-serif'),
    sans: v('--font-sans', 'sans-serif'),
  };
}

function loadImage(src: string | null | undefined): Promise<HTMLImageElement | null> {
  if (!src) return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

// Coupe le texte en lignes d'au plus maxWidth, maxLines lignes (la dernière finit par « … » si besoin)
function lines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const words = text.replace(/\s+/g, ' ').trim().split(' ');
  const out: string[] = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width <= maxWidth) line = test;
    else {
      if (line) out.push(line);
      line = word;
      if (out.length === maxLines) break;
    }
  }
  if (out.length < maxLines && line) out.push(line);
  if (out.length > maxLines) out.length = maxLines;
  const used = out.join(' ').split(' ').length;
  if (used < words.length && out.length) {
    let last = out[out.length - 1];
    while (last && ctx.measureText(`${last}…`).width > maxWidth) last = last.slice(0, -1);
    out[out.length - 1] = `${last.trimEnd()}…`;
  }
  return out;
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

// Pochette (ou photo ronde) avec bordure épaisse et ombre décalée, comme les cartes de l'appli
function drawCover(ctx: CanvasRenderingContext2D, t: Theme, img: HTMLImageElement | null, x: number, y: number, size: number, round = false) {
  const r = round ? size / 2 : size * 0.05;
  ctx.fillStyle = t.ink;
  roundedRect(ctx, x + 14, y + 14, size, size, r);
  ctx.fill();
  ctx.save();
  roundedRect(ctx, x, y, size, size, r);
  ctx.clip();
  ctx.fillStyle = t.accent;
  ctx.fillRect(x, y, size, size);
  if (img) ctx.drawImage(img, x, y, size, size);
  ctx.restore();
  ctx.lineWidth = 6;
  ctx.strokeStyle = t.ink;
  roundedRect(ctx, x, y, size, size, r);
  ctx.stroke();
}

// Fond, logo, étiquette du haut et pied de carte communs à toutes les cartes
function frame(ctx: CanvasRenderingContext2D, t: Theme, eyebrow: string) {
  ctx.fillStyle = t.bg;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = t.ink;
  ctx.font = `800 64px ${t.display}`;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('BARZ', PAD, PAD + 60);
  const w = ctx.measureText('BARZ').width;
  ctx.fillStyle = t.accent;
  ctx.fillText('¡', PAD + w, PAD + 60);
  ctx.fillStyle = t.accent;
  ctx.font = `700 30px ${t.sans}`;
  ctx.fillText(eyebrow.toUpperCase(), PAD, PAD + 130);
  // Pied : bandeau d'encre avec le lien
  ctx.fillStyle = t.ink;
  ctx.fillRect(0, H - 200, W, 200);
  ctx.fillStyle = t.bg;
  ctx.font = `800 40px ${t.display}`;
  ctx.fillText('L’appli du vendredi', PAD, H - 110);
  ctx.font = `500 30px ${t.sans}`;
  ctx.fillText(SITE_LABEL, PAD, H - 62);
}

async function prepare(eyebrow: string): Promise<{ canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; t: Theme }> {
  const t = theme();
  await Promise.all([document.fonts.load(`800 80px ${t.display}`), document.fonts.load(`500 40px ${t.sans}`), document.fonts.load(`700 40px ${t.sans}`)]).catch(() => {});
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  frame(ctx, t, eyebrow);
  return { canvas, ctx, t };
}

// Partage de l'image (menu du téléphone), sinon téléchargement
async function deliver(canvas: HTMLCanvasElement, name: string) {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('Impossible de créer l’image.');
  const file = new File([blob], `${name}.png`, { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'BARZ¡' });
      return;
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') return;
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}

export type BarzCardData = { name: string; username: string; title: string; artist: string; cover: string | null; score: number; body: string };

export async function shareBarzCard(d: BarzCardData) {
  const { canvas, ctx, t } = await prepare(`Le Barz de ${d.name}`);
  const size = 760;
  const top = 290;
  drawCover(ctx, t, await loadImage(d.cover), (W - size) / 2, top, size);
  // Note dans une pastille
  ctx.fillStyle = t.accent;
  roundedRect(ctx, W - PAD - 250, top + size - 80, 250, 130, 24);
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = t.ink;
  ctx.stroke();
  ctx.fillStyle = t.onAccent;
  ctx.font = `800 72px ${t.display}`;
  ctx.textAlign = 'center';
  ctx.fillText(d.score.toFixed(1).replace('.', ','), W - PAD - 125, top + size + 12);
  ctx.textAlign = 'left';
  let y = top + size + 150;
  ctx.fillStyle = t.ink;
  ctx.font = `800 76px ${t.display}`;
  for (const l of lines(ctx, d.title, W - 2 * PAD, 2)) {
    ctx.fillText(l, PAD, y);
    y += 86;
  }
  ctx.fillStyle = t.muted;
  ctx.font = `600 44px ${t.sans}`;
  ctx.fillText(lines(ctx, d.artist, W - 2 * PAD, 1)[0] ?? '', PAD, y + 4);
  y += 100;
  ctx.fillStyle = t.ink;
  ctx.font = `600 50px ${t.sans}`;
  const quote = lines(ctx, `« ${d.body} »`, W - 2 * PAD, Math.max(2, Math.floor((H - 250 - y) / 68)));
  for (const l of quote) {
    ctx.fillText(l, PAD, y);
    y += 68;
  }
  await deliver(canvas, `barz-${d.username}`);
}

export type TopCardItem = { title: string; sub: string; cover: string | null };

// Un top (artistes, albums, singles) : grille de pochettes numérotées
export async function shareTopCard(heading: string, items: TopCardItem[], round = false) {
  const { canvas, ctx, t } = await prepare(heading);
  const list = items.slice(0, 10);
  const cols = list.length <= 3 ? 1 : 2;
  const rows = Math.ceil(list.length / cols);
  const areaTop = 300;
  const areaH = H - 260 - areaTop;
  const rowH = Math.min(cols === 1 ? 420 : 260, areaH / rows);
  const size = rowH - (cols === 1 ? 60 : 40);
  const colW = (W - 2 * PAD) / cols;
  const images = await Promise.all(list.map((i) => loadImage(i.cover)));
  list.forEach((item, i) => {
    const col = cols === 1 ? 0 : i % cols;
    const row = cols === 1 ? i : Math.floor(i / cols);
    const x = PAD + col * colW;
    const y = areaTop + row * rowH;
    drawCover(ctx, t, images[i], x, y, size, round);
    // Rang
    ctx.fillStyle = t.accent;
    ctx.beginPath();
    ctx.arc(x + 6, y + 6, 34, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 5;
    ctx.strokeStyle = t.ink;
    ctx.stroke();
    ctx.fillStyle = t.onAccent;
    ctx.font = `800 34px ${t.display}`;
    ctx.textAlign = 'center';
    ctx.fillText(String(i + 1), x + 6, y + 18);
    ctx.textAlign = 'left';
    const textX = x + size + 30;
    const textW = colW - size - 40;
    ctx.fillStyle = t.ink;
    ctx.font = `800 ${cols === 1 ? 52 : 32}px ${t.display}`;
    const titleLines = lines(ctx, item.title, textW, 2);
    let ty = y + size / 2 - (titleLines.length - 1) * (cols === 1 ? 30 : 19);
    for (const l of titleLines) {
      ctx.fillText(l, textX, ty);
      ty += cols === 1 ? 60 : 38;
    }
    if (item.sub) {
      ctx.fillStyle = t.muted;
      ctx.font = `600 ${cols === 1 ? 34 : 24}px ${t.sans}`;
      ctx.fillText(lines(ctx, item.sub, textW, 1)[0] ?? '', textX, ty + 4);
    }
  });
  await deliver(canvas, 'barz-top');
}

// Une grande stat (bilan du mois, série aux jeux) : gros chiffre, quelques lignes, pochettes en bandeau
export async function shareStatCard(eyebrow: string, big: string, caption: string, details: string[], covers: (string | null)[] = []) {
  const { canvas, ctx, t } = await prepare(eyebrow);
  ctx.fillStyle = t.accent;
  ctx.font = `800 300px ${t.display}`;
  ctx.fillText(big, PAD - 10, 640);
  ctx.fillStyle = t.ink;
  ctx.font = `800 64px ${t.display}`;
  let y = 760;
  for (const l of lines(ctx, caption, W - 2 * PAD, 3)) {
    ctx.fillText(l, PAD, y);
    y += 74;
  }
  ctx.font = `600 40px ${t.sans}`;
  y += 30;
  for (const d of details.slice(0, 5)) {
    ctx.fillText(lines(ctx, d, W - 2 * PAD, 1)[0] ?? '', PAD, y);
    y += 60;
  }
  const shown = covers.filter(Boolean).slice(0, 4);
  if (shown.length) {
    const size = 200;
    const images = await Promise.all(shown.map((c) => loadImage(c)));
    images.forEach((img, i) => drawCover(ctx, t, img, PAD + i * (size + 30), H - 200 - size - 80, size));
  }
  await deliver(canvas, 'barz-stat');
}
