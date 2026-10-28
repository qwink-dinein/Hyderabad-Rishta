import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { Badge, Banner, confirm, EmptyState, Loading, useErrorMessage, useToast } from '@/components/ui/feedback';
import { ChipGroup, Field, TextField, ToggleRow } from '@/components/ui/forms';
import { Card, Divider, Header, Row, Screen, Section } from '@/components/ui/layout';
import { Text } from '@/components/ui/Text';
import { formatDate } from '@/domain/format';
import type { AnnouncementSegment } from '@/domain/types';
import { qk } from '@/hooks/queries';
import { backend, type RecipientRow } from '@/services';
import { space } from '@/theme/tokens';

const SEGMENTS: { value: AnnouncementSegment; label: string }[] = [
  { value: 'all', label: 'All users' },
  { value: 'brides', label: 'Brides' },
  { value: 'grooms', label: 'Grooms' },
  { value: 'published', label: 'Published profiles' },
  { value: 'unpublished', label: 'Not yet published' },
];

const blank = { titleEn: '', titleUr: '', titleTe: '', bodyEn: '', bodyUr: '', bodyTe: '', segment: 'all' as AnnouncementSegment, priority: 'normal' as 'normal' | 'high', deepLink: '', expiresDays: '', push: false, scheduleHours: '' };

/** Announcements (PRD §14): durable in-app inbox + honest readership analytics. */
export default function AdminAnnouncements() {
  const qc = useQueryClient();
  const toast = useToast((s) => s.show);
  const errMsg = useErrorMessage();
  const { data, isLoading } = useQuery({ queryKey: qk.admin('announcements'), queryFn: () => backend.adminListAnnouncements() });
  const [form, setForm] = useState(blank);
  const [editingId, setEditingId] = useState<string | undefined>();
  const [audience, setAudience] = useState<number | null>(null);
  const [report, setReport] = useState<{ id: string; rows: RecipientRow[] } | null>(null);
  const set = (p: Partial<typeof blank>) => setForm((f) => ({ ...f, ...p }));

  useEffect(() => {
    backend.adminAudiencePreview(form.segment).then(setAudience).catch(() => setAudience(null));
  }, [form.segment]);

  const refresh = () => qc.invalidateQueries({ queryKey: ['admin'] });

  const save = async (publish: boolean) => {
    try {
      const expiresAt = form.expiresDays ? new Date(Date.now() + Number(form.expiresDays) * 86400000).toISOString() : undefined;
      const a = await backend.adminSaveAnnouncement({
        id: editingId,
        title: { en: form.titleEn.trim(), ur: form.titleUr.trim() || undefined, te: form.titleTe.trim() || undefined },
        body: { en: form.bodyEn.trim(), ur: form.bodyUr.trim() || undefined, te: form.bodyTe.trim() || undefined },
        segment: form.segment,
        priority: form.priority,
        deepLink: form.deepLink.trim() || undefined,
        expiresAt,
        pushEnabled: form.push,
      });
      if (publish) {
        const at = form.scheduleHours ? new Date(Date.now() + Number(form.scheduleHours) * 3600000).toISOString() : undefined;
        const p = await backend.adminPublishAnnouncement(a.id, at);
        toast(p.status === 'scheduled' ? `Scheduled for ${formatDate(p.scheduledAt)}` : 'Published to in-app inboxes.');
      } else toast('Draft saved.');
      setForm(blank);
      setEditingId(undefined);
      refresh();
    } catch (e) {
      toast(errMsg(e), 'danger');
    }
  };

  return (
    <Screen header={<Header title="Announcements" />}>
      <Section title={editingId ? 'Edit draft' : 'New announcement'}>
        <Card>
          <Field label="Title (English)" required>
            <TextField value={form.titleEn} onChangeText={(v) => set({ titleEn: v })} accessibilityLabel="Title English" maxLength={120} />
          </Field>
          <Field label="Body (English)" required>
            <TextField value={form.bodyEn} onChangeText={(v) => set({ bodyEn: v })} multiline accessibilityLabel="Body English" maxLength={1000} />
          </Field>
          <Field label="Title (Urdu)" optional hint="Falls back to English if empty">
            <TextField value={form.titleUr} onChangeText={(v) => set({ titleUr: v })} accessibilityLabel="Title Urdu" style={{ textAlign: 'right' }} />
          </Field>
          <Field label="Body (Urdu)" optional>
            <TextField value={form.bodyUr} onChangeText={(v) => set({ bodyUr: v })} multiline accessibilityLabel="Body Urdu" style={{ textAlign: 'right' }} />
          </Field>
          <Field label="Title (Telugu)" optional>
            <TextField value={form.titleTe} onChangeText={(v) => set({ titleTe: v })} accessibilityLabel="Title Telugu" />
          </Field>
          <Field label="Body (Telugu)" optional>
            <TextField value={form.bodyTe} onChangeText={(v) => set({ bodyTe: v })} multiline accessibilityLabel="Body Telugu" />
          </Field>
          <Field label="Audience" hint={audience != null ? `${audience} users will receive this in their inbox` : undefined}>
            <ChipGroup options={SEGMENTS} value={form.segment} onChange={(v) => v && set({ segment: v })} />
          </Field>
          <Field label="Priority">
            <ChipGroup options={[{ value: 'normal', label: 'Normal' }, { value: 'high', label: 'High' }]} value={form.priority} onChange={(v) => v && set({ priority: v })} />
          </Field>
          <Field label="Deep link" optional hint="e.g. /biodata, /discover, /dashboard">
            <TextField value={form.deepLink} onChangeText={(v) => set({ deepLink: v })} autoCapitalize="none" accessibilityLabel="Deep link" />
          </Field>
          <Row gap={space.sm}>
            <View style={{ flex: 1 }}>
              <Field label="Expires in (days)" optional>
                <TextField value={form.expiresDays} onChangeText={(v) => set({ expiresDays: v.replace(/\D/g, '') })} keyboardType="number-pad" accessibilityLabel="Expires in days" />
              </Field>
            </View>
            <View style={{ flex: 1 }}>
              <Field label="Schedule in (hours)" optional hint="Empty = publish now">
                <TextField value={form.scheduleHours} onChangeText={(v) => set({ scheduleHours: v.replace(/\D/g, '') })} keyboardType="number-pad" accessibilityLabel="Schedule in hours" />
              </Field>
            </View>
          </Row>
          <ToggleRow label="Also request push notification" value={form.push} onChange={(v) => set({ push: v })} hint="No push provider is configured in demo mode — delivery is reported as 'not configured', never faked." />
          <Row gap={space.sm} style={{ marginTop: space.md }}>
            <Button label="Save draft" kind="secondary" onPress={() => save(false)} style={{ flex: 1 }} disabled={!form.titleEn || !form.bodyEn} />
            <Button label={form.scheduleHours ? 'Schedule' : 'Publish now'} onPress={() => save(true)} style={{ flex: 1 }} disabled={!form.titleEn || !form.bodyEn} />
          </Row>
        </Card>
      </Section>

      <Section title="All announcements">
        <Banner icon="eye">A view is counted only when a member opens the announcement. Bulk “mark all read” and background refreshes are not views.</Banner>
        {isLoading ? (
          <Loading />
        ) : !data?.length ? (
          <EmptyState title="No announcements yet" />
        ) : (
          data.map((a) => (
            <Card key={a.id} style={{ gap: space.sm }}>
              <Row style={{ justifyContent: 'space-between' }} wrap>
                <Text variant="h3" style={{ flex: 1 }}>
                  {a.title.en}
                </Text>
                <Badge label={a.status} tone={a.status === 'published' ? 'success' : a.status === 'archived' ? 'muted' : 'gold'} />
              </Row>
              <Text variant="caption">
                {SEGMENTS.find((s) => s.value === a.segment)?.label} · {a.priority} · {a.publishedAt ? `published ${formatDate(a.publishedAt)}` : a.scheduledAt ? `scheduled ${formatDate(a.scheduledAt)}` : 'draft'}
                {a.expiresAt ? ` · expires ${formatDate(a.expiresAt)}` : ''}
              </Text>
              {a.status !== 'draft' ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.md }}>
                  <Stat label="Targeted" v={a.stats.targeted} />
                  <Stat label="In-app available" v={a.stats.inAppAvailable} />
                  <Stat label="Unique viewers" v={`${a.stats.uniqueViewers} (${Math.round(a.stats.viewRate * 100)}%)`} />
                  <Stat label="Unread" v={a.stats.unread} />
                  <Stat label="Clicks" v={a.stats.clicks} />
                  <Stat label="Push submitted" v={a.stats.pushSubmitted} />
                  <Stat label="Push delivered" v={a.stats.pushDelivered} />
                  <Stat label="Push failed" v={a.stats.pushFailed} />
                  <Stat label="Push not configured" v={a.stats.pushNotConfigured} />
                </View>
              ) : null}
              <Row gap={space.sm} wrap>
                {a.status === 'draft' || a.status === 'scheduled' ? (
                  <>
                    <Button
                      label="Edit"
                      size="sm"
                      kind="secondary"
                      onPress={() => {
                        setEditingId(a.id);
                        setForm({ ...blank, titleEn: a.title.en, titleUr: a.title.ur ?? '', titleTe: a.title.te ?? '', bodyEn: a.body.en, bodyUr: a.body.ur ?? '', bodyTe: a.body.te ?? '', segment: a.segment, priority: a.priority, deepLink: a.deepLink ?? '', push: a.pushEnabled });
                      }}
                    />
                    <Button label="Publish now" size="sm" onPress={() => backend.adminPublishAnnouncement(a.id).then(refresh).catch((e) => toast(errMsg(e), 'danger'))} />
                  </>
                ) : null}
                {a.status === 'published' ? (
                  <Button
                    label={report?.id === a.id ? 'Hide recipients' : 'Recipient report'}
                    size="sm"
                    kind="secondary"
                    onPress={async () => {
                      if (report?.id === a.id) return setReport(null);
                      setReport({ id: a.id, rows: await backend.adminRecipientReport(a.id) });
                    }}
                  />
                ) : null}
                {a.status !== 'archived' ? <Button label="Archive" size="sm" kind="ghost" onPress={() => backend.adminArchiveAnnouncement(a.id).then(refresh)} /> : null}
                <Button
                  label="Delete"
                  size="sm"
                  kind="danger"
                  onPress={async () => {
                    if (await confirm({ title: 'Delete this announcement?', body: 'It disappears from every member inbox and its analytics are removed. Archive instead if you want to keep the record.', confirmLabel: 'Delete', danger: true }))
                      backend.adminDeleteAnnouncement(a.id).then(refresh).catch((e) => toast(errMsg(e), 'danger'));
                  }}
                />
              </Row>
              {report?.id === a.id ? (
                <View>
                  <Divider />
                  <Text variant="caption">Access to this report is recorded in the audit log.</Text>
                  {report.rows.map((r) => (
                    <Text key={r.userId} variant="caption">
                      {r.profileCode ?? 'No profile'} · {r.maskedPhone} · in-app {formatDate(r.delivery.inAppAt)} · push {r.delivery.pushStatus} · viewed {r.delivery.viewedAt ? formatDate(r.delivery.viewedAt) : '—'} · clicked {r.delivery.clickedAt ? formatDate(r.delivery.clickedAt) : '—'}
                    </Text>
                  ))}
                </View>
              ) : null}
            </Card>
          ))
        )}
      </Section>
    </Screen>
  );
}

function Stat({ label, v }: { label: string; v: number | string }) {
  return (
    <View style={{ minWidth: 110 }}>
      <Text variant="h3">{v}</Text>
      <Text variant="caption">{label}</Text>
    </View>
  );
}
