// Adaptadors de plataforma: la resta del joc no sap si corre a la web o a Android.
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { App } from '@capacitor/app';
import { LocalNotifications } from '@capacitor/local-notifications';

export const isNative = Capacitor.isNativePlatform();

export interface KeyValueStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

const webStore: KeyValueStore = {
  async get(k) {
    try { return localStorage.getItem(k); } catch { return null; }
  },
  async set(k, v) {
    try { localStorage.setItem(k, v); } catch { /* mode privat o quota plena */ }
  },
  async remove(k) {
    try { localStorage.removeItem(k); } catch { /* ignorar */ }
  },
};

const nativeStore: KeyValueStore = {
  async get(key) { return (await Preferences.get({ key })).value; },
  async set(key, value) { await Preferences.set({ key, value }); },
  async remove(key) { await Preferences.remove({ key }); },
};

export const store: KeyValueStore = isNative ? nativeStore : webStore;

/** Crida `cb(true)` quan l'app passa a segon pla i `cb(false)` quan torna. */
export function onBackground(cb: (hidden: boolean) => void): void {
  if (isNative) {
    void App.addListener('appStateChange', ({ isActive }) => cb(!isActive));
  } else {
    document.addEventListener('visibilitychange', () => cb(document.hidden));
    window.addEventListener('pagehide', () => cb(true));
  }
}

const NOTIF_ID = 1;

/** Programa (o reprograma) un avís local. Només a Android; a la web no fa res. */
export async function scheduleReminder(title: string, body: string, inSec: number): Promise<void> {
  if (!isNative || inSec <= 0) return;
  const perm = await LocalNotifications.checkPermissions();
  if (perm.display !== 'granted' && (await LocalNotifications.requestPermissions()).display !== 'granted') return;
  await LocalNotifications.cancel({ notifications: [{ id: NOTIF_ID }] });
  await LocalNotifications.schedule({
    notifications: [{ id: NOTIF_ID, title, body, schedule: { at: new Date(Date.now() + inSec * 1000) } }],
  });
}

export async function cancelReminders(): Promise<void> {
  if (isNative) await LocalNotifications.cancel({ notifications: [{ id: NOTIF_ID }] });
}
