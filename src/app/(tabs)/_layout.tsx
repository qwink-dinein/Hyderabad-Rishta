import { View } from 'react-native';
import { Redirect } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { BoostTabButton } from '@/components/BoostTabButton';
import { Icon, type IconName } from '@/components/ui/Icon';
import { useTabTransitions } from '@/navigation/transitions';
import { useSession } from '@/state/session';
import { colors, radius } from '@/theme/tokens';
import { fontFamily } from '@/theme/fonts';

/**
 * Authenticated member area: Home · Discover · BOOST (raised centre) · Requests · Profile.
 * Shortlist lives at /shortlist (Discover's heart button and Home), since Boost took its tab (owner request 2026-10-28).
 * The notification centre is a stack screen (/notifications) opened from the header bell and deep links.
 * Guarded here; the backend independently rejects unauthenticated calls.
 */
export default function TabsLayout() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const user = useSession((s) => s.user);
  const lang = useSession((s) => s.lang);
  const tabMotion = useTabTransitions();
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
        tabBarStyle: { backgroundColor: colors.white, borderTopColor: colors.border, minHeight: 62 + insets.bottom, paddingTop: 6, overflow: 'visible' },
        tabBarLabelStyle: { fontFamily: fontFamily(lang, 'medium'), fontSize: 11 },
      }}
    >
      <Tabs.Screen name="home" options={{ title: t('nav.home'), tabBarIcon: icon('home') }} />
      <Tabs.Screen name="discover" options={{ title: t('nav.discover'), tabBarIcon: icon('search') }} />
      <Tabs.Screen name="boost" options={{ title: t('nav.boost'), tabBarButton: (props) => <BoostTabButton {...props} /> }} />
      <Tabs.Screen name="requests" options={{ title: t('nav.requests'), tabBarIcon: icon('mail') }} />
      <Tabs.Screen name="dashboard" options={{ title: t('nav.profile'), tabBarIcon: icon('user') }} />
    </Tabs>
  );
}
