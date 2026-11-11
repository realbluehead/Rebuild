// Platform adapters: the rest of the game does not know whether it runs on the web or on Android.
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
    try { localStorage.setItem(k, v); } catch { /* private mode or quota full */ }
  },
  async remove(k) {
    try { localStorage.removeItem(k); } catch { /* ignore */ }
  },
};

const nativeStore: KeyValueStore = {
  async get(key) { return (await Preferences.get({ key })).value; },
  async set(key, value) { await Preferences.set({ key, value }); },
  async remove(key) { await Preferences.remove({ key }); },
};

export const store: KeyValueStore = isNative ? nativeStore : webStore;

/** Calls `cb(true)` when the app goes to the background and `cb(false)` when it comes back. */
export function onBackground(cb: (hidden: boolean) => void): void {
  if (isNative) {
    void App.addListener('appStateChange', ({ isActive }) => cb(!isActive));
  } else {
    document.addEventListener('visibilitychange', () => cb(document.hidden));
    window.addEventListener('pagehide', () => cb(true));
  }
}

const NOTIF_ID = 1;

/** Schedules (or reschedules) a local notification. Android only; a no-op on the web. */
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
