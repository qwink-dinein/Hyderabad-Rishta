import { View } from 'react-native';
import { Redirect } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Icon, type IconName } from '@/components/ui/Icon';
import { pendingReceivedCount } from '@/domain/connections';
import { useRequests } from '@/hooks/queries';
import { useTabTransitions } from '@/navigation/transitions';
import { useSession } from '@/state/session';
import { colors, radius } from '@/theme/tokens';
import { fontFamily } from '@/theme/fonts';

/**
 * Authenticated member area: Home · Discover · Shortlist · Requests · Profile (owner PRD 2026-10-29:
 * five balanced tabs; Boost is reached from Home and Profile, with entry points that follow its state).
 * The notification centre is a stack screen (/notifications) opened from the header bell and deep links.
 * Guarded here; the backend independently rejects unauthenticated calls.
 */
export default function TabsLayout() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const user = useSession((s) => s.user);
  const lang = useSession((s) => s.lang);
  const tabMotion = useTabTransitions();
  // Requests badge: interests received and still waiting for this member's answer (1, 2, 3…).
  const { data: requests } = useRequests();
  const waiting = pendingReceivedCount(requests ?? []);
  if (!user) return <Redirect href="/login" />;

  const icon = (name: IconName, filled?: IconName) =>
    function TabIcon({ color, focused }: { color: unknown; focused: boolean }) {
      return (
        // Understated highlight behind the selected item.
        <View style={{ width: 52, height: 30, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: focused ? colors.sage : 'transparent' }}>
          <Icon name={focused && filled ? filled : name} color={String(color)} size={21} strokeWidth={focused ? 2.1 : 1.8} />
        </View>
      );
    };

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        ...tabMotion,
        sceneStyle: { backgroundColor: colors.ivory },
        tabBarActiveTintColor: colors.emerald,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: { backgroundColor: colors.white, borderTopColor: colors.border, minHeight: (lang === 'ur' ? 70 : 62) + insets.bottom, paddingTop: 6 },
        // Urdu Nastaliq needs about twice the line height, or labels are clipped at the bottom.
        tabBarLabelStyle: { fontFamily: fontFamily(lang, 'medium'), fontSize: 11, lineHeight: lang === 'ur' ? 22 : 15 },
      }}
    >
      <Tabs.Screen name="home" options={{ title: t('nav.home'), tabBarIcon: icon('home') }} />
      <Tabs.Screen name="discover" options={{ title: t('nav.discover'), tabBarIcon: icon('search') }} />
      <Tabs.Screen name="shortlist" options={{ title: t('nav.shortlist'), tabBarIcon: icon('heart', 'heartFilled') }} />
      <Tabs.Screen
        name="requests"
        options={{
          title: t('nav.requests'),
          tabBarIcon: icon('mail'),
          tabBarBadge: waiting ? (waiting > 99 ? '99+' : waiting) : undefined,
          tabBarBadgeStyle: { backgroundColor: colors.danger, color: colors.white, fontSize: 11, minWidth: 18, height: 18, lineHeight: 18 },
          tabBarAccessibilityLabel: waiting ? `${t('nav.requests')}, ${t('home.newInterests', { count: waiting })}` : t('nav.requests'),
        }}
      />
      <Tabs.Screen name="dashboard" options={{ title: t('nav.profile'), tabBarIcon: icon('user') }} />
    </Tabs>
  );
}
