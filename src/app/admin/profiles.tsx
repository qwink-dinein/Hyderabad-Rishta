import { useState } from 'react';
import { View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { ProfileDetails } from '@/components/ProfileDetails';
import { Button } from '@/components/ui/Button';
import { Badge, EmptyState, Loading, useErrorMessage, useToast } from '@/components/ui/feedback';
import { ChipGroup, TextField } from '@/components/ui/forms';
import { Card, Header, Row, Screen } from '@/components/ui/layout';
import { Text } from '@/components/ui/Text';
import { formatDate } from '@/domain/format';
import { FULL_ACCESS, profileTypeOf, projectProfile } from '@/domain/privacy';
import type { ProfileStatus } from '@/domain/types';
import { useAdminProfiles } from '@/hooks/queries';
import { backend } from '@/services';
import { space } from '@/theme/tokens';

const FILTERS: { value: ProfileStatus | 'all'; label: string }[] = [
  { value: 'pending', label: 'Pending' },
  { value: 'published', label: 'Published' },
  { value: 'rejected', label: 'Needs changes' },
  { value: 'paused', label: 'Paused' },
  { value: 'draft', label: 'Draft' },
  { value: 'all', label: 'All' },
];

export default function AdminProfiles() {
  const qc = useQueryClient();
  const toast = useToast((s) => s.show);
  const errMsg = useErrorMessage();
  const [status, setStatus] = useState<ProfileStatus | 'all'>('pending');
  const { data, isLoading } = useAdminProfiles(status === 'all' ? undefined : status);
  const [openId, setOpenId] = useState<string | null>(null);
  const [note, setNote] = useState('');

  const act = async (id: string, next: ProfileStatus, requireNote = false) => {
    if (requireNote && !note.trim()) return toast('Add a note explaining what needs to change.', 'danger');
    try {
      await backend.adminSetProfileStatus(id, next, note.trim() || undefined);
      setNote('');
      setOpenId(null);
      qc.invalidateQueries({ queryKey: ['admin'] });
      toast(`Profile ${next}.`);
    } catch (e) {
      toast(errMsg(e), 'danger');
    }
  };

  return (
    <Screen header={<Header title="Profile review" />}>
      <View style={{ paddingVertical: space.lg }}>
        <ChipGroup options={FILTERS} value={status} onChange={(v) => v && setStatus(v)} />
      </View>
      {isLoading ? (
        <Loading />
      ) : !data?.length ? (
        <EmptyState title="Nothing here" body="No profiles with this status." />
      ) : (
        <View style={{ gap: space.md }}>
          {data.map((p) => (
            <Card key={p.id} style={{ gap: space.sm }}>
              <Row style={{ justifyContent: 'space-between' }} wrap>
                <View style={{ flex: 1 }}>
                  <Text variant="h3">{p.biodata.basic.fullName}</Text>
                  <Text variant="caption">
                    {profileTypeOf(p)} · {p.biodata.location.city} · phone {p.phoneMasked} · updated {formatDate(p.updatedAt)}
                  </Text>
                </View>
                <Badge label={p.status} tone={p.status === 'published' ? 'success' : p.status === 'rejected' ? 'danger' : 'gold'} />
              </Row>
              {p.adminNote ? <Text variant="caption">Note: {p.adminNote}</Text> : null}
              <Button label={openId === p.id ? 'Hide biodata' : 'Review biodata'} size="sm" kind="secondary" onPress={() => setOpenId(openId === p.id ? null : p.id)} />
              {openId === p.id ? (
                <View style={{ gap: space.md }}>
                  <ProfileDetails profile={projectProfile(p, FULL_ACCESS)} />
                  <TextField value={note} onChangeText={setNote} placeholder="Note to member (required to request corrections)" multiline accessibilityLabel="Admin note" />
                  <Row gap={space.sm} wrap>
                    {p.status !== 'published' ? <Button label="Approve & publish" size="sm" onPress={() => act(p.id, 'published')} /> : null}
                    <Button label="Request corrections" size="sm" kind="secondary" onPress={() => act(p.id, 'rejected', true)} />
                    {p.status === 'published' ? <Button label="Pause" size="sm" kind="danger" onPress={() => act(p.id, 'paused')} /> : null}
                  </Row>
                </View>
              ) : null}
            </Card>
          ))}
        </View>
      )}
    </Screen>
  );
}
