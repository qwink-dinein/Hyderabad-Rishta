import { View } from 'react-native';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import Constants from 'expo-constants';
import { useTranslation } from 'react-i18next';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { Button } from '@/components/ui/Button';
import { confirm, useErrorMessage, useToast } from '@/components/ui/feedback';
import { Card, Header, InfoRow, Row, Screen, Section } from '@/components/ui/layout';
import { Text } from '@/components/ui/Text';
import { maskPhone } from '@/domain/format';
import { isAdminRole } from '@/domain/types';
import { qk, useBlockedProfiles, useMyProfile } from '@/hooks/queries';
import { ToggleRow } from '@/components/ui/forms';
import { backend, backendInfo } from '@/services';
import { DemoBackend } from '@/services/demo/demoBackend';
import { useFeedbackPrefs } from '@/services/feedback';
import { unbindThisPhone } from '@/services/push';
import { PushSettings } from '@/components/PushSettings';
import { useFilters } from '@/state/filters';
import { useSession } from '@/state/session';
import { colors, space } from '@/theme/tokens';

/** Account, language, privacy and lifecycle actions (PRD §3, §4, §16). */
export default function Settings() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const toast = useToast((s) => s.show);
  const errMsg = useErrorMessage();
  const { user, setUser } = useSession();
  const { data: blocked } = useBlockedProfiles();
  const { data: myProfile } = useMyProfile();
  const demo = backend instanceof DemoBackend ? backend : null;
  const { sound, haptics, setSound, setHaptics } = useFeedbackPrefs();

  const signOut = async () => {
    await unbindThisPhone(); // a shared phone must stop receiving this account's alerts
    await backend.logout();
    qc.clear();
    useFilters.getState().reset();
    setUser(null);
    router.replace('/');
  };

  const guarded = async (title: string, body: string, fn: () => Promise<void>, label: string) => {
    const ok = await confirm({ title, body, confirmLabel: label, danger: true });
    if (!ok) return;
    try {
      await unbindThisPhone();
      await fn();
      qc.clear();
      setUser(null);
      router.replace('/');
    } catch (e) {
      toast(errMsg(e), 'danger');
    }
  };

  return (
    <Screen header={<Header title={t('settings.title')} />} edges={['top', 'bottom']}>
      <Section title={t('settings.language')}>
        <LanguageSwitcher />
      </Section>

      {user ? (
        <Section title={t('push.title')}>
          <PushSettings />
        </Section>
      ) : null}

      <Section title={t('settings.feedback')}>
        <Card>
          <ToggleRow label={t('settings.soundEffects')} hint={t('settings.soundEffectsHelp')} value={sound} onChange={(v) => setSound(v)} />
          <ToggleRow label={t('settings.haptics')} hint={t('settings.hapticsHelp')} value={haptics} onChange={(v) => setHaptics(v)} />
        </Card>
      </Section>

      {user ? (
        <Section title={t('settings.account')}>
          <Card>
            <InfoRow label={t('settings.phone')} value={`${user.countryCode} ${maskPhone(user.phone)}`} />
            <Text variant="caption">{t('settings.phoneHelp')}</Text>
          </Card>
          <Card style={{ gap: space.sm }}>
            <Text variant="label">{t('settings.pinTitle')}</Text>
            <Text variant="caption">{user.hasPin ? t('settings.pinOn') : t('settings.pinOff')}</Text>
            <Button
              label={user.hasPin ? t('settings.pinChange') : t('settings.pinSetup')}
              kind="secondary"
              size="sm"
              onPress={() => (user.hasPin ? router.push({ pathname: '/pin', params: { mode: 'change', next: '/settings' } }) : router.push({ pathname: '/login', params: { purpose: 'setup' } }))}
              style={{ alignSelf: 'flex-start' }}
              testID="pin-settings-action"
            />
          </Card>
          {myProfile ? (
            <Card style={{ gap: space.xs }}>
              <Text variant="label" onPress={() => router.push({ pathname: '/biodata', params: { step: '6' } })} accessibilityRole="link" color={colors.emerald}>
                {t('settings.visibility')}
              </Text>
              <Text variant="caption">{t('settings.visibilityHelp')}</Text>
            </Card>
          ) : null}
          {isAdminRole(user.role) ? <Button label={t('settings.admin')} onPress={() => router.push('/admin')} /> : null}
        </Section>
      ) : null}

      {user ? (
        myProfile ? (
          <Section title={t('requests.title')}>
            <Card>
              <ToggleRow
                label={t('settings.allowReminders')}
                hint={t('settings.allowRemindersHelp')}
                value={myProfile.biodata.privacy.allowReminders !== false}
                onChange={async (v) => {
                  try {
                    await backend.setAllowReminders(v);
                    qc.invalidateQueries({ queryKey: qk.myProfile });
                  } catch (e) {
                    toast(errMsg(e), 'danger');
                  }
                }}
              />
            </Card>
          </Section>
        ) : null
      ) : null}

      {user ? (
        <Section title={t('settings.blocked')}>
          <Card style={{ gap: space.sm }}>
            {blocked?.length ? (
              blocked.map((b) => (
                <Row key={b.profileId} style={{ justifyContent: 'space-between' }}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text variant="label">{b.name}</Text>
                    <Text variant="caption">{b.code}</Text>
                  </View>
                  <Button
                    label={t('profile.unblock')}
                    size="sm"
                    kind="secondary"
                    accessibilityHint={`${b.name} ${b.code}`}
                    testID={`unblock-${b.profileId}`}
                    onPress={async () => {
                      try {
                        await backend.unblockProfile(b.profileId);
                        qc.invalidateQueries({ queryKey: qk.blocked });
                        qc.invalidateQueries({ queryKey: ['search'] });
                        qc.invalidateQueries({ queryKey: qk.featured });
                      } catch (e) {
                        toast(errMsg(e), 'danger');
                      }
                    }}
                  />
                </Row>
              ))
            ) : (
              <Text variant="caption">{t('settings.noneBlocked')}</Text>
            )}
          </Card>
        </Section>
      ) : null}

      <Section title={t('settings.about')}>
        <Card style={{ gap: space.sm }}>
          <Text variant="label" onPress={() => router.push('/legal/privacy')} accessibilityRole="link" color={colors.emerald}>
            {t('settings.privacyPolicy')}
          </Text>
          <Text variant="label" onPress={() => router.push('/legal/terms')} accessibilityRole="link" color={colors.emerald}>
            {t('settings.terms')}
          </Text>
          <Text variant="label" onPress={() => router.push('/legal/help')} accessibilityRole="link" color={colors.emerald}>
            {t('settings.help')}
          </Text>
          <Text variant="caption">{t('settings.version', { v: Constants.expoConfig?.version ?? '1.0.0' })}</Text>
          {backendInfo.kind === 'demo' ? <Text variant="caption">{t('settings.backendDemo')}</Text> : null}
        </Card>
      </Section>

      {user ? (
        <View style={{ gap: space.sm, marginTop: space.xl }}>
          <Button label={t('settings.logout')} kind="secondary" onPress={signOut} testID="logout" />
          <Button label={t('settings.deactivate')} kind="ghost" onPress={() => guarded(t('settings.deactivate'), t('settings.deactivateConfirm'), () => backend.deactivateAccount(), t('settings.deactivate'))} />
          <Button label={t('settings.delete')} kind="danger" onPress={() => guarded(t('settings.delete'), t('settings.deleteConfirm'), () => backend.deleteAccount(), t('settings.delete'))} />
        </View>
      ) : null}

      {demo ? (
        <Button
          label={t('settings.demoReset')}
          kind="ghost"
          style={{ marginTop: space.xl }}
          onPress={async () => {
            const ok = await confirm({ title: t('settings.demoReset'), danger: true });
            if (!ok) return;
            await demo.reset();
            qc.clear();
            setUser(null);
            toast(t('settings.demoResetDone'));
            router.replace('/');
          }}
        />
      ) : null}
    </Screen>
  );
}
