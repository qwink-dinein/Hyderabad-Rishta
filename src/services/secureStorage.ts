import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { asyncStorageKV, type KV } from './storage';

/**
 * Where this phone keeps its login: the session token and the device key used for PIN login.
 * iOS Keychain / Android Keystore, readable only while the phone is unlocked and never copied to a
 * new phone through backups (THIS_DEVICE_ONLY) — a restored backup must verify by OTP again.
 * Browsers have no secure enclave; the web build falls back to local storage (demo/preview only).
 */
const opts = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };

export const secureKV: KV =
  Platform.OS === 'web'
    ? asyncStorageKV
    : {
        getItem: (k) => SecureStore.getItemAsync(k, opts).catch(() => null),
        setItem: (k, v) => SecureStore.setItemAsync(k, v, opts),
        removeItem: (k) => SecureStore.deleteItemAsync(k, opts),
      };
