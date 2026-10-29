import { router, useLocalSearchParams } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';
import { ProfileDetails } from '@/components/ProfileDetails';
import { Button } from '@/components/ui/Button';
import { Badge, Banner, ErrorView, Loading, useErrorMessage, useToast } from '@/components/ui/feedback';
import { Header, Row, Screen } from '@/components/ui/layout';
import { Text } from '@/components/ui/Text';
import { NO_CONSENT, projectProfile } from '@/domain/privacy';
import { firstInvalidStep, STEP_KEYS } from '@/domain/validation';
import { qk } from '@/hooks/queries';
import { backend } from '@/services';
import { space } from '@/theme/tokens';

/** Admin: check a team-added biodata exactly as members will see it, then publish or keep it as a draft. */
export default function AdminMemberReview() {
  const { profileId } = useLocalSearchParams<{ profileId: string }>();
  const qc = useQueryClient();
  const toast = useToast((s) => s.show);
  const errMsg = useErrorMessage();
  const [busy, setBusy] = useState(false);
  const { data, isLoading, error, refetch } = useQuery({ queryKey: qk.admin('memberDraft', profileId), queryFn: () => backend.adminGetMemberDraft(profileId) });

  if (isLoading) return <Loading />;
  if (error || !data)
    return (
      <Screen header={<Header title="Review biodata" />}>
        <ErrorView error={error} onRetry={refetch} />
      </Screen>
    );

  const p = data.profile;
  const missing = firstInvalidStep(p.biodata);
  const publish = async () => {
    setBusy(true);
    try {
      await backend.adminPublishMember(p.id);
      qc.invalidateQueries({ queryKey: ['admin'] });
      qc.invalidateQueries({ queryKey: ['search'] });
      qc.invalidateQueries({ queryKey: qk.featured });
      toast(`${p.code} is published. Its owner gets it on first login with ${data.phoneMasked}.`);
      router.replace(`/admin/member/${data.userId}`);
    } catch (e) {
      toast(errMsg(e), 'danger');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      header={<Header title={`Review ${p.code}`} />}
      footer={
        data.claimed ? undefined : (
          <Row gap={space.sm}>
            <Button label="Keep as draft" kind="secondary" onPress={() => router.replace(`/admin/member/${data.userId}`)} style={{ flex: 1 }} testID="review-draft" />
            <Button label={p.status === 'published' ? 'Published' : 'Publish now'} onPress={publish} loading={busy} disabled={missing !== -1 || p.status === 'published'} style={{ flex: 1.3 }} testID="review-publish" />
          </Row>
        )
      }
    >
      <View style={{ gap: space.md, paddingTop: space.lg }}>
        <Row gap={space.sm} wrap>
          <Badge label={p.status} tone={p.status === 'published' ? 'success' : 'gold'} />
          <Badge label={data.claimed ? 'claimed by member' : 'not yet signed in'} tone={data.claimed ? 'success' : 'muted'} />
          <Text variant="caption">{data.phoneMasked}</Text>
        </Row>
        {missing !== -1 ? (
          <Banner tone="warning" icon="info">
            {`Not complete yet: "${STEP_KEYS[missing]}" needs details before it can be published.`}
          </Banner>
        ) : (
          <Text variant="caption">{"This is how other members will see it (the member's privacy choices applied). Publishing makes it live at once — the team is the approver."}</Text>
        )}
        {!data.claimed ? (
          <Button label="Edit biodata" kind="ghost" size="sm" onPress={() => router.push({ pathname: '/admin/member-biodata', params: { profileId: p.id, step: String(Math.max(0, missing)) } })} style={{ alignSelf: 'flex-start' }} testID="review-edit" />
        ) : null}
        <ProfileDetails profile={projectProfile(p, NO_CONSENT)} />
      </View>
    </Screen>
  );
}
