// Notifications côté navigateur : abonnement de cet appareil (Web Push) et notification de test.
// Les envois sont faits par la fonction Supabase « notify » (supabase/functions/notify).
import { VAPID_PUBLIC_KEY } from '../lib/push-config';
import { getSession, supabase } from './social';

export type PushState = 'unsupported' | 'needs-install' | 'denied' | 'off' | 'on';

const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || !!(navigator as Navigator & { standalone?: boolean }).standalone;

function keyBytes(base64url: string): ArrayBuffer {
  const base64 = (base64url + '='.repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)).buffer as ArrayBuffer;
}

async function registration() {
  return navigator.serviceWorker.register('/BARZ-/sw.js', { scope: '/BARZ-/' }).then(() => navigator.serviceWorker.ready);
}

export async function pushState(): Promise<PushState> {
  // Sur iPhone, les notifications n'existent que dans l'appli installée sur l'écran d'accueil
  if (isIos() && !isStandalone()) return 'needs-install';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const sub = await (await registration()).pushManager.getSubscription();
  return sub ? 'on' : 'off';
}

export async function enablePush(): Promise<void> {
  const session = await getSession();
  if (!session || !supabase) throw new Error('Connecte-toi pour activer les notifications.');
  if ((await Notification.requestPermission()) !== 'granted') throw new Error('Notifications refusées : tu peux les autoriser dans les réglages du navigateur.');
  const reg = await registration();
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC_KEY) }));
  const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
  const { error } = await supabase
    .from('push_subscriptions')
    .upsert({ endpoint: json.endpoint, user_id: session.user.id, p256dh: json.keys.p256dh, auth: json.keys.auth }, { onConflict: 'endpoint' });
  if (error) throw new Error(error.message);
}

export async function disablePush(): Promise<void> {
  const sub = await (await registration()).pushManager.getSubscription();
  if (!sub) return;
  await supabase?.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
  await sub.unsubscribe();
}

// Envoie une notification de test à mes appareils
export async function testPush(): Promise<number> {
  if (!supabase) throw new Error('Supabase n’est pas configuré.');
  const { data, error } = await supabase.functions.invoke('notify', { body: { action: 'test' } });
  if (error) {
    const detail = await (error as { context?: Response }).context?.json?.().catch(() => null);
    throw new Error(detail?.error ?? error.message);
  }
  return (data as { sent: number }).sent;
}
