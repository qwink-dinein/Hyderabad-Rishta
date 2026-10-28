import type { Lang } from '@/domain/types';

/**
 * Font families are loaded per weight (subpath imports keep the bundle small).
 * Urdu uses Noto Nastaliq (needs generous line height), Telugu uses Noto Sans Telugu.
 */
export const fontAssets = {
  'Cormorant-SemiBold': require('@expo-google-fonts/cormorant-garamond/600SemiBold/CormorantGaramond_600SemiBold.ttf'),
  'Cormorant-Bold': require('@expo-google-fonts/cormorant-garamond/700Bold/CormorantGaramond_700Bold.ttf'),
  'Inter-Regular': require('@expo-google-fonts/inter/400Regular/Inter_400Regular.ttf'),
  'Inter-Medium': require('@expo-google-fonts/inter/500Medium/Inter_500Medium.ttf'),
  'Inter-SemiBold': require('@expo-google-fonts/inter/600SemiBold/Inter_600SemiBold.ttf'),
  'Urdu-Regular': require('@expo-google-fonts/noto-nastaliq-urdu/400Regular/NotoNastaliqUrdu_400Regular.ttf'),
  'Urdu-Bold': require('@expo-google-fonts/noto-nastaliq-urdu/700Bold/NotoNastaliqUrdu_700Bold.ttf'),
  'Telugu-Regular': require('@expo-google-fonts/noto-sans-telugu/400Regular/NotoSansTelugu_400Regular.ttf'),
  'Telugu-SemiBold': require('@expo-google-fonts/noto-sans-telugu/600SemiBold/NotoSansTelugu_600SemiBold.ttf'),
};

export type FontRole = 'display' | 'body' | 'medium' | 'semibold';

const families: Record<Lang, Record<FontRole, string>> = {
  en: { display: 'Cormorant-Bold', body: 'Inter-Regular', medium: 'Inter-Medium', semibold: 'Inter-SemiBold' },
  ur: { display: 'Urdu-Bold', body: 'Urdu-Regular', medium: 'Urdu-Regular', semibold: 'Urdu-Bold' },
  te: { display: 'Telugu-SemiBold', body: 'Telugu-Regular', medium: 'Telugu-Regular', semibold: 'Telugu-SemiBold' },
};

/** Line-height multiplier per script: Nastaliq has tall ascenders/descenders. */
export const lineHeightScale: Record<Lang, number> = { en: 1.45, ur: 2.0, te: 1.6 };

export function fontFamily(lang: Lang, role: FontRole): string {
  return families[lang][role];
}
