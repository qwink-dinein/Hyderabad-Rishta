import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { applyLanguage, LANGS } from '@/i18n';
import type { Lang } from '@/domain/types';
import { backend } from '@/services';
import { useSession } from '@/state/session';
import { colors, radius, space } from '@/theme/tokens';
import { fontFamily, isFontLoaded } from '@/theme/fonts';
import { Text } from './ui/Text';

/** Changes language instantly (no reload, no logout) and persists it locally and on the account. */
export async function changeLanguage(lang: Lang) {
  await applyLanguage(lang);
  useSession.getState().setLang(lang);
  if (useSession.getState().user) backend.setLanguage(lang).catch(() => undefined);
}

export function LanguageSwitcher({ tone = 'light' }: { tone?: 'light' | 'dark' }) {
  const { t } = useTranslation();
  const lang = useSession((s) => s.lang);
  const dark = tone === 'dark';
  return (
    <View style={[styles.wrap, dark && styles.wrapDark]} accessibilityRole="radiogroup" accessibilityLabel={t('lang.choose')}>
      {LANGS.map((l) => {
        const on = l === lang;
        return (
          <Pressable
            key={l}
            onPress={() => changeLanguage(l)}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            accessibilityLabel={t(`lang.${l}`)}
            style={[styles.item, on && (dark ? styles.itemOnDark : styles.itemOn)]}
          >
            {/* Each label is rendered in its own script regardless of the active language. */}
            <Text
              variant="label"
              color={on ? (dark ? colors.emerald : colors.white) : dark ? colors.ivory : colors.emerald}
              // Only reference a script font once it is registered (iOS warns on unknown families).
              style={isFontLoaded(l) ? { fontFamily: fontFamily(l, 'semibold'), lineHeight: l === 'ur' ? 26 : 18 } : { fontFamily: undefined, lineHeight: 20 }}
            >
              {t(`lang.${l}`)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', backgroundColor: colors.white, borderRadius: radius.pill, padding: 3, borderWidth: 1, borderColor: colors.border, alignSelf: 'flex-start' },
  wrapDark: { backgroundColor: 'rgba(255,255,255,0.12)', borderColor: 'rgba(255,255,255,0.25)' },
  item: { paddingHorizontal: space.md, minHeight: 34, minWidth: 54, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill },
  itemOn: { backgroundColor: colors.emerald },
  itemOnDark: { backgroundColor: colors.gold },
});
