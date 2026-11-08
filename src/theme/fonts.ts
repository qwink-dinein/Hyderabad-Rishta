import * as Font from 'expo-font';
import type { Lang } from '@/domain/types';

/**
 * Fonts are split so first paint only downloads Latin fonts (~1.3 MB on web instead of ~3.8 MB).
 * Urdu (Noto Nastaliq) and Telugu fonts load on demand the first time that language is chosen.
 * Subpath imports keep unused weights out of the bundle.
 */
export const baseFontAssets = {
  // Premium redesign 2026-11-08: Playfair Display (editorial serif) for headings, Inter for reading,
  // Montserrat for buttons, labels and navigation.
  'Playfair-SemiBold': require('@expo-google-fonts/playfair-display/600SemiBold/PlayfairDisplay_600SemiBold.ttf'),
  'Playfair-SemiBoldItalic': require('@expo-google-fonts/playfair-display/600SemiBold_Italic/PlayfairDisplay_600SemiBold_Italic.ttf'),
  'Montserrat-Medium': require('@expo-google-fonts/montserrat/500Medium/Montserrat_500Medium.ttf'),
  'Montserrat-SemiBold': require('@expo-google-fonts/montserrat/600SemiBold/Montserrat_600SemiBold.ttf'),
  'Inter-Regular': require('@expo-google-fonts/inter/400Regular/Inter_400Regular.ttf'),
  'Inter-Medium': require('@expo-google-fonts/inter/500Medium/Inter_500Medium.ttf'),
  'Inter-SemiBold': require('@expo-google-fonts/inter/600SemiBold/Inter_600SemiBold.ttf'),
};

const scriptFontAssets: Record<Exclude<Lang, 'en' | 'ur-Latn'>, Record<string, number>> = {
  ur: { 'Urdu-Regular': require('@expo-google-fonts/noto-nastaliq-urdu/400Regular/NotoNastaliqUrdu_400Regular.ttf') },
  te: {
    'Telugu-Regular': require('@expo-google-fonts/noto-sans-telugu/400Regular/NotoSansTelugu_400Regular.ttf'),
    'Telugu-SemiBold': require('@expo-google-fonts/noto-sans-telugu/600SemiBold/NotoSansTelugu_600SemiBold.ttf'),
  },
};

// Roman Urdu is written in English letters: it uses the Latin fonts that ship with the app.
const loaded = new Set<Lang>(['en', 'ur-Latn']);

/** Idempotent; resolves once the script font for `lang` is ready (never rejects — system fonts are the fallback). */
export async function ensureFonts(lang: Lang): Promise<void> {
  if (loaded.has(lang)) return;
  try {
    await Font.loadAsync(scriptFontAssets[lang as Exclude<Lang, 'en' | 'ur-Latn'>]);
    loaded.add(lang);
  } catch {
    // fall back to platform fonts
  }
}

export const isFontLoaded = (lang: Lang) => loaded.has(lang);

/** `ui` / `uiMedium` = buttons, labels, navigation and section labels (Montserrat in Latin scripts). */
export type FontRole = 'display' | 'body' | 'medium' | 'semibold' | 'ui' | 'uiMedium';

const families: Record<Lang, Record<FontRole, string>> = {
  en: { display: 'Playfair-SemiBold', body: 'Inter-Regular', medium: 'Inter-Medium', semibold: 'Inter-SemiBold', ui: 'Montserrat-SemiBold', uiMedium: 'Montserrat-Medium' },
  // Nastaliq conveys emphasis through size rather than weight; one weight keeps the download small.
  ur: { display: 'Urdu-Regular', body: 'Urdu-Regular', medium: 'Urdu-Regular', semibold: 'Urdu-Regular', ui: 'Urdu-Regular', uiMedium: 'Urdu-Regular' },
  'ur-Latn': { display: 'Playfair-SemiBold', body: 'Inter-Regular', medium: 'Inter-Medium', semibold: 'Inter-SemiBold', ui: 'Montserrat-SemiBold', uiMedium: 'Montserrat-Medium' },
  te: { display: 'Telugu-SemiBold', body: 'Telugu-Regular', medium: 'Telugu-Regular', semibold: 'Telugu-SemiBold', ui: 'Telugu-SemiBold', uiMedium: 'Telugu-Regular' },
};

/** Line-height multiplier per script: Nastaliq has tall ascenders/descenders. */
export const lineHeightScale: Record<Lang, number> = { en: 1.45, ur: 2.0, 'ur-Latn': 1.45, te: 1.6 };

export function fontFamily(lang: Lang, role: FontRole): string {
  return families[lang][role];
}
