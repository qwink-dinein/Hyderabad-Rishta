import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { BiodataWizard } from '@/components/BiodataWizard';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/feedback';
import { Header, Screen } from '@/components/ui/layout';
import { useMyProfile, useSaveDraft } from '@/hooks/queries';
import { useGoHome } from '@/hooks/useGoHome';
import { backend } from '@/services';
import { useSession } from '@/state/session';

/** The member's own biodata (PRD §6), using the shared wizard. */
export default function BiodataScreen() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ step?: string }>();
  const user = useSession((s) => s.user);
  const { data: profile, isLoading } = useMyProfile();
  const save = useSaveDraft();
  const goHome = useGoHome();
  // One number = one biodata: if the team removed this account's biodata, a new one can't be started here.
  const { data: fresh } = useQuery({ queryKey: ['session', 'fresh'], queryFn: () => backend.getSession(), enabled: !!user && !isLoading && !profile });

  if (!user) return <Redirect href="/login" />;
  if (!profile && fresh?.profileRemovedAt)
    return (
      <Screen header={<Header title={t('wizard.title')} onHome={goHome} />}>
        <EmptyState
          icon="shield"
          title={t('wizard.removedTitle')}
          body={t('wizard.removedBody')}
          action={<Button label={t('wizard.removedAction')} kind="secondary" onPress={() => router.replace('/settings')} testID="removed-settings" />}
        />
      </Screen>
    );

  return (
    <BiodataWizard
      profile={profile}
      loading={isLoading}
      phone={user}
      save={(biodata, step) => save.mutateAsync({ biodata, step })}
      saving={save.isPending}
      onFinish={() => router.push('/biodata/preview')}
      onExit={() => (router.canGoBack() ? router.back() : router.replace('/dashboard'))}
      onHome={goHome}
      title={profile ? t('wizard.editTitle') : t('wizard.title')}
      finishLabel={profile && profile.status !== 'draft' && profile.status !== 'rejected' ? t('wizard.saveReview') : t('wizard.reviewPreview')}
      initialStep={params.step != null ? Number(params.step) : undefined}
    />
  );
}
