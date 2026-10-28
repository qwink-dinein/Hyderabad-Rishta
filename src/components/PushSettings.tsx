import { useCallback, useEffect, useState } from 'react';
import { Linking, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { PushPrefs } from '@/domain/types';
import { qk, useMyProfile, usePushSettings } from '@/hooks/queries';
import { backend } from '@/services';
import { dismissPrompt, enablePush, getPushStatus, promptDismissedRecently, sendTestNotification, type PushStatus } from '@/services/push';
import { colors, space } from '@/theme/tokens';
import { Button } from './ui/Button';
import { Banner, useErrorMessage, useToast } from './ui/feedback';
import { ToggleRow } from './ui/forms';
import { Icon } from './ui/Icon';
import { Card, Row } from './ui/layout';
import { Text } from './ui/Text';

function usePushStatus() {
  const [status, setStatus] = useState<PushStatus | null>(null);
  const refresh = useCallback(() => {
    getPushStatus().then(setStatus).catch(() => setStatus('error'));
  }, []);
  useEffect(refresh, [refresh]);
  return { status, setStatus, refresh };
}

/** Settings → Phone notifications: this phone's status + account-wide preferences (stored server-side). */
export function PushSettings() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const toast = useToast((s) => s.show);
  const errMsg = useErrorMessage();
  const { status, setStatus } = usePushStatus();
  const { data } = usePushSettings();
  const [busy, setBusy] = useState(false);
  const prefs = data?.prefs;

  const turnOn = async () => {
    setBusy(true);
    const s = await enablePush(true);
    setStatus(s);
    setBusy(false);
    qc.invalidateQueries({ queryKey: qk.pushSettings });
    if (s === 'granted') toast(t('push.enabled'));
  };
  const set = async (patch: Partial<PushPrefs>) => {
    try {
      const next = await backend.setPushPrefs(patch);
      qc.setQueryData(qk.pushSettings, { prefs: next, devices: data?.devices ?? 0 });
    } catch (e) {
      toast(errMsg(e), 'danger');
    }
  };

  const statusLine: { tone: 'success' | 'warning' | 'info'; icon: 'check' | 'info' | 'bell'; text: string; action?: { label: string; run: () => void } } | null =
    status === null
      ? null
      : status === 'granted'
        ? { tone: 'success', icon: 'check', text: t('push.status.granted', { count: data?.devices ?? 1 }) }
        : status === 'undetermined'
          ? { tone: 'info', icon: 'bell', text: t('push.status.undetermined'), action: { label: t('push.turnOn'), run: turnOn } }
          : status === 'denied'
            ? { tone: 'warning', icon: 'info', text: t('push.status.denied'), action: { label: t('push.openSettings'), run: () => Linking.openSettings().catch(() => undefined) } }
            : status === 'error'
              ? { tone: 'warning', icon: 'info', text: t('push.status.error'), action: { label: t('common.retry'), run: turnOn } }
              : { tone: 'info', icon: 'info', text: t(`push.status.${status}`) };

  return (
    <View style={{ gap: space.sm }} testID="push-settings">
      {statusLine ? (
        <Banner tone={statusLine.tone} icon={statusLine.icon}>
          <Text variant="caption" color={statusLine.tone === 'success' ? colors.success : statusLine.tone === 'warning' ? colors.goldDeep : colors.emerald}>
            {statusLine.text}
          </Text>
          {statusLine.action ? <Button label={statusLine.action.label} size="sm" kind="secondary" onPress={statusLine.action.run} loading={busy} style={{ alignSelf: 'flex-start', marginTop: space.sm }} testID="push-action" /> : null}
        </Banner>
      ) : null}
      {prefs ? (
        <Card>
          <ToggleRow label={t('push.master')} hint={t('push.masterHelp')} value={prefs.enabled} onChange={(v) => set({ enabled: v })} />
          <View style={{ opacity: prefs.enabled ? 1 : 0.5 }} pointerEvents={prefs.enabled ? 'auto' : 'none'}>
            <ToggleRow label={t('push.cat.interests')} hint={t('push.cat.interestsHelp')} value={prefs.interests} onChange={(v) => set({ interests: v })} />
            <ToggleRow label={t('push.cat.activity')} hint={t('push.cat.activityHelp')} value={prefs.activity} onChange={(v) => set({ activity: v })} />
            <ToggleRow label={t('push.cat.announcements')} value={prefs.announcements} onChange={(v) => set({ announcements: v })} />
          </View>
          <Row style={{ marginTop: space.xs, alignItems: 'flex-start' }}>
            <Icon name="shield" size={16} color={colors.goldMuted} />
            <Text variant="caption" style={{ flex: 1 }}>
              {t('push.accountAlways')}
            </Text>
          </Row>
          <View style={{ height: space.sm }} />
          <ToggleRow label={t('push.showNames')} hint={t('push.showNamesHelp')} value={prefs.showNames} onChange={(v) => set({ showNames: v })} />
        </Card>
      ) : null}
      {status === 'granted' || status === 'expo_go_android' || status === 'no_project' ? (
        <Button
          label={t('push.test')}
          kind="ghost"
          size="sm"
          icon={<Icon name="bell" size={16} />}
          onPress={async () => {
            const ok = await sendTestNotification(t('push.testTitle'), t('push.testBody'));
            toast(ok ? t('push.testSent') : t('push.status.error'), ok ? 'success' : 'danger');
          }}
          style={{ alignSelf: 'flex-start' }}
        />
      ) : null}
    </View>
  );
}

/** Home: a gentle, dismissible ask — shown only to members with a profile, never on web, never twice in 14 days. */
export function PushPrompt() {
  const { t } = useTranslation();
  const { data: me } = useMyProfile();
  const { status, setStatus } = usePushStatus();
  const [hidden, setHidden] = useState(true);
  useEffect(() => {
    promptDismissedRecently().then((d) => setHidden(d));
  }, []);
  if (hidden || !me || status !== 'undetermined') return null;
  return (
    <Card style={{ gap: space.sm, marginTop: space.md, borderColor: colors.gold }} >
      <Row style={{ alignItems: 'flex-start' }} gap={space.md}>
        <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.goldSoft, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="bell" size={20} color={colors.emerald} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="bodyStrong">{t('push.promptTitle')}</Text>
          <Text variant="caption">{t('push.promptBody')}</Text>
        </View>
      </Row>
      <Row gap={space.sm}>
        <Button
          label={t('push.notNow')}
          kind="ghost"
          size="sm"
          onPress={() => {
            dismissPrompt();
            setHidden(true);
          }}
          style={{ flex: 1 }}
        />
        <Button label={t('push.turnOn')} size="sm" onPress={async () => setStatus(await enablePush(true))} style={{ flex: 1.4 }} testID="push-prompt-on" />
      </Row>
    </Card>
  );
}
