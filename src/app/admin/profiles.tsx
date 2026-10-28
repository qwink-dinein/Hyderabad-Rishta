import { CodeLink } from '@/components/admin/CodeLink';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Image } from 'expo-image';
import { useQueryClient } from '@tanstack/react-query';
import { ProfileDetails } from '@/components/ProfileDetails';
import { Button } from '@/components/ui/Button';
import { Badge, confirm, EmptyState, Loading, useErrorMessage, useToast } from '@/components/ui/feedback';
import { ChipGroup, TextField } from '@/components/ui/forms';
import { Icon } from '@/components/ui/Icon';
import { Card, Header, Row, Screen } from '@/components/ui/layout';
import { Text } from '@/components/ui/Text';
import { formatDate } from '@/domain/format';
import { FULL_ACCESS, profileTypeOf, projectProfile } from '@/domain/privacy';
import type { ProfileStatus } from '@/domain/types';
import { useAdminProfiles } from '@/hooks/queries';
import { backend } from '@/services';
import { colors, radius, space } from '@/theme/tokens';

const FILTERS: { value: ProfileStatus | 'all'; label: string }[] = [
  { value: 'pending', label: 'Pending' },
  { value: 'published', label: 'Published' },
  { value: 'rejected', label: 'Needs changes' },
  { value: 'paused', label: 'Paused' },
  { value: 'draft', label: 'Draft' },
  { value: 'all', label: 'All' },
];

/** Full moderation: approve, request changes, pause, resume, remove photos, delete (to Trash). */
export default function AdminProfiles() {
  const qc = useQueryClient();
  const toast = useToast((s) => s.show);
  const errMsg = useErrorMessage();
  const [status, setStatus] = useState<ProfileStatus | 'all'>('pending');
  const { data, isLoading } = useAdminProfiles(status === 'all' ? undefined : status);
  const [openId, setOpenId] = useState<string | null>(null);
  const [note, setNote] = useState('');

  const done = (msg: string) => {
    setNote('');
    qc.invalidateQueries({ queryKey: ['admin'] });
    toast(msg);
  };
  const run = async (fn: () => Promise<unknown>, msg: string) => {
    try {
      await fn();
      done(msg);
    } catch (e) {
      toast(errMsg(e), 'danger');
    }
  };
  const act = (id: string, next: ProfileStatus, requireNote = false) => {
    if (requireNote && !note.trim()) return toast('Add a note explaining what needs to change.', 'danger');
    return run(() => backend.adminSetProfileStatus(id, next, note.trim() || undefined), `Profile ${next === 'published' ? 'published' : next === 'rejected' ? 'sent back for changes' : next}.`);
  };
  const del = async (id: string, name: string) => {
    const ok = await confirm({ title: `Delete ${name}'s profile?`, body: 'It disappears from the app immediately and moves to Trash. The master admin can restore it within 30 days.', confirmLabel: 'Delete', danger: true });
    if (ok) {
      await run(() => backend.adminDeleteProfile(id, note.trim() || 'Removed by admin'), 'Profile moved to Trash.');
      setOpenId(null);
    }
  };

  return (
    <Screen header={<Header title="Profiles" />}>
      <View style={{ paddingVertical: space.lg }}>
        <ChipGroup options={FILTERS} value={status} onChange={(v) => v && setStatus(v)} />
      </View>
      {isLoading ? (
        <Loading />
      ) : !data?.length ? (
        <EmptyState title="Nothing here" body="No profiles with this status." />
      ) : (
        <View style={{ gap: space.md }}>
          {data.map((p) => {
            const open = openId === p.id;
            return (
              <Card key={p.id} style={{ gap: space.sm }}>
                <Row style={{ justifyContent: 'space-between' }} wrap>
                  <View style={{ flex: 1, minWidth: 180 }}>
                    <Row gap={space.sm} wrap>
                      <CodeLink code={p.code} userId={p.userId} />
                      <Text variant="h3">{p.biodata.basic.fullName}</Text>
                    </Row>
                    <Text variant="caption">
                      {profileTypeOf(p)} · {p.biodata.location.city} · phone {p.phoneMasked} · updated {formatDate(p.updatedAt, 'en')}
                    </Text>
                  </View>
                  <Badge label={p.status} tone={p.status === 'published' ? 'success' : p.status === 'rejected' ? 'danger' : 'gold'} />
                </Row>
                {p.adminNote ? <Text variant="caption">Note: {p.adminNote}</Text> : null}
                <Row gap={space.sm} wrap>
                  {p.status === 'pending' || p.status === 'draft' || p.status === 'rejected' ? <Button label="Approve & publish" size="sm" onPress={() => act(p.id, 'published')} testID={`approve-${p.id}`} /> : null}
                  {p.status === 'published' ? <Button label="Pause" size="sm" kind="secondary" onPress={() => act(p.id, 'paused')} /> : null}
                  {p.status === 'paused' ? <Button label="Resume" size="sm" onPress={() => act(p.id, 'published')} /> : null}
                  <Button label={open ? 'Hide details' : 'Review & more'} size="sm" kind="ghost" onPress={() => setOpenId(open ? null : p.id)} />
                </Row>
                {open ? (
                  <View style={{ gap: space.md }}>
                    {p.biodata.photos.length ? (
                      <View style={{ gap: space.xs }}>
                        <Text variant="label">Photos (tap ✕ to remove an inappropriate photo)</Text>
                        <Row gap={space.sm} wrap>
                          {p.biodata.photos.map((ph) => (
                            <View key={ph.id} style={{ width: 90, height: 112, borderRadius: radius.md, overflow: 'hidden' }}>
                              <Image source={{ uri: ph.uri }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                              <Pressable
                                accessibilityRole="button"
                                accessibilityLabel="Remove photo"
                                onPress={async () => {
                                  if (await confirm({ title: 'Remove this photo?', body: 'The member is notified. This cannot be undone.', confirmLabel: 'Remove', danger: true }))
                                    run(() => backend.adminRemovePhoto(p.id, ph.id), 'Photo removed.');
                                }}
                                style={{ position: 'absolute', top: 4, right: 4, width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(166,58,43,0.9)', alignItems: 'center', justifyContent: 'center' }}
                              >
                                <Icon name="close" size={14} color={colors.white} />
                              </Pressable>
                            </View>
                          ))}
                        </Row>
                      </View>
                    ) : null}
                    <ProfileDetails profile={projectProfile(p, FULL_ACCESS)} />
                    <TextField value={note} onChangeText={setNote} placeholder="Note to member / reason (required to request changes)" multiline accessibilityLabel="Admin note" />
                    <Row gap={space.sm} wrap>
                      <Button label="Request changes" size="sm" kind="secondary" onPress={() => act(p.id, 'rejected', true)} />
                      {p.status !== 'paused' ? <Button label="Pause" size="sm" kind="secondary" onPress={() => act(p.id, 'paused')} /> : null}
                      <Button label="Delete profile" size="sm" kind="danger" onPress={() => del(p.id, p.biodata.basic.fullName)} testID={`delete-${p.id}`} />
                    </Row>
                  </View>
                ) : null}
              </Card>
            );
          })}
        </View>
      )}
    </Screen>
  );
}
