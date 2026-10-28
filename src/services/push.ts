import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { AndroidImportance, AndroidNotificationVisibility } from 'expo-notifications';
import { backend } from '@/services';
import { colors } from '@/theme/tokens';

/**
 * Phone push (client side). The server decides WHAT to send (src/domain/push.ts + SQL trigger);
 * this module only binds this phone to the signed-in account and handles taps.
 *
 * Airtight rules:
 *  - The token is bound to exactly one account; logging out unbinds it BEFORE the session ends.
 *  - Signing in on a phone that already granted permission re-binds silently (no stale owner).
 *  - Taps deep-link inside the app and mark the in-app notification read.
 *  - Nothing here ever throws into the UI: unsupported environments report a status instead.
 */
export type PushStatus =
  | 'web' // browsers: in-app notifications only
  | 'simulator' // no push on simulators/emulators
  | 'expo_go_android' // Android remote push was removed from Expo Go in SDK 53 → needs a development build
  | 'no_project' // missing EAS projectId (set when the app is linked with `eas init`)
  | 'denied'
  | 'undetermined'
  | 'granted'
  | 'error';

const TOKEN_KEY = 'hr.push.token';
const DISMISS_KEY = 'hr.push.promptDismissedAt';

const isWeb = Platform.OS === 'web';
const isExpoGoAndroid = () => Platform.OS === 'android' && Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
const projectId = () => (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId ?? Constants.easConfig?.projectId;

let configured = false;
/** Call once at startup: foreground behaviour + Android channel. Safe to call anywhere. */
export function configurePush() {
  if (isWeb || configured) return;
  configured = true;
  // In the foreground the app shows its own banner (and the inbox updates), so no duplicate system banner.
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: false, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: true }),
  });
  if (Platform.OS === 'android') {
    Notifications.setNotificationChannelAsync('default', {
      name: 'Hyderabad Rishta',
      importance: AndroidImportance.HIGH,
      lightColor: colors.gold,
      vibrationPattern: [0, 180, 120, 180],
      lockscreenVisibility: AndroidNotificationVisibility.PRIVATE,
    }).catch(() => undefined);
  }
}

export async function getPushStatus(): Promise<PushStatus> {
  if (isWeb) return 'web';
  if (!Device.isDevice) return 'simulator';
  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status === 'denied') return 'denied';
    if (status !== 'granted') return 'undetermined';
    if (isExpoGoAndroid()) return 'expo_go_android';
    if (!projectId()) return 'no_project';
    return 'granted';
  } catch {
    return 'error';
  }
}

/** Asks (only when `ask`), then binds this phone's token to the signed-in account. */
export async function enablePush(ask: boolean): Promise<PushStatus> {
  if (isWeb) return 'web';
  if (!Device.isDevice) return 'simulator';
  configurePush();
  try {
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted' && ask) status = (await Notifications.requestPermissionsAsync()).status;
    if (status === 'denied') return 'denied';
    if (status !== 'granted') return 'undetermined';
    if (isExpoGoAndroid()) return 'expo_go_android';
    const pid = projectId();
    if (!pid) return 'no_project';
    const token = (await Notifications.getExpoPushTokenAsync({ projectId: pid })).data;
    await backend.registerPushDevice(token, Platform.OS === 'ios' ? 'ios' : 'android');
    await AsyncStorage.setItem(TOKEN_KEY, token).catch(() => undefined);
    return 'granted';
  } catch {
    return 'error';
  }
}

/** Unbinds this phone from the account. Call BEFORE logout so a shared phone stops getting alerts. */
export async function unbindThisPhone() {
  if (isWeb) return;
  try {
    const token = await AsyncStorage.getItem(TOKEN_KEY);
    if (token) await backend.unregisterPushDevice(token);
    await AsyncStorage.removeItem(TOKEN_KEY);
    await Notifications.setBadgeCountAsync(0);
  } catch {
    // best effort — the server also drops tokens that Expo reports as dead
  }
}

export async function setBadge(n: number) {
  if (isWeb) return;
  Notifications.setBadgeCountAsync(Math.max(0, n)).catch(() => undefined);
}

/** A local notification to check permission and how alerts look (works in Expo Go too). */
export async function sendTestNotification(title: string, body: string) {
  if (isWeb) return false;
  configurePush();
  try {
    await Notifications.scheduleNotificationAsync({ content: { title, body, data: { deepLink: '/notifications' } }, trigger: null });
    return true;
  } catch {
    return false;
  }
}

/** Subscribes to taps (incl. the one that launched the app) and incoming pushes. Returns an unsubscribe. */
export function listenToPush(handlers: { onTap: (deepLink: string | undefined, notificationId: string | undefined) => void; onReceive: () => void }) {
  if (isWeb) return () => undefined;
  configurePush();
  const read = (r: Notifications.NotificationResponse) => {
    const d = r.notification.request.content.data as { deepLink?: string; notificationId?: string } | undefined;
    handlers.onTap(d?.deepLink, d?.notificationId);
  };
  Notifications.getLastNotificationResponseAsync()
    .then((r) => r && read(r))
    .catch(() => undefined);
  const tap = Notifications.addNotificationResponseReceivedListener(read);
  const recv = Notifications.addNotificationReceivedListener(() => handlers.onReceive());
  // Tokens can rotate (reinstall / OS refresh): re-bind whenever that happens.
  const rotate = Notifications.addPushTokenListener(() => {
    enablePush(false).catch(() => undefined);
  });
  return () => {
    tap.remove();
    recv.remove();
    rotate.remove();
  };
}

export async function promptDismissedRecently(days = 14) {
  try {
    const at = Number(await AsyncStorage.getItem(DISMISS_KEY));
    return !!at && Date.now() - at < days * 86400000;
  } catch {
    return false;
  }
}

export async function dismissPrompt() {
  await AsyncStorage.setItem(DISMISS_KEY, String(Date.now())).catch(() => undefined);
}
