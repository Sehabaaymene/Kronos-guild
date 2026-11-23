/**
 * Web-app notifications. On iPhone they only work when the app was added to
 * the Home Screen (iOS 16.4 or later) and permission was granted. Everything
 * is always kept in the in-app Notification center as well.
 */
export type PermissionState = 'granted' | 'denied' | 'undetermined' | 'unavailable';

const supported = () => typeof window !== 'undefined' && 'Notification' in window;

export function setupNotificationHandler() {}

export async function getPermission(): Promise<PermissionState> {
  if (!supported()) return 'unavailable';
  const p = Notification.permission;
  return p === 'granted' ? 'granted' : p === 'denied' ? 'denied' : 'undetermined';
}

export async function requestPermission(): Promise<PermissionState> {
  if (!supported()) return 'unavailable';
  const p = await Notification.requestPermission();
  return p === 'granted' ? 'granted' : p === 'denied' ? 'denied' : 'undetermined';
}

export async function showLocalNotification(title: string, body: string) {
  if (!supported() || Notification.permission !== 'granted') return;
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) await reg.showNotification(title, { body, icon: 'icons/icon-192.png' });
    else new Notification(title, { body });
  } catch {
    // not supported here — the in-app notification already exists
  }
}
