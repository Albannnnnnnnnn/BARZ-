// Invitations (supabase/community.sql) : chaque membre a un lien personnel ; qui s'inscrit avec devient son ami.
// Le code est gardé dans ce navigateur le temps de l'inscription (e-mail à confirmer compris), puis accepté dès que
// la personne est connectée, sur n'importe quelle page.
import { BASE, getSession, supabase } from './social';

const KEY = 'barz-invite';

const remember = (code: string) => {
  try {
    localStorage.setItem(KEY, code);
  } catch {
    // stockage bloqué : l'amitié ne se fera pas toute seule
  }
};
const pending = () => {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
};
const forget = () => {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // rien
  }
};

export async function inviteLink(): Promise<string> {
  if (!supabase) throw new Error('Supabase n’est pas configuré.');
  const { data, error } = await supabase.rpc('my_invite_code');
  if (error) throw error;
  return `${location.origin}${BASE}connexion?mode=signup&invite=${data}`;
}

// Bouton « Inviter un ami » : partage du lien (téléphone) ou copie
export async function shareInvite(button: HTMLButtonElement) {
  const label = button.textContent;
  try {
    const url = await inviteLink();
    const text = 'Rejoins-moi sur BARZ¡, l’appli des sorties du vendredi : on sera amis direct.';
    if (navigator.share) await navigator.share({ title: 'BARZ¡', text, url });
    else {
      await navigator.clipboard.writeText(`${text} ${url}`);
      button.textContent = 'Lien copié !';
      setTimeout(() => (button.textContent = label), 2500);
    }
  } catch (err) {
    if ((err as Error)?.name !== 'AbortError') alert('Impossible de créer ton lien pour le moment.');
  }
}

// Page de connexion ouverte avec ?invite= : le code est gardé, et on dit qui invite
export async function readInvite(): Promise<{ display_name: string; username: string } | null> {
  const code = new URLSearchParams(location.search).get('invite')?.trim().toLowerCase();
  if (!code || !/^[a-f0-9]{12}$/.test(code) || !supabase) return null;
  remember(code);
  const { data } = await supabase.rpc('invite_info', { invite: code });
  return ((data ?? []) as { display_name: string; username: string }[])[0] ?? null;
}

// Connecté avec une invitation en attente : amitié créée, petit message
export async function acceptPendingInvite() {
  const code = pending();
  if (!code || !supabase || !(await getSession())) return;
  const { data, error } = await supabase.rpc('accept_invite', { invite: code });
  if (error) return; // SQL pas encore lancé : on réessaiera à la prochaine page
  forget();
  if (!data) return;
  const toast = document.createElement('p');
  toast.className = 'bz-notice bz-notice--ok invite-toast';
  toast.textContent = `Toi et ${data} êtes maintenant amis sur BARZ¡ 🎉`;
  Object.assign(toast.style, { position: 'fixed', left: '50%', bottom: '100px', transform: 'translateX(-50%)', zIndex: '70', maxWidth: 'calc(100vw - 32px)' });
  document.body.append(toast);
  setTimeout(() => toast.remove(), 6000);
}
