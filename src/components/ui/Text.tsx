import { memo } from 'react';
import { Text as RNText, type TextProps, type TextStyle } from 'react-native';
import { useSession } from '@/state/session';
import { colors } from '@/theme/tokens';
import { fontFamily, lineHeightScale, type FontRole } from '@/theme/fonts';
import { isRTL } from '@/i18n';

type Variant = 'display' | 'h1' | 'h2' | 'h3' | 'body' | 'bodyStrong' | 'label' | 'caption' | 'overline';

const VARIANTS: Record<Variant, { size: number; role: FontRole; color?: string; upper?: boolean; spacing?: number }> = {
  display: { size: 34, role: 'display', color: colors.emerald },
  h1: { size: 27, role: 'display', color: colors.emerald },
  h2: { size: 20, role: 'display', color: colors.emerald },
  h3: { size: 17, role: 'semibold', color: colors.charcoal },
  body: { size: 15, role: 'body', color: colors.charcoal },
  bodyStrong: { size: 15, role: 'semibold', color: colors.charcoal },
  label: { size: 13, role: 'medium', color: colors.charcoal },
  caption: { size: 13, role: 'body', color: colors.muted },
  overline: { size: 12, role: 'semibold', color: colors.goldDeep, upper: true, spacing: 1.2 },
};

export interface AppTextProps extends TextProps {
  variant?: Variant;
  color?: string;
  center?: boolean;
}

/**
 * Script-aware text: picks the font family and line height for the active language
 * (Nastaliq needs ~2× line height) and aligns to the reading direction.
 */
export const Text = memo(function Text({ variant = 'body', color, center, style, ...rest }: AppTextProps) {
  const lang = useSession((s) => s.lang);
  const v = VARIANTS[variant];
  // Latin display font only for English; other scripts use their own families.
  const size = lang === 'ur' && v.role !== 'display' ? v.size + 1 : v.size;
  const base: TextStyle = {
    fontFamily: fontFamily(lang, v.role),
    fontSize: size,
    // Serif headings read better tight; scripts with tall glyphs keep their own scale.
    lineHeight: Math.round(size * (v.role === 'display' && lang === 'en' ? 1.24 : lineHeightScale[lang])),
    color: color ?? v.color,
    textAlign: center ? 'center' : isRTL(lang) ? 'right' : 'left',
    writingDirection: isRTL(lang) ? 'rtl' : 'ltr',
    ...(v.upper && lang === 'en' ? { textTransform: 'uppercase', letterSpacing: v.spacing } : null),
  };
  return <RNText {...rest} style={[base, style]} />;
});
