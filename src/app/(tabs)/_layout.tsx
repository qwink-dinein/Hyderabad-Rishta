import { Redirect } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import { useTranslation } from 'react-i18next';
import { Icon, type IconName } from '@/components/ui/Icon';
import { useUnreadCount } from '@/hooks/queries';
import { useSession } from '@/state/session';
import { colors } from '@/theme/tokens';
import { fontFamily } from '@/theme/fonts';

/** Authenticated member area. Guarded here; the backend independently rejects unauthenticated calls. */
export default function TabsLayout() {
  const { t } = useTranslation();
  const user = useSession((s) => s.user);
  const lang = useSession((s) => s.lang);
  const unread = useUnreadCount();
  if (!user) return <Redirect href="/login" />;

  const icon = (name: IconName) =>
    function TabIcon({ color }: { color: unknown }) {
      return <Icon name={name} color={String(color)} size={22} />;
    };

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.emerald,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: { backgroundColor: colors.white, borderTopColor: colors.border, minHeight: 60 },
        tabBarLabelStyle: { fontFamily: fontFamily(lang, 'medium'), fontSize: 11 },
      }}
    >
      <Tabs.Screen name="discover" options={{ title: t('nav.discover'), tabBarIcon: icon('search') }} />
      <Tabs.Screen name="shortlist" options={{ title: t('nav.shortlist'), tabBarIcon: icon('heart') }} />
      <Tabs.Screen name="requests" options={{ title: t('nav.requests'), tabBarIcon: icon('mail') }} />
      <Tabs.Screen
        name="notifications"
        options={{ title: t('nav.notifications'), tabBarIcon: icon('bell'), tabBarBadge: unread > 0 ? (unread > 9 ? '9+' : unread) : undefined, tabBarBadgeStyle: { backgroundColor: colors.gold, color: colors.emerald } }}
      />
      <Tabs.Screen name="dashboard" options={{ title: t('nav.dashboard'), tabBarIcon: icon('user') }} />
    </Tabs>
  );
}
