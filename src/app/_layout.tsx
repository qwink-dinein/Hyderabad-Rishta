import { useEffect, useState } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import { router, Stack, type ErrorBoundaryProps } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { isRTL, restoreLanguage } from '@/i18n';
import { PushBridge } from '@/components/PushBridge';
import { modalTransition, useStackTransitions, webScreenLayout } from '@/navigation/transitions';
import { Button } from '@/components/ui/Button';
import { ConfirmHost, ToastHost, useToast } from '@/components/ui/feedback';
import { Text } from '@/components/ui/Text';
import i18n from '@/i18n';
import { backend } from '@/services';
import { loadFeedbackPrefs } from '@/services/feedback';
import { AppError } from '@/services/backend';
import { useSession } from '@/state/session';
import { baseFontAssets } from '@/theme/fonts';
import { colors } from '@/theme/tokens';

SplashScreen.preventAutoHideAsync().catch(() => undefined);

/**
 * The server ended this session (logout elsewhere, PIN reset on another phone, suspension, 180 idle
 * days): sign out cleanly once and go to login, instead of leaving every screen showing an error.
 */
let endingSession = false;
function sessionLost() {
  if (endingSession || !useSession.getState().user) return;
  endingSession = true;
  useSession.getState().setUser(null);
  queryClient.clear();
  useToast.getState().show(i18n.t('auth.sessionEnded'), 'danger');
  router.replace('/login');
  setTimeout(() => (endingSession = false), 1000);
}
const onAuthError = (err: unknown) => {
  if (err instanceof AppError && (err.code === 'unauthenticated' || err.code === 'account_suspended' || err.code === 'account_removed')) sessionLost();
};

const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: onAuthError }),
  mutationCache: new MutationCache({ onError: onAuthError }),
  defaultOptions: {
    queries: {
      // Don't hammer the backend on auth/permission errors; retry transient ones once.
      retry: (count, err) => !(err instanceof AppError) && count < 1,
      staleTime: 15_000,
      refetchOnWindowFocus: false,
    },
  },
});

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(baseFontAssets);
  const { ready, setReady, setUser, setLang, lang } = useSession();
  const transitions = useStackTransitions();
  const [booted, setBooted] = useState(false);

  useEffect(() => {
    (async () => {
      loadFeedbackPrefs(); // sound/haptics preferences (fire-and-forget)
      const l = await restoreLanguage();
      setLang(l);
      try {
        setUser(await backend.getSession());
      } catch {
        setUser(null);
      }
      setBooted(true);
    })();
  }, [setLang, setUser]);

  // Coming back to the app: make sure the session is still valid (it may have been revoked meanwhile).
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active' || !useSession.getState().user) return;
      backend
        .getSession()
        .then((u) => (u ? setUser(u) : sessionLost()))
        .catch(() => undefined);
    });
    return () => sub.remove();
  }, [setUser]);

  useEffect(() => {
    // Fonts failing to load must never block the app — system fonts are an acceptable fallback.
    if (booted && (fontsLoaded || fontError)) {
      setReady(true);
      SplashScreen.hideAsync().catch(() => undefined);
    }
  }, [booted, fontsLoaded, fontError, setReady]);

  if (!ready) return <View style={{ flex: 1, backgroundColor: colors.ivory }} />;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          {/* Layout direction flips instantly for Urdu without an app restart. */}
          <View style={[styles.root, { direction: isRTL(lang) ? 'rtl' : 'ltr' }]}>
            <StatusBar style="dark" />
            <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.ivory }, ...transitions }} screenLayout={webScreenLayout}>
              <Stack.Screen name="filters" options={{ presentation: 'modal', ...modalTransition }} />
            </Stack>
            <PushBridge />
            <ToastHost />
            <ConfirmHost />
          </View>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ivory },
  crash: { flex: 1, backgroundColor: colors.ivory, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 16 },
});

/** Last-resort screen for an unexpected crash anywhere in the app: never a blank page. */
export function ErrorBoundary({ retry }: ErrorBoundaryProps) {
  return (
    <View style={styles.crash}>
      <Text variant="h2" center accessibilityRole="header">
        {i18n.t('err.crashTitle')}
      </Text>
      <Text variant="body" center>
        {i18n.t('err.crashBody')}
      </Text>
      <Button label={i18n.t('common.retry')} onPress={retry} />
      <Button label={i18n.t('nav.goHome')} kind="ghost" onPress={() => router.replace('/')} />
    </View>
  );
}
