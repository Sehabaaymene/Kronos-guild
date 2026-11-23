import * as Notifications from 'expo-notifications';

/**
 * iPhone notifications (local only — no server, no internet).
 *
 * How it works on iOS:
 *  - The app asks permission once (Settings › Notifications in the app).
 *  - Alerts are generated on the phone when something happens in the app
 *    (stock drops, goal milestones) or when the app is opened (unpaid reminders).
 *    Because there is no server, nothing can be detected while the app is closed.
 *  - If permission is refused, alerts still appear in the in-app Notification center.
 */
let handlerSet = false;

export function setupNotificationHandler() {
  if (handlerSet) return;
  handlerSet = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

export type PermissionState = 'granted' | 'denied' | 'undetermined' | 'unavailable';

export async function getPermission(): Promise<PermissionState> {
  try {
    const p = await Notifications.getPermissionsAsync();
    const IOS_PROVISIONAL = 3; // Notifications.IosAuthorizationStatus.PROVISIONAL
    if (p.granted || p.ios?.status === IOS_PROVISIONAL) return 'granted';
    return p.canAskAgain ? 'undetermined' : 'denied';
  } catch {
    return 'unavailable';
  }
}

export async function requestPermission(): Promise<PermissionState> {
  try {
    const p = await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowSound: true, allowBadge: false } });
    return p.granted ? 'granted' : p.canAskAgain ? 'undetermined' : 'denied';
  } catch {
    return 'unavailable';
  }
}

export async function showLocalNotification(title: string, body: string) {
  try {
    await Notifications.scheduleNotificationAsync({ content: { title, body }, trigger: null });
  } catch {
    // Not supported in this environment — the in-app notification already exists.
  }
}
