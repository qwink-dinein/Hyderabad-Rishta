import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { BrandMark } from '@/components/art/Illustrations';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Card, Row } from '@/components/ui/layout';
import { Text } from '@/components/ui/Text';
import { formatDate } from '@/domain/format';
import { normalizeReferralCode, type MyReferral, type ReferralSettings } from '@/domain/referral';
import { useMyReferral, useReferralSettings } from '@/hooks/queries';
import { backend } from '@/services';
import { getPendingReferral, savePendingReferral } from '@/services/referralCapture';
import { colors, radius, space } from '@/theme/tokens';

/**
 * Referral free Boosts (owner spec + approved designs 2026-11-02). Every piece here is ADDED to an existing
 * screen and shows only where the spec says: Referral mode for the promotions; a member's own earned Boosts
 * in either mode. Paid Boost screens are otherwise unchanged.
 */

/** Referral mode is on and the programme is open. */
export function useReferralMode(): { on: boolean; settings?: ReferralSettings } {
  const { data } = useReferralSettings();
  return { on: !!data && data.mode === 'referral' && data.enabled, settings: data };
}

/** Boost screen, Referral mode: the referral headline, my free-Boost balance, and how to earn one. */
export function ReferralBoostPanel({ boostActiveUntil }: { boostActiveUntil?: string }) {
  const { t } = useTranslation();
  const { data: me } = useMyReferral();
  const days = me?.rewardDays ?? 7;
  return (
    <View style={{ gap: space.lg }} testID="referral-boost-panel">
      <View style={styles.hero}>
        <View style={styles.heroMark} pointerEvents="none">
          <BrandMark size={130} />
        </View>
        <View style={styles.badge}>
          <Text variant="overline" color={colors.forest}>
            {t('referral.heroBadge')}
          </Text>
        </View>
        <Text variant="h1" color={colors.ivory} accessibilityRole="header">
          {t('referral.heroTitle')}
        </Text>
        <Text variant="body" color={colors.sage}>
          {t('referral.heroBody', { days })}
          {me?.inviteeReward ? ` ${t('referral.heroBoth')}` : ''}
        </Text>
        <Button label={t('referral.cta')} kind="gold" full onPress={() => router.push('/refer')} icon={<Icon name="users" size={18} color={colors.forest} />} testID="referral-cta" />
      </View>
      {me ? <FreeBoostBalance me={me} boostActiveUntil={boostActiveUntil} /> : null}
      <View style={{ gap: space.sm }}>
        <Text variant="h3">{t('referral.howTitle')}</Text>
        {[t('referral.how1'), t('referral.how2'), me?.inviteeReward ? t('referral.how3Both', { days }) : t('referral.how3', { days }), t('referral.how4')].map((line, i) => (
          <Row key={i} gap={space.md} style={{ alignItems: 'flex-start' }}>
            <View style={styles.step}>
              <Text variant="label" color={colors.goldDeep}>
                {i + 1}
              </Text>
            </View>
            <Text variant="body" style={{ flex: 1 }}>
              {line}
            </Text>
          </Row>
        ))}
      </View>
      <Text variant="caption">{t('myBoost.honest')}</Text>
    </View>
  );
}

/** "Free Boosts available: N" with the Use button. `boostActiveUntil` = the running Boost's end (only while one runs). */
export function FreeBoostBalance({ me, boostActiveUntil }: { me: MyReferral; boostActiveUntil?: string }) {
  const { t } = useTranslation();
  const running = !!boostActiveUntil; // callers pass it only while a Boost is running
  return (
    <Card style={{ gap: space.md }} testID="referral-balance">
      <Row style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <View style={{ gap: 2 }}>
          <Text variant="caption">{t('referral.available')}</Text>
          <Text variant="h1" testID="referral-available">
            {me.stats.available}
          </Text>
        </View>
        <Row gap={space.lg}>
          <View style={{ alignItems: 'flex-end' }}>
            <Text variant="caption">{t('referral.earned')}</Text>
            <Text variant="bodyStrong">{me.stats.earned}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text variant="caption">{t('referral.used')}</Text>
            <Text variant="bodyStrong">{me.stats.used}</Text>
          </View>
        </Row>
      </Row>
      {me.stats.available > 0 ? (
        running ? (
          <Text variant="label" color={colors.emerald} testID="referral-use-after">
            {t('referral.useAfter', { date: formatDate(boostActiveUntil) })}
          </Text>
        ) : (
          <Button label={t('referral.useNow', { days: me.rewardDays })} full onPress={() => router.push('/refer/use')} testID="referral-use" />
        )
      ) : (
        <Text variant="caption">{t('referral.noneYet')}</Text>
      )}
      <Text variant="caption">{t('referral.chooseWhen')}</Text>
    </Card>
  );
}

/** Paid mode: a member who still has free Boosts from earlier referrals can use them (nothing else changes). */
export function LeftoverFreeBoosts() {
  const { t } = useTranslation();
  const { data: me } = useMyReferral();
  const n = me?.stats.available ?? 0;
  if (!n) return null;
  return (
    <Pressable onPress={() => router.push('/refer/use')} accessibilityRole="button" style={styles.leftover} testID="referral-leftover">
      <Icon name="sparkle" size={18} color={colors.goldDeep} />
      <Text variant="label" style={{ flex: 1 }}>
        {t('referral.leftover', { count: n })}
      </Text>
      <Text variant="label" color={colors.emerald}>
        {t('referral.useOne')}
      </Text>
    </Pressable>
  );
}

/** Home: one quiet promotional banner, Referral mode only. */
export function HomeReferralBanner() {
  const { t } = useTranslation();
  const { on } = useReferralMode();
  if (!on) return null;
  return (
    <Pressable onPress={() => router.push('/refer')} accessibilityRole="button" style={styles.banner} testID="home-referral-banner">
      <BrandMark size={48} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="bodyStrong" color={colors.ivory}>
          {t('referral.homeTitle')}
        </Text>
        <Text variant="caption" color={colors.sage}>
          {t('referral.homeBody')}
        </Text>
      </View>
      <Icon name="chevronRight" size={20} color={colors.gold} />
    </Pressable>
  );
}

/** Profile tab: the Refer & Earn entry (Referral mode, or whenever the member has referral Boosts). */
export function ProfileReferralCard() {
  const { t } = useTranslation();
  const { on } = useReferralMode();
  const { data: me } = useMyReferral();
  if (!on && !(me && (me.stats.earned > 0 || me.stats.referred > 0))) return null;
  return (
    <Pressable onPress={() => router.push('/refer')} accessibilityRole="button" style={styles.profileCard} testID="profile-referral-card">
      <View style={styles.iconBox}>
        <Icon name="users" size={20} color={colors.goldDeep} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="bodyStrong">{t('referral.title')}</Text>
        <Text variant="caption">{me && me.stats.earned > 0 ? t('referral.cardHint', { earned: me.stats.earned, available: me.stats.available }) : t('referral.cardHintNew')}</Text>
      </View>
      <Icon name="chevronRight" size={20} color={colors.muted} />
    </Pressable>
  );
}

/** Home: the invited family's welcome Boost, once their biodata is approved (either mode — it is theirs). */
export function WelcomeGiftCard() {
  const { t } = useTranslation();
  const { data: me } = useMyReferral();
  const gift = me?.rewards.find((w) => w.role === 'invitee' && w.status === 'available');
  if (!gift) return null;
  return (
    <Pressable onPress={() => router.push('/refer/use')} accessibilityRole="button" style={styles.gift} testID="referral-welcome-gift">
      <Icon name="sparkle" size={22} color={colors.goldDeep} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="bodyStrong">{t('referral.giftTitle', { days: gift.days })}</Text>
        <Text variant="caption">{t('referral.giftBody')}</Text>
      </View>
      <Icon name="chevronRight" size={20} color={colors.goldDeep} />
    </Pressable>
  );
}

/** "Your biodata is live" (and after approval): one line inviting them to refer others — Referral mode only. */
export function InviteAfterLive() {
  const { t } = useTranslation();
  const { on, settings } = useReferralMode();
  if (!on || !settings) return null;
  return (
    <Pressable onPress={() => router.push('/refer')} accessibilityRole="button" style={styles.after} testID="referral-after-live">
      <Icon name="users" size={22} color={colors.gold} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="bodyStrong" color={colors.ivory}>
          {t('referral.afterTitle')}
        </Text>
        <Text variant="caption" color={colors.sage}>
          {settings.inviteeReward ? t('referral.afterBodyBoth', { days: settings.rewardDays }) : t('referral.afterBody', { days: settings.rewardDays })}
        </Text>
      </View>
      <Icon name="chevronRight" size={20} color={colors.gold} />
    </Pressable>
  );
}

/** Welcome screens: shown when this phone opened someone's invitation link. */
export function InvitedBanner({ tone = 'dark' }: { tone?: 'dark' | 'light' }) {
  const { t } = useTranslation();
  const { data: s } = useReferralSettings();
  const [code, setCode] = useState<string | null>(null);
  useEffect(() => {
    getPendingReferral().then(setCode);
  }, []);
  if (!code || (s && !s.enabled)) return null;
  const dark = tone === 'dark';
  return (
    <View style={[styles.invited, !dark && styles.invitedLight]} testID="invited-banner">
      <Icon name="sparkle" size={22} color={colors.gold} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="bodyStrong" color={dark ? colors.ivory : colors.charcoal}>
          {t('referral.invitedTitle')}
        </Text>
        <Text variant="caption" color={dark ? colors.sage : colors.muted}>
          {s?.inviteeReward ? t('referral.invitedSubBoost', { code, days: s.rewardDays }) : t('referral.invitedSub', { code })}
        </Text>
      </View>
    </View>
  );
}

/** Sign-up (phone step): the invitation code — prefilled from the link, or typed. Saved for after the OTP. */
export function ReferralCodeField() {
  const { t } = useTranslation();
  const { data: s } = useReferralSettings();
  const [value, setValue] = useState('');
  const [state, setState] = useState<'idle' | 'valid' | 'invalid'>('idle');
  useEffect(() => {
    getPendingReferral().then((c) => {
      if (c) {
        setValue(c);
        setState('valid');
      }
    });
  }, []);
  if (s && !s.enabled) return null;
  const check = async (raw: string) => {
    const c = normalizeReferralCode(raw);
    if (!raw.trim()) {
      setState('idle');
      await savePendingReferral(null);
      return;
    }
    if (!c) return setState('invalid');
    const ok = await backend.checkReferralCode(c).catch(() => false);
    setState(ok ? 'valid' : 'invalid');
    await savePendingReferral(ok ? c : null);
  };
  return (
    <View style={{ gap: space.xs }} testID="referral-code-field">
      <Text variant="label">
        {t('referral.codeLabel')} <Text variant="caption">{t('referral.codeOptional')}</Text>
      </Text>
      <View style={[styles.codeBox, state === 'valid' && { borderColor: colors.success }, state === 'invalid' && { borderColor: colors.danger }]}>
        <TextInput
          value={value}
          onChangeText={(v) => {
            setValue(v.toUpperCase());
            setState('idle');
          }}
          onBlur={() => check(value)}
          onSubmitEditing={() => check(value)}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={10}
          placeholder="HR····"
          accessibilityLabel={t('referral.codeLabel')}
          style={styles.codeInput}
          testID="referral-code-input"
        />
        {state === 'valid' ? (
          <Row gap={4}>
            <Icon name="check" size={18} color={colors.success} />
            <Text variant="label" color={colors.success}>
              {t('referral.codeValid')}
            </Text>
          </Row>
        ) : null}
      </View>
      {state === 'invalid' ? (
        <Text variant="caption" color={colors.danger} testID="referral-code-invalid">
          {t('referral.codeInvalid')}
        </Text>
      ) : null}
      <Text variant="caption">{s?.inviteeReward ? t('referral.codeHint', { days: s.rewardDays }) : t('referral.codeHintPlain')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { borderRadius: radius.lg, padding: space.xl, gap: space.sm, overflow: 'hidden', backgroundColor: colors.forest },
  heroMark: { position: 'absolute', right: -24, top: -20, opacity: 0.2 },
  badge: { alignSelf: 'flex-start', backgroundColor: colors.gold, borderRadius: radius.pill, paddingHorizontal: space.sm, paddingVertical: 3 },
  step: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.goldSoft, alignItems: 'center', justifyContent: 'center' },
  leftover: { flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.md, borderRadius: radius.md, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.gold, minHeight: 48 },
  banner: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: radius.lg, backgroundColor: colors.forest, minHeight: 64 },
  profileCard: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: radius.lg, backgroundColor: colors.white, borderWidth: 1.5, borderColor: colors.gold, minHeight: 64 },
  iconBox: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.goldSoft, alignItems: 'center', justifyContent: 'center' },
  gift: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: radius.lg, backgroundColor: colors.goldSoft, borderWidth: 1.5, borderColor: colors.gold, minHeight: 64 },
  after: { flexDirection: 'row', alignItems: 'center', gap: space.md, borderRadius: radius.lg, padding: space.md, backgroundColor: colors.forest, minHeight: 64 },
  invited: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.gold, backgroundColor: colors.emerald },
  invitedLight: { backgroundColor: colors.goldSoft },
  codeBox: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 52, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.white, paddingHorizontal: space.md },
  codeInput: { flex: 1, minWidth: 0, fontSize: 17, letterSpacing: 1.5, color: colors.charcoal, paddingVertical: space.sm },
});
