import { Pressable, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { CornerFlourish } from '@/components/art/Illustrations';
import { changeLanguage } from '@/components/LanguageSwitcher';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Header, Screen } from '@/components/ui/layout';
import { Text } from '@/components/ui/Text';
import type { Lang } from '@/domain/types';
import { LANGS } from '@/i18n';
import { useSession } from '@/state/session';
import { colors, radius, space } from '@/theme/tokens';
import { fontFamily, isFontLoaded } from '@/theme/fonts';

/** Each language is labelled in its own script, whatever the current UI language. */
const BADGE: Record<Lang, string> = { en: 'EN', ur: 'اردو', te: 'తె' };

/** Registration step 1 (Design PRD §5.2) — shown only when no language was chosen yet. */
export default function ChooseLanguage() {
  const { t } = useTranslation();
  const { next } = useLocalSearchParams<{ next?: string }>();
  const lang = useSession((s) => s.lang);
  return (
    <Screen
      header={<Header title="" />}
      footer={<Button label={t('common.continue')} arrow full onPress={() => router.replace({ pathname: '/login', params: next ? { next } : {} })} testID="language-continue" />}
    >
      <View style={styles.flourish} pointerEvents="none">
        <CornerFlourish size={110} />
      </View>
      <View style={{ gap: space.sm, marginTop: space.xl, marginBottom: space.xl }}>
        <Text variant="h1" center accessibilityRole="header">
          {t('lang.title')}
        </Text>
        <Text variant="body" color={colors.muted} center>
          {t('lang.sub')}
        </Text>
      </View>
      <View style={{ gap: space.md }} accessibilityRole="radiogroup" accessibilityLabel={t('lang.choose')}>
        {LANGS.map((l) => {
          const on = l === lang;
          return (
            <Pressable
              key={l}
              onPress={() => changeLanguage(l)}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              aria-checked={on}
              accessibilityLabel={t(`lang.${l}`)}
              style={({ pressed }) => [styles.option, on && styles.optionOn, pressed && { transform: [{ scale: 0.99 }] }]}
              testID={`lang-${l}`}
            >
              <View style={[styles.badge, on && styles.badgeOn]}>
                <Text variant="label" color={on ? colors.ivory : colors.emerald} style={isFontLoaded(l) ? { fontFamily: fontFamily(l, 'semibold') } : undefined}>
                  {BADGE[l]}
                </Text>
              </View>
              <Text variant="bodyStrong" style={[{ flex: 1 }, isFontLoaded(l) ? { fontFamily: fontFamily(l, 'semibold') } : null]}>
                {t(`lang.${l}`)}
              </Text>
              {on ? (
                <View style={styles.check}>
                  <Icon name="check" size={14} color={colors.white} strokeWidth={2.4} />
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flourish: { position: 'absolute', top: 0, right: -10, opacity: 0.8 },
  option: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 64, paddingHorizontal: space.lg, borderRadius: radius.md, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border },
  optionOn: { borderColor: colors.emerald, borderWidth: 1.5 },
  badge: { minWidth: 44, height: 44, borderRadius: 22, paddingHorizontal: 6, backgroundColor: colors.sage, alignItems: 'center', justifyContent: 'center' },
  badgeOn: { backgroundColor: colors.emerald },
  check: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.emerald, alignItems: 'center', justifyContent: 'center' },
});
