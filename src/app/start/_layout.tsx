import { Stack } from 'expo-router';
import { colors } from '@/theme/tokens';

/** New-member onboarding: native stack pushes (the platform's own transition and swipe-back). */
export default function StartLayout() {
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.ivory } }} />;
}
