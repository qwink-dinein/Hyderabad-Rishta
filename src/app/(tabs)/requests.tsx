import { useEffect, useMemo, useState } from 'react';
import { Animated, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { ContactActions } from '@/components/ContactActions';
import { ProfilePhoto } from '@/components/ProfileCard';
import { TabHeader } from '@/components/TabHeader';
import { Button } from '@/components/ui/Button';
import { Badge, Banner, confirm, EmptyState, ErrorView, Loading, useErrorMessage, useToast } from '@/components/ui/feedback';
import { Segmented, ToggleRow } from '@/components/ui/forms';
import { Icon } from '@/components/ui/Icon';
import { Card, Divider, Row } from '@/components/ui/layout';
import { Text } from '@/components/ui/Text';
import { formatDate, uid } from '@/domain/format';
import type { ConsentScopes, PhoneOffer, RequestStatus } from '@/domain/types';
import { useOfferPhone, usePokeRequest, useRequests, useRespondPhoneOffer, useRespondRequest, useSetConsent, useWithdrawPhoneOffer, useWithdrawRequest } from '@/hooks/queries';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import type { RequestView } from '@/services/backend';
import { celebrate } from '@/services/feedback';
import { useSession } from '@/state/session';
import { colors, maxContentWidth, radius, space } from '@/theme/tokens';

const TONE: Record<RequestStatus, 'gold' | 'success' | 'muted' | 'danger'> = {
  pending: 'gold',
  accepted: 'success',
  declined: 'muted',
  withdrawn: 'muted',
  expired: 'muted',
  blocked: 'danger',
};

/** Interest inbox: received/sent, accept/decline, number offers both ways, poke, withdraw (feature PRD §3–7). */
export default function Requests() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<'received' | 'sent'>('received');
  const { data, isLoading, error, refetch, isRefetching } = useRequests();
  const list = (data ?? []).filter((r) => r.direction === tab);
  const pendingCount = (data ?? []).filter((r) => r.direction === 'received' && r.request.status === 'pending').length;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <TabHeader title={t('requests.title')} />
      <View style={[styles.column, { paddingHorizontal: space.lg, paddingBottom: space.md, gap: space.md }]}>
        <Segmented
          options={[
            { value: 'received', label: `${t('requests.received')}${pendingCount ? ` (${pendingCount})` : ''}` },
            { value: 'sent', label: t('requests.sent') },
          ]}
          value={tab}
          onChange={setTab}
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

function useRun() {
  const toast = useToast((s) => s.show);
  const errMsg = useErrorMessage();
  return async (fn: () => Promise<unknown>, ok?: string) => {
    try {
      await fn();
      if (ok) toast(ok);
    } catch (e) {
      toast(errMsg(e), 'danger');
    }
  };
}

function RequestCard({ view }: { view: RequestView }) {
  const { t } = useTranslation();
  const run = useRun();
  const respond = useRespondRequest();
  const withdraw = useWithdrawRequest();
  const poke = usePokeRequest();
  const withdrawOffer = useWithdrawPhoneOffer();
  const { request: r, other, direction } = view;
  const open = r.status === 'pending';
  const profileLink = () => router.push(`/profile/${other.id}`);

  return (
    <Card padded={false} style={{ overflow: 'hidden' }}>
      <Pressable onPress={profileLink} accessibilityRole="button" accessibilityLabel={`${t('card.view')}: ${other.displayName}`} style={styles.head}>
        <View style={styles.thumb}>
          <ProfilePhoto profile={other} height={60} rounded={false} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="h3">
            {other.displayName}, {other.age}
          </Text>
          {direction === 'received' && open && view.theirOffer?.status === 'offered' ? (
            <Text variant="caption" color={colors.goldDeep}>
              {t('requests.offeredShort')}
            </Text>
          ) : null}
          <Text variant="caption">
            {[other.location.city, other.location.state].filter(Boolean).join(', ')}
          </Text>
          <Text variant="caption">{[t(`opt.education.${other.career.education}`, { defaultValue: '' }), other.career.professionOther ?? t(`opt.profession.${other.career.profession}`, { defaultValue: '' })].filter(Boolean).join(' · ')}</Text>
        </View>
        <Badge label={t(`requests.status.${r.status}`)} tone={TONE[r.status]} />
      </Pressable>

      <View style={{ paddingHorizontal: space.lg, paddingBottom: space.lg, gap: space.sm }}>
        <Text variant="caption">
          {formatDate(r.createdAt)}
          {open ? ` · ${t('requests.expiresOn', { date: formatDate(r.expiresAt) })}` : ''}
        </Text>
        {r.message ? (
          <View style={styles.msg}>
            <Text variant="caption">{t('requests.message')}</Text>
            <Text variant="body">{r.message}</Text>
          </View>
        ) : null}

        {/* ── Received & pending: Accept / Decline / View Profile / Report ── */}
        {direction === 'received' && open ? (
          <>
            <Banner icon={view.theirOffer?.status === 'offered' ? 'phone' : 'lock'} tone={view.theirOffer?.status === 'offered' ? 'warning' : 'info'}>
              {view.theirOffer?.status === 'offered' ? t('requests.offeredNotice') : t('requests.noOfferNotice')}
            </Banner>
            <Row gap={space.sm}>
              <Button label={t('requests.decline')} kind="secondary" size="sm" onPress={() => run(() => respond.mutateAsync({ id: r.id, decision: 'declined' }))} style={{ flex: 1 }} disabled={respond.isPending} testID={`decline-${r.id}`} />
              <Button label={t('requests.accept')} size="sm" onPress={() => run(async () => {
                await respond.mutateAsync({ id: r.id, decision: 'accepted' });
                celebrate('accepted');
              })} style={{ flex: 1 }} loading={respond.isPending} disabled={respond.isPending} testID={`accept-${r.id}`} />
            </Row>
            <Row gap={space.sm}>
              <Button label={t('requests.viewProfile')} kind="ghost" size="sm" onPress={profileLink} />
              <Button label={t('requests.report')} kind="ghost" size="sm" icon={<Icon name="flag" size={14} />} onPress={() => router.push({ pathname: '/profile/[id]', params: { id: other.id, report: '1' } })} />
            </Row>
          </>
        ) : null}

        {/* ── Sent & pending: offer status, withdraw, poke ── */}
        {direction === 'sent' && open ? (
          <>
            {view.myOffer ? <OfferLine label={t('requests.yourNumber')} offer={view.myOffer} /> : null}
            <PokeLine view={view} onPoke={() => run(() => poke.mutateAsync(r.id), t('requests.pokeSent'))} busy={poke.isPending} />
            <Row gap={space.sm} wrap>
              {view.myOffer?.status === 'offered' ? (
                <Button label={t('requests.withdrawOffer')} kind="ghost" size="sm" onPress={() => run(() => withdrawOffer.mutateAsync(view.myOffer!.id))} testID={`withdraw-offer-${r.id}`} />
              ) : null}
              <Button
                label={t('requests.withdraw')}
                kind="ghost"
                size="sm"
                onPress={async () => {
                  if (await confirm({ title: t('requests.withdraw'), body: t('requests.withdrawConfirm'), confirmLabel: t('requests.withdraw'), danger: true })) run(() => withdraw.mutateAsync(r.id));
                }}
              />
            </Row>
          </>
        ) : null}

        {r.status === 'accepted' ? <AcceptedSection view={view} /> : null}
      </View>
    </Card>
  );
}

function OfferLine({ label, offer }: { label: string; offer?: PhoneOffer }) {
  const { t } = useTranslation();
  const status = offer?.status ?? 'none';
  return (
    <Row style={{ justifyContent: 'space-between' }}>
      <Text variant="label">{label}</Text>
      <Badge label={t(`requests.phone.${status}`)} tone={status === 'accepted' ? 'success' : status === 'offered' ? 'gold' : 'muted'} />
    </Row>
  );
}

function PokeLine({ view, onPoke, busy }: { view: RequestView; onPoke: () => void; busy: boolean }) {
  const { t } = useTranslation();
  const [mountedAt] = useState(() => Date.now());
  const hours = useMemo(() => {
    if (!view.poke.availableAt) return 0;
    return Math.max(1, Math.ceil((new Date(view.poke.availableAt).getTime() - mountedAt) / 3600000));
  }, [view.poke.availableAt, mountedAt]);
  if (view.poke.canPoke)
    return <Button label={t('requests.poke')} size="sm" kind="gold" icon={<PokeBell />} onPress={onPoke} loading={busy} disabled={busy} style={{ alignSelf: 'flex-start' }} testID={`poke-${view.request.id}`} />;
  const reason = view.poke.reason;
  const text =
    reason === 'wait' ? t('requests.pokeWait', { hours }) : reason === 'used' ? t('requests.pokeUsed') : reason === 'limit' ? t('requests.pokeLimit') : reason === 'optout' ? t('requests.pokeOptout') : null;
  return text ? (
    <Text variant="caption" testID={`poke-status-${view.request.id}`}>
      {text}
    </Text>
  ) : null;
}

/** Bell that makes one small, restrained swing when the reminder becomes available (Design PRD §9.2). */
function PokeBell() {
  const reduced = useReducedMotion();
  const [r] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (reduced) return;
    Animated.sequence([
      Animated.delay(250),
      Animated.timing(r, { toValue: 1, duration: 120, useNativeDriver: true }),
      Animated.timing(r, { toValue: -1, duration: 160, useNativeDriver: true }),
      Animated.timing(r, { toValue: 0, duration: 120, useNativeDriver: true }),
    ]).start();
  }, [r, reduced]);
  return (
    <Animated.View style={{ transform: [{ rotate: r.interpolate({ inputRange: [-1, 1], outputRange: ['-14deg', '14deg'] }) }] }}>
      <Icon name="bell" size={16} color={colors.emerald} />
    </Animated.View>
  );
}

function AcceptedSection({ view }: { view: RequestView }) {
  const { t } = useTranslation();
  const run = useRun();
  const user = useSession((s) => s.user);
  const offerPhone = useOfferPhone();
  const respondOffer = useRespondPhoneOffer();
  const withdrawOffer = useWithdrawPhoneOffer();
  const { other, myOffer, theirOffer } = view;
  const canOffer = !myOffer || ['declined', 'withdrawn', 'expired'].includes(myOffer.status);

  const share = async () => {
    const ok = await confirm({
      title: t('requests.shareMyNumber'),
      body: `${t('requests.offerConfirm', { masked: `${user?.countryCode ?? ''} ${view.myPhoneMasked}`, name: other.displayName })}\n\n✓ ${t('connect.consent')}`,
      confirmLabel: t('requests.shareMyNumber'),
    });
    if (ok) run(() => offerPhone.mutateAsync({ requestId: view.request.id, idempotencyKey: uid('offer_') }));
  };

  return (
    <View style={{ gap: space.sm }}>
      <Divider />
      {/* Their number */}
      <Text variant="overline">{t('requests.theirNumber')}</Text>
      {other.contact ? (
        <ContactActions countryCode={other.contact.countryCode} phone={other.contact.phone} />
      ) : theirOffer?.status === 'offered' ? (
        <View style={styles.offerBox}>
          <Text variant="body">{t('requests.theyOffered', { name: other.displayName })}</Text>
          <Row gap={space.sm}>
            <Button label={t('requests.declineNumber')} kind="secondary" size="sm" onPress={() => run(() => respondOffer.mutateAsync({ id: theirOffer.id, decision: 'declined' }))} style={{ flex: 1 }} />
            <Button label={t('requests.acceptNumber')} size="sm" onPress={() => run(async () => {
              await respondOffer.mutateAsync({ id: theirOffer.id, decision: 'accepted' });
              celebrate('accepted');
            })} style={{ flex: 1.3 }} loading={respondOffer.isPending} testID={`accept-number-${view.request.id}`} />
          </Row>
        </View>
      ) : (
        <OfferLine label={t('requests.theirNumber')} offer={theirOffer} />
      )}

      {/* My number */}
      <Text variant="overline" style={{ marginTop: space.sm }}>
        {t('requests.yourNumber')}
      </Text>
      <OfferLine label={`${user?.countryCode ?? ''} ${view.myPhoneMasked}`} offer={myOffer} />
      {canOffer ? (
        <>
          <Text variant="caption">{t('requests.shareMyNumberHelp', { name: other.displayName })}</Text>
          <Button label={t('requests.shareMyNumber')} size="sm" icon={<Icon name="phone" size={16} color={colors.white} />} onPress={share} style={{ alignSelf: 'flex-start' }} loading={offerPhone.isPending} testID={`share-number-${view.request.id}`} />
        </>
      ) : myOffer?.status === 'offered' ? (
        <Button label={t('requests.withdrawOffer')} kind="ghost" size="sm" onPress={() => run(() => withdrawOffer.mutateAsync(myOffer.id))} style={{ alignSelf: 'flex-start' }} />
      ) : null}

      <ConsentEditor requestId={view.request.id} name={other.displayName} initial={view.myConsent} />
    </View>
  );
}

/** Photos / full biodata — phone sharing is handled by offers above. */
function ConsentEditor({ requestId, name, initial }: { requestId: string; name: string; initial: ConsentScopes }) {
  const { t } = useTranslation();
  const run = useRun();
  const setConsent = useSetConsent();
  const [scopes, setScopes] = useState<ConsentScopes>(initial);
  const dirty = scopes.photos !== initial.photos || scopes.fullBiodata !== initial.fullBiodata;
  return (
    <View style={styles.consent}>
      <Text variant="bodyStrong">{t('requests.alsoShare')}</Text>
      <Text variant="caption">{t('requests.shareTitle', { name })}</Text>
      <ToggleRow label={t('requests.sharePhotos')} value={scopes.photos} onChange={(v) => setScopes({ ...scopes, photos: v })} />
      <ToggleRow label={t('requests.shareFull')} value={scopes.fullBiodata} onChange={(v) => setScopes({ ...scopes, fullBiodata: v })} />
      <Button label={t('requests.saveSharing')} size="sm" disabled={!dirty} loading={setConsent.isPending} onPress={() => run(() => setConsent.mutateAsync({ id: requestId, scopes: { ...scopes, phone: false } }), t('requests.sharingSaved'))} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ivory },
  column: { width: '100%', maxWidth: maxContentWidth, alignSelf: 'center' },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg },
  thumb: { width: 60, height: 60, borderRadius: 30, overflow: 'hidden', borderWidth: 2, borderColor: colors.gold },
  msg: { backgroundColor: colors.ivory, borderRadius: radius.md, padding: space.md, gap: 4 },
  offerBox: { backgroundColor: colors.warningBg, borderRadius: radius.md, padding: space.md, gap: space.sm },
  consent: { backgroundColor: colors.sage, borderRadius: radius.md, padding: space.md, gap: space.xs, marginTop: space.sm },
});
