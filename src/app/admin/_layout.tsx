import { useEffect } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/components/ui/feedback';
import { Redirect, Stack } from 'expo-router';
import { UiLang } from '@/i18n/uiLang';
import { isAdminRole } from '@/domain/types';
import { useStackTransitions, webScreenLayout } from '@/navigation/transitions';
import { useSession } from '@/state/session';
import { colors } from '@/theme/tokens';

/**
 * Admin area. This guard is UX only — every admin backend call independently verifies the
 * admin role (DemoBackend.admin() / Supabase RLS + is_admin()). Hiding a button is not security.
 * Admin UI copy is English-only for the MVP (internal tool) — see Tasks.md.
 */
export default function AdminLayout() {
  const user = useSession((s) => s.user);
  const transitions = useStackTransitions();
  if (!user) return <Redirect href="/login" />;
  if (!isAdminRole(user.role)) return <NotForMembers />;
  // English-only console: always left-to-right with Latin fonts, whatever the admin's app language.
  return (
    <UiLang lang="en">
      <View style={{ flex: 1, direction: 'ltr' }}>
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.ivory }, ...transitions }} screenLayout={webScreenLayout} />
      </View>
    </UiLang>
  );
}

/** A member who opens an admin link is told why and taken back to the app (never a blank or a silent bounce). */
function NotForMembers() {
  const { t } = useTranslation();
  useEffect(() => {
    useToast.getState().show(t('perm.adminOnly'), 'info');
  }, [t]);
  return <Redirect href="/discover" />;
}
