import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLocales } from 'expo-localization';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { Platform } from 'react-native';
import type { Lang } from '@/domain/types';
import { ensureFonts } from '@/theme/fonts';
import en from './en';
import te from './te';
import ur from './ur';
import { setDateLanguage } from '@/domain/format';

export const LANGS: Lang[] = ['en', 'ur', 'te'];
export const RTL_LANGS: Lang[] = ['ur'];
const STORAGE_KEY = 'hr.lang';
const CHOSEN_KEY = 'hr.langChosen';

export const isRTL = (lang: Lang) => RTL_LANGS.includes(lang);

function deviceLanguage(): Lang {
  const code = getLocales()[0]?.languageCode;
  return code === 'ur' || code === 'te' ? code : 'en';
}

i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, ur: { translation: ur }, te: { translation: te } },
  lng: deviceLanguage(),
  // Per-key fallback: an untranslated string shows English rather than a raw key (PRD §4).
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  returnNull: false,
});

/** Applies a language immediately (no reload/logout) and persists the choice. */
export async function applyLanguage(lang: Lang): Promise<void> {
  // Load the script font first so text never flashes in the wrong typeface.
  await ensureFonts(lang);
  await i18n.changeLanguage(lang);
  setDateLanguage(lang);
  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    document.documentElement.lang = lang;
    document.documentElement.dir = isRTL(lang) ? 'rtl' : 'ltr';
  }
  try {
    await AsyncStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // Non-fatal: preference just won't persist.
  }
}

/** Whether the person has explicitly picked a language (vs. the device default). UI-only hint. */
export async function hasChosenLanguage(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(CHOSEN_KEY)) === '1';
  } catch {
    return true; // storage unavailable → don't block the journey with an extra step
  }
}

export async function markLanguageChosen(): Promise<void> {
  try {
    await AsyncStorage.setItem(CHOSEN_KEY, '1');
  } catch {
    // non-fatal
  }
}

export async function restoreLanguage(): Promise<Lang> {
  try {
    const saved = (await AsyncStorage.getItem(STORAGE_KEY)) as Lang | null;
    if (saved && LANGS.includes(saved)) {
      await applyLanguage(saved);
      return saved;
    }
  } catch {
    // ignore
  }
  const lang = i18n.language as Lang;
  await applyLanguage(LANGS.includes(lang) ? lang : 'en');
  return i18n.language as Lang;
}

export default i18n;
