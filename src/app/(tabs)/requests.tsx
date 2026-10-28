import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { ProfilePhoto } from '@/components/ProfileCard';
import { Button } from '@/components/ui/Button';
import { Badge, EmptyState, ErrorView, Loading, useErrorMessage, useToast } from '@/components/ui/feedback';
import { ChipGroup, ToggleRow } from '@/components/ui/forms';
import { Card, Divider, Row } from '@/components/ui/layout';
import { Text } from '@/components/ui/Text';
import { formatDate } from '@/domain/format';
import type { ConsentScopes } from '@/domain/types';
import { useRequests, useRespondRequest, useSetConsent, useWithdrawRequest } from '@/hooks/queries';
import type { RequestView } from '@/services/backend';
import { colors, maxContentWidth, radius, space } from '@/theme/tokens';

/** Received/sent requests, accept/decline, and the separate consent step (PRD §12). */
export default function Requests() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<'received' | 'sent'>('received');
  const { data, isLoading, error, refetch, isRefetching } = useRequests();
  const list = (data ?? []).filter((r) => r.direction === tab);
  const pendingCount = (data ?? []).filter((r) => r.direction === 'received' && r.request.status === 'pending').length;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={[styles.column, { padding: space.lg, gap: space.md }]}>
        <Text variant="h1" accessibilityRole="header">
          {t('requests.title')}
        </Text>
        <ChipGroup
          options={[
            { value: 'received', label: `${t('requests.received')}${pendingCount ? ` (${pendingCount})` : ''}` },
            { value: 'sent', label: t('requests.sent') },
          ]}
          value={tab}
          onChange={(v) => v && setTab(v)}
        />
      </View>
      {isLoading ? (
        <Loading />
      ) : error ? (
        <ErrorView error={error} onRetry={refetch} />
      ) : (
        <FlatList
          data={list}
          keyExtractor={(r) => r.request.id}
          contentContainerStyle={[styles.column, { paddingHorizontal: space.lg, paddingBottom: space.xxxl, gap: space.md }]}
          renderItem={({ item }) => <RequestCard view={item} />}
          onRefresh={refetch}
          refreshing={isRefetching}
          ListEmptyComponent={<EmptyState icon="mail" title={tab === 'received' ? t('requests.emptyReceived') : t('requests.emptySent')} />}
        />
      )}
    </View>
  );
}

function RequestCard({ view }: { view: RequestView }) {
  const { t } = useTranslation();
  const toast = useToast((s) => s.show);
  const errMsg = useErrorMessage();
  const respond = useRespondRequest();
  const withdraw = useWithdrawRequest();
  const { request: r, other, direction } = view;
  const tone = r.status === 'accepted' ? 'success' : r.status === 'pending' ? 'gold' : 'muted';

  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch (e) {
      toast(errMsg(e), 'danger');
    }
  };

  const theyShared = Object.entries(other.granted).filter(([, v]) => v).map(([k]) => k);
  return (
    <Card padded={false} style={{ overflow: 'hidden' }}>
      <Pressable onPress={() => router.push(`/profile/${other.id}`)} accessibilityRole="button" accessibilityLabel={`${t('card.view')}: ${other.displayName}`} style={styles.head}>
        <View style={styles.thumb}>
          <ProfilePhoto profile={other} height={64} rounded={false} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="h3">{other.displayName}</Text>
          <Text variant="caption">
            {t('common.years', { n: other.age })} · {other.location.city} · {formatDate(r.createdAt)}
          </Text>
        </View>
        <Badge label={t(`requests.status.${r.status}`)} tone={tone} />
      </Pressable>
      <View style={{ paddingHorizontal: space.lg, paddingBottom: space.lg, gap: space.sm }}>
        {r.message ? (
          <View style={styles.msg}>
            <Text variant="caption">{t('requests.message')}</Text>
            <Text variant="body">{r.message}</Text>
          </View>
        ) : null}
        {direction === 'received' && r.status === 'pending' ? (
          <Row gap={space.sm}>
            <Button label={t('requests.decline')} kind="secondary" size="sm" onPress={() => run(() => respond.mutateAsync({ id: r.id, decision: 'declined' }))} style={{ flex: 1 }} />
            <Button label={t('requests.accept')} size="sm" onPress={() => run(() => respond.mutateAsync({ id: r.id, decision: 'accepted' }))} style={{ flex: 1 }} loading={respond.isPending} testID={`accept-${r.id}`} />
          </Row>
        ) : null}
        {direction === 'sent' && r.status === 'pending' ? (
          <Button label={t('requests.withdraw')} kind="ghost" size="sm" onPress={() => run(() => withdraw.mutateAsync(r.id))} />
        ) : null}
        {r.status === 'accepted' ? (
          <>
            <Divider />
            <Text variant="label">{t('requests.theyShared')}</Text>
            <Text variant="caption">
              {theyShared.length ? theyShared.map((k) => t(`requests.share${k === 'fullBiodata' ? 'Full' : k === 'phone' ? 'Phone' : 'Photos'}`)).join(' · ') : t('requests.nothingShared')}
            </Text>
            {other.contact ? (
              <Text variant="h3" selectable>
                {other.contact.countryCode} {other.contact.phone}
              </Text>
            ) : null}
            <ConsentEditor requestId={r.id} name={other.displayName} initial={view.myConsent} />
          </>
        ) : null}
      </View>
    </Card>
  );
}

function ConsentEditor({ requestId, name, initial }: { requestId: string; name: string; initial: ConsentScopes }) {
  const { t } = useTranslation();
  const toast = useToast((s) => s.show);
  const errMsg = useErrorMessage();
  const setConsent = useSetConsent();
  const [scopes, setScopes] = useState<ConsentScopes>(initial);
  const dirty = JSON.stringify(scopes) !== JSON.stringify(initial);
  return (
    <View style={styles.consent}>
      <Text variant="bodyStrong">{t('requests.shareTitle', { name })}</Text>
      <Text variant="caption">{t('requests.shareHelp')}</Text>
      <ToggleRow label={t('requests.sharePhotos')} value={scopes.photos} onChange={(v) => setScopes({ ...scopes, photos: v })} />
      <ToggleRow label={t('requests.sharePhone')} value={scopes.phone} onChange={(v) => setScopes({ ...scopes, phone: v })} />
      <ToggleRow label={t('requests.shareFull')} value={scopes.fullBiodata} onChange={(v) => setScopes({ ...scopes, fullBiodata: v })} />
      <Button
        label={t('requests.saveSharing')}
        size="sm"
        disabled={!dirty}
        loading={setConsent.isPending}
        onPress={async () => {
          try {
            await setConsent.mutateAsync({ id: requestId, scopes });
            toast(t('requests.sharingSaved'));
          } catch (e) {
            toast(errMsg(e), 'danger');
          }
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ivory },
  column: { width: '100%', maxWidth: maxContentWidth, alignSelf: 'center' },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg },
  thumb: { width: 64, height: 64, borderRadius: radius.md, overflow: 'hidden' },
  msg: { backgroundColor: colors.ivory, borderRadius: radius.md, padding: space.md, gap: 4 },
  consent: { backgroundColor: colors.sage, borderRadius: radius.md, padding: space.md, gap: space.xs, marginTop: space.sm },
});
