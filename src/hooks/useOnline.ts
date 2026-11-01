import { onlineManager } from '@tanstack/react-query';
import { addNetworkStateListener, getNetworkStateAsync, type NetworkState } from 'expo-network';
import { useEffect, useState } from 'react';

/** Offline = the device has no connection, or has one but cannot reach the internet. Unknown counts as online. */
export const isOffline = (s: Pick<NetworkState, 'isConnected' | 'isInternetReachable'>) => s.isConnected === false || s.isInternetReachable === false;

/**
 * Tells React Query when the device goes offline and comes back: requests pause instead of failing while
 * offline, and everything on screen refreshes by itself on reconnect. Call once at app start.
 */
export function wireOnlineManager() {
  onlineManager.setEventListener((setOnline) => {
    let sub: { remove(): void } | undefined;
    try {
      getNetworkStateAsync().then((s) => setOnline(!isOffline(s))).catch(() => undefined);
      sub = addNetworkStateListener((s) => setOnline(!isOffline(s)));
    } catch {
      // Network module unavailable (tests, very old builds): assume online.
    }
    return () => sub?.remove();
  });
}

/** Live online/offline state for the UI (follows React Query's online manager). */
export function useOnline() {
  const [online, setOnline] = useState(() => onlineManager.isOnline());
  useEffect(() => onlineManager.subscribe((o) => setOnline(o)), []);
  return online;
}
