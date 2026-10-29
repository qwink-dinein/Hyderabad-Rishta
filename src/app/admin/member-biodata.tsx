import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BiodataWizard } from '@/components/BiodataWizard';
import { Banner, ErrorView, Loading } from '@/components/ui/feedback';
import { Header, Screen } from '@/components/ui/layout';
import type { Biodata } from '@/domain/types';
import { qk } from '@/hooks/queries';
import { backend, type AdminMemberDraft } from '@/services';

/**
 * Admin / sub-admin: the member's biodata, in the same wizard members use. The first save creates
 * the account (no OTP) as a draft; later saves update it until the member signs in and takes over.
 */
export default function AdminMemberBiodata() {
  const params = useLocalSearchParams<{ cc?: string; phone?: string; profileId?: string; step?: string }>();
  const qc = useQueryClient();
  const [created, setCreated] = useState<AdminMemberDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const existing = useQuery({
    queryKey: qk.admin('memberDraft', params.profileId),
    queryFn: () => backend.adminGetMemberDraft(params.profileId!),
    enabled: !!params.profileId,
  });
  const draft = created ?? existing.data ?? null;

  if (params.profileId && existing.isLoading) return <Loading />;
  if (params.profileId && existing.error)
    return (
      <Screen header={<Header title="Member biodata" />}>
        <ErrorView error={existing.error} onRetry={existing.refetch} />
      </Screen>
    );
  if (draft?.claimed)
    return (
      <Screen header={<Header title="Member biodata" />}>
        <Banner icon="lock">This member has signed in and now manages their own biodata.</Banner>
      </Screen>
    );
  if (!draft && (!params.cc || !params.phone)) {
    router.replace('/admin/add-member');
    return <Loading />;
  }

  const phone = draft ? { label: draft.phoneMasked } : { countryCode: params.cc!, phone: params.phone! };
  const save = async (biodata: Biodata, step: number) => {
    setSaving(true);
    try {
      const next = draft
        ? await backend.adminSaveMemberBiodata(draft.profile.id, biodata, step)
        : await backend.adminCreateMember({ countryCode: params.cc!, phone: params.phone!, biodata, lastStep: step });
      setCreated(next);
      qc.invalidateQueries({ queryKey: ['admin'] });
      if (!draft) router.setParams({ profileId: next.profile.id, cc: undefined, phone: undefined });
      return next;
    } finally {
      setSaving(false);
    }
  };

  return (
    <BiodataWizard
      profile={draft?.profile ?? null}
      loading={false}
      phone={phone}
      save={save}
      saving={saving}
      onFinish={() => {
        const id = (created ?? draft)?.profile.id;
        if (id) router.replace({ pathname: '/admin/member-review', params: { profileId: id } });
      }}
      onExit={() => (router.canGoBack() ? router.back() : router.replace('/admin/add-member'))}
      onHome={() => router.replace('/admin')}
      title={draft ? `Member biodata · ${draft.profile.code}` : 'New member biodata'}
      finishLabel="Save & review"
      initialStep={params.step != null ? Number(params.step) : undefined}
      banner={
        <Banner icon="info">
          {draft
            ? `Saved as ${draft.profile.code} (${draft.profile.status}) for ${draft.phoneMasked}. When this number's owner logs in with OTP, they get this account.`
            : `New member for ${params.cc} ${params.phone}. Nothing is created until you save the first step. No OTP is needed.`}
        </Banner>
      }
    />
  );
}
